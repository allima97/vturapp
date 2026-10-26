/**
 * App Hono da API /api/v2 — F2: identidade e autorização.
 *
 * Rotas F2 usam Better Auth + D1 diretamente (sem Supabase).
 * Paralelo ao app-v1 existente; não altera as rotas /api/v1/*.
 *
 * Rotas disponíveis:
 *   /api/v2/health     — health check (prova que o app v2 está ativo)
 *   /api/v2/invites    — fluxo completo de convite F2-02
 *
 * F3+: mais rotas migrarão para cá conforme cada domínio for reescrito.
 */

import { Hono } from 'hono';
import type { ApiEnv } from './types';
import { requestContext, handleApiError, handleNotFound } from './middleware';
import { invitesV2Routes } from './routes/invites-v2';
import { tenantProofRoutes } from './routes/tenant-proof';

export function createApiAppV2() {
  const app = new Hono<ApiEnv>().basePath('/api/v2');

  app.use('*', requestContext);
  app.onError((err, c) => {
    const res = handleApiError(err, c.get('requestId'));
    return res;
  });
  app.notFound(() => handleNotFound());

  // ── Health ────────────────────────────────────────────────────────────────
  app.get('/health', (c) => {
    return c.json({ status: 'ok', api: 'v2', timestamp: new Date().toISOString() });
  });

  // ── Invites (F2-02) ───────────────────────────────────────────────────────
  app.route('/invites', invitesV2Routes);

  // ── F2-04 Tenant Isolation Proof (non-production only) ────────────────────
  app.route('/f2-proof', tenantProofRoutes);

  return app;
}

export const apiAppV2 = createApiAppV2();
