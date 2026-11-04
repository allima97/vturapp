/**
 * Rota de autenticação Better Auth: /api/auth/[...auth]
 *
 * Captura todas as rotas Better Auth:
 *   POST /api/auth/sign-in/email
 *   POST /api/auth/sign-up/email
 *   POST /api/auth/sign-out
 *   GET  /api/auth/session
 *   POST /api/auth/two-factor/enable
 *   POST /api/auth/verify-email
 *   POST /api/auth/forgot-password
 *   POST /api/auth/reset-password
 *   ...
 *
 * F2-02: passa resendApiKey para habilitar verificação de e-mail e
 *        redefinição de senha via Resend.
 *
 * Referência: docs/f1/F1-04-better-auth.md
 */

import type { RequestHandler } from './$types';
import { createAuth } from '$lib/auth';

const handler: RequestHandler = async ({ request, platform }) => {
  const env = platform?.env;

  if (!env?.DB) {
    return new Response('D1 não disponível', { status: 503 });
  }
  if (!env?.BETTER_AUTH_SECRET) {
    return new Response('BETTER_AUTH_SECRET não configurado', { status: 503 });
  }

  const baseURL =
    env.PUBLIC_ENVIRONMENT === 'production'
      ? 'https://vturapp.com.br'
      : env.PUBLIC_APP_URL ?? 'http://localhost:5173';

  const auth = createAuth(
    env.DB,
    env.BETTER_AUTH_SECRET,
    baseURL,
    env.RESEND_API_KEY   // F2-02: habilitado para verificação de e-mail
  );

  return auth.handler(request);
};

export const GET = handler;
export const POST = handler;
