import type { MiddlewareHandler } from 'hono';
import { json } from '@sveltejs/kit';
import { logServerError, toErrorResponse } from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import type { ApiEnv } from './types';

const REQUEST_ID_HEADER = 'x-request-id';
const MAX_INCOMING_REQUEST_ID = 100;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]+$/;

function newRequestId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Correlation ID: reaproveita x-request-id do cliente (se seguro) ou o cf-ray
 * do Cloudflare; senão gera um. Vai na resposta em `x-request-id` para o
 * suporte cruzar navegador ↔ log do Worker.
 */
export function resolveRequestId(headers: Headers) {
  const incoming = headers.get(REQUEST_ID_HEADER)?.trim();
  if (incoming && incoming.length <= MAX_INCOMING_REQUEST_ID && SAFE_REQUEST_ID.test(incoming)) {
    return incoming;
  }
  const cfRay = headers.get('cf-ray')?.trim();
  if (cfRay && SAFE_REQUEST_ID.test(cfRay)) return cfRay;
  return newRequestId();
}

/** Garante headers mutáveis (Response vinda de fetch() tem headers imutáveis). */
function withMutableHeaders(res: Response) {
  try {
    res.headers.set('x-vtur-probe', '1');
    res.headers.delete('x-vtur-probe');
    return res;
  } catch {
    return new Response(res.body, res);
  }
}

/**
 * Correlation ID + Server-Timing (duração total do handler).
 * Só acrescenta headers; não altera status nem corpo.
 */
export const requestContext: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const requestId = resolveRequestId(c.req.raw.headers);
  c.set('requestId', requestId);
  const startedAt = Date.now();

  await next();

  const res = withMutableHeaders(c.res);
  res.headers.set(REQUEST_ID_HEADER, requestId);
  const duration = Date.now() - startedAt;
  const previous = res.headers.get('server-timing');
  res.headers.set(
    'server-timing',
    previous ? `${previous}, app;dur=${duration}` : `app;dur=${duration}`
  );
  c.res = res;
};

/**
 * Erro não tratado dentro de um handler Hono: mesmo formato de resposta que as
 * rotas SvelteKit já usam (toErrorResponse), com o requestId no log.
 */
export function handleApiError(err: Error, requestId: string | undefined) {
  logServerError('[api] erro não tratado', err, { requestId });
  return toErrorResponse(err, 'Erro interno.');
}

/** Rota inexistente dentro de /api/v1 (só chega aqui via catch-all). */
export function handleNotFound() {
  return json({ error: 'Rota não encontrada.' }, { status: 404, headers: NO_STORE_HEADERS });
}
