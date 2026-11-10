import type { DataClient } from '$lib/server/data';

// Erro com status HTTP — capturável pelo catch local das rotas sem ser interceptado pelo SvelteKit
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

function error(status: number, message: string): never {
  throw new ApiError(status, message);
}
import {
  MODULOS_ADMIN_PERMISSOES,
  listSystemModuleCatalog,
  normalizeModuloKey,
  toModuloDbKey
} from '$lib/admin/modules';
import {
  invalidateReadModelCache,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { getAdminClient, isUuid, permLevel, type UserScope } from '$lib/server/v1';
import { chunkArray, uniqueCleanStrings } from '$lib/utils/array';

export type ManagedUserRow = {
  id: string;
  nome_completo: string | null;
  email: string | null;
  telefone?: string | null;
  cidade?: string | null;
  estado?: string | null;
  active?: boolean | null;
  ativo?: boolean | null;
  user_type_id?: string | null;
  company_id?: string | null;
  uso_individual?: boolean | null;
  created_by_gestor?: boolean | null;
  participa_ranking?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  user_types?: { name?: string | null } | { name?: string | null }[] | null;
  companies?:
    | { nome_fantasia?: string | null; nome_empresa?: string | null }
    | Array<{ nome_fantasia?: string | null; nome_empresa?: string | null }>
    | null;
};

export type ManagedUserTypeRow = {
  id: string;
  name: string;
  description?: string | null;
  created_at?: string | null;
};

export type ManagedCompanyRow = {
  id: string;
  nome_empresa?: string | null;
  nome_fantasia?: string | null;
  cnpj?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  estado?: string | null;
  active?: boolean | null;
};

export type ManagedPermissionRow = {
  id?: string;
  usuario_id: string;
  modulo: string;
  permissao: string;
  ativo: boolean;
};

export type EmailSettingsPayload = {
  id?: string | null;
  singleton?: boolean;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_secure?: boolean | null;
  smtp_user?: string | null;
  smtp_pass?: string | null;
  resend_api_key?: string | null;
  alerta_from_email?: string | null;
  admin_from_email?: string | null;
  avisos_from_email?: string | null;
  financeiro_from_email?: string | null;
  suporte_from_email?: string | null;
};

export type AvisoTemplatePayload = {
  id?: string | null;
  nome?: string | null;
  assunto?: string | null;
  mensagem?: string | null;
  ativo?: boolean | null;
  sender_key: string;
  [key: string]: unknown;
};

const PERMISSION_VALUES = new Set(['none', 'view', 'create', 'edit', 'delete', 'admin']);

export const DEFAULT_FROM_EMAILS = {
  alerta: 'alerta@vtur.com.br',
  admin: 'admin@vtur.com.br',
  avisos: 'avisos@vtur.com.br',
  financeiro: 'financeiro@vtur.com.br',
  suporte: 'suporte@vtur.com.br'
};

const ACCESS_CHANGE_CACHE_TAGS = [
  READ_MODEL_TAGS.users,
  READ_MODEL_TAGS.finance,
  READ_MODEL_TAGS.dashboard,
  READ_MODEL_TAGS.sales,
  READ_MODEL_TAGS.payments,
  READ_MODEL_TAGS.conciliacao,
  READ_MODEL_TAGS.vendasKpis,
  READ_MODEL_TAGS.ranking,
  READ_MODEL_TAGS.comissoes
];

function normalizePermissionValue(value?: string | null) {
  const normalized = String(value || 'none')
    .trim()
    .toLowerCase();
  return PERMISSION_VALUES.has(normalized) ? normalized : 'none';
}

function invalidateAccessReadModels(params?: {
  userId?: string | null;
  companyIds?: string[] | null;
}) {
  invalidateReadModelCache({
    tags: ACCESS_CHANGE_CACHE_TAGS,
    scopeTags: scopeCacheTags(params || {})
  });
}

function firstEmbedded<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export function extractUserTypeName(
  record: { user_types?: ManagedUserRow['user_types'] } | null | undefined
) {
  return String(firstEmbedded(record?.user_types)?.name || '')
    .trim()
    .toUpperCase();
}

export function extractCompanyName(
  record: { companies?: ManagedUserRow['companies'] } | null | undefined
) {
  const company = firstEmbedded(record?.companies);
  return String(company?.nome_fantasia || company?.nome_empresa || '').trim();
}

export function isSystemAdminRole(role?: string | null) {
  return String(role || '')
    .trim()
    .toUpperCase()
    .includes('ADMIN');
}

export function isMasterRole(role?: string | null) {
  return String(role || '')
    .trim()
    .toUpperCase()
    .includes('MASTER');
}

export function isGestorRole(role?: string | null) {
  return String(role || '')
    .trim()
    .toUpperCase()
    .includes('GESTOR');
}

export function isSellerRole(role?: string | null) {
  return String(role || '')
    .trim()
    .toUpperCase()
    .includes('VENDEDOR');
}

export function isFinanceiroRole(role?: string | null) {
  return String(role || '')
    .trim()
    .toUpperCase()
    .includes('FINANCEIRO');
}

export function normalizeUserType(role?: string | null) {
  return String(role || '')
    .trim()
    .toUpperCase();
}

export function isRestrictedUserTypeName(role?: string | null) {
  const normalized = String(role || '')
    .trim()
    .toUpperCase();
  return normalized.includes('ADMIN') || normalized.includes('MASTER');
}

export function getAccessibleCompanyIds(scope: UserScope) {
  const ids = new Set<string>();
  if (scope.companyId && isUuid(scope.companyId)) ids.add(scope.companyId);
  for (const companyId of scope.companyIds || []) {
    if (isUuid(companyId)) ids.add(companyId);
  }
  return Array.from(ids);
}

export function canManageUsers(scope: UserScope) {
  const adminPerm = permLevel(scope.permissoes.admin);
  const usersPerm = permLevel(scope.permissoes.admin_users);
  return scope.isAdmin || scope.isMaster || scope.isGestor || adminPerm >= 5 || usersPerm >= 3;
}

export function canManagePermissions(scope: UserScope) {
  const adminPerm = permLevel(scope.permissoes.admin);
  const permissionsPerm = permLevel(scope.permissoes.master_permissoes);
  return scope.isAdmin || scope.isMaster || adminPerm >= 5 || permissionsPerm >= 3;
}

export function canManageCompanies(scope: UserScope) {
  const companiesPerm = permLevel(scope.permissoes.admin_empresas);
  return scope.isAdmin || scope.isMaster || companiesPerm >= 3;
}

export function ensureCanManageUsers(scope: UserScope) {
  if (!canManageUsers(scope)) {
    throw error(403, 'Sem permissao para administrar usuarios.');
  }
}

export function ensureCanManagePermissions(scope: UserScope) {
  if (!canManagePermissions(scope)) {
    throw error(403, 'Sem permissao para administrar permissoes.');
  }
}

export function ensureCanManageCompanies(scope: UserScope) {
  if (!canManageCompanies(scope)) {
    throw error(403, 'Sem permissao para administrar empresas.');
  }
}

export function isUserInScope(
  scope: UserScope,
  row: Pick<ManagedUserRow, 'id' | 'company_id' | 'user_types'>
) {
  if (scope.isAdmin) return true;
  if (row.id === scope.userId) return true;

  const roleName = extractUserTypeName({ user_types: row.user_types });
  const companyId = String(row.company_id || '').trim();

  // Fallback para Master sem empresas em master_empresas: usa o company_id do perfil
  let rawCompanies = getAccessibleCompanyIds(scope);
  if (scope.isMaster && rawCompanies.length === 0 && scope.companyId) {
    rawCompanies = [scope.companyId];
  }
  const accessibleCompanies = new Set(rawCompanies);

  if (scope.isMaster) {
    return accessibleCompanies.has(companyId);
  }

  if (scope.isGestor) {
    return companyId === scope.companyId && isSellerRole(roleName);
  }

  return false;
}

export function ensureTargetUserScope(
  scope: UserScope,
  row: Pick<ManagedUserRow, 'id' | 'company_id' | 'user_types'>
) {
  if (scope.isAdmin || row.id === scope.userId) return;

  const roleName = extractUserTypeName({ user_types: row.user_types });
  const companyId = String(row.company_id || '').trim();

  // Fallback para Master sem empresas em master_empresas: usa o company_id do perfil
  let rawCompanies = getAccessibleCompanyIds(scope);
  if (scope.isMaster && rawCompanies.length === 0 && scope.companyId) {
    rawCompanies = [scope.companyId];
  }
  const accessibleCompanies = new Set(rawCompanies);

  if (scope.isMaster) {
    if (!accessibleCompanies.has(companyId) || isRestrictedUserTypeName(roleName)) {
      throw error(403, 'Usuario fora do escopo do master.');
    }
    return;
  }

  if (scope.isGestor) {
    if (companyId !== scope.companyId || !isSellerRole(roleName)) {
      throw error(403, 'Gestor so pode administrar vendedores da propria empresa.');
    }
    return;
  }

  throw error(403, 'Usuario fora do escopo permitido.');
}

export function ensureAssignableCompany(scope: UserScope, companyId?: string | null) {
  const targetCompanyId = String(companyId || '').trim();
  if (!targetCompanyId) {
    if (!scope.isAdmin) {
      throw error(400, 'Empresa obrigatoria para usuarios corporativos.');
    }
    return;
  }

  if (scope.isAdmin) return;

  const accessibleCompanies = new Set(getAccessibleCompanyIds(scope));
  if (scope.isMaster) {
    if (!accessibleCompanies.has(targetCompanyId)) {
      throw error(403, 'Empresa fora do portfolio do master.');
    }
    return;
  }

  if (scope.isGestor && targetCompanyId !== scope.companyId) {
    throw error(403, 'Gestor so pode operar na propria empresa.');
  }

  if (scope.isGestor) return;

  throw error(403, 'Sem permissao para atribuir empresa a usuarios.');
}

export function ensureAssignableUserType(scope: UserScope, typeName?: string | null) {
  const normalized = String(typeName || '')
    .trim()
    .toUpperCase();
  if (!normalized) return;

  if (scope.isAdmin) return;

  if (scope.isMaster) {
    if (isRestrictedUserTypeName(normalized)) {
      throw error(403, 'Master nao pode atribuir perfis ADMIN ou MASTER.');
    }
    return;
  }

  if (scope.isGestor) {
    if (!isSellerRole(normalized)) {
      throw error(403, 'Gestor so pode atribuir perfil de vendedor.');
    }
    return;
  }

  throw error(403, 'Somente ADMIN, MASTER ou GESTOR podem atribuir tipo de usuario.');
}

export function ensureAssignablePermissionSet(
  scope: UserScope,
  permissions: Array<{ modulo?: string | null; permissao?: string | null; ativo?: boolean | null }>
) {
  if (scope.isAdmin) return;

  const blockedModules = new Set<string>();

  for (const item of permissions || []) {
    const modulo = normalizeModuloKey(item?.modulo);
    const permissao = normalizePermissionValue(item?.permissao);
    const active = item?.ativo !== false && permissao !== 'none';

    if (!modulo || !active) continue;

    if (modulo === 'admin' || modulo.startsWith('admin_')) {
      blockedModules.add(modulo);
      continue;
    }

    if (modulo === 'master_permissoes') {
      blockedModules.add(modulo);
      continue;
    }

    if (!scope.isMaster && modulo.startsWith('master_')) {
      blockedModules.add(modulo);
    }
  }

  if (blockedModules.size > 0) {
    throw error(
      403,
      `Sem permissao para atribuir modulos administrativos: ${Array.from(blockedModules).join(', ')}.`
    );
  }
}

export async function listManagedUsers(client: DataClient, scope: UserScope) {
  const rows: ManagedUserRow[] = [];
  const fetchUsers = async (filters?: {
    companyIds?: string[] | null;
    ownUserId?: string | null;
  }) => {
    let query = client
      .from('users')
      .select(
        `
        id,
        nome_completo,
        email,
        telefone,
        cidade,
        estado,
        active,
        user_type_id,
        company_id,
        uso_individual,
        created_by_gestor,
        participa_ranking,
        created_at,
        updated_at,
        user_types(name),
        companies(nome_fantasia, nome_empresa)
      `
      )
      .order('nome_completo', { ascending: true })
      .limit(2000);

    if (filters?.companyIds && filters.companyIds.length > 0) {
      query = query.in('company_id', filters.companyIds);
    } else if (filters?.ownUserId) {
      query = query.eq('id', filters.ownUserId);
    }

    const { data, error: queryError } = await query;
    if (queryError) throw queryError;
    rows.push(...((data || []) as ManagedUserRow[]));
  };

  if (!scope.isAdmin) {
    let accessibleCompanies = getAccessibleCompanyIds(scope);

    // Fallback para Master sem empresas em master_empresas:
    // usa o company_id do próprio perfil (igual ao vtur-app)
    if (scope.isMaster && accessibleCompanies.length === 0 && scope.companyId) {
      accessibleCompanies = [scope.companyId];
    }

    if (scope.isMaster && accessibleCompanies.length > 0) {
      for (const companyBatch of chunkArray(accessibleCompanies)) {
        await fetchUsers({ companyIds: companyBatch });
      }
    } else if (scope.companyId) {
      await fetchUsers({ companyIds: [scope.companyId] });
    } else {
      await fetchUsers({ ownUserId: scope.userId });
    }
  } else {
    await fetchUsers();
  }

  return rows.filter((row) => isUserInScope(scope, row));
}

export async function loadManagedUser(client: DataClient, scope: UserScope, userId: string) {
  const { data, error: queryError } = await client
    .from('users')
    .select(
      `
        id,
        nome_completo,
        email,
        telefone,
        cidade,
        estado,
        active,
        user_type_id,
        company_id,
        uso_individual,
        created_by_gestor,
        participa_ranking,
        created_at,
        updated_at,
        user_types(name),
        companies(nome_fantasia, nome_empresa)
      `
    )
    .eq('id', userId)
    .maybeSingle();

  if (queryError || !data) {
    throw error(404, 'Usuario nao encontrado.');
  }

  const row = data as ManagedUserRow;
  ensureTargetUserScope(scope, row);
  return row;
}

export async function loadManagedUserTypes(client: DataClient, scope: UserScope) {
  const { data, error: queryError } = await client
    .from('user_types')
    .select('id, name, description, created_at')
    .order('name', { ascending: true });

  if (queryError) throw queryError;

  const rows = (data || []) as ManagedUserTypeRow[];

  return rows.filter((row) => {
    if (scope.isAdmin) return true;
    if (scope.isMaster) return !isRestrictedUserTypeName(row.name);
    if (scope.isGestor) return isSellerRole(row.name);
    return false;
  });
}

export async function loadManagedCompanies(client: DataClient, scope: UserScope) {
  const rows: ManagedCompanyRow[] = [];
  const fetchCompanies = async (companyIds?: string[] | null) => {
    let query = client
      .from('companies')
      .select(
        `
        id,
        nome_empresa,
        nome_fantasia,
        cnpj,
        telefone,
        endereco,
        cidade,
        estado,
        active
      `
      )
      .order('nome_fantasia', { ascending: true });

    if (companyIds && companyIds.length > 0) {
      query = query.in('id', companyIds);
    }

    const { data, error: queryError } = await query;
    if (queryError) throw queryError;
    rows.push(...((data || []) as ManagedCompanyRow[]));
  };

  if (!scope.isAdmin) {
    const accessibleCompanies = getAccessibleCompanyIds(scope);
    if (accessibleCompanies.length === 0) return [];
    for (const companyBatch of chunkArray(accessibleCompanies)) {
      await fetchCompanies(companyBatch);
    }
  } else {
    await fetchCompanies();
  }

  return rows;
}

export async function loadFinanceiroCompanyIds(
  client: DataClient,
  scope: UserScope,
  financeiroId: string
) {
  const scopedFinanceiroId = String(financeiroId || '').trim();
  if (!scopedFinanceiroId) return [];

  const rows: Array<{ company_id?: string | null; status?: string | null }> = [];
  const accessibleCompanies = !scope.isAdmin ? getAccessibleCompanyIds(scope) : [];
  if (!scope.isAdmin && accessibleCompanies.length === 0) return [];
  const companyBatches = !scope.isAdmin ? chunkArray(accessibleCompanies) : [null];

  for (const companyBatch of companyBatches) {
    let query = client
      .from('financeiro_empresas')
      .select('company_id, status')
      .eq('financeiro_id', scopedFinanceiroId);

    if (companyBatch) query = query.in('company_id', companyBatch);

    const { data, error: queryError } = await query;
    if (queryError) {
      const code = String(queryError.code || '').toUpperCase();
      const message = String(queryError.message || '').toLowerCase();
      if (code === '42P01' || message.includes('does not exist')) return [];
      throw queryError;
    }
    rows.push(...(data || []));
  }

  return Array.from(
    new Set(
      rows
        .filter(
          (row: { status?: string | null }) =>
            String(row?.status || '').toLowerCase() !== 'rejected'
        )
        .map((row: { company_id?: string | null }) => String(row?.company_id || '').trim())
        .filter(isUuid)
    )
  );
}

export async function syncFinanceiroCompanyLinks(
  client: DataClient,
  scope: UserScope,
  financeiroId: string,
  companyIds: string[],
  actorUserId?: string | null
) {
  const scopedFinanceiroId = String(financeiroId || '').trim();
  if (!isUuid(scopedFinanceiroId)) {
    throw error(400, 'Usuario financeiro invalido.');
  }

  const targetUser = await loadManagedUser(client, scope, scopedFinanceiroId);
  const targetRole = extractUserTypeName(targetUser);
  if (!isFinanceiroRole(targetRole)) {
    throw error(400, 'Vinculo multiempresa permitido apenas para usuarios financeiros.');
  }

  const cleanedCompanyIds = uniqueCleanStrings(companyIds || []).filter(isUuid);
  for (const companyId of cleanedCompanyIds) {
    ensureAssignableCompany(scope, companyId);
  }

  const accessibleCompanies = getAccessibleCompanyIds(scope);
  const existingRows: Array<{ id?: string | null; company_id?: string | null }> = [];
  if (!scope.isAdmin) {
    if (accessibleCompanies.length === 0) return;
    for (const companyBatch of chunkArray(accessibleCompanies)) {
      const { data, error: existingError } = await client
        .from('financeiro_empresas')
        .select('id, company_id')
        .eq('financeiro_id', scopedFinanceiroId)
        .in('company_id', companyBatch);
      if (existingError) throw existingError;
      existingRows.push(...(data || []));
    }
  } else {
    const { data, error: existingError } = await client
      .from('financeiro_empresas')
      .select('id, company_id')
      .eq('financeiro_id', scopedFinanceiroId);
    if (existingError) throw existingError;
    existingRows.push(...(data || []));
  }

  const existingMap = new Map<string, string>();
  for (const row of existingRows || []) {
    const companyId = String(row?.company_id || '').trim();
    if (isUuid(companyId) && row?.id) existingMap.set(companyId, row.id);
  }

  const changedCompanyIds = uniqueCleanStrings([...existingMap.keys(), ...cleanedCompanyIds]);
  const wanted = new Set(cleanedCompanyIds);
  const idsToDelete = Array.from(existingMap.entries())
    .filter(([companyId]) => !wanted.has(companyId))
    .map(([, id]) => id)
    .filter(Boolean);

  if (idsToDelete.length > 0) {
    for (const batch of chunkArray(idsToDelete)) {
      const { error: deleteError } = await client
        .from('financeiro_empresas')
        .delete()
        .in('id', batch);
      if (deleteError) throw deleteError;
    }
  }

  const rowsToInsert = cleanedCompanyIds
    .filter((companyId) => !existingMap.has(companyId))
    .map((companyId) => ({
      financeiro_id: scopedFinanceiroId,
      company_id: companyId,
      status: 'approved',
      approved_at: new Date().toISOString(),
      created_by: actorUserId || scope.userId
    }));

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await client.from('financeiro_empresas').insert(rowsToInsert);
    if (insertError) throw insertError;
  }

  if (idsToDelete.length > 0 || rowsToInsert.length > 0) {
    invalidateAccessReadModels({
      userId: scopedFinanceiroId,
      companyIds: changedCompanyIds
    });
  }
}

