/// <reference types="@sveltejs/kit" />
/// <reference types="@cloudflare/workers-types" />

declare global {
  namespace App {
    interface Error {
      message: string;
      code?: string;
    }

    /**
     * Locals preenchidos pelo hooks.server.ts.
     * As propriedades Supabase serão removidas quando a autenticação
     * migrar para Better Auth (F2-02).
     */
    interface Locals {
      // ── Legado Supabase (remover em F2-02) ──────────────────────────────
      supabase: import('@supabase/supabase-js').SupabaseClient;
      safeGetSession(): Promise<{
        session: import('@supabase/supabase-js').Session | null;
        user: import('@supabase/supabase-js').User | null;
      }>;
      session?: import('@supabase/supabase-js').Session | null;
      user?: import('@supabase/supabase-js').User | null;
      userType?: string;
      isSystemAdmin?: boolean;
      acessos?: Record<string, string>;
    }

    interface PageData {
      // ── Legado Supabase (remover em F2-02) ──────────────────────────────
      session: import('@supabase/supabase-js').Session | null;
      user: import('@supabase/supabase-js').User | null;
    }

    interface PageState {
      [key: string]: unknown;
    }

    /**
     * Platform.env — bindings do Cloudflare Workers disponíveis via
     * event.platform?.env em handlers SvelteKit e em c.env via Hono.
     *
     * Veja src/lib/server/api/types.ts (ApiEnv) para os tipos Hono.
     */
    interface Platform {
      env?: {
        // ── Novos bindings (D1 + R2) ────────────────────────────────────
        DB: D1Database;
        R2: R2Bucket;
        KV_BINDING: KVNamespace;
        ASSETS: Fetcher;

        // ── Secrets (injetados via wrangler secret) ──────────────────────
        BETTER_AUTH_SECRET: string;
        RESEND_API_KEY: string;
        PUBLIC_ENVIRONMENT?: string;
        PUBLIC_TURNSTILE_SITE_KEY?: string;
        TURNSTILE_SECRET_KEY?: string;

        // ── Legado Supabase (remover em F5-04) ───────────────────────────
        PUBLIC_SUPABASE_URL?: string;
        PUBLIC_SUPABASE_ANON_KEY?: string;
        SUPABASE_SERVICE_ROLE_KEY?: string;
        CRON_SECRET?: string;
        WORKER_BASE_URL?: string;
      };
      context?: ExecutionContext;
    }
  }
}

export {};
