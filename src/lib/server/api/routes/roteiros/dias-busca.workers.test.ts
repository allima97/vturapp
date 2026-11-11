/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, expect, it, vi } from 'vitest';
import { createDataClient } from '$lib/server/data/query';

const state = vi.hoisted(() => ({
  scope: { isAdmin: false, isGestor: false, isMaster: false, companyId: null as string | null }
}));
vi.mock('$lib/server/v1', async (original) => ({
  ...(await original<typeof import('$lib/server/v1')>()),
  getAdminClient: () => ({}),
  requireAuthenticatedUser: async () => ({ id: 'owner' }),
  resolveUserScope: async () => state.scope,
  ensureModuloAccess: () => undefined,
  sanitizePostgrestSearchTerm: (value: string | null) => value ?? ''
}));
import { handleRoteirosDiasBuscaGet } from './dias-busca';
import { handleRoteirosSugestoesSalvarPost } from './sugestoes-salvar';
import { handleRoteirosPatch } from './root';

async function buscar(params: string) {
  return handleRoteirosDiasBuscaGet({
    url: new URL(`https://vtur.app/api/v1/roteiros/dias-busca?${params}`),
    platform: { env: { DB: env.DB, GEO_DB: env.GEO_TEST } }
  } as Parameters<typeof handleRoteirosDiasBuscaGet>[0]);
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.GEO_TEST.batch([
    env.GEO_TEST.prepare(
      'CREATE TABLE place (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country_code TEXT NOT NULL, admin1 TEXT NOT NULL, admin2 TEXT NOT NULL, population INTEGER NOT NULL, feature_class TEXT NOT NULL, feature_code TEXT NOT NULL)'
    ),
    env.GEO_TEST.prepare(
      "INSERT INTO place VALUES (1, 'Rome', 'IT', '', '', 1, 'P', 'PPL'), (2, 'Italy', 'IT', '', '', 0, 'A', 'PCLI')"
    ),
    env.GEO_TEST.prepare(
      'CREATE TABLE alternate_name (id INTEGER PRIMARY KEY, place_id INTEGER NOT NULL, language TEXT NOT NULL, name TEXT NOT NULL, preferred INTEGER NOT NULL, short INTEGER NOT NULL, colloquial INTEGER NOT NULL, historic INTEGER NOT NULL)'
    ),
    env.GEO_TEST.prepare("INSERT INTO alternate_name VALUES (1, 1, 'pt', 'Roma', 1, 0, 0, 0)")
  ]);
  await env.DB.prepare(
    "INSERT INTO legado_cidades (id, nome, estado_nome, pais_nome) VALUES (?, 'Roma', 'Lácio', 'Itália')"
  )
    .bind(crypto.randomUUID())
    .run();
  const rows = Array.from({ length: 22 }, (_, index) =>
    env.DB.prepare(
      'INSERT INTO legado_roteiro_dia (id, created_by, cidade, cidade_id, descricao, percurso) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), 'owner', 'Roma, Italy', 'geonames:1', `Museu ${index}`, 'Visita')
  );
  rows.push(
    env.DB.prepare(
      "INSERT INTO legado_roteiro_dia (id, created_by, cidade, cidade_id, descricao) VALUES (?, 'owner', 'Roma, Italy', NULL, 'Dia legado')"
    ).bind(crypto.randomUUID()),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_dia (id, created_by, cidade, cidade_id, descricao) VALUES (?, 'owner', 'Roma, Italy', 'geonames:99', 'Outro destino')"
    ).bind(crypto.randomUUID()),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_dia (id, created_by, cidade, cidade_id, descricao) VALUES (?, 'outro', 'Roma, Italy', 'geonames:1', 'Outro usuário')"
    ).bind(crypto.randomUUID()),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_dia (id, created_by, cidade, descricao) VALUES (?, 'owner', 'Roma, Lácio, Itália', 'Dia cadastrado')"
    ).bind(crypto.randomUUID()),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_dia (id, created_by, cidade, descricao) VALUES (?, 'owner', 'Roma', 'Dia inválido')"
    ).bind(crypto.randomUUID())
  );
  await env.DB.batch(rows);
});

it('busca por identidade e rótulo exato, com paginação e isolamento do proprietário', async () => {
  const primeira = await buscar('cidade_id=geonames%3A1&cidade_exata=valor-falso');
  expect(primeira.status).toBe(200);
  const pagina = await primeira.json<{ dias: { descricao: string }[]; temMais: boolean }>();
  expect(pagina.dias).toHaveLength(20);
  expect(pagina.temMais).toBe(true);
  const segunda = await buscar('cidade_id=geonames%3A1&offset=20');
  const resto = await segunda.json<{ dias: { descricao: string }[]; temMais: boolean }>();
  expect(resto.dias).toHaveLength(3);
  expect(resto.temMais).toBe(false);
  const descricoes = [...pagina.dias, ...resto.dias].map((dia) => dia.descricao);
  expect(descricoes).toContain('Dia legado');
  expect(descricoes).not.toContain('Outro destino');
  expect(descricoes).not.toContain('Outro usuário');
});

it('filtra texto e exige cidade cadastrada exata', async () => {
  const response = await buscar('cidade_id=geonames%3A1&q=legado');
  expect(await response.json()).toMatchObject({
    dias: [{ descricao: 'Dia legado' }],
    temMais: false
  });
  const cadastrada = await buscar(`cidade_exata=${encodeURIComponent('Roma, Lácio, Itália')}`);
  expect(await cadastrada.json()).toMatchObject({
    dias: [{ descricao: 'Dia cadastrado' }],
    temMais: false
  });
  expect((await buscar('cidade_exata=Roma')).status).toBe(400);
  expect((await buscar('cidade_id=geonames%3A999')).status).toBe(400);
  expect((await buscar('cidade_id=geonames%3A1&offset=-1')).status).toBe(400);
});

it('impede recriar sugestões livres de cidades pelas duas rotas legadas', async () => {
  const body = { action: 'sugestoes-salvar', tipo: ' Cidade ', valor: 'Roma' };
  const request = (method: string) =>
    new Request('https://vtur.app/api/v1/roteiros', {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  const post = await handleRoteirosSugestoesSalvarPost({
    request: request('POST')
  } as Parameters<typeof handleRoteirosSugestoesSalvarPost>[0]);
  expect(post.status).toBe(400);
  const patch = await handleRoteirosPatch({
    request: request('PATCH'),
    locals: {
      dados: createDataClient({
        db: env.DB,
        r2: env.R2,
        secret: 'segredo-de-teste-com-32-caracteres',
        origin: 'https://vtur.app',
        headers: new Headers()
      }),
      safeGetSession: async () => ({
        session: { access_token: 'teste', refresh_token: 'teste', user: { id: 'owner' } },
        user: { id: 'owner' }
      })
    }
  } as Parameters<typeof handleRoteirosPatch>[0]);
  expect(patch.status).toBe(400);
});
