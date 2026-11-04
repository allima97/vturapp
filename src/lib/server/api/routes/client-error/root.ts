// Migrado para Hono de src/routes/api/v1/client-error/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { checkPersistentRateLimit } from '$lib/server/persistentRateLimit';
import { logServerError } from '$lib/server/v1';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_BODY_BYTES = 8 * 1024;
const MAX_FIELD_CHARS = 1200;

function trimField(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length <= MAX_FIELD_CHARS ? text : text.slice(0, MAX_FIELD_CHARS);
}

function sanitizePayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return { message: '' };
  }
  const fields = payload as Record<string, unknown>;

  return {
    message: trimField(fields.message),
    stack: dev ? trimField(fields.stack) : '',
    page: trimField(fields.page),
    source: trimField(fields.source),
    ts: trimField(fields.ts),
    ua: trimField(fields.ua)
  };
}

export const handleClientErrorPost = async ({ request, getClientAddress, platform }: RequestEvent) => {
  try {
    const originError = rejectCrossOriginRequest(request, 'Origem inválida.');
    if (originError) return originError;

    const clientAddress = getClientAddress();
    const rateLimit = await checkPersistentRateLimit('client-error', clientAddress || 'unknown', {
      max: 30,
      windowMs: 60_000
    }, platform?.env?.DB);
    if (!rateLimit.allowed) {
      return json(
        { error: 'Muitas requisições.' },
        { status: 429, headers: { ...NO_STORE_HEADERS, 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      );
    }

    const payloadResult = await readJsonBodyLimited(request, MAX_BODY_BYTES);
    if (!payloadResult.ok) return payloadResult.response;
    const payload = payloadResult.data;
    const url = new URL(request.url);
    const safePayload = sanitizePayload(payload);

    if (dev) {
      console.error('CLIENT_ERROR', {
        url: url.pathname,
        payload: safePayload
      });
    } else {
      console.warn('CLIENT_ERROR', {
        url: url.pathname,
        message: safePayload.message,
        page: safePayload.page,
        source: safePayload.source,
        ts: safePayload.ts
      });
    }
  } catch (err: unknown) {
    logServerError('CLIENT_ERROR_PARSE', err);
  }

  return json(null, { status: 204, headers: NO_STORE_HEADERS });
};
