/**
 * Rotas Hono para convites F2 — /api/v2/invites.
 *
 * Usa Better Auth + D1 diretamente (sem Supabase).
 * Auth context resolvido via resolveAuthContext() do helper F2-02.
 *
 * Endpoints:
 *   POST   /api/v2/invites            — criar convite (requer papel=admin)
 *   GET    /api/v2/invites/:token     — consultar convite (público)
 *   POST   /api/v2/invites/:token/accept — aceitar convite (público)
 */

import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { criarConvite, getConvite, aceitarConvite, ConviteError, PAPEIS } from '$lib/server/invites/service';
import { resolveAuthContext, requireAdmin } from '$lib/server/auth/context';
import type { Papel } from '$lib/server/db/schema';

export const invitesV2Routes = new Hono<ApiEnv>();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v2/invites — criar convite
// ─────────────────────────────────────────────────────────────────────────────

invitesV2Routes.post('/', async (c) => {
  const { DB, BETTER_AUTH_SECRET, RESEND_API_KEY, PUBLIC_APP_URL, PUBLIC_ENVIRONMENT } = c.env;

  if (!DB || !BETTER_AUTH_SECRET) {
    return c.json({ error: 'Serviço indisponível.' }, 503);
  }

  const baseURL =
    PUBLIC_ENVIRONMENT === 'production'
      ? 'https://vturapp.com.br'
      : PUBLIC_APP_URL ?? 'http://localhost:5173';

  // Verificar autenticação e papel admin
  const ctx = await resolveAuthContext(c.req.raw.headers, DB, BETTER_AUTH_SECRET, baseURL);
  if (!ctx) {
    return c.json({ error: 'Não autenticado.' }, 401);
  }
  if (!requireAdmin(ctx)) {
    return c.json({ error: 'Apenas administradores podem enviar convites.' }, 403);
  }

  // Validar body
  let body: { email?: unknown; papel?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'JSON inválido.' }, 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : null;
  const papel = typeof body.papel === 'string' ? body.papel : 'operador';

  if (!email) {
    return c.json({ error: 'Campo obrigatório: email.' }, 400);
  }
  if (!(PAPEIS as readonly string[]).includes(papel)) {
    return c.json({ error: `Papel inválido. Valores válidos: ${PAPEIS.join(', ')}.` }, 400);
  }

  try {
    const result = await criarConvite(
      DB,
      { empresaId: ctx.empresaId, email, papel: papel as Papel, convidadoPorId: ctx.userId },
      baseURL,
      RESEND_API_KEY ?? ''
    );

    return c.json({ conviteId: result.conviteId, token: result.token }, 201);
  } catch (err) {
    if (err instanceof ConviteError) {
      const status = err.code === 'ERRO_INTERNO' ? 500 : 422;
      return c.json({ error: err.message, code: err.code }, status);
    }
    throw err;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v2/invites/:token — consultar convite (público)
// ─────────────────────────────────────────────────────────────────────────────

invitesV2Routes.get('/:token', async (c) => {
  const { DB } = c.env;
  const token = c.req.param('token');

  if (!DB) return c.json({ error: 'Serviço indisponível.' }, 503);

  try {
    const convite = await getConvite(DB, token);
    return c.json({
      empresaNome: convite.empresaNome,
      email: convite.email,
      papel: convite.papel,
      expiresAt: convite.expiresAt,
    });
  } catch (err) {
    if (err instanceof ConviteError) {
      const status =
        err.code === 'TOKEN_INVALIDO' ? 404
        : err.code === 'CONVITE_ACEITO' ? 409
        : 422; // CONVITE_EXPIRADO
      return c.json({ error: err.message, code: err.code }, status);
    }
    throw err;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v2/invites/:token/accept — aceitar convite (público)
// ─────────────────────────────────────────────────────────────────────────────

invitesV2Routes.post('/:token/accept', async (c) => {
  const { DB, BETTER_AUTH_SECRET, PUBLIC_APP_URL, PUBLIC_ENVIRONMENT } = c.env;
  const token = c.req.param('token');

  if (!DB || !BETTER_AUTH_SECRET) {
    return c.json({ error: 'Serviço indisponível.' }, 503);
  }

  const baseURL =
    PUBLIC_ENVIRONMENT === 'production'
      ? 'https://vturapp.com.br'
      : PUBLIC_APP_URL ?? 'http://localhost:5173';

  // Validar body
  let body: { nome?: unknown; senha?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'JSON inválido.' }, 400);
  }

  const nome = typeof body.nome === 'string' ? body.nome.trim() : null;
  const senha = typeof body.senha === 'string' ? body.senha : null;

  if (!nome) return c.json({ error: 'Campo obrigatório: nome.' }, 400);
  if (!senha || senha.length < 8) {
    return c.json({ error: 'A senha deve ter pelo menos 8 caracteres.' }, 400);
  }

  // Criar instância Better Auth para signUp
  const { createAuth } = await import('$lib/auth');
  const auth = createAuth(DB, BETTER_AUTH_SECRET, baseURL);

  try {
    const result = await aceitarConvite(DB, auth, { token, nome, senha }, baseURL);
    return c.json({ userId: result.userId, empresaId: result.empresaId }, 201);
  } catch (err) {
    if (err instanceof ConviteError) {
      const status =
        err.code === 'TOKEN_INVALIDO' ? 404
        : err.code === 'CONVITE_ACEITO' ? 409
        : err.code === 'ERRO_CRIAR_USUARIO' ? 422
        : 422;
      return c.json({ error: err.message, code: err.code }, status);
    }
    throw err;
  }
});
