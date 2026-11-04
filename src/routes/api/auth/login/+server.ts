import { createSupabaseServerClient, getSupabaseAuthStorageKey } from '$lib/db/supabase';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { checkPersistentRateLimit } from '$lib/server/persistentRateLimit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { verifyTurnstileToken } from '$lib/server/turnstile';
import { logServerError } from '$lib/server/v1';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const MAX_LOGIN_BODY_BYTES = 8 * 1024;

type LoginRequestBody = {
  email?: string;
  password?: string;
  turnstile_token?: string;
  turnstileToken?: string;
};

function readLoginBody(value: unknown): LoginRequestBody | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  return {
    email: typeof body.email === 'string' ? body.email : undefined,
    password: typeof body.password === 'string' ? body.password : undefined,
    turnstile_token: typeof body.turnstile_token === 'string' ? body.turnstile_token : undefined,
    turnstileToken: typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined
  };
}

export const POST: RequestHandler = async ({ request, cookies, getClientAddress, platform }) => {
  try {
    const originError = rejectCrossOriginRequest(request, 'Origem inválida.');
    if (originError) return originError;

    let remoteIp: string | null = null;
    try {
      remoteIp = getClientAddress();
    } catch {
      remoteIp = null;
    }

    const bodyResult = await readJsonBodyLimited(request, MAX_LOGIN_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;
    const body = readLoginBody(bodyResult.data);
    if (!body) {
      return json({ error: 'Payload invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    const turnstileToken = String(body.turnstile_token || body.turnstileToken || '').trim();

    if (!email || !password) {
      return json({ error: 'Email e senha obrigatorios.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const rateLimit = await checkPersistentRateLimit('auth-login', `${remoteIp || 'unknown'}:${email.toLowerCase()}`, {
      max: 12,
      windowMs: 60_000
    }, platform?.env?.DB);
    if (!rateLimit.allowed) {
      return json(
        { error: 'Muitas tentativas de login. Tente novamente em instantes.' },
        {
          status: 429,
          headers: { ...NO_STORE_HEADERS, 'Retry-After': String(rateLimit.retryAfterSeconds) }
        }
      );
    }

    const turnstile = await verifyTurnstileToken(turnstileToken, remoteIp);
    if (!turnstile.ok) {
      return json({ error: turnstile.message, codes: turnstile.codes ?? [] }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const supabase = createSupabaseServerClient({
      get: (name) => cookies.get(name),
      getAll: () => cookies.getAll().map((cookie) => ({ name: cookie.name, value: cookie.value })),
      set: (name, value, options) => {
        cookies.set(name, value, { ...options, path: '/' });
      },
      remove: (name, options) => {
        cookies.delete(name, { ...options, path: '/' });
      }
    });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return json({ error: 'Email ou senha incorretos.' }, { status: 401, headers: NO_STORE_HEADERS });
    }

    cookies.delete('sb-access-token', { path: '/' });
    cookies.delete('sb-refresh-token', { path: '/' });

    return json(
      {
        ok: true,
        user: data.user,
        session: data.session,
        storageKey: getSupabaseAuthStorageKey()
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    logServerError('[auth/login] erro ao fazer login', err);
    return json({ error: 'Erro ao fazer login.' }, { status: 500, headers: NO_STORE_HEADERS });
  }
};
