/**
 * Rotas de prova de isolamento de tenant — F2-04.
 *
 * SOMENTE disponível quando PUBLIC_ENVIRONMENT !== 'production'.
 * Demonstra via HTTP que o stack de guarda funciona:
 *
 *   GET  /api/v2/f2-proof/tenant-isolation
 *        — lista membros do tenant autenticado (prova que só vê o próprio tenant)
 *
 *   POST /api/v2/f2-proof/tenant-isolation/cross-tenant
 *        — tenta acessar registro de outro tenant, retorna 403 (prova de bloqueio)
 *
 * Protegido por resolveAuthContext (precisa de sessão Better Auth).
 */

import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { resolveAuthContext } from '$lib/server/auth/context';
import { listarMembros, getMembro } from '$lib/server/tenant/members';
import { assertHasEmpresaId, TenantError } from '$lib/server/tenant/guard';

export const tenantProofRoutes = new Hono<ApiEnv>();

// ── GET /api/v2/f2-proof/tenant-isolation ─────────────────────────────────
// Retorna membros do tenant autenticado.
// Prova: usuário só enxerga registros da sua empresa (empresa_id no WHERE).
// ─────────────────────────────────────────────────────────────────────────

tenantProofRoutes.get('/tenant-isolation', async (c) => {
  const env = c.env;

  // Bloquear em produção
  if (env.PUBLIC_ENVIRONMENT === 'production') {
    return c.json({ error: 'Endpoint de prova desabilitado em produção.' }, 403);
  }

  // Resolver contexto de autenticação
  const ctx = await resolveAuthContext(
    c.req.raw.headers,
    env.DB,
    env.BETTER_AUTH_SECRET,
    env.PUBLIC_APP_URL
  );

  if (!ctx) {
    return c.json({ error: 'Não autenticado.', code: 'UNAUTHENTICATED' }, 401);
  }

  try {
    assertHasEmpresaId(ctx.empresaId);
    const membros = await listarMembros(env.DB, ctx.empresaId);

    return c.json({
      proof: 'F2-04-READ-ISOLATION',
      description: 'Membros retornados pertencem APENAS ao tenant autenticado.',
      authContext: {
        userId: ctx.userId,
        empresaId: ctx.empresaId,
        papel: ctx.papel,
      },
      membros: membros.map(m => ({
        id: m.id,
        empresaId: m.empresaId,
        papel: m.papel,
        ativo: m.ativo,
      })),
      invariant: `Todos os registros têm empresaId === ${ctx.empresaId}`,
      allSameTenant: membros.every(m => m.empresaId === ctx.empresaId),
    });
  } catch (err) {
    if (err instanceof TenantError && err.code === 'MISSING_EMPRESA_ID') {
      return c.json({ error: 'Usuário sem empresa associada.' }, 403);
    }
    return c.json({ error: 'Erro interno.' }, 500);
  }
});

// ── POST /api/v2/f2-proof/tenant-isolation/cross-tenant ───────────────────
// Tenta ler um membro de outro tenant (id enviado no body).
// Prova: retorna 403 com code CROSS_TENANT.
// ─────────────────────────────────────────────────────────────────────────

tenantProofRoutes.post('/tenant-isolation/cross-tenant', async (c) => {
  const env = c.env;

  // Bloquear em produção
  if (env.PUBLIC_ENVIRONMENT === 'production') {
    return c.json({ error: 'Endpoint de prova desabilitado em produção.' }, 403);
  }

  const ctx = await resolveAuthContext(
    c.req.raw.headers,
    env.DB,
    env.BETTER_AUTH_SECRET,
    env.PUBLIC_APP_URL
  );

  if (!ctx) {
    return c.json({ error: 'Não autenticado.', code: 'UNAUTHENTICATED' }, 401);
  }

  let body: { membroId?: number } = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Body JSON inválido.' }, 400);
  }

  const membroId = Number(body.membroId);
  if (!membroId) {
    return c.json({ error: 'membroId é obrigatório.' }, 400);
  }

  try {
    assertHasEmpresaId(ctx.empresaId);
    const resultado = await getMembro(env.DB, membroId, ctx.empresaId);

    if (!resultado.ok) {
      const status = resultado.code === 'CROSS_TENANT' ? 403 : resultado.code === 'NAO_ENCONTRADO' ? 404 : 500;
      return c.json({
        proof: 'F2-04-CROSS-TENANT-BLOCKED',
        ok: false,
        code: resultado.code,
        error: resultado.error,
        description: resultado.code === 'CROSS_TENANT'
          ? `ISOLAMENTO FUNCIONANDO: acesso ao membro ${membroId} de outro tenant foi BLOQUEADO.`
          : `Membro ${membroId} não encontrado.`,
      }, status);
    }

    // Membro do mesmo tenant — retorna normalmente (não é cross-tenant)
    return c.json({
      proof: 'F2-04-SAME-TENANT-ALLOWED',
      ok: true,
      description: `Membro ${membroId} pertence ao seu tenant (${ctx.empresaId}). Acesso permitido.`,
      membro: resultado.membro,
    });
  } catch (err) {
    if (err instanceof TenantError) {
      return c.json({ error: err.message, code: err.code }, 403);
    }
    return c.json({ error: 'Erro interno.' }, 500);
  }
});
