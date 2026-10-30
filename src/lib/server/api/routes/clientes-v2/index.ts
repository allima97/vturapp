/**
 * Rotas Hono para clientes — /api/v2/clientes (F3-01 / M02).
 *
 * Fundações usadas:
 *   - auth: resolveAuthContext (F2-02) — sessão Better Auth + papel
 *   - RBAC: can() (F2-03) — recurso 'clientes', ações ler/criar/editar/excluir
 *   - tenant: queries filtram empresa_id do contexto (F2-04)
 *   - anexos: R2 privado com download mediado (F1-05)
 *
 * Endpoints:
 *   GET    /api/v2/clientes                      — listar (busca, cursor)
 *   POST   /api/v2/clientes                      — criar
 *   GET    /api/v2/clientes/:id                  — detalhe
 *   PATCH  /api/v2/clientes/:id                  — editar (exige versao)
 *   DELETE /api/v2/clientes/:id                  — desativar (soft delete)
 *   GET    /api/v2/clientes/:id/anexos           — listar anexos
 *   POST   /api/v2/clientes/:id/anexos           — upload (multipart)
 *   GET    /api/v2/clientes/:id/anexos/:anexoId  — download mediado
 *   DELETE /api/v2/clientes/:id/anexos/:anexoId  — remover anexo
 */

import { Hono, type Context } from 'hono';
import type { ApiEnv } from '../../types';
import { resolveAuthContext } from '$lib/server/auth/context';
import { can } from '$lib/server/policy';
import { getDb } from '$lib/server/db/client';
import { r2Download } from '$lib/server/r2/client';
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
} from '$lib/server/clientes/service';

export const clientesV2Routes = new Hono<ApiEnv>();

/** Resolve auth + bindings; já respondeu (503/401) quando retorna `{ res }`. */
async function contexto(c: Context<ApiEnv>) {
  const { DB, BETTER_AUTH_SECRET, PUBLIC_APP_URL, PUBLIC_ENVIRONMENT } = c.env;
  if (!DB || !BETTER_AUTH_SECRET) {
    return { res: c.json({ error: 'Serviço indisponível.' }, 503) };
  }
  const baseURL =
    PUBLIC_ENVIRONMENT === 'production'
      ? 'https://vturapp.com.br'
      : PUBLIC_APP_URL ?? 'http://localhost:5173';
  const ctx = await resolveAuthContext(c.req.raw.headers, DB, BETTER_AUTH_SECRET, baseURL);
  if (!ctx) {
    return { res: c.json({ error: 'Não autenticado.' }, 401) };
  }
  return { ctx, db: getDb(DB), env: c.env };
}

function respostaErro(c: Context<ApiEnv>, err: unknown) {
  if (err instanceof ClienteError) {
    const status =
      err.code === 'NAO_ENCONTRADO' ? 404
      : err.code === 'DOCUMENTO_DUPLICADO' ? 409
      : err.code === 'CONFLITO_VERSAO' ? 409
      : err.code === 'VALIDACAO' ? 400
      : err.code === 'ANEXO_INVALIDO' ? 400
      : 500;
    return c.json({ error: err.message, code: err.code, errors: err.errors }, status);
  }
  throw err;
}

function parseId(valor: string): number | null {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET / — listar com busca e cursor
// ─────────────────────────────────────────────────────────────────────────────

clientesV2Routes.get('/', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'clientes', 'ler')) return c.json({ error: 'Sem permissão.' }, 403);

  const busca = c.req.query('busca') || undefined;
  const cursorParam = c.req.query('cursor');
  const cursor = cursorParam ? parseId(cursorParam) : undefined;
  const limiteParam = c.req.query('limite');
  const limite = limiteParam ? Number(limiteParam) : undefined;
  const incluirInativos = c.req.query('inativos') === '1';

  const resultado = await listarClientes(r.db, r.ctx.empresaId, {
    busca,
    cursor: cursor ?? undefined,
    limite: limite && Number.isInteger(limite) ? limite : undefined,
    somenteAtivos: !incluirInativos,
  });

  return c.json({
    itens: resultado.itens.map(paraJson),
    proximo_cursor: resultado.proximoCursor,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST / — criar
// ─────────────────────────────────────────────────────────────────────────────

clientesV2Routes.post('/', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'clientes', 'criar')) return c.json({ error: 'Sem permissão.' }, 403);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'JSON inválido.' }, 400);
  }

  try {
    const cliente = await criarCliente(r.db, r.ctx.empresaId, r.ctx.userId, body);
    return c.json({ data: paraJson(cliente) }, 201);
  } catch (err) {
    return respostaErro(c, err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:id — detalhe
// ─────────────────────────────────────────────────────────────────────────────

clientesV2Routes.get('/:id', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'clientes', 'ler')) return c.json({ error: 'Sem permissão.' }, 403);

  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'ID inválido.' }, 400);

  try {
    const cliente = await getCliente(r.db, r.ctx.empresaId, id);
    return c.json({ data: paraJson(cliente) });
  } catch (err) {
    return respostaErro(c, err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /:id — editar (concorrência otimista: body.versao obrigatório)
// ─────────────────────────────────────────────────────────────────────────────

clientesV2Routes.patch('/:id', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'clientes', 'editar')) return c.json({ error: 'Sem permissão.' }, 403);

  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'ID inválido.' }, 400);

  let body: { versao?: unknown } & Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'JSON inválido.' }, 400);
  }

  const versao = Number(body.versao);
  if (!Number.isInteger(versao) || versao < 1) {
    return c.json({ error: 'Campo obrigatório: versao (número inteiro da versão lida).' }, 400);
  }

  try {
    const cliente = await atualizarCliente(r.db, r.ctx.empresaId, id, versao, body);
    return c.json({ data: paraJson(cliente) });
  } catch (err) {
    return respostaErro(c, err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:id — desativar (soft delete; histórico preservado)
// ─────────────────────────────────────────────────────────────────────────────

clientesV2Routes.delete('/:id', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'clientes', 'excluir')) return c.json({ error: 'Sem permissão.' }, 403);

  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'ID inválido.' }, 400);

  try {
    await desativarCliente(r.db, r.ctx.empresaId, id);
    return c.json({ ok: true });
  } catch (err) {
    return respostaErro(c, err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Anexos
// ─────────────────────────────────────────────────────────────────────────────

clientesV2Routes.get('/:id/anexos', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'clientes', 'ler')) return c.json({ error: 'Sem permissão.' }, 403);

  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'ID inválido.' }, 400);

  try {
    const anexos = await listarAnexos(r.db, r.ctx.empresaId, id);
    return c.json({
      itens: anexos.map((a) => ({
        id: a.id,
        nome_original: a.nomeOriginal,
        content_type: a.contentType,
        tamanho_bytes: a.tamanhoBytes,
        criado_em: a.criadoEm,
      })),
    });
  } catch (err) {
    return respostaErro(c, err);
  }
});