export async function loadUserPermissions(client: DataClient, userId: string) {
  const { data, error: queryError } = await client
    .from('modulo_acesso')
    .select('id, usuario_id, modulo, permissao, ativo')
    .eq('usuario_id', userId);

  if (queryError) throw queryError;

  return (data || []) as ManagedPermissionRow[];
}

export async function loadUserTypeDefaultPermissions(client: DataClient, userTypeId: string) {
  const { data, error: queryError } = await client
    .from('user_type_default_perms')
    .select('id, user_type_id, modulo, permissao, ativo')
    .eq('user_type_id', userTypeId);

  if (queryError) throw queryError;

  return (data || []) as Array<{
    id?: string;
    user_type_id: string;
    modulo: string;
    permissao: string;
    ativo: boolean;
  }>;
}

export function buildPermissionMatrix(
  rows:
    | Array<{ modulo?: string | null; permissao?: string | null; ativo?: boolean | null }>
    | null
    | undefined
) {
  const rowMap = new Map<string, { modulo: string; permissao: string; ativo: boolean }>();

  for (const row of rows || []) {
    const key = normalizeModuloKey(row?.modulo);
    if (!key) continue;
    rowMap.set(key, {
      modulo: key,
      permissao: String(row?.permissao || 'none'),
      ativo: row?.ativo !== false
    });
  }

  return MODULOS_ADMIN_PERMISSOES.map((label) => {
    const key = normalizeModuloKey(toModuloDbKey(label));
    const current = rowMap.get(key);
    return {
      label,
      modulo: key,
      permissao: current?.permissao || 'none',
      ativo: current?.ativo !== false && current?.permissao !== 'none'
    };
  });
}

