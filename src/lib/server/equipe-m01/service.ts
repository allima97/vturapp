/**
 * M01 — Empresas, usuários, vínculos e permissões.
 *
 * Camada de domínio sobre D1 (Drizzle) para gestão de:
 *   - Empresa (dados cadastrais do tenant)
 *   - Membros (associação usuário ↔ empresa, papel RBAC)
 *
 * Isolamento de tenant garantido: toda operação filtra por `empresaId`.
 * Soft-delete para revogar membros (preserva histórico de vendas).
 *
 * Referências: F2-03 (RBAC), F2-04 (isolamento de tenant), ADR-003.
 */

import { and, eq } from 'drizzle-orm';
import type { DrizzleDb } from '$lib/server/db/client';
import { empresas, membrosEmpresa, user, PAPEIS, type Papel } from '$lib/server/db/schema';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export interface EmpresaInput {
  nome?: string;
  timezone?: string;
  slug?: string;
}

export interface AlterarPapelInput {
  papel: Papel;
}

export type MembroDetalhe = {
  id: number;
  userId: string;
  empresaId: number;
  papel: Papel;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
  nome: string | null;
  email: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Erros de domínio
// ─────────────────────────────────────────────────────────────────────────────

export class EmpresaError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NAO_ENCONTRADO'
      | 'VALIDACAO'
      | 'SEM_PERMISSAO'
      | 'CONFLITO'
  ) {
    super(message);
    this.name = 'EmpresaError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Empresa
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna os dados da empresa do tenant.
 * Lança NAO_ENCONTRADO se a empresa não existir (inconsistência).
 */
export async function obterEmpresa(db: DrizzleDb, empresaId: number) {
  const rows = await db
    .select()
    .from(empresas)
    .where(eq(empresas.id, empresaId))
    .limit(1);

  if (rows.length === 0) {
    throw new EmpresaError('Empresa não encontrada.', 'NAO_ENCONTRADO');
  }

  return rows[0];
}

/**
 * Atualiza os dados da empresa.
 * Apenas admin pode chamar (verificação de papel feita na rota).
 */
export async function editarEmpresa(
  db: DrizzleDb,
  empresaId: number,
  dados: EmpresaInput
) {
  // Validações
  if (dados.nome !== undefined && dados.nome.trim().length === 0) {
    throw new EmpresaError('Nome da empresa não pode ser vazio.', 'VALIDACAO');
  }
  if (dados.nome !== undefined && dados.nome.trim().length > 200) {
    throw new EmpresaError('Nome da empresa muito longo (max 200 caracteres).', 'VALIDACAO');
  }

  const agora = new Date().toISOString();
  const update: Partial<typeof empresas.$inferInsert> = { atualizadoEm: agora };

  if (dados.nome !== undefined) update.nome = dados.nome.trim();
  if (dados.timezone !== undefined) update.timezone = dados.timezone;
  if (dados.slug !== undefined) update.slug = dados.slug || null;

  await db
    .update(empresas)
    .set(update)
    .where(eq(empresas.id, empresaId));

  return obterEmpresa(db, empresaId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Membros
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lista membros da empresa (ativos e inativos).
 * Inclui dados do usuário (nome, email) via JOIN.
 */
export async function listarMembros(
  db: DrizzleDb,
  empresaId: number,
  opts: { somenteAtivos?: boolean } = {}
): Promise<MembroDetalhe[]> {
  const conds = [eq(membrosEmpresa.empresaId, empresaId)];
  if (opts.somenteAtivos !== false) {
    conds.push(eq(membrosEmpresa.ativo, true));
  }

  const rows = await db
    .select({
      id:           membrosEmpresa.id,
      userId:       membrosEmpresa.userId,
      empresaId:    membrosEmpresa.empresaId,
      papel:        membrosEmpresa.papel,
      ativo:        membrosEmpresa.ativo,
      criadoEm:     membrosEmpresa.criadoEm,
      atualizadoEm: membrosEmpresa.atualizadoEm,
      nome:         user.name,
      email:        user.email,
    })
    .from(membrosEmpresa)
    .leftJoin(user, eq(membrosEmpresa.userId, user.id))
    .where(and(...conds));

  return rows as MembroDetalhe[];
}

/**
 * Retorna um membro específico da empresa.
 * Lança NAO_ENCONTRADO se não pertencer ao tenant.
 */
export async function obterMembro(
  db: DrizzleDb,
  empresaId: number,
  membroId: number
): Promise<MembroDetalhe> {
  const rows = await db
    .select({
      id:           membrosEmpresa.id,
      userId:       membrosEmpresa.userId,
      empresaId:    membrosEmpresa.empresaId,
      papel:        membrosEmpresa.papel,
      ativo:        membrosEmpresa.ativo,
      criadoEm:     membrosEmpresa.criadoEm,
      atualizadoEm: membrosEmpresa.atualizadoEm,
      nome:         user.name,
      email:        user.email,
    })
    .from(membrosEmpresa)
    .leftJoin(user, eq(membrosEmpresa.userId, user.id))
    .where(
      and(
        eq(membrosEmpresa.id, membroId),
        eq(membrosEmpresa.empresaId, empresaId)
      )
    )
    .limit(1);

  if (rows.length === 0) {
    throw new EmpresaError('Membro não encontrado.', 'NAO_ENCONTRADO');
  }

  return rows[0] as MembroDetalhe;
}

/**
 * Altera o papel (role) de um membro.
 * Apenas admin pode chamar. Não é possível rebaixar o próprio admin (verificar na rota).
 */
export async function alterarPapelMembro(
  db: DrizzleDb,
  empresaId: number,
  membroId: number,
  novoPapel: Papel
): Promise<MembroDetalhe> {
  if (!PAPEIS.includes(novoPapel)) {
    throw new EmpresaError(
      `Papel inválido: '${novoPapel}'. Valores aceitos: ${PAPEIS.join(', ')}.`,
      'VALIDACAO'
    );
  }

  // Verifica que o membro pertence ao tenant
  await obterMembro(db, empresaId, membroId);

  const agora = new Date().toISOString();
  await db
    .update(membrosEmpresa)
    .set({ papel: novoPapel, atualizadoEm: agora })
    .where(
      and(
        eq(membrosEmpresa.id, membroId),
        eq(membrosEmpresa.empresaId, empresaId)
      )
    );

  return obterMembro(db, empresaId, membroId);
}

/**
 * Revoga o acesso de um membro (soft-delete: ativo = false).
 * Preserva histórico de vendas e auditoria.
 */
export async function revogarMembroM01(
  db: DrizzleDb,
  empresaId: number,
  membroId: number
): Promise<MembroDetalhe> {
  // Verifica que o membro pertence ao tenant
  await obterMembro(db, empresaId, membroId);

  const agora = new Date().toISOString();
  await db
    .update(membrosEmpresa)
    .set({ ativo: false, atualizadoEm: agora })
    .where(
      and(
        eq(membrosEmpresa.id, membroId),
        eq(membrosEmpresa.empresaId, empresaId)
      )
    );

  // Retorna o membro com ativo=false (busca sem filtro de ativo)
  const rows = await db
    .select({
      id:           membrosEmpresa.id,
      userId:       membrosEmpresa.userId,
      empresaId:    membrosEmpresa.empresaId,
      papel:        membrosEmpresa.papel,
      ativo:        membrosEmpresa.ativo,
      criadoEm:     membrosEmpresa.criadoEm,
      atualizadoEm: membrosEmpresa.atualizadoEm,
      nome:         user.name,
      email:        user.email,
    })
    .from(membrosEmpresa)
    .leftJoin(user, eq(membrosEmpresa.userId, user.id))
    .where(
      and(
        eq(membrosEmpresa.id, membroId),
        eq(membrosEmpresa.empresaId, empresaId)
      )
    )
    .limit(1);

  return rows[0] as MembroDetalhe;
}
