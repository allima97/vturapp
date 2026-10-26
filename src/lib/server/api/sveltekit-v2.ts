/**
 * Ponte SvelteKit → Hono para o app /api/v2.
 *
 * Diferenças em relação ao sveltekit.ts (v1):
 *   - Injeta BETTER_AUTH_SECRET e RESEND_API_KEY nos bindings
 *   - Não injeta `event` (legado Supabase) — v2 não depende de Supabase
 *   - Injeta PUBLIC_APP_URL e PUBLIC_ENVIRONMENT para resolução de base URL
 *
 * Uso em +server.ts:
 *   import { apiHandlerV2 } from '$lib/server/api/sveltekit-v2';
 *   export const GET = apiHandlerV2;
 */

import type { RequestEvent } from '@sveltejs/kit';
import { apiAppV2 } from './app-v2';

export async function apiHandlerV2(event: RequestEvent): Promise<Response> {
  const platformEnv = event.platform?.env;

  return apiAppV2.fetch(event.request, {
    // ── Cloudflare Workers bindings ──────────────────────────────────────
    DB: platformEnv?.DB,
    R2: platformEnv?.R2,
    KV_BINDING: platformEnv?.KV_BINDING,

    // ── Secrets F2-02 ────────────────────────────────────────────────────
    BETTER_AUTH_SECRET: platformEnv?.BETTER_AUTH_SECRET ?? '',
    RESEND_API_KEY: platformEnv?.RESEND_API_KEY ?? '',
    PUBLIC_APP_URL: platformEnv?.PUBLIC_APP_URL,
    PUBLIC_ENVIRONMENT: platformEnv?.PUBLIC_ENVIRONMENT,

    // ── NOTE: sem `event` (sem Supabase em v2) ───────────────────────────
    event: null as unknown as RequestEvent, // satisfaz o tipo ApiEnv; nunca usado em v2
  });
}
