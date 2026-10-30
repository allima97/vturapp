import type { RequestEvent } from '@sveltejs/kit';
import { apiApp } from './app';

/**
 * Ponte SvelteKit → Hono. Use em qualquer +server.ts migrado:
 *
 *   import { apiHandler } from '$lib/server/api/sveltekit';
 *   export const GET = apiHandler;
 *
 * Bindings disponíveis nos handlers Hono via `c.env`:
 *   c.env.DB          — D1Database (banco relacional)
 *   c.env.R2          — R2Bucket (arquivos privados)
 *   c.env.KV_BINDING  — KVNamespace (cache)
 *   c.env.event       — RequestEvent original (legado; remover em F2-03)
 */
export function apiHandler(event: RequestEvent): Promise<Response> {
  const platformEnv = event.platform?.env;

  return Promise.resolve(
    apiApp.fetch(event.request, {
      // ── Legado (remover em F2-03 após migração de auth) ────────────────
      event,

      // ── Bindings Cloudflare Workers ─────────────────────────────────────
      // Disponíveis via `c.env` nos handlers Hono.
      // Em desenvolvimento local (`wrangler dev --local`) o Miniflare injeta
      // os bindings D1/R2 reais do ambiente local. Durante `vite dev` (sem
      // wrangler), platform.env é undefined — os bindings não estão disponíveis
      // e devem ser acessados com optional chaining nos handlers.
      DB: platformEnv?.DB,
      R2: platformEnv?.R2,
      KV_BINDING: platformEnv?.KV_BINDING,
    })
  );
}
