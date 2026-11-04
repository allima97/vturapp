import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { toast } from '$lib/stores/ui';

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiOptions {
  method?: ApiMethod;
  body?: Record<string, unknown> | FormData | string | null;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  timeoutMs?: number;
  cacheTtlMs?: number;
  noCache?: boolean;
  redirectOnForbidden?: boolean;
  redirectOnUnauthorized?: boolean;
}

export class ApiError extends Error {
  status: number;
  payload?: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

const DEFAULT_API_TIMEOUT_MS = 20_000; // falha rápida para chamadas comuns
const DEFAULT_GET_CACHE_TTL_MS = 15_000; // navegações rápidas reaproveitam cache

type CachedGetEntry = {
  expiresAt: number;
  promise?: Promise<unknown>;
  value?: unknown;
};

const getCache = new Map<string, CachedGetEntry>();
const inFlightGetControllers = new Set<AbortController>();
const navigationAbortedControllers = new WeakSet<AbortController>();

export function abortInFlightApiReads() {
  for (const controller of inFlightGetControllers) {
    navigationAbortedControllers.add(controller);
    if (!controller.signal.aborted) controller.abort();
  }
  inFlightGetControllers.clear();
  for (const [url, entry] of getCache) {
    if (entry.promise) getCache.delete(url);
  }
}

function shouldBypassLocalGetValueCache(url: string) {
  return ['/api/v1/vendas/list'].some((prefix) => url.startsWith(prefix));
}

export function isCanceledApiError(err: unknown) {
  if (!(err instanceof ApiError)) return false;
  const payload = err.payload as { aborted?: boolean; timeout?: boolean } | undefined;
  return err.status === 0 && payload?.aborted === true && payload?.timeout !== true;
}

function buildQueryString(
  query?: Record<string, string | number | boolean | undefined | null>
): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

let unauthorizedRedirectStarted = false;

function handleUnauthorized() {
  if (!browser || unauthorizedRedirectStarted) return;
  const path = window.location.pathname;
  if (path.startsWith('/auth/')) return;
  unauthorizedRedirectStarted = true;
  toast.warning('Sua sessão expirou. Faça login novamente.', 6000);
  const next = `${path}${window.location.search || ''}`;
  // Navegação completa (não goto): descarta o estado da tela e os dados em
  // cache de quem não está mais logado, e volta para esta tela após o login.
  window.location.assign(`/auth/login?session_expired=1&next=${encodeURIComponent(next)}`);
}

function handleForbidden() {
  if (browser) {
    goto('/negado');
  }
}

function fallbackErrorMessage(response: Response) {
  return `Erro ${response.status}: ${response.statusText || 'Falha na requisição'}`;
}

function safeTextMessage(value: string, fallback: string) {
  const text = String(value || '').trim();
  if (!text) return fallback;
  if (text.startsWith('<!doctype') || text.startsWith('<html')) return fallback;
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

async function readError(response: Response) {
  const fallback = fallbackErrorMessage(response);
  const raw = await response.text().catch(() => '');
  if (!raw) return { message: fallback };

  try {
    const errorData = JSON.parse(raw);
    return {
      message:
        safeTextMessage(errorData?.message, '') ||
        safeTextMessage(errorData?.error, '') ||
        safeTextMessage(errorData?.details, '') ||
        fallback,
      payload: errorData
    };
  } catch {
    return { message: safeTextMessage(raw, fallback) };
  }
}

export async function apiFetch<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const queryString = buildQueryString(options.query);
  const url = `${path}${queryString}`;
  const method = options.method || 'GET';
  const isGetCacheCandidate =
    browser && method === 'GET' && !options.headers && !options.body && options.noCache !== true;
  const canShareGetPromise = isGetCacheCandidate && !options.signal;
  const shouldKeepGetValue = isGetCacheCandidate && !shouldBypassLocalGetValueCache(url);

  if (isGetCacheCandidate) {
    const cached = getCache.get(url);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      if (shouldKeepGetValue && 'value' in cached) return cached.value as T;
      if (canShareGetPromise && cached.promise) return cached.promise as Promise<T>;
      if (!cached.promise) getCache.delete(url);
    }
  } else if (browser && method !== 'GET') {
    getCache.clear();
  }

