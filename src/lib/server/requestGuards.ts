import { json } from '@sveltejs/kit';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';

export const SAME_ORIGIN_FETCH_SITES = new Set(['same-origin', 'same-site', 'none']);

export function isSameOriginRequest(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).origin === requestUrl.origin;
    } catch {
      return false;
    }
  }

  const fetchSite = request.headers.get('sec-fetch-site');
  if (!fetchSite) return true;
  return SAME_ORIGIN_FETCH_SITES.has(fetchSite);
}

export function rejectCrossOriginRequest(
  request: Request,
  message = 'Origem invalida.'
): Response | null {
  if (isSameOriginRequest(request)) return null;
  return json({ error: message }, { status: 403, headers: NO_STORE_HEADERS });
}

export function rejectLargePayload(
  request: Request,
  maxBytes: number,
  message = 'Payload muito grande.'
): Response | null {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return json({ error: message }, { status: 413, headers: NO_STORE_HEADERS });
  }
  return null;
}

export type LimitedJsonResult = { ok: true; data: unknown } | { ok: false; response: Response };

export type LimitedTextResult = { ok: true; text: string } | { ok: false; response: Response };

export type LimitedFormDataResult =
  | { ok: true; formData: FormData }
  | { ok: false; response: Response };

function payloadTooLargeResponse(message: string) {
  return json({ error: message }, { status: 413, headers: NO_STORE_HEADERS });
}

function invalidFormDataResponse() {
  return json({ error: 'Envio invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
}

export async function readTextBodyLimited(
  request: Request,
  maxBytes: number,
  message = 'Payload muito grande.'
): Promise<LimitedTextResult> {
  const payloadError = rejectLargePayload(request, maxBytes, message);
  if (payloadError) return { ok: false, response: payloadError };

  let text = '';

  if (!request.body) {
    text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      return {
        ok: false,
        response: payloadTooLargeResponse(message)
      };
    }
    return { ok: true, text };
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;

    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return {
        ok: false,
        response: payloadTooLargeResponse(message)
      };
    }

    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return { ok: true, text };
}

export async function readJsonBodyLimited(
  request: Request,
  maxBytes: number,
  message = 'Payload muito grande.'
): Promise<LimitedJsonResult> {
  const textResult = await readTextBodyLimited(request, maxBytes, message);
  if (!textResult.ok) return textResult;

  if (!textResult.text.trim()) return { ok: true, data: null };

  try {
    return { ok: true, data: JSON.parse(textResult.text) };
  } catch {
    return { ok: true, data: null };
  }
}

export async function readFormDataBodyLimited(
  request: Request,
  maxBytes: number,
  message = 'Payload muito grande.'
): Promise<LimitedFormDataResult> {
  const payloadError = rejectLargePayload(request, maxBytes, message);
  if (payloadError) return { ok: false, response: payloadError };

  if (!request.body) {
    try {
      return { ok: true, formData: await request.formData() };
    } catch {
      return { ok: false, response: invalidFormDataResponse() };
    }
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, response: payloadTooLargeResponse(message) };
    }

    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const limitedRequest = new Request(request.url, {
      body,
      headers: request.headers,
      method: request.method
    });
    return { ok: true, formData: await limitedRequest.formData() };
  } catch {
    return { ok: false, response: invalidFormDataResponse() };
  }
}
