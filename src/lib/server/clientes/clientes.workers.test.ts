/**
 * F3-01 — Testes de integração de clientes no runtime Workers real
 * (workerd via Miniflare): D1 + R2 locais efêmeros.
 *
 * Prova, com banco e storage reais:
 *   A. CRUD completo (criar, ler, listar, editar, desativar)
 *   B. Isolamento de tenant: empresa B não lê/edita/apaga cliente da empresa A
 *   C. Documento duplicado na mesma empresa → 409; em outra empresa → permitido
 *   D. Concorrência otimista: versão errada → CONFLITO_VERSAO
 *   E. Anexo privado: upload R2 + metadado D1, download mediado, remoção;
 *      validação de conteúdo (magic bytes) e compensação
 *   F. Rotas HTTP: 401 sem sessão, 403 sem permissão, fluxo feliz com sessão
 *
 * Executar: npx vitest run --project workers src/lib/server/clientes/clientes.workers.test.ts
 */

/// <reference types="@cloudflare/vitest-pool-workers" />

import type { ApiEnv } from '$lib/server/api/types';
type WorkerBindings = ApiEnv['Bindings'];

declare module 'cloudflare:test' {
  interface ProvidedEnv extends WorkerBindings {}
}

import { env } from 'cloudflare:test';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '$lib/server/db/client';
import { createApiAppV2 } from '$lib/server/api/app-v2';
import {
  ClienteError,
  atualizarCliente,
  criarCliente,
  desativarCliente,
  getAnexo,
  getCliente,
  listarAnexos,
  listarClientes,
  registrarAnexo,
  removerAnexo,
} from './service';

const MIGRATIONS = (env as Record<string, unknown>).TEST_MIGRATIONS as Parameters<
  typeof applyD1Migrations
>[1];

const EMPRESA_A = 1;
const EMPRESA_B = 2;
const USUARIO_A = 'usr-teste-a';
const USUARIO_B = 'usr-teste-b';
const USUARIO_VIEW = 'usr-teste-view';

const clienteValido = {
  nome: 'Maria da Silva',
  tipo_pessoa: 'PF',
  documento: '52998224725',
  telefone: '(11) 98888-7777',
  email: 'maria@exemplo.com',
};

beforeAll(async () => {
  await applyD1Migrations(env.DB, MIGRATIONS);
});

beforeEach(async () => {
  // Limpa dados entre testes (ordem respeita FKs)
  for (const t of ['cliente_anexos', 'clientes', 'membros_empresa', 'session', 'user', 'empresas']) {
    await env.DB.exec(`DELETE FROM ${t}`);
  }
  await env.R2.delete((await env.R2.list()).objects.map((o: { key: string }) => o.key));

  const agora = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO empresas (id, nome, criado_em, atualizado_em) VALUES (?, ?, ?, ?)')
      .bind(EMPRESA_A, 'Agência Alfa', agora, agora),
    env.DB.prepare('INSERT INTO empresas (id, nome, criado_em, atualizado_em) VALUES (?, ?, ?, ?)')
      .bind(EMPRESA_B, 'Agência Beta', agora, agora),
  ]);
  const ts = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO user (id, name, email, email_verified, empresa_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(USUARIO_A, 'Admin Alfa', 'admin@alfa.com', 1, EMPRESA_A, ts, ts),
    env.DB.prepare('INSERT INTO user (id, name, email, email_verified, empresa_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(USUARIO_B, 'Admin Beta', 'admin@beta.com', 1, EMPRESA_B, ts, ts),
    env.DB.prepare('INSERT INTO user (id, name, email, email_verified, empresa_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(USUARIO_VIEW, 'Viewer Alfa', 'view@alfa.com', 1, EMPRESA_A, ts, ts),
  ]);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO membros_empresa (empresa_id, user_id, papel, ativo, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(EMPRESA_A, USUARIO_A, 'admin', 1, agora, agora),
    env.DB.prepare('INSERT INTO membros_empresa (empresa_id, user_id, papel, ativo, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(EMPRESA_B, USUARIO_B, 'admin', 1, agora, agora),
    env.DB.prepare('INSERT INTO membros_empresa (empresa_id, user_id, papel, ativo, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(EMPRESA_A, USUARIO_VIEW, 'visualizador', 1, agora, agora),
  ]);
});

const db = () => getDb(env.DB);

// ─────────────────────────────────────────────────────────────────────────────
// A. CRUD
// ─────────────────────────────────────────────────────────────────────────────

