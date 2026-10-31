/**
 * App Hono da API /api/v2 — F2: identidade e autorização.
 *
 * Rotas F2 usam Better Auth + D1 diretamente (sem Supabase).
 * Paralelo ao app-v1 existente; não altera as rotas /api/v1/*.
 *
 * Middlewares globais (F2-05 / F2-06):
 *   - productionGuard    — bloqueia /f2-proof/*, /debug/* em produção (404)
 *   - securityHeaders  — CSP, HSTS, X-Content-Type-Options, X-Frame-Options
 *   - rateLimitMiddleware — 120 req/min por IP
 *   - csrfProtection   — verifica Origin em mutating requests
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
import { clientesV2Routes } from './routes/clientes-v2';
import { vendasV2Routes } from './routes/vendas-v2';
import { tenantProofRoutes } from './routes/tenant-proof';
import { produtosV2Routes } from './routes/produtos-v2';
import { destinosV2Routes } from './routes/destinos-v2';
import { dashboardV2Routes } from './routes/dashboard-v2';
import { muralV2Routes } from './routes/mural-v2';
import { equipeV2Routes } from './routes/equipe-v2';
import { auditoriaV2Routes } from './routes/auditoria-v2';
import { agendaV2Routes } from './routes/agenda-v2';
import { securityHeaders, csrfProtection } from './middleware/security';
import { productionGuard } from './middleware/production-guard';
import { rateLimitMiddleware } from './middleware/rate-limit';

export function createApiAppV2() {
  const app = new Hono<ApiEnv>().basePath('/api/v2');

  app.use('*', requestContext);
  app.use('*', productionGuard);
  app.use('*', securityHeaders);
  app.use(
    '*',
    rateLimitMiddleware({
      windowMs: 60_000,
      maxRequests: 120,
      excludePaths: ['/api/v2/health'],
    })
  );
  app.use('*', csrfProtection());
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

  // ── Clientes (F3-01) ──────────────────────────────────────────────────────
  app.route('/clientes', clientesV2Routes);
  app.route('/vendas', vendasV2Routes);

  // ── F2-04 Tenant Isolation Proof (non-production only) ────────────────────
  app.route('/f2-proof', tenantProofRoutes);
  app.route('/produtos', produtosV2Routes);
  app.route('/destinos', destinosV2Routes);
  app.route('/dashboard', dashboardV2Routes);
  app.route('/agenda', agendaV2Routes);
app.route('/mural', muralV2Routes);
  app.route('/equipe', equipeV2Routes);
  app.route('/auditoria', auditoriaV2Routes);

  return app;
}

export const apiAppV2 = createApiAppV2();
