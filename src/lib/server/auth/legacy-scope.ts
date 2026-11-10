/**
 * Resolução do escopo de acesso do modelo VTUR legado sobre D1.
 *
 * Esta camada reproduz a regra do servidor antigo; rotas ainda precisam ser
 * migradas para consumi-la antes que o RBAC simples deixe de ser necessário.
 * Não armazena o resultado em KV/cache: mudanças de vínculo/permissão devem
 * valer na requisição seguinte.
 */

import { and, eq, like } from 'drizzle-orm';
import { getDb } from '$lib/server/db/client';
import {
  financeiroEmpresas,
  gestorEquipeCompartilhada,
  gestorVendedor,
  masterEmpresas,
  moduloAcesso,
  user,
  userProfiles,
  userTypes,
  type LegacyPermissionLevel
} from '$lib/server/db/schema';
import { listarModulosComHeranca, MAPA_MODULOS, MODULO_ALIASES } from '$lib/config/modulos';

export const LEGACY_ROLES = [
  'ADMIN',
  'MASTER',
  'FINANCEIRO',
  'GESTOR',
  'VENDEDOR',
  'OUTRO'
] as const;
export type LegacyRole = (typeof LEGACY_ROLES)[number];

export type LegacyAccessScope = {
  userId: string;
  typeName: string;
  role: LegacyRole;
  usageIndividual: boolean;
  ownCompanyId: number | null;
  /** ADMIN tem null para representar escopo global; demais papéis recebem IDs permitidos. */
  companyIds: number[] | null;
  modulePermissions: Record<string, LegacyPermissionLevel>;
  teamSellerIds: string[];
  isAdmin: boolean;
  isMaster: boolean;
  isFinanceiro: boolean;
  isGestor: boolean;
  isVendedor: boolean;
};

export class LegacyAccessDisabledError extends Error {
  constructor() {
    super('Perfil de acesso desativado.');
    this.name = 'LegacyAccessDisabledError';
  }
}

const PERMISSION_LEVEL: Record<LegacyPermissionLevel, number> = {
  none: 0,
  view: 1,
  create: 2,
  edit: 3,
  delete: 4,
  admin: 5
};

function normalizeModule(value: string): string {
  const raw = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
  return MODULO_ALIASES[raw] || raw;
}

/** Mantém a precedência de `resolvePapel()` no código legado. */
export function resolveLegacyRole(typeName: string, usageIndividual: boolean): LegacyRole {
  const type = String(typeName || '').toUpperCase();
  if (type.includes('ADMIN')) return 'ADMIN';
  if (type.includes('MASTER')) return 'MASTER';
  if (type.includes('FINANCEIRO')) return 'FINANCEIRO';
  if (type.includes('GESTOR')) return 'GESTOR';
  if (usageIndividual) return 'VENDEDOR';
  if (type.includes('VENDEDOR')) return 'VENDEDOR';
  return 'OUTRO';
}

function addPermission(
  target: Record<string, LegacyPermissionLevel>,
  module: string,
  permission: string
): void {
  const level = permission.toLowerCase() as LegacyPermissionLevel;
  if (!(level in PERMISSION_LEVEL)) return;
  const normalized = normalizeModule(module);
  if (!normalized) return;

  const keys = new Set([normalized, module.trim().toLowerCase()]);
  for (const key of keys) {
    if (!key) continue;
    const current = target[key] ?? 'none';
    if (PERMISSION_LEVEL[level] > PERMISSION_LEVEL[current]) target[key] = level;
  }
}

function buildPermissionMap(
  rows: Array<{ modulo: string; permissao: string; ativo: boolean }>
): Record<string, LegacyPermissionLevel> {
  const result: Record<string, LegacyPermissionLevel> = {};
  for (const row of rows) {
    if (row.ativo) addPermission(result, row.modulo, row.permissao);
  }
  return result;
}

async function resolveManagerTeam(d1: D1Database, userId: string, companyId: number | null) {
  // A RPC antiga segue até o gestor-base, evita ciclos e limita a cadeia a 10.
  // A relação atual só tem um sucessor por gestor (gestor_id é PK).
  const base = await d1
    .prepare(
      `
      WITH RECURSIVE links(gestor_id, gestor_base_id, path, depth) AS (
        SELECT gestor_id, gestor_base_id, '|' || gestor_id || '|', 1
        FROM gestor_equipe_compartilhada
        WHERE gestor_id = ?1
        UNION ALL
        SELECT next.gestor_id, next.gestor_base_id,
               links.path || next.gestor_id || '|', links.depth + 1
        FROM gestor_equipe_compartilhada AS next
        JOIN links ON next.gestor_id = links.gestor_base_id
        WHERE links.depth < 10
          AND instr(links.path, '|' || next.gestor_id || '|') = 0
      )
      SELECT gestor_base_id
      FROM links
      ORDER BY depth DESC
      LIMIT 1
    `
    )
    .bind(userId)
    .first<{ gestor_base_id: string }>();
  const baseManagerId = base?.gestor_base_id ?? userId;

  const db = getDb(d1);
  const directTeam = await db
    .select({ userId: gestorVendedor.vendedorId })
    .from(gestorVendedor)
    .where(and(eq(gestorVendedor.gestorId, baseManagerId), eq(gestorVendedor.ativo, true)))
    .all();

  const sameCompanyManagers =
    companyId === null
      ? []
      : await db
          .select({ userId: user.id })
          .from(user)
          .innerJoin(userProfiles, eq(userProfiles.userId, user.id))
          .innerJoin(userTypes, eq(userTypes.id, userProfiles.userTypeId))
          .where(
            and(
              eq(user.empresaId, companyId),
              eq(userProfiles.ativo, true),
              like(userTypes.name, '%GESTOR%')
            )
          )
          .all();

  return [
    ...new Set([
      userId,
      ...directTeam.map((row) => row.userId),
      ...sameCompanyManagers.map((row) => row.userId)
    ])
  ];
}

