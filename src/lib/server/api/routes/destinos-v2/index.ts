/**
 * Rotas Hono para destinos — /api/v2/destinos (M10).
 *
 * Destinos formam um catálogo global (sem empresa_id).
 * Qualquer usuário autenticado pode listar e ver detalhes.
 * Criar, editar e inativar exigem permissão em `configuracoes`.
 *
 * Endpoints:
 *   GET    /api/v2/destinos            — listar ativos (busca, pais, limite)
 *   POST   /api/v2/destinos            — criar novo destino
 *   GET    /api/v2/destinos/:id        — detalhe de um destino (incluindo inativos)
 *   PATCH  /api/v2/destinos/:id        — editar campos do destino
 *   DELETE /api/v2/destinos/:id        — inativar destino (soft delete)
 */

import { Hono, type Context } from 'hono';
import type { ApiEnv } from '../../types';
import { resolveAuthContext } from '$lib/server/auth/context';
import { can } from '$lib/server/policy';
import { getDb } from '$lib/server/db/client';
import {
  DestinoError,
  criarDestino,
  editarDestino,
  inativarDestino,
  listarDestinos,
  obterDestino,
  type DestinoInput,
} from '$lib/server/destinos/service';

export const destinosV2Routes = new Hono<ApiEnv>();

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
  if (err instanceof DestinoError) {
    const status = err.code === 'NAO_ENCONTRADO' ? 404 : 400;
    return c.json({ error: err.message, code: err.code }, status);
  }
  throw err;
}

function parseId(valor: string): number | null {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET / — listar destinos ativos
// ─────────────────────────────────────────────────────────────────────────────

destinosV2Routes.get('/', async (c) => {
  const result = await contexto(c);
  if ('res' in result) return result.res;
  const { db } = result;

  const busca = c.req.query('busca') ?? undefined;
  const pais = c.req.query('pais') ?? undefined;
  const limiteStr = c.req.query('limite');
  const limite = limiteStr ? Math.min(Number(limiteStr) || 50, 200) : 50;

  const lista = await listarDestinos(db, { busca, pais, limite });
  return c.json({ destinos: lista, total: lista.length });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST / — criar destino
// ─────────────────────────────────────────────────────────────────────────────

destinosV2Routes.post('/', async (c) => {
  const result = await contexto(c);
  if ('res' in result) return result.res;
  const { ctx, db } = result;

  if (!can(ctx.papel, 'configuracoes', 'criar')) {
    return c.json({ error: 'Sem permissão para criar destinos.' }, 403);
  }

  const body = await c.req.json<DestinoInput>();

  try {
    const destino = await criarDestino(db, body);
    return c.json(destino, 201);
  } catch (err) {
    return respostaErro(c, err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:id — detalhe do destino
// ─────────────────────────────────────────────────────────────────────────────

destinosV2Routes.get('/:id', async (c) => {
  const result = await contexto(c);
  if ('res' in result) return result.res;
  const { db } = result;

  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'ID inválido.' }, 400);

  try {
    const destino = await obterDestino(db, id);
    return c.json(destino);
  } catch (err) {
    return respostaErro(c, err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /:id — editar destino
// ─────────────────────────────────────────────────────────────────────────────

destinosV2Routes.patch('/:id', async (c) => {
  const result = await contexto(c);
  if ('res' in result) return result.res;
  const { ctx, db } = result;

  if (!can(ctx.papel, 'configuracoes', 'editar')) {
    return c.json({ error: 'Sem permissão para editar destinos.' }, 403);
  }

  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'ID inválido.' }, 400);

  const body = await c.req.json<Partial<DestinoInput>>();

  try {
    const destino = await editarDestino(db, id, body);
    return c.json(destino);
  } catch (err) {
    return respostaErro(c, err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:id — inativar destino
// ─────────────────────────────────────────────────────────────────────────────

destinosV2Routes.delete('/:id', async (c) => {
  const result = await contexto(c);
  if ('res' in result) return result.res;
  const { ctx, db } = result;

  if (!can(ctx.papel, 'configuracoes', 'excluir')) {
    return c.json({ error: 'Sem permissão para inativar destinos.' }, 403);
  }

  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'ID inválido.' }, 400);

  try {
    await inativarDestino(db, id);
    return c.json({ ok: true });
  } catch (err) {
    return respostaErro(c, err);
  }
});
