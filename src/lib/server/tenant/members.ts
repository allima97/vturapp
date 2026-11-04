/**
 * Serviço de membros — operações de gestão de membros dentro de um tenant.
 *
 * F2-04: inclui a prova de revogação de acesso.
 * Revogação: `ativo = false` mantém o histórico mas bloqueia acesso futuro.
 * resolveAuthContext() em F2-02 filtra `WHERE ativo = 1` ao buscar o papel.
 */

import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { membrosEmpresa } from '$lib/server/db/schema';
import { assertTenantOwnership, TenantError } from './guard';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export type MembrosResult =
  | { ok: true; membro: { id: number; userId: string; empresaId: number; papel: string; ativo: boolean } }
  | { ok: false; error: string; code: 'NAO_ENCONTRADO' | 'CROSS_TENANT' | 'ERRO_INTERNO' };

// ─────────────────────────────────────────────────────────────────────────────
// listarMembros() — lista membros ativos de uma empresa
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lista todos os membros ativos da empresa do usuário autenticado.
 * Sempre filtra por `empresaId` (sem possibilidade de cross-tenant).
 */
export async function listarMembros(
  d1: D1Database,
  empresaId: number
) {
  const db = drizzle(d1);
  return db
    .select({
      id: membrosEmpresa.id,
      userId: membrosEmpresa.userId,
      empresaId: membrosEmpresa.empresaId,
      papel: membrosEmpresa.papel,
      ativo: membrosEmpresa.ativo,
      criadoEm: membrosEmpresa.criadoEm,
    })
    .from(membrosEmpresa)
    .where(
      and(
        eq(membrosEmpresa.empresaId, empresaId),
        eq(membrosEmpresa.ativo, true)
      )
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// revogarMembro() — desativa um membro da empresa
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Revoga o acesso de um membro à empresa.
 *
 * - Busca o membro pelo id
 * - Verifica que pertence ao tenant do solicitante (assertTenantOwnership)
 * - Marca `ativo = false` (soft delete, preserva histórico)
 *
 * @param d1          - D1 database binding
 * @param membroId    - id do registro em membros_empresa
 * @param empresaId   - empresa do usuário autenticado (fonte de verdade)
 * @returns MembrosResult
 */
export async function revogarMembro(
  d1: D1Database,
  membroId: number,
  empresaId: number
): Promise<MembrosResult> {
  const db = drizzle(d1);

  try {
    // 1. Busca o membro pelo id
    const rows = await db
      .select()
      .from(membrosEmpresa)
      .where(eq(membrosEmpresa.id, membroId))
      .limit(1);

    if (rows.length === 0) {
      return { ok: false, error: 'Membro não encontrado.', code: 'NAO_ENCONTRADO' };
    }

    const membro = rows[0];

    // 2. Verifica isolamento de tenant — lança TenantError se cross-tenant
    assertTenantOwnership(empresaId, membro.empresaId);

    // 3. Revoga (soft-delete)
    await db
      .update(membrosEmpresa)
      .set({
        ativo: false,
        atualizadoEm: new Date().toISOString(),
      })
      .where(eq(membrosEmpresa.id, membroId));

    return {
      ok: true,
      membro: {
        id: membro.id,
        userId: membro.userId,
        empresaId: membro.empresaId,
        papel: membro.papel,
        ativo: false,
      },
    };
  } catch (err) {
    if (err instanceof TenantError) {
      return { ok: false, error: err.message, code: 'CROSS_TENANT' };
    }
    return { ok: false, error: 'Erro interno ao revogar membro.', code: 'ERRO_INTERNO' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getMembro() — busca membro verificando tenant ownership
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna um membro verificando que pertence ao tenant do solicitante.
 * Demonstra leitura isolada por tenant.
 */
export async function getMembro(
  d1: D1Database,
  membroId: number,
  empresaId: number
): Promise<MembrosResult> {
  const db = drizzle(d1);

  try {
    const rows = await db
      .select()
      .from(membrosEmpresa)
      .where(eq(membrosEmpresa.id, membroId))
      .limit(1);

    if (rows.length === 0) {
      return { ok: false, error: 'Membro não encontrado.', code: 'NAO_ENCONTRADO' };
    }

    const membro = rows[0];

    // Prova de isolamento de leitura: lança se membro for de outro tenant
    assertTenantOwnership(empresaId, membro.empresaId);

    return {
      ok: true,
      membro: {
        id: membro.id,
        userId: membro.userId,
        empresaId: membro.empresaId,
        papel: membro.papel,
        ativo: membro.ativo,
      },
    };
  } catch (err) {
    if (err instanceof TenantError) {
      return { ok: false, error: err.message, code: 'CROSS_TENANT' };
    }
    return { ok: false, error: 'Erro interno.', code: 'ERRO_INTERNO' };
  }
}
