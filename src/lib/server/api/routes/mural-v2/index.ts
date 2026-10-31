/**
 * M09 — Mural de recados v2 (D1 / Drizzle).
 *
 * Polling com cursor (ADR-008): GET /recados?since=<ISO>
 */
import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { resolveAuthContext } from '$lib/server/auth/context';
import { can } from '$lib/server/policy';
import {
  criarRecado,
  excluirRecado,
  listarRecados,
  listarTodosRecados,
  MuralError,
} from '$lib/server/mural-m09/service';
import { getDb } from '$lib/server/db/client';

export const muralV2Routes = new Hono<ApiEnv>()

  /**
   * GET /recados
   * Query params: since (ISO), limit (int)
   * Gerente/admin vê todos da empresa; operador/visualizador vê os próprios + broadcast.
   */
  .get('/recados', async (c) => {
    const { DB, BETTER_AUTH_SECRET } = c.env;
    const baseURL = new URL(c.req.url).origin;
    const ctx = await resolveAuthContext(c.req.raw.headers, DB, BETTER_AUTH_SECRET, baseURL);
    if (!ctx) return c.json({ error: 'Não autenticado.' }, 401);
    if (!can(ctx.papel, 'mural', 'ler')) return c.json({ error: 'Sem permissão.' }, 403);

    const db = getDb(DB);
    const since = c.req.query('since') ?? undefined;
    const limit = Number(c.req.query('limit') ?? 50);

    const isGerente = ctx.papel === 'admin';

    const recados = isGerente
      ? await listarTodosRecados(db, ctx.empresaId, { since, limit })
      : await listarRecados(db, ctx.empresaId, ctx.userId, { since, limit });

    return c.json({ recados });
  })

  /**
   * POST /recados
   * Body: { assunto?, conteudo, destinatarioId? }
   */
  .post('/recados', async (c) => {
    const { DB, BETTER_AUTH_SECRET } = c.env;
    const baseURL = new URL(c.req.url).origin;
    const ctx = await resolveAuthContext(c.req.raw.headers, DB, BETTER_AUTH_SECRET, baseURL);
    if (!ctx) return c.json({ error: 'Não autenticado.' }, 401);
    if (!can(ctx.papel, 'mural', 'criar')) return c.json({ error: 'Sem permissão.' }, 403);

    const db = getDb(DB);
    let body: { assunto?: string; conteudo?: string; destinatarioId?: string } = {};
    try { body = await c.req.json(); } catch { /* keep empty */ }

    try {
      const recado = await criarRecado(db, ctx.empresaId, ctx.userId, {
        assunto: body.assunto,
        conteudo: body.conteudo ?? '',
        destinatarioId: body.destinatarioId ?? null,
      });
      return c.json({ recado }, 201);
    } catch (e) {
      if (e instanceof MuralError && e.code === 'VALIDACAO') return c.json({ error: e.message }, 422);
      throw e;
    }
  })

  /**
   * DELETE /recados/:id
   * Remetente pode excluir o próprio; admin pode excluir qualquer um.
   */
  .delete('/recados/:id', async (c) => {
    const { DB, BETTER_AUTH_SECRET } = c.env;
    const baseURL = new URL(c.req.url).origin;
    const ctx = await resolveAuthContext(c.req.raw.headers, DB, BETTER_AUTH_SECRET, baseURL);
    if (!ctx) return c.json({ error: 'Não autenticado.' }, 401);
    if (!can(ctx.papel, 'mural', 'excluir')) return c.json({ error: 'Sem permissão.' }, 403);

    const db = getDb(DB);
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'ID inválido.' }, 400);

    try {
      await excluirRecado(db, ctx.empresaId, id, ctx.userId, ctx.papel);
      return c.json({ ok: true });
    } catch (e) {
      if (e instanceof MuralError) {
        const status = e.code === 'NAO_ENCONTRADO' ? 404 : 403;
        return c.json({ error: e.message }, status);
      }
      throw e;
    }
  });
