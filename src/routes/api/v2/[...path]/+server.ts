/**
 * Catch-all da API v2: /api/v2/* → app Hono v2.
 *
 * Todas as rotas /api/v2/* caem aqui e são atendidas pelo
 * app Hono v2 (src/lib/server/api/app-v2.ts).
 *
 * F2-02: rotas de convite (invites) + health check.
 * F3+: mais rotas migrarão para cá conforme cada domínio for reescrito.
 */
import { apiHandlerV2 } from '$lib/server/api/sveltekit-v2';

export const GET = apiHandlerV2;
export const POST = apiHandlerV2;
export const PUT = apiHandlerV2;
export const PATCH = apiHandlerV2;
export const DELETE = apiHandlerV2;
