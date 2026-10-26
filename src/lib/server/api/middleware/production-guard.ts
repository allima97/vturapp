/**
 * Middleware de guarda de produção — F2-06.
 *
 * Bloqueia endpoints de diagnóstico, prova e debug quando o ambiente é produção.
 *
 * Endpoints protegidos:
 *   - /api/v2/f2-proof/*   — rotas de prova de isolamento (F2-04)
 *   - /api/v2/debug/*      — futuras rotas de debug
 *   - /api/v2/diagnostics/* — futuras rotas de diagnóstico
 *
 * Em produção, retorna 404 (não 403) para não revelar que o endpoint existe.
 *
 * Uso:
 *   app.use('*', productionGuard);
 *
 * Referência: docs/f2/F2-06-producao.md
 */

import type { MiddlewareHandler } from 'hono';
import type { ApiEnv } from '../types';

/**
 * Prefixos de paths que são SEMPRE bloqueados em produção.
 * Inclui o basePath '/api/v2' porque o middleware roda após o basePath ser aplicado.
 */
const DEBUG_PATH_PREFIXES = [
  '/api/v2/f2-proof',
  '/api/v2/debug',
  '/api/v2/diagnostics',
  '/api/v2/test',
  '/api/v2/internal',
];

/**
 * Retorna true se o path é um endpoint de debug/prova.
 * Função pura — exportada para testes.
 */
export function isDebugPath(pathname: string, prefixes: string[] = DEBUG_PATH_PREFIXES): boolean {
  return prefixes.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Retorna true se o ambiente é produção.
 * Função pura — exportada para testes.
 */
export function isProduction(env: string | undefined): boolean {
  return env === 'production';
}

/**
 * Middleware: bloqueia paths de debug em produção com 404.
 *
 * Retorna 404 (não 403) deliberadamente — não revelar que o endpoint existe.
 */
export const productionGuard: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const env = c.env.PUBLIC_ENVIRONMENT;

  if (!isProduction(env)) {
    return next();
  }

  const pathname = new URL(c.req.url).pathname;

  if (isDebugPath(pathname)) {
    return c.json({ error: 'Rota não encontrada.', code: 'NOT_FOUND' }, 404);
  }

  return next();
};