/**
 * Resolve o perfil e o escopo atuais a partir do Better Auth userId.
 * Retorna null para perfil ausente/desativado; não usa fallback que eleve
 * usuário sem profile a um papel de negócio.
 */
export async function resolveLegacyAccessScope(
  d1: D1Database,
  userId: string
): Promise<LegacyAccessScope | null> {
  const db = getDb(d1);
  const profile = await db
    .select({
      typeName: userTypes.name,
      usageIndividual: userProfiles.usoIndividual,
      active: userProfiles.ativo,
      companyId: user.empresaId
    })
    .from(userProfiles)
    .innerJoin(user, eq(user.id, userProfiles.userId))
    .leftJoin(userTypes, eq(userTypes.id, userProfiles.userTypeId))
    .where(eq(userProfiles.userId, userId))
    .get();

  if (!profile) return null;
  if (!profile.active) throw new LegacyAccessDisabledError();

  const typeName = profile.typeName ?? '';
  const role = resolveLegacyRole(typeName, profile.usageIndividual);
  const ownCompanyId = profile.companyId ?? null;

  const accessRows = await db
    .select({
      modulo: moduloAcesso.modulo,
      permissao: moduloAcesso.permissao,
      ativo: moduloAcesso.ativo
    })
    .from(moduloAcesso)
    .where(eq(moduloAcesso.usuarioId, userId))
    .all();
  const modulePermissions = buildPermissionMap(accessRows);

  let companyIds: number[] | null;
  if (role === 'ADMIN') {
    companyIds = null;
  } else if (role === 'MASTER') {
    const rows = await db
      .select({ companyId: masterEmpresas.companyId, status: masterEmpresas.status })
      .from(masterEmpresas)
      .where(eq(masterEmpresas.masterId, userId))
      .all();
    const linked = rows
      .filter((row) => row.status.toLowerCase() !== 'rejected')
      .map((row) => row.companyId);
    companyIds = [...new Set(linked.length ? linked : ownCompanyId === null ? [] : [ownCompanyId])];
  } else if (role === 'FINANCEIRO') {
    const rows = await db
      .select({ companyId: financeiroEmpresas.companyId, status: financeiroEmpresas.status })
      .from(financeiroEmpresas)
      .where(eq(financeiroEmpresas.financeiroId, userId))
      .all();
    companyIds = [
      ...new Set([
        ...rows
          .filter((row) => row.status.toLowerCase() !== 'rejected')
          .map((row) => row.companyId),
        ...(ownCompanyId === null ? [] : [ownCompanyId])
      ])
    ];
  } else {
    companyIds = ownCompanyId === null ? [] : [ownCompanyId];
  }

  const teamSellerIds =
    role === 'GESTOR'
      ? await resolveManagerTeam(d1, userId, ownCompanyId)
      : role === 'VENDEDOR' && profile.usageIndividual
        ? [userId]
        : [];

  return {
    userId,
    typeName,
    role,
    usageIndividual: profile.usageIndividual,
    ownCompanyId,
    companyIds,
    modulePermissions,
    teamSellerIds,
    isAdmin: role === 'ADMIN',
    isMaster: role === 'MASTER',
    isFinanceiro: role === 'FINANCEIRO',
    isGestor: role === 'GESTOR',
    isVendedor: role === 'VENDEDOR'
  };
}

/** Avalia permissões `modulo_acesso` com os mesmos aliases/heranças do legado. */
export function hasLegacyModuleAccess(
  scope: LegacyAccessScope,
  modules: string[],
  minLevel = 1
): boolean {
  if (scope.isAdmin) return true;

  const allowed = new Set<string>();
  for (const module of modules) {
    for (const label of listarModulosComHeranca(module.trim())) {
      allowed.add(normalizeModule(label));
      const key = MAPA_MODULOS[label];
      if (key) allowed.add(normalizeModule(key));
      allowed.add(label.trim().toLowerCase());
    }
  }

  return Object.entries(scope.modulePermissions).some(([module, permission]) => {
    const normalized = normalizeModule(module);
    return (
      (allowed.has(module) || allowed.has(normalized)) && PERMISSION_LEVEL[permission] >= minLevel
    );
  });
}