  const timeoutMs = Math.max(1_000, Number(options.timeoutMs || DEFAULT_API_TIMEOUT_MS));
  const controller = new AbortController();
  const shouldTrackRead = browser && method === 'GET';
  if (shouldTrackRead) inFlightGetControllers.add(controller);
  let didTimeout = false;
  const timeout = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  let removeExternalAbortListener: (() => void) | null = null;

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      const onAbort = () => controller.abort();
      options.signal.addEventListener('abort', onAbort, { once: true });
      removeExternalAbortListener = () => options.signal?.removeEventListener('abort', onAbort);
    }
  }

  const isFormData = options.body instanceof FormData;
  const isString = typeof options.body === 'string';

  const headers: Record<string, string> = {
    ...(options.headers || {})
  };

  if (!isFormData && !isString && options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const requestBody: BodyInit | undefined = options.body
    ? isFormData || isString
      ? (options.body as BodyInit)
      : JSON.stringify(options.body)
    : undefined;

  const requestPromise = (async () => {
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: requestBody,
        signal: controller.signal,
        credentials: 'same-origin'
      });
    } catch (err) {
      const aborted =
        controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError');
      if (aborted && !didTimeout && navigationAbortedControllers.has(controller)) {
        return new Promise<T>(() => {});
      }
      throw new ApiError(
        aborted
          ? didTimeout
            ? 'A requisição demorou demais. Tente novamente.'
            : 'Requisição cancelada.'
          : 'Falha de conexão com o servidor.',
        0,
        aborted ? { aborted: true, timeout: didTimeout, cause: err } : err
      );
    } finally {
      clearTimeout(timeout);
      removeExternalAbortListener?.();
      if (shouldTrackRead) inFlightGetControllers.delete(controller);
    }

    if (response.status === 401) {
      if (options.redirectOnUnauthorized !== false) {
        handleUnauthorized();
      }
      throw new ApiError('Sessão expirada. Faça login novamente.', 401);
    }

    if (response.status === 403) {
      if (options.redirectOnForbidden !== false) {
        handleForbidden();
      }
      throw new ApiError('Acesso negado.', 403);
    }

    if (!response.ok) {
      const error = await readError(response);
      throw new ApiError(error.message, response.status, error.payload);
    }

    const contentLength = response.headers.get('content-length');
    if (response.status === 204 || contentLength === '0') {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  })();

  if (isGetCacheCandidate) {
    const ttlMs = Math.max(0, Number(options.cacheTtlMs ?? DEFAULT_GET_CACHE_TTL_MS));
    const entry: CachedGetEntry | null = canShareGetPromise
      ? {
          expiresAt: Date.now() + Math.max(ttlMs, timeoutMs),
          promise: requestPromise
        }
      : null;
    if (entry) getCache.set(url, entry);
    try {
      const value = await requestPromise;
      if (shouldKeepGetValue && ttlMs > 0) {
        const valueEntry = entry || getCache.get(url) || { expiresAt: 0 };
        valueEntry.value = value;
        valueEntry.promise = undefined;
        valueEntry.expiresAt = Date.now() + ttlMs;
        getCache.set(url, valueEntry);
      } else if (entry) {
        getCache.delete(url);
      }
      return value as T;
    } catch (err) {
      if (entry) getCache.delete(url);
      throw err;
    }
  }

  return requestPromise;
}

export function apiGet<T = unknown>(
  path: string,
  query?: ApiOptions['query'],
  signal?: AbortSignal,
  timeoutMs?: number
) {
  return apiFetch<T>(path, { method: 'GET', query, signal, ...(timeoutMs ? { timeoutMs } : {}) });
}

export function apiPost<T = unknown>(
  path: string,
  body: ApiOptions['body'],
  signal?: AbortSignal,
  timeoutMs?: number
) {
  return apiFetch<T>(path, { method: 'POST', body, signal, ...(timeoutMs ? { timeoutMs } : {}) });
}

export function apiPatch<T = unknown>(
  path: string,
  body: ApiOptions['body'],
  signal?: AbortSignal
) {
  return apiFetch<T>(path, { method: 'PATCH', body, signal });
}

export function apiPut<T = unknown>(path: string, body: ApiOptions['body'], signal?: AbortSignal) {
  return apiFetch<T>(path, { method: 'PUT', body, signal });
}

export function apiDelete<T = unknown>(
  path: string,
  query?: ApiOptions['query'],
  signal?: AbortSignal
) {
  return apiFetch<T>(path, { method: 'DELETE', query, signal });
}
