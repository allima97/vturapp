/**
 * Política de acesso VTUR — ponto de entrada.
 *
 * F2-03: Matriz RBAC centralizada + funções de autorização.
 *
 * Importar de '$lib/server/policy' (não diretamente dos submodules).
 *
 * @example
 * import { can, requireCan, authorize } from '$lib/server/policy';
 */

export { can, canAny, canAll, authorize, requireCan, listarCapacidades, temAcessoAoRecurso } from './authorize';
export { MATRIZ_RBAC, TODAS_CAPACIDADES, RECURSOS, ACOES } from './matrix';
export type { Recurso, Acao, PapelCapabilitySet } from './matrix';
