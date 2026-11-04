import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { checkPersistentRateLimit } from '$lib/server/persistentRateLimit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { verifyTurnstileToken } from '$lib/server/turnstile';
import { logServerError } from '$lib/server/v1';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const MAX_TURNSTILE_BODY_BYTES = 4 * 1024;

type TurnstileVerifyBody = {
  turnstile_token?: string;
  turnstileToken?: string;
};

function readTurnstileVerifyBody(value: unknown): TurnstileVerifyBody | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  return {
    turnstile_token: typeof body.turnstile_token === 'string' ? body.turnstile_token : undefined,
    turnstileToken: typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined
  };
}

export const POST: RequestHandler = async ({ request, getClientAddress, platform }) => {
  try {
    const originError = rejectCrossOriginRequest(request, 'Origem inválida.');
    if (originError) return originError;

    let remoteIp: string | null = null;
    try {
      remoteIp = getClientAddress();
    } catch {
      remoteIp = null;
    }

    const rateLimit = await checkPersistentRateLimit('turnstile-verify', remoteIp || 'unknown', {
      max: 120,
      windowMs: 60_000
    }, platform?.env?.DB);
    if (!rateLimit.allowed) {
      return json(
        { error: 'Muitas validações. Tente novamente em instantes.' },
        {
          status: 429,
          headers: { ...NO_STORE_HEADERS, 'Retry-After': String(rateLimit.retryAfterSeconds) }
        }
      );
    }

    const bodyResult = await readJsonBodyLimited(request, MAX_TURNSTILE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;
    const body = readTurnstileVerifyBody(bodyResult.data);
    if (!body) {
      return json({ error: 'Payload invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const token = String(body?.turnstile_token || body?.turnstileToken || '').trim();

    const result = await verifyTurnstileToken(token, remoteIp);
    if (!result.ok) {
      return json({ error: result.message, codes: result.codes ?? [] }, { status: 403, headers: NO_STORE_HEADERS });
    }

    return json({ ok: true, skipped: result.skipped ?? false }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logServerError('[turnstile/verify] erro ao validar desafio', err);
    return json({ error: 'Erro ao validar desafio de segurança.' }, { status: 500, headers: NO_STORE_HEADERS });
  }
};