export async function saveUserPermissions(
  client: DataClient,
  userId: string,
  permissions: Array<{ modulo: string; permissao: string; ativo: boolean }>
) {
  const normalized = permissions.map((item) => ({
    modulo: normalizeModuloKey(item.modulo),
    permissao: normalizePermissionValue(item.permissao),
    ativo: item.ativo !== false && normalizePermissionValue(item.permissao) !== 'none'
  }));

  const keys = uniqueCleanStrings(normalized.map((item) => item.modulo));
  if (!keys.length) return;

  const { data: existingRows, error: existingError } = await client
    .from('modulo_acesso')
    .select('id, modulo')
    .eq('usuario_id', userId)
    .in('modulo', keys);

  if (existingError) throw existingError;

  const existingMap = new Map<string, string>();
  for (const row of existingRows || []) {
    const key = normalizeModuloKey(row.modulo);
    if (key && row.id) existingMap.set(key, row.id);
  }

  for (const item of normalized) {
    const payload = {
      usuario_id: userId,
      modulo: item.modulo,
      permissao: item.permissao,
      ativo: item.ativo
    };

    const existingId = existingMap.get(item.modulo);
    if (existingId) {
      const { error: updateError } = await client
        .from('modulo_acesso')
        .update(payload)
        .eq('id', existingId);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await client.from('modulo_acesso').insert(payload);
      if (insertError) throw insertError;
    }
  }

  invalidateAccessReadModels({ userId });
}

