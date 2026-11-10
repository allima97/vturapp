import { dev } from '$app/environment';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const MAX_SET_SESSION_BODY_BYTES = 16 * 1024;

export const POST: RequestHandler = async ({ request }) => {
  const originError = rejectCrossOriginRequest(request, 'Origem inválida.');
  if (originError) return originError;
  const bodyResult = await readJsonBodyLimited(request, MAX_SET_SESSION_BODY_BYTES);
  if (!bodyResult.ok) return bodyResult.response;
  const body =
    bodyResult.data && typeof bodyResult.data === 'object'
      ? (bodyResult.data as Record<string, unknown>)
      : {};
  if (!body.access_token || !body.refresh_token) {
    return json({ error: 'Tokens obrigatorios' }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (dev) console.info('[set-session] sessao ja estabelecida pelo cookie de autenticacao.');
  return json({ ok: true }, { headers: NO_STORE_HEADERS });
};
