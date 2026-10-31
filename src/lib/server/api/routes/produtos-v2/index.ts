/**
 * Rotas Hono para produtos — /api/v2/produtos (M03).
 *
 * Produtos formam um catálogo global (sem empresa_id).
 * Qualquer usuário autenticado pode listar e ver detalhes.
 * Criar, editar e inativar exigem papel `admin` ou `operador` com
 * permissão em `configuracoes`.
 *
 * Endpoints:
 *   GET    /api/v2/produtos            — listar ativos (busca, tipo, limite)
 *   POST   /api/v2/produtos            — criar novo produto
 *   GET    /api/v2/produtos/:id        — detalhe de um produto (incluindo inativos)
 *   PATCH  /api/v2/produtos/:id        — editar campos do produto
 *   DELETE /api/v2/produtos/:id        — inativar produto (soft delete)
 */

import { Hono, type Context } from 'hono';
import type { ApiEnv } from '../../types';
import { resolveAuthContext } from '$lib/server/auth/context';
import { can } from '$lib/server/policy';
import { getDb } from '$lib/server/db/client';
import {
  ProdutoError,
  criarProduto,
  editarProduto,
  inativarProduto,
  listarProdutos,
  obterProduto,
  type ProdutoInput,
} from '$lib/server/vendas/service';

export const produtosV2Routes = new Hono<ApiEnv>();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function contexto(c: Context<ApiEnv>) {
  const { DB, BETTER_AUTH_SECRET, PUBLIC_APP_URL, PUBLIC_ENVIRONMENT } = c.env;
  if (!DB || !BETTER_AUTH_SECRET) return { res: c.json({ error: 'Serviço indisponível.' }, 503) };
  const baseURL =
    PUBLIC_ENVIRONMENT === 'production'
      ? 'https://vturapp.com.br'
      : PUBLIC_APP_URL ?? 'http://localhost:5173';
  const ctx = await resolveAuthContext(c.req.raw.headers, DB, BETTER_AUTH_SECRET, baseURL);
  if (!ctx) return { res: c.json({ error: 'Não autenticado.' }, 401) };
  return { ctx, db: getDb(DB) };
}

function respostaErro(c: Context<ApiEnv>, err: unknown) {
  if (err instanceof ProdutoError) {
    const status = err.code === 'NAO_ENCONTRADO' ? 404 : err.code === 'VALIDACAO' ? 400 : 409;
    return c.json({ error: err.message, code: err.code }, status);
  }
  throw err;
}

function parseId(valor: string): number | null {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v2/produtos — listar produtos ativos
// ─────────────────────────────────────────────────────────────────────────────

produtosV2Routes.get('/', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;

  // Qualquer papel autenticado pode listar produtos
  const busca = c.req.query('busca') || undefined;
  const tipo = c.req.query('tipo') || undefined;
  const limiteRaw = Number(c.req.query('limite') ?? 50);
  const limite = Number.isInteger(limiteRaw) && limiteRaw > 0 ? Math.min(limiteRaw, 200) : 50;

  const lista = await listarProdutos(r.db, { busca, tipo, limite });
  return c.json({ itens: lista, total: lista.length });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v2/produtos — criar produto
// ─────────────────────────────────────────────────────────────────────────────

produtosV2Routes.post('/', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'configuracoes', 'criar')) return c.json({ error: 'Sem permissão.' }, 403);

  const body = await c.req.json<ProdutoInput>().catch(() => null);
  if (!body) return c.json({ error: 'Corpo JSON inválido.' }, 400);

  try {
    const produto = await criarProduto(r.db, body);
    return c.json(produto, 201);
  } catch (err) {
    return respostaErro(c, err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v2/produtos/:id — detalhe
// ─────────────────────────────────────────────────────────────────────────────

produtosV2Routes.get('/:id', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;

  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'ID inválido.' }, 400);

  try {
    const produto = await obterProduto(r.db, id);
    return c.json(produto);
  } catch (err) {
    return respostaErro(c, err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v2/produtos/:id — editar
// ─────────────────────────────────────────────────────────────────────────────

produtosV2Routes.patch('/:id', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'configuracoes', 'editar')) return c.json({ error: 'Sem permissão.' }, 403);

  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'ID inválido.' }, 400);

  const body = await c.req.json<Partial<ProdutoInput>>().catch(() => null);
  if (!body) return c.json({ error: 'Corpo JSON inválido.' }, 400);

  try {
    const produto = await editarProduto(r.db, id, body);
    return c.json(produto);
  } catch (err) {
    return respostaErro(c, err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/v2/produtos/:id — inativar (soft delete)
// ─────────────────────────────────────────────────────────────────────────────

produtosV2Routes.delete('/:id', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'configuracoes', 'excluir')) return c.json({ error: 'Sem permissão.' }, 403);

  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'ID inválido.' }, 400);

  try {
    await inativarProduto(r.db, id);
    return c.json({ ok: true });
  } catch (err) {
    return respostaErro(c, err);
  }
});
