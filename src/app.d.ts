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
     *
     * F2-02: adicionados campos Better Auth + tenant.
     * Os campos Supabase permanecem para as rotas existentes até F5+.
     */
    interface Locals {
      // ── Legado Supabase (remover em F5-04) ──────────────────────────────
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

      // ── Better Auth (F2-02) ──────────────────────────────────────────────
      /**
       * Usuário autenticado via Better Auth.
       * NULL quando a rota é acessada sem sessão Better Auth válida.
       * Preenchido pelo hook Better Auth em hooks.server.ts (F2-02).
       */
      betterAuthUser?: {
        id: string;
        name: string;
        email: string;
        emailVerified: boolean;
        empresaId?: number | null;
        createdAt: Date;
        updatedAt: Date;
      } | null;

      /** Sessão Better Auth — complementar a betterAuthUser */
      betterAuthSession?: {
        id: string;
        token: string;
        expiresAt: Date;
        userId: string;
        ipAddress?: string | null;
        userAgent?: string | null;
      } | null;

      // ── Contexto de tenant (F2-02) ───────────────────────────────────────
      /**
       * ID da empresa do usuário autenticado (tenant).
       * NULL para super-admins ou usuários sem empresa.
       * Preenchido a partir de user.empresa_id após resolução da sessão.
       */
      empresaId?: number | null;

      /**
       * Papel do usuário na empresa: 'admin' | 'operador' | 'visualizador'.
       * NULL quando o usuário não tem empresa ou não está em membros_empresa.
       */
      papel?: import('$lib/server/db/schema').Papel | null;
    }

    interface PageData {
      // ── Legado Supabase (remover em F5-04) ──────────────────────────────
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
        PUBLIC_APP_URL?: string;
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
