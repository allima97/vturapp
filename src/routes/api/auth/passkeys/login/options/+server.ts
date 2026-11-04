import { json } from '@sveltejs/kit';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { checkPersistentRateLimit } from '$lib/server/persistentRateLimit';
import { buildAuthenticationOptions, toPasskeyErrorResponse } from '$lib/server/passkeys';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import type { RequestHandler } from './$types';

const MAX_PASSKEY_OPTIONS_BODY_BYTES = 8 * 1024;

type PasskeyLoginOptionsBody = {
  email?: string;
};

function readPasskeyLoginOptionsBody(value: unknown): PasskeyLoginOptionsBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return {
    email: typeof body.email === 'string' ? body.email : undefined
  };
}

export const POST: RequestHandler = async (event) => {
  try {
    const originError = rejectCrossOriginRequest(event.request, 'Origem inválida.');
    if (originError) return originError;

    const bodyResult = await readJsonBodyLimited(event.request, MAX_PASSKEY_OPTIONS_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;
    const body = readPasskeyLoginOptionsBody(bodyResult.data);
    const email = String(body?.email || '').trim();
    const remoteIp = event.getClientAddress?.() || 'unknown';

    const rateLimit = await checkPersistentRateLimit('passkey-login-options', `${remoteIp}:${email.toLowerCase() || 'no-email'}`, {
      max: 30,
      windowMs: 60_000
    }, event.platform?.env?.DB);
    if (!rateLimit.allowed) {
      return json(
        { error: 'Muitas tentativas de passkey. Tente novamente em instantes.' },
        {
          status: 429,
          headers: { ...NO_STORE_HEADERS, 'Retry-After': String(rateLimit.retryAfterSeconds) }
        }
      );
    }

    const payload = await buildAuthenticationOptions(event, email || null);
    return json({ ok: true, ...payload }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toPasskeyErrorResponse(err, 'Erro ao preparar login por passkey.');
  }
};
