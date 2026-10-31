/**
 * Rotas Hono — /api/v2/auditoria (M12)
 *
 * Endpoints:
 *   GET  /api/v2/auditoria/logs          — listar eventos (só admin)
 *   GET  /api/v2/auditoria/lgpd/:userId  — exportar sumário do titular (admin)
 *   POST /api/v2/auditoria/lgpd/:userId/anonimizar — anonimizar audit_logs do titular (admin)
 */

import { Hono, type Context } from 'hono';
import type { ApiEnv } from '../../types';
import { resolveAuthContext } from '$lib/server/auth/context';
import { can } from '$lib/server/policy';
import { getDb } from '$lib/server/db/client';
import {
  listarAuditLogs,
  exportarDadosTitular,
  anonimizarTitularAuditLogs,
} from '$lib/server/m12-auditoria/service';

export const auditoriaV2Routes = new Hono<ApiEnv>();

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
  return { ctx, db: getDb(DB) };
}

// GET /api/v2/auditoria/logs
auditoriaV2Routes.get('/logs', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  const { ctx, db } = r;

  if (!can(ctx.papel, 'auditoria', 'ler')) {
    return c.json({ error: 'Sem permissão.' }, 403);
  }

  const q = c.req.query();
  const logs = await listarAuditLogs(db, ctx.empresaId, {
    modulo:  q.modulo,
    userId:  q.userId,
    de:      q.de,
    ate:     q.ate,
    cursor:  q.cursor ? Number(q.cursor) : undefined,
    limite:  q.limite ? Number(q.limite) : 50,
  });

  return c.json(logs);
});

// GET /api/v2/auditoria/lgpd/:userId
auditoriaV2Routes.get('/lgpd/:userId', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  const { ctx, db } = r;

  if (!can(ctx.papel, 'auditoria', 'ler')) {
    return c.json({ error: 'Sem permissão.' }, 403);
  }

  const dados = await exportarDadosTitular(db, ctx.empresaId, c.req.param('userId'));
  return c.json(dados);
});

// POST /api/v2/auditoria/lgpd/:userId/anonimizar
auditoriaV2Routes.post('/lgpd/:userId/anonimizar', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  const { ctx, db } = r;

  if (!can(ctx.papel, 'auditoria', 'gerenciar')) {
    return c.json({ error: 'Sem permissão.' }, 403);
  }

  // Confirmar intenção
  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch { /* body vazio */ }
  if (body.confirmar !== true) {
    return c.json({ error: 'Envie { "confirmar": true } para confirmar a operação.' }, 422);
  }

  const result = await anonimizarTitularAuditLogs(db, ctx.empresaId, c.req.param('userId'));
  return c.json(result);
});