export async function saveDefaultPermissions(
  client: DataClient,
  userTypeId: string,
  permissions: Array<{ modulo: string; permissao: string; ativo: boolean }>
) {
  const normalized = permissions.map((item) => ({
    modulo: normalizeModuloKey(item.modulo),
    permissao: normalizePermissionValue(item.permissao),
    ativo: item.ativo !== false && normalizePermissionValue(item.permissao) !== 'none'
  }));

  const keys = uniqueCleanStrings(normalized.map((item) => item.modulo));
  if (!keys.length) return;

  const { data: existingRows, error: existingError } = await client
    .from('user_type_default_perms')
    .select('id, modulo')
    .eq('user_type_id', userTypeId)
    .in('modulo', keys);

  if (existingError) throw existingError;

  const existingMap = new Map<string, string>();
  for (const row of existingRows || []) {
    const key = normalizeModuloKey(row.modulo);
    if (key && row.id) existingMap.set(key, row.id);
  }

  for (const item of normalized) {
    const payload = {
      user_type_id: userTypeId,
      modulo: item.modulo,
      permissao: item.permissao,
      ativo: item.ativo
    };

    const existingId = existingMap.get(item.modulo);
    if (existingId) {
      const { error: updateError } = await client
        .from('user_type_default_perms')
        .update(payload)
        .eq('id', existingId);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await client.from('user_type_default_perms').insert(payload);
      if (insertError) throw insertError;
    }
  }

  invalidateReadModelCache({ tags: [READ_MODEL_TAGS.users] });
}

