/**
 * Middleware de segurança para a API v2 — F2-05.
 *
 * Implementa:
 *   1. Security Headers — CSP, HSTS, X-Content-Type-Options, X-Frame-Options, etc.
 *   2. CSRF Protection — verifica Origin para mutating requests (POST/PUT/DELETE/PATCH)
 *
 * Uso:
 *   app.use('*', securityHeaders(env));
 *   app.use('*', csrfProtection(env));
 *
 * Referência: docs/f2/F2-05-seguranca.md
 */

import type { MiddlewareHandler } from 'hono';
import type { ApiEnv } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Security Headers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Define headers de segurança padrão em todas as respostas da API v2.
 *
 * Headers aplicados:
 * - X-Content-Type-Options: nosniff           — impede MIME-sniffing
 * - X-Frame-Options: DENY                     — impede clickjacking
 * - Referrer-Policy: strict-origin            — não vaza URL no Referer
 * - Permissions-Policy: restritivo            — desabilita APIs sensíveis
 * - Strict-Transport-Security                 — HTTPS obrigatório (prod)
 * - Content-Security-Policy                   — restringe fontes de conteúdo
 * - Cache-Control: no-store                   — nenhum dado sensível em cache
 */
export const securityHeaders: MiddlewareHandler<ApiEnv> = async (c, next) => {
  await next();

  const res = c.res;
  const isProd = c.env.PUBLIC_ENVIRONMENT === 'production';

  // X-Content-Type-Options
  res.headers.set('x-content-type-options', 'nosniff');

  // X-Frame-Options
  res.headers.set('x-frame-options', 'DENY');

  // Referrer-Policy
  res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');

  // Permissions-Policy — desabilita câmera, microfone, geolocalização
  res.headers.set(
    'permissions-policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );

  // HSTS — só em produção (dev não usa HTTPS obrigatoriamente)
  if (isProd) {
    res.headers.set(
      'strict-transport-security',
      'max-age=63072000; includeSubDomains; preload'
    );
  }

  // Content-Security-Policy — API JSON: sem scripts ou frames
  res.headers.set(
    'content-security-policy',
    "default-src 'none'; frame-ancestors 'none'"
  );

  // Cache-Control — dados da API não devem ser cacheados
  if (!res.headers.has('cache-control')) {
    res.headers.set('cache-control', 'no-store');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. CSRF Protection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Protege endpoints mutantes (POST/PUT/DELETE/PATCH) contra CSRF.
 *
 * Estratégia: verifica Origin/Referer header para garantir que a requisição
 * veio do próprio domínio. APIs JSON são naturalmente mais resistentes a CSRF
 * (HTML forms não enviam Content-Type: application/json), mas essa camada
 * adiciona defesa em profundidade.
 *
 * Exceções (bypass intencional):
 *   - Requisições de ferramentas de desenvolvimento (Origin: null + não-prod)
 *   - Content-Type diferente de application/json (vazio = sem bypass, apenas loga)
 *
 * @param allowedOrigins - Lista de origens permitidas. Default: usa PUBLIC_APP_URL.
 */
export function csrfProtection(allowedOrigins?: string[]): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    const MUTATING = ['POST', 'PUT', 'DELETE', 'PATCH'];

    if (!MUTATING.includes(method)) {
      return next();
    }

    // Endpoints Better Auth (/api/auth/*) têm seu próprio CSRF via token interno
    const path = new URL(c.req.url).pathname;
    if (path.startsWith('/api/auth/')) {
      return next();
    }

    const origin = c.req.header('origin');
    const referer = c.req.header('referer');
    const env = c.env;

    const appUrl = env.PUBLIC_APP_URL ?? 'http://localhost:5173';
    const allowed = allowedOrigins ?? [
      appUrl.replace(/\/$/, ''),
      'http://localhost:5173',
      'http://localhost:4173',
    ];

    // Origin null pode ser de redirecionamentos ou tools de dev
    if (origin === 'null' || !origin) {
      // Em produção, rejeita sem Origin
      if (env.PUBLIC_ENVIRONMENT === 'production') {
        return c.json(
          { error: 'CSRF: Origin header ausente.', code: 'CSRF_MISSING_ORIGIN' },
          403
        );
      }
      // Em dev, aceita (facilita curl e testes)
      return next();
    }

    // Verifica se Origin está na lista de permitidos
    const originAllowed = allowed.some(
      (a) => origin === a || origin.startsWith(a + '/')
    );

    if (!originAllowed) {
      // Tenta Referer como fallback
      const refererAllowed = referer && allowed.some((a) => referer.startsWith(a));
      if (!refererAllowed) {
        return c.json(
          {
            error: `CSRF: Origin '${origin}' não permitido.`,
            code: 'CSRF_INVALID_ORIGIN',
          },
          403
        );
      }
    }

    return next();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (re-exportados para testes)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica se um origin é permitido para uma lista de origens.
 * Função pura — usada nos testes.
 */
export function isOriginAllowed(origin: string, allowed: string[]): boolean {
  return allowed.some((a) => origin === a || origin.startsWith(a + '/'));
}
