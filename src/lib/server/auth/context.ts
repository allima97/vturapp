/**
 * Contexto de autenticação e autorização para rotas da API — F2-02.
 *
 * Resolve sessão Better Auth + papel do membro dentro da empresa,
 * sem depender do hooks.server.ts (útil nas rotas Hono /api/v2).
 *
 * Uso em handlers Hono:
 *   const ctx = await resolveAuthContext(c.req.raw.headers, c.env.DB, c.env.BETTER_AUTH_SECRET);
 *   if (!ctx) return c.json({ error: 'Não autenticado' }, 401);
 *   if (ctx.papel !== 'admin') return c.json({ error: 'Sem permissão' }, 403);
 */

import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db/client';
import { membrosEmpresa, user, type Papel } from '$lib/server/db/schema';
import { createAuth } from '$lib/auth';

export type AuthContext = {
  userId: string;
  userEmail: string;
  empresaId: number;
  papel: Papel;
};

/**
 * Resolve o contexto de autenticação a partir dos headers da request.
 *
 * Retorna null se:
 *   - Não há sessão Better Auth válida
 *   - O usuário não tem empresa_id (super-admin sem empresa ou conta não vinculada)
 *   - O usuário não está em membros_empresa (inconsistência de dados)
 */
export async function resolveAuthContext(
  headers: Headers,
  d1: D1Database,
  secret: string,
  baseURL?: string
): Promise<AuthContext | null> {
  const auth = createAuth(d1, secret, baseURL);

  // 1. Verificar sessão Better Auth
  const sessionResult = await auth.api.getSession({
    headers,
  });

  if (!sessionResult?.user || !sessionResult?.session) {
    return null;
  }

  const { user: sessionUser } = sessionResult;

  // 2. Verificar que o usuário tem empresa vinculada
  const db = getDb(d1);
  const userRow = await db
    .select({ empresaId: user.empresaId })
    .from(user)
    .where(eq(user.id, sessionUser.id))
    .get();

  if (!userRow?.empresaId) {
    return null;
  }

  // 3. Verificar papel em membros_empresa
  const membro = await db
    .select({ papel: membrosEmpresa.papel, ativo: membrosEmpresa.ativo })
    .from(membrosEmpresa)
    .where(eq(membrosEmpresa.userId, sessionUser.id))
    .get();

  if (!membro || !membro.ativo) {
    return null;
  }

  return {
    userId: sessionUser.id,
    userEmail: sessionUser.email,
    empresaId: userRow.empresaId,
    papel: membro.papel as Papel,
  };
}

/**
 * Helper para verificar se o papel tem permissão de admin.
 * Usado nos guards de rota.
 */
export function requireAdmin(ctx: AuthContext | null): ctx is AuthContext & { papel: 'admin' } {
  return ctx?.papel === 'admin';
}

/**
 * Helper para verificar se o papel pode escrever (admin ou operador).
 */
export function canWrite(ctx: AuthContext | null): ctx is AuthContext {
  return ctx !== null && (ctx.papel === 'admin' || ctx.papel === 'operador');
}