export async function syncUserTypeDefaultPermissions(
  client: DataClient,
  userId: string,
  userTypeId?: string | null
) {
  const normalizedUserTypeId = String(userTypeId || '').trim();
  if (!normalizedUserTypeId) return;

  const defaults = await loadUserTypeDefaultPermissions(client, normalizedUserTypeId);
  if (!defaults.length) return;

  await saveUserPermissions(
    client,
    userId,
    defaults.map((row) => ({
      modulo: row.modulo,
      permissao: row.permissao,
      ativo: row.ativo !== false
    }))
  );
}

export async function findAuthUserIdByEmail(
  client: ReturnType<typeof getAdminClient>,
  email: string
) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase();
  if (!normalized) return null;

  const perPage = 200;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error: listError } = await client.auth.admin.listUsers({ page, perPage });
    if (listError) throw listError;
    const users = (data?.users || []) as Array<{ id?: string | null; email?: string | null }>;
    const found = users.find(
      (user) =>
        String(user.email || '')
          .trim()
          .toLowerCase() === normalized
    );
    if (found?.id) return String(found.id);
    if (users.length < perPage) break;
  }

  return null;
}

export async function createOrReuseAuthUser(
  client: ReturnType<typeof getAdminClient>,
  payload: {
    email: string;
    password: string;
  }
) {
  const existingUserId = await findAuthUserIdByEmail(client, payload.email);
  if (existingUserId) {
    return { userId: existingUserId, created: false };
  }

  const { data, error: createError } = await client.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true
  });

  if (createError) throw createError;

  const userId = String(data.user?.id || '').trim();
  if (!userId) {
    throw error(500, 'Falha ao criar autenticacao.');
  }

  return { userId, created: true };
}

