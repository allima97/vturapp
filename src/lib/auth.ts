/**
 * Better Auth — fábrica de instância para Cloudflare Workers + D1.
 *
 * Em Cloudflare Workers, o D1 binding só está disponível dentro de handlers
 * de request (via event.platform.env.DB). Por isso usamos uma função fábrica
 * em vez de uma instância estática de módulo.
 *
 * Uso nos handlers SvelteKit:
 *   import { createAuth } from '$lib/auth';
 *   const auth = createAuth(env.DB, env.BETTER_AUTH_SECRET, baseURL, env.RESEND_API_KEY);
 *
 * F2-02: adicionados sendVerificationEmail e sendResetPassword via Resend.
 *
 * Referência: docs/f1/F1-04-better-auth.md, docs/adr/ADR-002-autenticacao.md
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '$lib/server/db/schema';
import { sendEmailWithRetry } from '$lib/server/email/client';

/**
 * Cria uma instância Better Auth conectada ao D1.
 *
 * @param d1          - D1Database binding do Cloudflare Workers
 * @param secret      - BETTER_AUTH_SECRET (mínimo 32 caracteres); injetado via wrangler secret
 * @param baseURL     - URL base do app (para links em e-mails e cookies)
 * @param resendApiKey - RESEND_API_KEY para envio de e-mails transacionais (F2-02)
 */
export function createAuth(
  d1: D1Database,
  secret: string,
  baseURL?: string,
  resendApiKey?: string
) {
  const db = drizzle(d1, { schema });
  const appBaseURL = baseURL ?? 'http://localhost:5173';

  // Helper interno para envio de e-mails transacionais
  async function sendAuthEmail(to: string, subject: string, html: string, text: string) {
    if (!resendApiKey) {
      // Dev: só loga (sem envio real)
      console.info(`[auth email — dev] Para: ${to} | ${subject}`);
      return;
    }
    await sendEmailWithRetry(resendApiKey, {
      from: 'autenticacao@vturapp.com.br',
      to,
      subject,
      html,
      text,
    });
  }

  return betterAuth({
    secret,
    baseURL: appBaseURL,

    database: drizzleAdapter(db, {
      provider: 'sqlite',
    }),

    // ── Auth methods ──────────────────────────────────────────────────────
    emailAndPassword: {
      enabled: true,
      /**
       * Verificação obrigatória apenas em produção.
       * Em dev o envio é simulado (console.info).
       * F2-02: Resend habilitado quando resendApiKey fornecido.
       */
      requireEmailVerification: Boolean(resendApiKey),

      /** Envia e-mail de verificação após cadastro */
      sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
        await sendAuthEmail(
          user.email,
          'Confirme seu e-mail — VTUR',
          templateVerificacao(url),
          `Confirme seu e-mail: ${url}`
        );
      },

      /** Envia e-mail de redefinição de senha */
      sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
        await sendAuthEmail(
          user.email,
          'Redefina sua senha — VTUR',
          templateResetSenha(user.email, url),
          `Redefina sua senha: ${url}`
        );
      },
    },

    // ── Plugins ───────────────────────────────────────────────────────────
    plugins: [
      /**
       * Two-Factor Authentication (TOTP).
       * F1-04: prova que o plugin funciona com D1.
       */
      twoFactor(),
    ],

    // ── Trusted origins ───────────────────────────────────────────────────
    trustedOrigins: [
      'http://localhost:5173',    // vite dev
      'http://localhost:8787',    // wrangler dev
      appBaseURL,
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

// ─────────────────────────────────────────────────────────────────────────────
// Templates de e-mail transacionais (auth)
// ─────────────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function templateVerificacao(url: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Confirme seu e-mail</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 16px;color:#1a1a1a">
  <h1 style="font-size:1.5rem;margin-bottom:8px">Confirme seu e-mail</h1>
  <p>Obrigado por criar sua conta no <strong>VTUR</strong>. Clique no botão abaixo para confirmar seu e-mail.</p>
  <p style="margin:24px 0">
    <a href="${esc(url)}"
       style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
      Confirmar e-mail
    </a>
  </p>
  <p style="color:#555;font-size:0.875rem">Se você não criou esta conta, ignore este e-mail.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="color:#999;font-size:0.75rem">VTUR — Sistema de gestão para agências de viagem</p>
</body>
</html>`;
}

function templateResetSenha(email: string, url: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Redefinir senha</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 16px;color:#1a1a1a">
  <h1 style="font-size:1.5rem;margin-bottom:8px">Redefinir sua senha</h1>
  <p>Recebemos uma solicitação para redefinir a senha de <strong>${esc(email)}</strong>.</p>
  <p style="margin:24px 0">
    <a href="${esc(url)}"
       style="background:#dc2626;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
      Redefinir senha
    </a>
  </p>
  <p style="color:#555;font-size:0.875rem">Este link expira em 1 hora. Se não foi você, ignore este e-mail.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="color:#999;font-size:0.75rem">VTUR — Sistema de gestão para agências de viagem</p>
</body>
</html>`;
}