describe('CRUD de clientes (D1 real)', () => {
  it('cria, lê, edita e desativa', async () => {
    const criado = await criarCliente(db(), EMPRESA_A, USUARIO_A, clienteValido);
    expect(criado.id).toBeGreaterThan(0);
    expect(criado.empresaId).toBe(EMPRESA_A);
    expect(criado.nome).toBe('Maria da Silva');
    expect(criado.versao).toBe(1);
    expect(criado.ativo).toBe(true);

    const lido = await getCliente(db(), EMPRESA_A, criado.id);
    expect(lido.documento).toBe('52998224725');

    const editado = await atualizarCliente(db(), EMPRESA_A, criado.id, 1, {
      ...clienteValido,
      nome: 'Maria S. Souza',
      cidade: 'Maceió',
      estado: 'AL',
    });
    expect(editado.nome).toBe('Maria S. Souza');
    expect(editado.versao).toBe(2);

    await desativarCliente(db(), EMPRESA_A, criado.id);
    const inativo = await getCliente(db(), EMPRESA_A, criado.id);
    expect(inativo.ativo).toBe(false);
    // continua existindo (sem exclusão física)
    expect(inativo.nome).toBe('Maria S. Souza');
  });

  it('rejeita dados inválidos com mapa de erros', async () => {
    const erro = await criarCliente(db(), EMPRESA_A, USUARIO_A, { nome: '' }).catch((e) => e);
    expect(erro).toBeInstanceOf(ClienteError);
    expect(erro.code).toBe('VALIDACAO');
    expect(erro.errors.nome).toBeTruthy();
  });

  it('pagina por cursor com ordenação determinística', async () => {
    for (let i = 1; i <= 5; i++) {
      await criarCliente(db(), EMPRESA_A, USUARIO_A, {
        ...clienteValido,
        nome: `Cliente ${String(i).padStart(2, '0')}`,
        documento: `5299822472${i}` === '52998224725' ? '52998224726' : `5299822472${i}`,
      });
    }
    const pagina1 = await listarClientes(db(), EMPRESA_A, { limite: 2 });
    expect(pagina1.itens).toHaveLength(2);
    expect(pagina1.itens[0].id).toBeGreaterThan(pagina1.itens[1].id); // mais recente primeiro
    expect(pagina1.proximoCursor).toBe(pagina1.itens[1].id);

    const pagina2 = await listarClientes(db(), EMPRESA_A, {
      limite: 2,
      cursor: pagina1.proximoCursor!,
    });
    expect(pagina2.itens).toHaveLength(2);
    expect(pagina2.itens[0].id).toBeLessThan(pagina1.itens[1].id);
  });

  it('busca por nome e por documento', async () => {
    await criarCliente(db(), EMPRESA_A, USUARIO_A, clienteValido);
    await criarCliente(db(), EMPRESA_A, USUARIO_A, {
      ...clienteValido,
      nome: 'João Pereira',
      documento: '11144477735',
    });

    const porNome = await listarClientes(db(), EMPRESA_A, { busca: 'Pereira' });
    expect(porNome.itens.map((c) => c.nome)).toEqual(['João Pereira']);

    const porDocumento = await listarClientes(db(), EMPRESA_A, { busca: '5299822' });
    expect(porDocumento.itens.map((c) => c.nome)).toEqual(['Maria da Silva']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B/C. Isolamento de tenant e unicidade
// ─────────────────────────────────────────────────────────────────────────────

describe('isolamento de tenant', () => {
  it('empresa B não lê, edita nem desativa cliente da empresa A', async () => {
    const criado = await criarCliente(db(), EMPRESA_A, USUARIO_A, clienteValido);

    await expect(getCliente(db(), EMPRESA_B, criado.id)).rejects.toMatchObject({
      code: 'NAO_ENCONTRADO',
    });
    await expect(
      atualizarCliente(db(), EMPRESA_B, criado.id, 1, clienteValido)
    ).rejects.toMatchObject({ code: 'NAO_ENCONTRADO' });
    await expect(desativarCliente(db(), EMPRESA_B, criado.id)).rejects.toMatchObject({
      code: 'NAO_ENCONTRADO',
    });

    const listaB = await listarClientes(db(), EMPRESA_B);
    expect(listaB.itens).toHaveLength(0);
  });

  it('documento duplicado na mesma empresa → erro; em outra empresa → permitido', async () => {
    await criarCliente(db(), EMPRESA_A, USUARIO_A, clienteValido);

    await expect(criarCliente(db(), EMPRESA_A, USUARIO_A, clienteValido)).rejects.toMatchObject({
      code: 'DOCUMENTO_DUPLICADO',
    });

    const naBeta = await criarCliente(db(), EMPRESA_B, USUARIO_B, clienteValido);
    expect(naBeta.empresaId).toBe(EMPRESA_B);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Concorrência otimista
// ─────────────────────────────────────────────────────────────────────────────

describe('edição concorrente', () => {
  it('versão desatualizada → CONFLITO_VERSAO; versão certa → aplica', async () => {
    const criado = await criarCliente(db(), EMPRESA_A, USUARIO_A, clienteValido);

    // Duas "abas" leem a versão 1; a primeira grava
    await atualizarCliente(db(), EMPRESA_A, criado.id, 1, {
      ...clienteValido,
      cidade: 'Maceió',
    });

    // A segunda tenta gravar sobre a versão 1 (desatualizada)
    await expect(
      atualizarCliente(db(), EMPRESA_A, criado.id, 1, { ...clienteValido, cidade: 'Recife' })
    ).rejects.toMatchObject({ code: 'CONFLITO_VERSAO' });

    // Com a versão nova, grava
    const ok = await atualizarCliente(db(), EMPRESA_A, criado.id, 2, {
      ...clienteValido,
      cidade: 'Recife',
    });
    expect(ok.cidade).toBe('Recife');
    expect(ok.versao).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Anexos privados (R2 real)
// ─────────────────────────────────────────────────────────────────────────────

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4

function arquivoPdf(nome = 'rg.pdf') {
  return new File([PDF_BYTES], nome, { type: 'application/pdf' });
}

describe('anexos privados', () => {
  it('upload → metadado no D1, objeto no R2, download mediado, remoção', async () => {
    const cliente = await criarCliente(db(), EMPRESA_A, USUARIO_A, clienteValido);

    const anexo = await registrarAnexo(db(), env.R2, EMPRESA_A, cliente.id, USUARIO_A, arquivoPdf());
    expect(anexo.nomeOriginal).toBe('rg.pdf');
    expect(anexo.chaveR2).toMatch(new RegExp(`^empresa/${EMPRESA_A}/clientes/${cliente.id}/`));
    // chave imprevisível: não é só o nome original
    expect(anexo.chaveR2).not.toBe(`empresa/${EMPRESA_A}/clientes/${cliente.id}/rg.pdf`);

    // Objeto existe no R2
    const objeto = await env.R2.get(anexo.chaveR2);
    expect(objeto).not.toBeNull();
    expect(objeto!.size).toBe(PDF_BYTES.length);
    // Consumir o stream libera o armazenamento isolado do Miniflare ao final do teste.
    expect(new Uint8Array(await objeto!.arrayBuffer())).toEqual(PDF_BYTES);

    // Listagem não expõe a chave no service de listagem pública
    const anexos = await listarAnexos(db(), EMPRESA_A, cliente.id);
    expect(anexos).toHaveLength(1);

    const meta = await getAnexo(db(), EMPRESA_A, cliente.id, anexo.id);
    expect(meta.id).toBe(anexo.id);

    await removerAnexo(db(), env.R2, EMPRESA_A, cliente.id, anexo.id);
    expect(await listarAnexos(db(), EMPRESA_A, cliente.id)).toHaveLength(0);
    expect(await env.R2.get(anexo.chaveR2)).toBeNull();
  });

  it('rejeita conteúdo que não corresponde ao tipo declarado', async () => {
    const cliente = await criarCliente(db(), EMPRESA_A, USUARIO_A, clienteValido);
    const falso = new File([new Uint8Array([1, 2, 3, 4])], 'virus.pdf', { type: 'application/pdf' });
    await expect(
      registrarAnexo(db(), env.R2, EMPRESA_A, cliente.id, USUARIO_A, falso)
    ).rejects.toMatchObject({ code: 'ANEXO_INVALIDO' });
    // Nada ficou no R2
    expect((await env.R2.list()).objects).toHaveLength(0);
  });

  it('empresa B não acessa anexo da empresa A', async () => {
    const cliente = await criarCliente(db(), EMPRESA_A, USUARIO_A, clienteValido);
    const anexo = await registrarAnexo(db(), env.R2, EMPRESA_A, cliente.id, USUARIO_A, arquivoPdf());

    await expect(getAnexo(db(), EMPRESA_B, cliente.id, anexo.id)).rejects.toMatchObject({
      code: 'NAO_ENCONTRADO',
    });
    await expect(listarAnexos(db(), EMPRESA_B, cliente.id)).rejects.toMatchObject({
      code: 'NAO_ENCONTRADO',
    });
    await expect(
      removerAnexo(db(), env.R2, EMPRESA_B, cliente.id, anexo.id)
    ).rejects.toMatchObject({ code: 'NAO_ENCONTRADO' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. Rotas HTTP com sessão Better Auth
// ─────────────────────────────────────────────────────────────────────────────

async function criarSessao(userId: string): Promise<string> {
  const token = `tok-${userId}`;
  const agora = Date.now();
  await env.DB.prepare(
    'INSERT INTO session (id, user_id, token, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(`sess-${userId}`, userId, token, agora + 3600_000, agora, agora)
    .run();
  return token;
}

function app() {
  return createApiAppV2();
}

const ENV = {
  ...(env as unknown as Record<string, unknown>),
  BETTER_AUTH_SECRET: 'segredo-de-teste-f3-01-com-32-chars',
  PUBLIC_APP_URL: 'http://localhost:5173',
  PUBLIC_ENVIRONMENT: 'development',
};

function authed(token: string, extra: Record<string, string> = {}) {
  return {
    cookie: `better-auth.session_token=${token}`,
    origin: 'http://localhost:5173',
    ...extra,
  };
}

describe('rotas /api/v2/clientes', () => {
  it('mede as consultas D1 da listagem autenticada para F3-04', async () => {
    const token = await criarSessao(USUARIO_A);
    await criarCliente(db(), EMPRESA_A, USUARIO_A, clienteValido);
    await env.DB.batch(
      Array.from({ length: 21 }, (_, index) => {
        const numero = String(index + 1).padStart(2, '0');
        return env.DB.prepare(
          `INSERT INTO clientes
            (empresa_id, nome, tipo_pessoa, documento, telefone, criado_em, atualizado_em)
           VALUES (?, ?, 'PF', ?, ?, ?, ?)`
        ).bind(
          EMPRESA_A,
          `Cliente de medição ${numero}`,
          `900000000${String(index + 1).padStart(2, '0')}`,
          `119000000${numero}`,
          new Date().toISOString(),
          new Date().toISOString()
        );
      })
    );

    const queries: string[] = [];
    const countedDB = new Proxy(env.DB, {
      get(target, property) {
        if (property === 'prepare') {
          return (sql: string) => {
            queries.push(sql);
            return target.prepare(sql);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const measurementEnv = { ...ENV, DB: countedDB } as typeof env;

    const response = await app().request(
      '/api/v2/clientes?limite=20',
      { headers: authed(token) },
      measurementEnv
    );

    expect(response.status).toBe(200);
    const firstPage = (await response.json()) as {
      itens: unknown[];
      proximo_cursor: number | null;
    };
    expect(firstPage.itens).toHaveLength(20);
    expect(firstPage.proximo_cursor).not.toBeNull();
    expect(queries).toHaveLength(4);
    const firstPageQueryCount = queries.length;

    queries.length = 0;
    const nextPage = await app().request(
      `/api/v2/clientes?limite=20&cursor=${firstPage.proximo_cursor}`,
      { headers: authed(token) },
      measurementEnv
    );
    expect(nextPage.status).toBe(200);
    expect((await nextPage.json() as { itens: unknown[] }).itens).toHaveLength(2);
    expect(queries).toHaveLength(4);
    console.info(
      `[F3-04] GET /api/v2/clientes: ${firstPageQueryCount} consultas D1 por página; ` +
        `página seguinte: ${queries.length}`
    );
  });

  it('sem sessão → 401', async () => {
    const res = await app().request('/api/v2/clientes', {}, ENV);
    expect(res.status).toBe(401);
  });

  it('responde indisponibilidade recuperável sem sessão', async () => {
    const unavailable = await app().request('/api/v2/clientes', {}, {
      PUBLIC_APP_URL: 'http://localhost:5173',
      PUBLIC_ENVIRONMENT: 'development',
    } as typeof env);
    expect(unavailable.status).toBe(503);

    const retry = await app().request('/api/v2/clientes', {}, ENV);
    expect(retry.status).toBe(401);
  });

  it('visualizador não cria cliente (403), mas lista (200)', async () => {
    const token = await criarSessao(USUARIO_VIEW);

    const post = await app().request(
      '/api/v2/clientes',
      {
        method: 'POST',
        headers: authed(token, { 'content-type': 'application/json' }),
        body: JSON.stringify(clienteValido),
      },
      ENV
    );
    expect(post.status).toBe(403);

    const get = await app().request('/api/v2/clientes', { headers: authed(token) }, ENV);
    expect(get.status).toBe(200);
  });

  it('fluxo feliz: criar → listar → detalhe → editar → desativar', async () => {
    const token = await criarSessao(USUARIO_A);
    const app2 = app();

    const criado = await app2.request(
      '/api/v2/clientes',
      {
        method: 'POST',
        headers: authed(token, { 'content-type': 'application/json' }),
        body: JSON.stringify(clienteValido),
      },
      ENV
    );
    expect(criado.status).toBe(201);
    const { data } = (await criado.json()) as { data: { id: number; versao: number } };

    const lista = await app2.request('/api/v2/clientes?busca=Maria', { headers: authed(token) }, ENV);
    const listaJson = (await lista.json()) as { itens: { nome: string }[] };
    expect(listaJson.itens.map((c) => c.nome)).toEqual(['Maria da Silva']);

    const editado = await app2.request(
      `/api/v2/clientes/${data.id}`,
      {
        method: 'PATCH',
        headers: authed(token, { 'content-type': 'application/json' }),
        body: JSON.stringify({ ...clienteValido, cidade: 'Maceió', versao: data.versao }),
      },
      ENV
    );
    expect(editado.status).toBe(200);

    // Versão errada → 409
    const conflito = await app2.request(
      `/api/v2/clientes/${data.id}`,
      {
        method: 'PATCH',
        headers: authed(token, { 'content-type': 'application/json' }),
        body: JSON.stringify({ ...clienteValido, cidade: 'Recife', versao: 1 }),
      },
      ENV
    );
    expect(conflito.status).toBe(409);

    const removido = await app2.request(
      `/api/v2/clientes/${data.id}`,
      { method: 'DELETE', headers: authed(token) },
      ENV
    );
    expect(removido.status).toBe(200);
  });

  it('empresa B recebe 404 para cliente da empresa A (sem vazar existência)', async () => {
    const tokenA = await criarSessao(USUARIO_A);
    const tokenB = await criarSessao(USUARIO_B);
    const app2 = app();

    const criado = await app2.request(
      '/api/v2/clientes',
      {
        method: 'POST',
        headers: authed(tokenA, { 'content-type': 'application/json' }),
        body: JSON.stringify(clienteValido),
      },
      ENV
    );
    const { data } = (await criado.json()) as { data: { id: number } };

    const detalhe = await app2.request(
      `/api/v2/clientes/${data.id}`,
      { headers: authed(tokenB) },
      ENV
    );
    expect(detalhe.status).toBe(404);
  });

  it('lista paginada e metadados de anexos respondem em conjunto para a sessão sintética', async () => {
    const token = await criarSessao(USUARIO_A);
    const criado = await app().request(
      '/api/v2/clientes',
      {
        method: 'POST',
        headers: authed(token, { 'content-type': 'application/json' }),
        body: JSON.stringify(clienteValido),
      },
      ENV
    );
    const { data } = (await criado.json()) as { data: { id: number } };

    const [lista, anexos] = await Promise.all([
      app().request('/api/v2/clientes?limite=20', { headers: authed(token) }, ENV),
      app().request(`/api/v2/clientes/${data.id}/anexos`, { headers: authed(token) }, ENV),
    ]);
    expect(lista.status).toBe(200);
    expect(anexos.status).toBe(200);
    expect((await lista.json() as { itens: unknown[] }).itens).toHaveLength(1);
    expect((await anexos.json() as { itens: unknown[] }).itens).toHaveLength(0);
  });

  it('upload de anexo via multipart e download mediado', async () => {
    const token = await criarSessao(USUARIO_A);
    const app2 = app();

    const criado = await app2.request(
      '/api/v2/clientes',
      {
        method: 'POST',
        headers: authed(token, { 'content-type': 'application/json' }),
        body: JSON.stringify(clienteValido),
      },
      ENV
    );
    const { data } = (await criado.json()) as { data: { id: number } };

    const invalidForm = new FormData();
    invalidForm.append('arquivo', new File([new Uint8Array([1, 2, 3, 4])], 'falso.pdf', { type: 'application/pdf' }));
    const invalidUpload = await app2.request(
      `/api/v2/clientes/${data.id}/anexos`,
      { method: 'POST', headers: authed(token), body: invalidForm },
      ENV
    );
    expect(invalidUpload.status).toBe(400);

    const form = new FormData();
    form.append('arquivo', arquivoPdf('identidade.pdf'));
    const upload = await app2.request(
      `/api/v2/clientes/${data.id}/anexos`,
      { method: 'POST', headers: authed(token), body: form },
      ENV
    );
    expect(upload.status).toBe(201);
    const { data: anexo } = (await upload.json()) as { data: { id: number } };

    const download = await app2.request(
      `/api/v2/clientes/${data.id}/anexos/${anexo.id}`,
      { headers: authed(token) },
      ENV
    );
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe('application/pdf');
    expect(download.headers.get('x-content-type-options')).toBe('nosniff');
    const bytes = new Uint8Array(await download.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x25, 0x50, 0x44, 0x46]);
  });
});
