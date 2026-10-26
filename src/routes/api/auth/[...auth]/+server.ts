/**
 * Rota de autenticação Better Auth: /api/auth/[...auth]
 *
 * Captura todas as rotas Better Auth:
 *   POST /api/auth/sign-in/email
 *   POST /api/auth/sign-up/email
 *   POST /api/auth/sign-out
 *   GET  /api/auth/session
 *   POST /api/auth/two-factor/enable
 *   ...
 *
 * Em F2-02, o svelteKitHandler no hooks.server.ts poderá substituir
 * esta rota. Por ora, usamos o handler explícito aqui para manter
 * controle fino sobre as rotas auth vs rotas de negócio.
 *
 * Referência: docs/f1/F1-04-better-auth.md
 */

import type { RequestHandler } from '.$types';
import { createAuth } from '$lib/auth';

const handler: RequestHandler = async ({ request, platform }) => {
  const env = platform?.env;

  if (!env?.DB) {
    return new Response('D1 não disponível', { status: 503 });
  }
  if (!env?.BETTER_AUTH_SECRET) {
    return new Response('BETTER_AUTH_SECRET não configurado', { status: 503 });
  }

  const auth = createAuth(
    env.DB,
    env.BETTER_AUTH_SECRET,
    env.PUBLIC_ENVIRONMENT === 'production'
      ? 'https://vturapp.com.br'  // TODO F2-02: configurar via PUBLIC_APP_URL env var
      : undefined
  );

  return auth.handler(request);
};

export const GET = handler;
export const POST = handler;