export async function loadSystemModuleSettings(client: DataClient) {
  const { data, error: queryError } = await client
    .from('system_module_settings')
    .select('module_key, enabled, reason, updated_at, updated_by');

  if (queryError) throw queryError;

  const catalog = listSystemModuleCatalog(
    (data || []).map((row: { module_key?: string | null }) => String(row.module_key || '').trim())
  );

  return {
    rows: (data || []) as Array<{
      module_key?: string | null;
      enabled?: boolean | null;
      reason?: string | null;
      updated_at?: string | null;
      updated_by?: string | null;
    }>,
    catalog
  };
}

export async function saveSystemModuleSettings(
  client: DataClient,
  payload: Array<{
    module_key: string;
    enabled: boolean;
    reason?: string | null;
    updated_by?: string | null;
  }>
) {
  for (const item of payload) {
    const moduleKey = normalizeModuloKey(item.module_key);
    if (!moduleKey) continue;

    const { data: existingRow, error: existingError } = await client
      .from('system_module_settings')
      .select('module_key')
      .eq('module_key', moduleKey)
      .maybeSingle();

    if (existingError) throw existingError;

    const rowPayload = {
      module_key: moduleKey,
      enabled: item.enabled !== false,
      reason: item.reason || null,
      updated_by: item.updated_by || null
    };

    if (existingRow) {
      const { error: updateError } = await client
        .from('system_module_settings')
        .update(rowPayload)
        .eq('module_key', moduleKey);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await client.from('system_module_settings').insert(rowPayload);
      if (insertError) throw insertError;
    }
  }
}

