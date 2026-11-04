/**
 * Rate limiting por IP — F2-05.
 *
 * Implementa um sliding-window simples em memória (Map).
 * Em Cloudflare Workers, cada instância/isolate tem seu próprio Map —
 * por isso é "best-effort": adequado para proteção contra abuse básico,
 * não garante limite global em múltiplos workers.
 *
 * Para limites globais em produção, usar Cloudflare KV/Durable Objects.
 *
 * Uso:
 *   app.use('*', rateLimitMiddleware({ windowMs: 60_000, maxRequests: 60 }));
 */

import type { MiddlewareHandler } from 'hono';
import type { ApiEnv } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export interface RateLimitOptions {
  /** Janela de tempo em ms. Default: 60_000 (1 minuto). */
  windowMs?: number;
  /** Máximo de requisições por janela. Default: 60. */
  maxRequests?: number;
  /** Mensagem de erro. Default: 'Muitas requisições. Tente novamente em breve.' */
  message?: string;
  /** Prefixo de paths que se aplicam. Default: todas ('/'). */
  pathPrefix?: string;
  /** Paths excluídos do rate limit. */
  excludePaths?: string[];
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store in-memory (singleton por isolate)
// ─────────────────────────────────────────────────────────────────────────────

/** Mapa IP → window entry. Limpo automaticamente quando resetAt expira. */
const store = new Map<string, WindowEntry>();

/**
 * Retorna o IP da requisição.
 * Em Cloudflare Workers, o IP real está em CF-Connecting-IP.
 * Em desenvolvimento, usa x-forwarded-for ou '127.0.0.1'.
 */
export function getClientIp(request: Request): string {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();

  return '127.0.0.1';
}

/**
 * Verifica e incrementa o contador para um IP.
 *
 * @returns { allowed: true } se dentro do limite, { allowed: false, retryAfterMs } caso contrário.
 */
export function checkRateLimit(
  ip: string,
  windowMs: number,
  maxRequests: number
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now > entry.resetAt) {
    // Nova janela
    store.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true };
}

/**
 * Limpa entradas expiradas do store.
 * Chamada periodicamente para evitar crescimento ilimitado.
 */
export function pruneExpiredEntries(): number {
  const now = Date.now();
  let pruned = 0;
  for (const [ip, entry] of store.entries()) {
    if (now > entry.resetAt) {
      store.delete(ip);
      pruned++;
    }
  }
  return pruned;
}

/** Retorna o tamanho atual do store (para testes). */
export function getStoreSize(): number {
  return store.size;
}

/** Limpa completamente o store (para testes). */
export function clearStore(): void {
  store.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware Hono
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Middleware de rate limiting por IP.
 *
 * Retorna 429 com header Retry-After quando o limite é excedido.
 */
export function rateLimitMiddleware(
  options: RateLimitOptions = {}
): MiddlewareHandler<ApiEnv> {
  const {
    windowMs = 60_000,
    maxRequests = 60,
    message = 'Muitas requisições. Tente novamente em breve.',
    pathPrefix = '/',
    excludePaths = [],
  } = options;

  // Prune a cada ~100 requisições (probabilístico para evitar overhead)
  let callCount = 0;

  return async (c, next) => {
    const path = new URL(c.req.url).pathname;

    // Verifica se o path está no escopo
    if (!path.startsWith(pathPrefix)) {
      return next();
    }

    // Verifica exclusões
    if (excludePaths.some((exc) => path.startsWith(exc))) {
      return next();
    }

    // Prune periódico
    if (++callCount % 100 === 0) {
      pruneExpiredEntries();
    }

    const ip = getClientIp(c.req.raw);
    const result = checkRateLimit(ip, windowMs, maxRequests);

    if (!result.allowed) {
      const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
      return c.json(
        { error: message, code: 'RATE_LIMIT_EXCEEDED' },
        429,
        {
          'Retry-After': String(retryAfterSec),
          'X-RateLimit-Limit': String(maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil((Date.now() + result.retryAfterMs) / 1000)),
        }
      );
    }

    await next();
  };
}
