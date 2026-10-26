/**
 * Guardas de isolamento de tenant VTUR — F2-04.
 *
 * Prova que:
 *   1. Leitura cross-tenant é bloqueada (usuário de empresa A não lê empresa B)
 *   2. Gravação está isolada por empresa (empresa_id sempre vem do contexto auth)
 *   3. Revogação de membro funciona corretamente
 *
 * Em D1 (SQLite), Row Level Security não existe no banco.
 * O isolamento é garantido por:
 *   a) Todas as queries de negócio incluem `WHERE empresa_id = ?` (do auth context)
 *   b) assertTenantOwnership() verifica antes de DELETE/UPDATE
 *   c) injectTenantId() força empresa_id no INSERT (ignora o que veio do body)
 *
 * Referência: docs/f2/F2-04-isolamento.md
 */

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

/** Qualquer registro com empresa_id (número inteiro) */
export type TenantRow = { empresaId: number } | { empresa_id: number };

/** Erros de isolamento de tenant */
export class TenantError extends Error {
  constructor(
    message: string,
    public readonly code: 'CROSS_TENANT_READ' | 'CROSS_TENANT_WRITE' | 'MISSING_EMPRESA_ID'
  ) {
    super(message);
    this.name = 'TenantError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// assertTenantOwnership() — verifica que um registro pertence ao tenant
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica que um registro pertence ao tenant do usuário autenticado.
 *
 * @throws {TenantError} se o registro pertencer a outro tenant
 *
 * @example
 * // Antes de retornar um registro:
 * assertTenantOwnership(ctx.empresaId, venda.empresaId);
 *
 * // Antes de deletar um registro:
 * assertTenantOwnership(ctx.empresaId, venda.empresaId);
 */
export function assertTenantOwnership(
  userEmpresaId: number,
  rowEmpresaId: number
): void {
  if (userEmpresaId !== rowEmpresaId) {
    throw new TenantError(
      `Acesso negado: registro pertence à empresa ${rowEmpresaId}, não à empresa ${userEmpresaId}.`,
      'CROSS_TENANT_READ'
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// injectTenantId() — força empresa_id no INSERT/UPDATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Garante que o empresa_id num objeto de dados vem do contexto de autenticação
 * (não do body da requisição). Previne que um usuário injete empresa_id de outro tenant.
 *
 * @param data          - Dados recebidos do body (pode conter empresaId injetado)
 * @param authEmpresaId - empresa_id do usuário autenticado (fonte de verdade)
 * @returns Dados com empresaId forçado do contexto auth
 *
 * @example
 * const dadosSeguro = injectTenantId(body, ctx.empresaId);
 * await db.insert(vendas).values(dadosSeguro);
 */
export function injectTenantId<T extends object>(
  data: T,
  authEmpresaId: number
): T & { empresaId: number } {
  return { ...data, empresaId: authEmpresaId };
}

// ─────────────────────────────────────────────────────────────────────────────
// validateTenantId() — valida empresa_id em objetos recebidos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valida que um objeto não tenta declarar empresa_id de outro tenant.
 * Lança TenantError se detectar tentativa de cross-tenant write.
 *
 * @param bodyEmpresaId - empresa_id declarado no body (pode ser undefined)
 * @param authEmpresaId - empresa_id do usuário autenticado
 *
 * @example
 * validateTenantWrite(body.empresaId, ctx.empresaId);
 * // Lança se body.empresaId !== ctx.empresaId
 */
export function validateTenantWrite(
  bodyEmpresaId: number | undefined | null,
  authEmpresaId: number
): void {
  if (bodyEmpresaId !== undefined && bodyEmpresaId !== null && bodyEmpresaId !== authEmpresaId) {
    throw new TenantError(
      `Tentativa de gravação cross-tenant: empresa ${bodyEmpresaId} ≠ ${authEmpresaId}.`,
      'CROSS_TENANT_WRITE'
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// assertHasEmpresaId() — garante que o contexto auth tem empresa
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica que o contexto de autenticação tem empresa_id (não é super-admin sem empresa).
 * Lança TenantError se empresaId for null/undefined.
 *
 * @example
 * assertHasEmpresaId(ctx.empresaId); // throws se null
 * // daqui em diante ctx.empresaId é number
 */
export function assertHasEmpresaId(
  empresaId: number | null | undefined
): asserts empresaId is number {
  if (!empresaId) {
    throw new TenantError(
      'Usuário autenticado não tem empresa associada.',
      'MISSING_EMPRESA_ID'
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// isTenantMismatch() — verificação não-lançante (para logs/monitoramento)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna true se houver mismatch de tenant (para logging sem lançar exceção).
 */
export function isTenantMismatch(
  userEmpresaId: number,
  rowEmpresaId: number
): boolean {
  return userEmpresaId !== rowEmpresaId;
}