clientesV2Routes.post('/:id/anexos', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'clientes', 'editar')) return c.json({ error: 'Sem permissão.' }, 403);
  if (!r.env.R2) return c.json({ error: 'Armazenamento indisponível.' }, 503);

  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'ID inválido.' }, 400);

  let file: File | null;
  try {
    const form = await c.req.formData();
    const valor = form.get('arquivo');
    file = valor instanceof File ? valor : null;
  } catch {
    return c.json({ error: 'Envie multipart/form-data com o campo "arquivo".' }, 400);
  }
  if (!file) return c.json({ error: 'Campo obrigatório: arquivo.' }, 400);

  try {
    const anexo = await registrarAnexo(r.db, r.env.R2, r.ctx.empresaId, id, r.ctx.userId, file);
    return c.json(
      {
        data: {
          id: anexo.id,
          nome_original: anexo.nomeOriginal,
          content_type: anexo.contentType,
          tamanho_bytes: anexo.tamanhoBytes,
          criado_em: anexo.criadoEm,
        },
      },
      201
    );
  } catch (err) {
    return respostaErro(c, err);
  }
});

clientesV2Routes.get('/:id/anexos/:anexoId', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'clientes', 'ler')) return c.json({ error: 'Sem permissão.' }, 403);
  if (!r.env.R2) return c.json({ error: 'Armazenamento indisponível.' }, 503);

  const id = parseId(c.req.param('id'));
  const anexoId = parseId(c.req.param('anexoId'));
  if (!id || !anexoId) return c.json({ error: 'ID inválido.' }, 400);

  try {
    const anexo = await getAnexo(r.db, r.ctx.empresaId, id, anexoId);
    // Download mediado: a chave R2 nunca sai do servidor (roteiro §5)
    const objeto = await r2Download(r.env.R2, anexo.chaveR2, r.ctx.empresaId);
    if (!objeto) return c.json({ error: 'Arquivo não encontrado no armazenamento.' }, 404);

    return new Response(objeto.body, {
      headers: {
        'content-type': anexo.contentType,
        'content-disposition': `attachment; filename="${anexo.nomeOriginal.replace(/[^\w.\- ]/g, '_')}"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (err) {
    return respostaErro(c, err);
  }
});

clientesV2Routes.delete('/:id/anexos/:anexoId', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'clientes', 'editar')) return c.json({ error: 'Sem permissão.' }, 403);
  if (!r.env.R2) return c.json({ error: 'Armazenamento indisponível.' }, 503);

  const id = parseId(c.req.param('id'));
  const anexoId = parseId(c.req.param('anexoId'));
  if (!id || !anexoId) return c.json({ error: 'ID inválido.' }, 400);

  try {
    await removerAnexo(r.db, r.env.R2, r.ctx.empresaId, id, anexoId);
    return c.json({ ok: true });
  } catch (err) {
    return respostaErro(c, err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────

/** Serialização pública: snake_case (contrato do legado), tags como array. */
function paraJson(row: import('$lib/server/db/schema').Cliente) {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(row.tags);
    if (Array.isArray(parsed)) tags = parsed.map(String);
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    nome: row.nome,
    tipo_pessoa: row.tipoPessoa,
    documento: row.documento,
    nascimento: row.nascimento,
    telefone: row.telefone,
    whatsapp: row.whatsapp,
    email: row.email,
    classificacao: row.classificacao,
    endereco: row.endereco,
    numero: row.numero,
    complemento: row.complemento,
    cidade: row.cidade,
    estado: row.estado,
    cep: row.cep,
    rg: row.rg,
    genero: row.genero,
    nacionalidade: row.nacionalidade,
    tags,
    tipo_cliente: row.tipoCliente,
    notas: row.notas,
    ativo: row.ativo,
    versao: row.versao,
    criado_em: row.criadoEm,
    atualizado_em: row.atualizadoEm,
  };
}
