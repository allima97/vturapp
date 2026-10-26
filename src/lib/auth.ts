/**
 * Better Auth — fábrica de instância para Cloudflare Workers + D1.
 *
 * Em Cloudflare Workers, o D1 binding só está disponível dentro de handlers
 * de request (via event.platform.env.DB). Por isso usamos uma função fábrica
 * em vez de uma instância estática de módulo.
 *
 * Uso nos handlers SvelteKit (hooks.server.ts — F2-02):
 *   import { createAuth } from '$lib/auth';
 *   const auth = createAuth(event.platform.env.DB, event.platform.env.BETTER_AUTH_SECRET);
 *
 * O Drizzle adapter mapeia as tabelas do schema.ts (user, session, account,
 * verification) para o modelo interno do Better Auth.
 *
 * Plugins planejados:
 *   - twoFactor()      F1-04 prova: autenticação de dois fatores via TOTP
 *   - passkey()        F1-04 prova: WebAuthn/Passkey
 *   - sveltekitCookies F2-02: cookies SvelteKit via getRequestEvent
 *
 * Referência: docs/f1/F1-04-better-auth.md, docs/adr/ADR-002-autenticacao.md
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '$lib/server/db/schema';

/**
 * Cria uma instância Better Auth conectada ao D1.
 *
 * @param d1     - D1Database binding do Cloudflare Workers
 * @param secret - BETTER_AUTH_SECRET (mínimo 32 caracteres); injetado via wrangler secret
 * @param baseURL - URL base do app (para geração de links em emails)
 */
export function createAuth(
  d1: D1Database,
  secret: string,
  baseURL?: string
) {
  const db = drizzle(d1, { schema });

  return betterAuth({
    secret,
    baseURL: baseURL ?? 'http://localhost:5173',

    database: drizzleAdapter(db, {
      provider: 'sqlite',
    }),

    // ── Auth methods ──────────────────────────────────────────────────────
    emailAndPassword: {
      enabled: true,
      /**
       * Não enviar e-mail de verificação em dev.
       * Em prod, F1-07 configurará Resend para envio.
       */
      requireEmailVerification: false,
    },

    // ── Plugins ───────────────────────────────────────────────────────────
    plugins: [
      /**
       * Two-Factor Authentication (TOTP).
       * F1-04: prova que o plugin funciona com D1.
       * A UI de configuração será implementada em F2-02.
       */
      twoFactor(),
    ],

    // ── Trusted origins ───────────────────────────────────────────────────
    // Adicionar domínios de produção em F2-02 via env var.
    trustedOrigins: [
      'http://localhost:5173',  // vite dev
      'http://localhost:8787',  // wrangler dev
    ],

    // ── Sessão ────────────────────────────────────────────────────────────
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 dias
      updateAge: 60 * 60 * 24,       // renovar se mais novo que 24h
    },
  });
}

/** Tipo da instância Better Auth (útil para tipar helpers) */
export type AuthInstance = ReturnType<typeof createAuth>;
