/**
 * Funções de autorização VTUR — F2-03.
 *
 * Baseadas na MATRIZ_RBAC definida em matrix.ts.
 * Sem dependências externas (puras, testáveis sem banco/rede).
 *
 * Uso básico:
 *   can('admin', 'financeiro', 'gerenciar')  // → true
 *   can('operador', 'empresa', 'editar')     // → false
 *   can('visualizador', 'clientes', 'ler')   // → true
 *
 * Uso em guards Hono:
 *   const guard = requireCan('convites', 'criar');
 *   app.post('/invites', guard, handler);
 *
 * Uso em +server.ts SvelteKit:
 *   authorize(locals.papel, 'financeiro', 'ler', () => json(dados));
 */

import type { MiddlewareHandler } from 'hono';
import type { Papel } from '$lib/server/db/schema';
import type { ApiEnv } from '$lib/server/api/types';
import type { Recurso, Acao } from './matrix';
import { MATRIZ_RBAC } from './matrix';

// ─────────────────────────────────────────────────────────────────────────────
// can() — verificação pura
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica se um papel tem permissão para executar uma ação em um recurso.
 *
 * @returns true se permitido, false caso contrário
 *
 * @example
 * can('admin', 'empresa', 'gerenciar')    // true
 * can('operador', 'empresa', 'gerenciar') // false
 * can('visualizador', 'vendas', 'ler')    // true
 * can(null, 'vendas', 'ler')             // false (não autenticado)
 */
export function can(
  papel: Papel | null | undefined,
  recurso: Recurso,
  acao: Acao
): boolean {
  if (!papel) return false;
  const capSet = MATRIZ_RBAC[papel];
  if (!capSet) return false;
  return capSet.has(`${recurso}:${acao}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// canAny() — verifica se pode qualquer uma das ações
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna true se o papel tem permissão para PELO MENOS UMA das ações.
 *
 * @example
 * canAny('operador', 'vendas', ['criar', 'editar']) // true
 * canAny('visualizador', 'financeiro', ['ler'])     // false
 */
export function canAny(
  papel: Papel | null | undefined,
  recurso: Recurso,
  acoes: Acao[]
): boolean {
  return acoes.some((acao) => can(papel, recurso, acao));
}

// ─────────────────────────────────────────────────────────────────────────────
// canAll() — verifica se pode todas as ações
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna true se o papel tem permissão para TODAS as ações.
 */
export function canAll(
  papel: Papel | null | undefined,
  recurso: Recurso,
  acoes: Acao[]
): boolean {
  return acoes.every((acao) => can(papel, recurso, acao));
}

// ─────────────────────────────────────────────────────────────────────────────
// authorize() — guard funcional para SvelteKit +server.ts
// ─────────────────────────────────────────────────────────────────────────────

type AuthorizeResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: Response };

/**
 * Guard funcional para handlers SvelteKit.
 *
 * @example
 * const result = authorize(locals.papel, 'convites', 'criar', () => {
 *   return json({ status: 'ok' });
 * });
 * if (!result.ok) return result.response;
 * return result.value;
 */
export function authorize<T>(
  papel: Papel | null | undefined,
  recurso: Recurso,
  acao: Acao,
  handler: () => T
): AuthorizeResult<T> {
  if (!papel) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: 'Não autenticado.', code: 'UNAUTHENTICATED' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }
  if (!can(papel, recurso, acao)) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: 'Sem permissão.', code: 'FORBIDDEN', recurso, acao }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }
  return { ok: true, value: handler() };
}

// ─────────────────────────────────────────────────────────────────────────────
// requireCan() — Hono middleware factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Middleware Hono que verifica autorização antes de chamar o handler.
 * Usa `resolveAuthContext` para obter o papel do usuário autenticado.
 *
 * Requer que a rota use o contexto de auth do F2-02.
 *
 * @example
 * app.post('/invites', requireCan('convites', 'criar'), handler);
 * app.delete('/vendas/:id', requireCan('vendas', 'excluir'), handler);
 */
export function requireCan(recurso: Recurso, acao: Acao): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const { DB, BETTER_AUTH_SECRET, PUBLIC_APP_URL, PUBLIC_ENVIRONMENT } = c.env;

    if (!DB || !BETTER_AUTH_SECRET) {
      return c.json({ error: 'Serviço indisponível.' }, 503);
    }

    const baseURL =
      PUBLIC_ENVIRONMENT === 'production'
        ? 'https://vturapp.com.br'
        : PUBLIC_APP_URL ?? 'http://localhost:5173';

    const { resolveAuthContext } = await import('$lib/server/auth/context');
    const ctx = await resolveAuthContext(c.req.raw.headers, DB, BETTER_AUTH_SECRET, baseURL);

    if (!ctx) {
      return c.json({ error: 'Não autenticado.', code: 'UNAUTHENTICATED' }, 401);
    }

    if (!can(ctx.papel, recurso, acao)) {
      return c.json(
        { error: 'Sem permissão.', code: 'FORBIDDEN', recurso, acao },
        403
      );
    }

    // Anexar contexto ao request para uso no handler
    c.set('requestId', c.get('requestId')); // preserva requestId

    await next();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// listarCapacidades() — documentação/UI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna a lista de capacidades de um papel (para documentação ou UI).
 *
 * @example
 * listarCapacidades('operador')
 * // → ['clientes:criar', 'clientes:editar', 'clientes:ler', ...]
 */
export function listarCapacidades(papel: Papel): string[] {
  return [...MATRIZ_RBAC[papel]].sort();
}

/**
 * Retorna true se o papel tem qualquer acesso ao recurso.
 *
 * @example
 * temAcessoAoRecurso('visualizador', 'financeiro') // false
 * temAcessoAoRecurso('operador', 'financeiro')     // true (pode ler)
 */
export function temAcessoAoRecurso(papel: Papel | null | undefined, recurso: Recurso): boolean {
  if (!papel) return false;
  const capSet = MATRIZ_RBAC[papel];
  for (const key of capSet) {
    if (key.startsWith(`${recurso}:`)) return true;
  }
  return false;
}