export async function loadAvisoTemplates(client: DataClient): Promise<AvisoTemplatePayload[]> {
  const { data, error: queryError } = await client
    .from('admin_avisos_templates')
    .select('id, nome, assunto, mensagem, ativo, sender_key')
    .order('nome', { ascending: true });

  if (!queryError) {
    return (
      (data || []) as Array<
        Omit<AvisoTemplatePayload, 'sender_key'> & { sender_key?: string | null }
      >
    ).map((row) => ({
      ...row,
      sender_key: row.sender_key || 'avisos'
    }));
  }

  const message = String(queryError.message || '').toLowerCase();
  if (!message.includes('sender_key') && !message.includes('schema cache')) {
    throw queryError;
  }

  const fallback = await client
    .from('admin_avisos_templates')
    .select('id, nome, assunto, mensagem, ativo')
    .order('nome', { ascending: true });

  if (fallback.error) throw fallback.error;

  return ((fallback.data || []) as Array<Omit<AvisoTemplatePayload, 'sender_key'>>).map((row) => ({
    ...row,
    sender_key: 'avisos'
  }));
}

export async function loadEmailSettings(client: DataClient) {
  const { data, error: queryError } = await client
    .from('admin_email_settings')
    .select(
      'id, singleton, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, resend_api_key, alerta_from_email, admin_from_email, avisos_from_email, financeiro_from_email, suporte_from_email'
    )
    .eq('singleton', true)
    .maybeSingle();

  if (queryError) throw queryError;
  return (data || null) as EmailSettingsPayload | null;
}

export function buildFromEmails(settings: Partial<EmailSettingsPayload> | null | undefined) {
  const alerta = String(settings?.alerta_from_email || DEFAULT_FROM_EMAILS.alerta).trim();
  const admin = String(settings?.admin_from_email || DEFAULT_FROM_EMAILS.admin).trim();
  const avisos = String(settings?.avisos_from_email || DEFAULT_FROM_EMAILS.avisos).trim();
  const financeiro = String(
    settings?.financeiro_from_email || DEFAULT_FROM_EMAILS.financeiro
  ).trim();
  const suporte = String(settings?.suporte_from_email || DEFAULT_FROM_EMAILS.suporte).trim();

  return {
    alerta,
    admin,
    avisos,
    financeiro,
    suporte,
    default: avisos || admin || alerta
  };
}

export function applyTemplate(text: string, vars: Record<string, string>) {
  return String(text || '')
    .replace(/{{\s*nome\s*}}/gi, vars.nome || '')
    .replace(/{{\s*email\s*}}/gi, vars.email || '')
    .replace(/{{\s*empresa\s*}}/gi, vars.empresa || '')
    .replace(/{{\s*senha\s*}}/gi, vars.senha || '');
}
