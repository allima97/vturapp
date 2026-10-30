import type { RequestEvent } from '@sveltejs/kit';

/**
 * Ambiente do app Hono dentro do SvelteKit.
 *
 * Bindings disponíveis no contexto Hono via `c.env`:
 * - `event`: RequestEvent original do SvelteKit (legado — será removido em F2-03
 *   quando a autenticação migrar para Better Auth + D1)
 * - `DB`: D1Database — banco relacional principal (novo)
 * - `R2`: R2Bucket — armazenamento privado de arquivos (novo)
 * - `KV_BINDING`: KVNamespace — cache distribuído (existente)
 * - `BETTER_AUTH_SECRET`: secret da instância Better Auth (F2-02)
 * - `RESEND_API_KEY`: API key do Resend (F2-02)
 *
 * Acesso nos handlers:
 *   const db = c.env.DB;                    // D1Database
 *   const r2 = c.env.R2;                    // R2Bucket
 *   const kv = c.env.KV_BINDING;            // KVNamespace
 *   const event = c.env.event;              // RequestEvent (legado)
 *   const secret = c.env.BETTER_AUTH_SECRET; // string (F2-02)
 */
export type ApiEnv = {
  Bindings: {
    // ── SvelteKit ────────────────────────────────────────────────────────
    /** RequestEvent original — disponível enquanto auth estiver em Supabase */
    event: RequestEvent;

    // ── Cloudflare Workers (novos) ───────────────────────────────────────
    /** D1Database — banco relacional principal */
    DB: D1Database;
    /** R2Bucket — armazenamento privado de arquivos */
    R2: R2Bucket;
    /** KVNamespace — cache distribuído */
    KV_BINDING: KVNamespace;

    // ── Secrets (F2-02) ─────────────────────────────────────────────────
    /** Better Auth secret — injetado via wrangler secret */
    BETTER_AUTH_SECRET: string;
    /** Resend API key — injetado via wrangler secret */
    RESEND_API_KEY: string;
    /** URL base da aplicação */
    PUBLIC_APP_URL?: string;
    /** Ambiente de execução */
    PUBLIC_ENVIRONMENT?: string;
  };
  Variables: {
    requestId: string;
  };
};
