import { getDataClient, type DataClient } from '$lib/server/data';
import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { json, type RequestEvent } from '@sveltejs/kit';
import { listarModulosComHeranca, MAPA_MODULOS, MODULO_ALIASES } from '$lib/config/modulos';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { getCachedReadModelWithKv } from '$lib/server/kvInvalidation';
import { currentMonthRangeISODate, toISODateLocal as formatISODateLocal } from '$lib/date';
import { chunkArray, uniqueCleanStrings, uniqueValues } from '$lib/utils/array';

// Erro com status HTTP — capturável pelo catch local das rotas sem ser interceptado pelo SvelteKit
class ApiError extends Error {
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

export type Papel = 'ADMIN' | 'MASTER' | 'FINANCEIRO' | 'GESTOR' | 'VENDEDOR' | 'OUTRO';
export type PermissaoNivel = 'none' | 'view' | 'create' | 'edit' | 'delete' | 'admin';

export interface UserScope {
  userId: string;
  nome: string | null;
  email: string | null;
  tipoNome: string;
  usoIndividual: boolean;
  papel: Papel;
  companyId: string | null;
  companyIds: string[];
  permissoes: Record<string, PermissaoNivel>;
  isAdmin: boolean;
  isMaster: boolean;
  isFinanceiro: boolean;
  isGestor: boolean;
  isVendedor: boolean;
}

export const NO_MATCH_COMPANY_ID = '00000000-0000-0000-0000-000000000000';
const DEBUG_ENDPOINT_ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DEBUG_ENDPOINT_PRODUCTION_VALUES = new Set(['production', 'force-production']);
const UNFILTERED_REQUEST_VALUES = new Set([
  '*',
  'all',
  'todos',
  'todas',
  'todo',
  'toda',
  'todos os vendedores',
  'todas as empresas',
  'selecione uma opcao',
  'null',
  'undefined'
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type HttpErrorLike = {
  status: number;
  body?: {
    message?: string;
  };
};

type UserTypeNameRow = { name?: string | null };

type RankingUserRow = {
  id?: string | null;
  nome_completo?: string | null;
  email?: string | null;
  company_id?: string | null;
  active?: boolean | null;
  uso_individual?: boolean | null;
  participa_ranking?: boolean | null;
  user_types?: UserTypeNameRow | UserTypeNameRow[] | null;
};

export function isProductionRuntime() {
  return [publicEnv.PUBLIC_ENVIRONMENT, privateEnv.VTUR_ENV, privateEnv.NODE_ENV].some(
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase() === 'production'
  );
}

export function isDebugEndpointEnabled(event?: RequestEvent) {
  const explicitValue = String(privateEnv.VTUR_ENABLE_DEBUG_ENDPOINTS || '')
    .trim()
    .toLowerCase();
  const isProduction = isProductionRuntime();
  const explicitEnabled = DEBUG_ENDPOINT_ENABLED_VALUES.has(explicitValue);
  const explicitProductionEnabled = DEBUG_ENDPOINT_PRODUCTION_VALUES.has(explicitValue);
  if (isProduction) return explicitProductionEnabled;
  if (explicitEnabled || explicitProductionEnabled) return true;

  const hostname = String(event?.url?.hostname || '').toLowerCase();
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

  return isLocalhost;
}

type UsersProfileRow = {
  id: string;
  company_id: string | null;
  nome_completo: string | null;
  email: string | null;
  uso_individual: boolean | null;
  user_types: { name: string | null } | { name: string | null }[] | null;
};

export function getAdminClient() {
  return getDataClient();
}

export function isUuid(value?: string | null) {
  return Boolean(value && UUID_PATTERN.test(value));
}

function collectUniqueUuidValues(values?: unknown[] | null) {
  const ids = new Set<string>();
  for (const value of values || []) {
    const id = String(value || '').trim();
    if (isUuid(id)) ids.add(id);
  }
  return Array.from(ids);
}

export function parseUuidList(value?: string | null, limit = 300) {
  if (!value) return [];

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => isUuid(item))
    .slice(0, limit);
}

export function parseIntSafe(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const intVal = Math.trunc(parsed);
  return intVal > 0 ? intVal : fallback;
}

export function toISODateLocal(date: Date) {
  return formatISODateLocal(date);
}

export function getMonthRange(reference?: Date) {
  if (!reference) return currentMonthRangeISODate();

  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);

  return {
    inicio: toISODateLocal(start),
    fim: toISODateLocal(end)
  };
}

export function normalizeText(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function sanitizePostgrestSearchTerm(value?: string | null, maxLength = 80) {
  return String(value || '')
    .trim()
    .replace(/[%_*(),{}[\]"'\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, maxLength)
    .trim();
}

export function normalizeModulo(value?: string | null) {
  const raw = normalizeText(value).replace(/\s+/g, '_');
  if (!raw) return '';
  return MODULO_ALIASES[raw] || raw;
}

export function permLevel(value?: string | null) {
  switch (String(value || '').toLowerCase()) {
    case 'admin':
      return 5;
    case 'delete':
      return 4;
    case 'edit':
      return 3;
    case 'create':
      return 2;
    case 'view':
      return 1;
    default:
      return 0;
  }
}

export function resolveUserTypeName(
  userTypes: UserTypeNameRow | UserTypeNameRow[] | null | undefined
) {
  if (Array.isArray(userTypes)) {
    return String(userTypes[0]?.name || '');
  }

  return String(userTypes?.name || '');
}

export function isTechnicalRankingUserName(value?: string | null) {
  const normalized = normalizeText(value).replace(/\s+/g, ' ');
  return normalized === 'baixa rac' || normalized === 'equipe vtur';
}

export function isRankingEligibleUser(row: RankingUserRow) {
  if (!row?.id) return false;
  if (row?.active === false) return false;
  if (row?.uso_individual === true) return false;
  if (isTechnicalRankingUserName(row?.nome_completo || row?.email)) return false;

  const tipoNome = resolveUserTypeName(row?.user_types).toUpperCase();
  const isVendedor = tipoNome.includes('VENDEDOR');
  const isGestorParticipante = tipoNome.includes('GESTOR') && Boolean(row?.participa_ranking);

  return isVendedor || isGestorParticipante;
}

export async function fetchRankingVendedoresByCompanyIds(client: DataClient, companyIds: string[]) {
  const scopedCompanyIds = collectUniqueUuidValues(companyIds);
  if (scopedCompanyIds.length === 0) return [] as RankingUserRow[];
  const scopedCompanySet = new Set(scopedCompanyIds);

  return getCachedReadModel<RankingUserRow[]>({
    key: buildReadModelCacheKey('ranking-vendedores', {
      companyIds: scopedCompanyIds
    }),
    tags: [
      READ_MODEL_TAGS.users,
      READ_MODEL_TAGS.ranking,
      ...scopeCacheTags({ companyIds: scopedCompanyIds })
    ],
    ttlMs: 300_000,
    staleTtlMs: 1_800_000,
    loader: async () => {
      const batchRows = await Promise.all(
        chunkArray(scopedCompanyIds).map(async (companyBatch) => {
          let query = client
            .from('users')
            .select(
              'id, nome_completo, email, company_id, active, uso_individual, participa_ranking, user_types(name)'
            )
            .eq('active', true)
            .eq('uso_individual', false)
            .limit(5000);

          query =
            companyBatch.length === 1
              ? query.eq('company_id', companyBatch[0])
              : query.in('company_id', companyBatch);

          const { data, error } = await query;
          if (error) throw error;
          return (data || []) as unknown as RankingUserRow[];
        })
      );

      return batchRows.flat().filter((row) => {
        const companyId = String(row?.company_id || '').trim();
        return scopedCompanySet.has(companyId) && isRankingEligibleUser(row);
      });
    }
  });
}

function buildPermissionsMap(
  rows: Array<{
    modulo: string | null;
    permissao: string | null;
    ativo: boolean | null;
  }>
) {
  const map: Record<string, PermissaoNivel> = {};

  const setPerm = (key: string, incoming: PermissaoNivel) => {
    if (!key) return;
    const current = map[key] || 'none';
    if (permLevel(incoming) > permLevel(current)) {
      map[key] = incoming;
    }
  };

  for (const row of rows) {
    if (!row?.ativo) continue;

    const key = normalizeModulo(row.modulo);
    if (!key) continue;

    const incoming = String(row.permissao || '').toLowerCase() as PermissaoNivel;
    setPerm(key, incoming);

    const rawModulo = String(row.modulo || '')
      .trim()
      .toLowerCase();
    if (rawModulo && rawModulo !== key) {
      setPerm(rawModulo, incoming);
    }
  }

  return map;
}

export function resolvePapel(tipoNome: string, usoIndividual: boolean): Papel {
  const tipo = String(tipoNome || '').toUpperCase();

  // Papel de tipo tem precedência sobre uso_individual
  // uso_individual diferencia vendedores individuais de equipe,
  // NÃO restringe administradores/gestores do sistema.
  if (tipo.includes('ADMIN')) return 'ADMIN';
  if (tipo.includes('MASTER')) return 'MASTER';
  if (tipo.includes('FINANCEIRO')) return 'FINANCEIRO';
  if (tipo.includes('GESTOR')) return 'GESTOR';
  if (usoIndividual) return 'VENDEDOR';
  if (tipo.includes('VENDEDOR')) return 'VENDEDOR';

  return 'OUTRO';
}

export async function requireAuthenticatedUser(event: RequestEvent) {
  const { session, user } = await event.locals.safeGetSession();

  if (!session || !user) {
    throw error(401, 'Sessao invalida.');
  }

  return user;
}

async function fetchPermissions(client: DataClient, userId: string) {
  const { data, error: permissionsError } = await client
    .from('modulo_acesso')
    .select('modulo, permissao, ativo')
    .eq('usuario_id', userId);

  if (permissionsError) {
    throw error(500, 'Erro ao carregar permissoes.');
  }

  return buildPermissionsMap(
    (data || []) as Array<{
      modulo: string | null;
      permissao: string | null;
      ativo: boolean | null;
    }>
  );
}

export async function fetchGestorEquipeIdsComGestor(client: DataClient, gestorId: string) {
  if (!gestorId) return [];

  try {
    const { data, error: rpcError } = await client.rpc('gestor_equipe_vendedor_ids', {
      uid: gestorId
    });
    if (rpcError) throw rpcError;

    const ids = (data || [])
      .map((row: { vendedor_id?: string | null }) => String(row?.vendedor_id || '').trim())
      .filter(Boolean);

    return uniqueValues([gestorId, ...ids]);
  } catch {
    const { data, error: fallbackError } = await client
      .from('gestor_vendedor')
      .select('vendedor_id, ativo')
      .eq('gestor_id', gestorId);

    if (fallbackError) {
      return [gestorId];
    }

    const ids = (data || [])
      .filter((row: { ativo?: boolean | null }) => row?.ativo !== false)
      .map((row: { vendedor_id?: string | null }) => String(row?.vendedor_id || '').trim())
      .filter(Boolean);

    return uniqueValues([gestorId, ...ids]);
  }
}

/**
 * Retorna IDs de vendedores/gestores ativos de um conjunto de empresas.
 * Exclui ADMINs, MASTERs e usuários com uso_individual=true
 * (uso_individual = vendedores isolados que nunca aparecem no escopo de outros).
 */
export async function fetchVendedorIdsByCompanyIds(
  client: DataClient,
  companyIds: string[]
): Promise<string[]> {
  if (companyIds.length === 0) return [];

  try {
    const data = await fetchRankingVendedoresByCompanyIds(client, companyIds);

    return (data || []).map((row) => String(row?.id || '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function fetchMasterEmpresas(client: DataClient, masterId: string) {
  const scopedMasterId = String(masterId || '').trim();
  if (!isUuid(scopedMasterId)) return [];

  return getCachedReadModel({
    key: buildReadModelCacheKey('master-empresas', {
      masterId: scopedMasterId
    }),
    tags: [READ_MODEL_TAGS.users, ...scopeCacheTags({ userId: scopedMasterId })],
    ttlMs: 300_000,
    staleTtlMs: 1_800_000,
    loader: async () => {
      const { data, error: companiesError } = await client
        .from('master_empresas')
        .select('company_id, status')
        .eq('master_id', scopedMasterId);

      if (companiesError) {
        return [];
      }

      return (data || [])
        .filter((row: { status?: string | null }) => {
          const status = String(row?.status || '')
            .trim()
            .toLowerCase();
          return status !== 'rejected';
        })
        .map((row: { company_id?: string | null }) => String(row?.company_id || '').trim())
        .filter(Boolean);
    }
  });
}

export async function fetchFinanceiroEmpresas(client: DataClient, financeiroId: string) {
  const scopedFinanceiroId = String(financeiroId || '').trim();
  if (!isUuid(scopedFinanceiroId)) return [];

  return getCachedReadModel({
    key: buildReadModelCacheKey('financeiro-empresas', {
      financeiroId: scopedFinanceiroId
    }),
    tags: [
      READ_MODEL_TAGS.users,
      READ_MODEL_TAGS.finance,
      ...scopeCacheTags({ userId: scopedFinanceiroId })
    ],
    ttlMs: 300_000,
    staleTtlMs: 1_800_000,
    loader: async () => {
      const { data, error: companiesError } = await client
        .from('financeiro_empresas')
        .select('company_id, status')
        .eq('financeiro_id', scopedFinanceiroId);

      if (companiesError) {
        return [];
      }

      return (data || [])
        .filter((row: { status?: string | null }) => {
          const status = String(row?.status || '')
            .trim()
            .toLowerCase();
          return status !== 'rejected';
        })
        .map((row: { company_id?: string | null }) => String(row?.company_id || '').trim())
        .filter(isUuid);
    }
  });
}

async function resolveUserScopeUncached(client: DataClient, userId: string): Promise<UserScope> {
  const { data, error: profileError } = await client
    .from('users')
    .select('id, company_id, nome_completo, email, uso_individual, user_types(name)')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || !data) {
    throw error(403, 'Perfil do usuario nao encontrado.');
  }

  const profile = data as UsersProfileRow;
  const tipoNome = resolveUserTypeName(profile.user_types);
  const usoIndividual = Boolean(profile.uso_individual);
  const papel = resolvePapel(tipoNome, usoIndividual);
  const permissoes = await fetchPermissions(client, userId);
  const companyId = isUuid(profile.company_id) ? String(profile.company_id) : null;

  let companyIds: string[];
  if (papel === 'MASTER') {
    const masterEmpresas = await fetchMasterEmpresas(client, userId);
    // Fallback para Master sem master_empresas: usa o próprio company_id do perfil
    // (igual ao comportamento do vtur-app)
    companyIds = masterEmpresas.length > 0 ? masterEmpresas : companyId ? [companyId] : [];
  } else if (papel === 'FINANCEIRO') {
    const financeiroEmpresas = await fetchFinanceiroEmpresas(client, userId);
    const ids = new Set<string>();
    for (const id of financeiroEmpresas) {
      if (isUuid(id)) ids.add(id);
    }
    if (companyId) ids.add(companyId);
    companyIds = Array.from(ids);
  } else {
    companyIds = companyId ? [companyId] : [];
  }

  return {
    userId,
    nome: profile.nome_completo,
    email: profile.email,
    tipoNome,
    usoIndividual,
    papel,
    companyId,
    companyIds,
    permissoes,
    isAdmin: papel === 'ADMIN',
    isMaster: papel === 'MASTER',
    isFinanceiro: papel === 'FINANCEIRO',
    isGestor: papel === 'GESTOR',
    isVendedor: papel === 'VENDEDOR'
  };
}

export async function resolveUserScope(client: DataClient, userId: string): Promise<UserScope> {
  const key = buildReadModelCacheKey('user-scope', { userId });
  return getCachedReadModel({
    key,
    // user-scope é chamado em toda requisição autenticada. Cache mais longo
    // evita repetir permissões/perfil em cada widget de dashboard e relatório;
    // alterações de usuário continuam limpando o read model pelas tags.
    ttlMs: 300_000,
    staleTtlMs: 1_800_000,
    tags: [READ_MODEL_TAGS.users, ...scopeCacheTags({ userId })],
    loader: () => resolveUserScopeUncached(client, userId)
  });
}

export function hasModuloAccess(scope: UserScope, modulos: string[], minLevel = 1) {
  if (scope.isAdmin) return true;

  const modulosConsulta = Array.from(
    new Set(
      modulos.flatMap((modulo) => {
        const labels = listarModulosComHeranca(String(modulo || '').trim());
        return labels.flatMap((label) => {
          const key = MAPA_MODULOS[label];
          return key ? [label, key] : [label];
        });
      })
    )
  );

  const allowed = new Set<string>();
  for (const entry of modulosConsulta) {
    const normalized = normalizeModulo(entry);
    if (normalized) allowed.add(normalized);
    const raw = String(entry || '')
      .trim()
      .toLowerCase();
    if (raw) allowed.add(raw);
  }

  // Verifica permissões específicas
  const hasSpecific = Object.entries(scope.permissoes).some(([modulo, permissao]) => {
    const normalized = normalizeModulo(modulo);
    return allowed.has(modulo) || (normalized && allowed.has(normalized))
      ? permLevel(permissao) >= minLevel
      : false;
  });

  if (hasSpecific) return true;

  return false;
}

export function ensureModuloAccess(
  scope: UserScope,
  modulos: string[],
  minLevel: number,
  message: string
) {
  if (!hasModuloAccess(scope, modulos, minLevel)) {
    throw error(403, message);
  }
}

export async function resolveScopedVendedorIds(
  client: DataClient,
  scope: UserScope,
  requestedRaw?: string | null
) {
  const rawRequested = String(requestedRaw || '').trim();
  const normalizedRequested = normalizeText(rawRequested);
  const hasExplicitRequestedFilter =
    Boolean(rawRequested) && !UNFILTERED_REQUEST_VALUES.has(normalizedRequested);
  const requestedIds = parseUuidList(requestedRaw);
  if (hasExplicitRequestedFilter && requestedIds.length === 0) {
    return [NO_MATCH_COMPANY_ID];
  }

  if (scope.isAdmin) {
    return requestedIds;
  }

  const filterRequestedIds = (companyVendedorIds: string[]) => {
    const companyVendedorSet = new Set(companyVendedorIds);
    const filtered = requestedIds.filter((id) => companyVendedorSet.has(id));
    return filtered.length > 0 ? filtered : [NO_MATCH_COMPANY_ID];
  };

  if (scope.isGestor || scope.isFinanceiro) {
    const companyVendedorIds = await fetchVendedorIdsByCompanyIds(client, scope.companyIds);

    if (requestedIds.length > 0) {
      return filterRequestedIds(companyVendedorIds);
    }

    return companyVendedorIds;
  }

  if (scope.isMaster) {
    const companyVendedorIds = await fetchVendedorIdsByCompanyIds(client, scope.companyIds);

    if (requestedIds.length > 0) {
      return filterRequestedIds(companyVendedorIds);
    }

    return companyVendedorIds;
  }

  return [scope.userId];
}

export function resolveScopedCompanyIds(scope: UserScope, requestedCompanyId?: string | null) {
  const rawCompanyId = String(requestedCompanyId || '').trim();
  const normalizedCompanyId = normalizeText(rawCompanyId);
  const companyId = UNFILTERED_REQUEST_VALUES.has(normalizedCompanyId) ? '' : rawCompanyId;
  const scopedCompanyIds = Array.from(new Set((scope.companyIds || []).filter(isUuid)));
  const scopedCompanySet = new Set(scopedCompanyIds);

  if (scope.isAdmin) {
    return isUuid(companyId) ? [companyId] : [];
  }

  if (scope.isMaster || scope.isFinanceiro) {
    if (isUuid(companyId)) {
      return scopedCompanySet.has(companyId) ? [companyId] : [NO_MATCH_COMPANY_ID];
    }
    if (companyId) return [NO_MATCH_COMPANY_ID];

    return scopedCompanyIds.length > 0 ? scopedCompanyIds : [NO_MATCH_COMPANY_ID];
  }

  if (isUuid(companyId)) {
    return scopedCompanySet.has(companyId) ? [companyId] : [NO_MATCH_COMPANY_ID];
  }
  if (companyId) return [NO_MATCH_COMPANY_ID];

  if (scope.isVendedor && scope.usoIndividual) {
    return [];
  }

  return scopedCompanyIds.length > 0 ? scopedCompanyIds : [NO_MATCH_COMPANY_ID];
}

export function resolveScopedCompanyId(scope: UserScope, requestedCompanyId?: string | null) {
  const companyIds = resolveScopedCompanyIds(scope, requestedCompanyId);
  if (companyIds[0] === NO_MATCH_COMPANY_ID) return null;
  return companyIds.length === 1 ? companyIds[0] : null;
}

export async function resolveAccessibleClientIds(
  client: DataClient,
  params: {
    companyIds: string[];
    vendedorIds: string[];
  }
) {
  const companyIds = uniqueCleanStrings((params.companyIds || []).filter(isUuid)).sort();
  const vendedorIds = uniqueCleanStrings((params.vendedorIds || []).filter(isUuid)).sort();

  if (companyIds.length === 0 && vendedorIds.length === 0) {
    return [];
  }

  // getCachedReadModelWithKv: além do cache local (por instância), reaproveita
  // o valor entre instâncias via KV (cache L2) -- ver kvInvalidation.ts. O
  // kvTtlSeconds usa o mesmo teto de 120s já aceito abaixo para o cache local
  // (ttlMs), não introduz uma nova janela de desatualização.
  return getCachedReadModelWithKv({
    key: buildReadModelCacheKey('accessible-client-ids', {
      companyIds,
      vendedorIds
    }),
    tags: [
      READ_MODEL_TAGS.clients,
      READ_MODEL_TAGS.sales,
      ...scopeCacheTags({ companyIds, vendedorIds })
    ],
    ttlMs: 120_000,
    staleTtlMs: 900_000,
    kvTtlSeconds: 120,
    loader: async () => {
      // Substitui o cruzamento de lotes em JS por uma única chamada RPC
      // (função accessible_client_ids, ver dados/migrations) que reproduz
      // exatamente a mesma lógica de OR entre as três condições.
      const { data, error } = await client.rpc('accessible_client_ids', {
        p_company_ids: companyIds,
        p_vendedor_ids: vendedorIds
      });

      if (error) throw error;

      const clientIds = new Set<string>();
      for (const row of (data || []) as Array<{ cliente_id?: string | null }>) {
        const id = String(row?.cliente_id || '').trim();
        if (id) clientIds.add(id);
      }

      return Array.from(clientIds);
    }
  });
}

function isHttpErrorLike(value: unknown): value is HttpErrorLike {
  return Boolean(value && typeof value === 'object' && 'status' in value);
}

export function errorLogDetails(err: unknown) {
  if (!err || typeof err !== 'object') {
    return { message: String(err || '') };
  }

  const error = err as Record<string, unknown>;
  return {
    name: String(error.name || ''),
    message: String(error.message || ''),
    code: String(error.code || ''),
    status: typeof error.status === 'number' ? error.status : undefined
  };
}

export function logServerError(context: string, err: unknown, extra?: Record<string, unknown>) {
  console.error(context, {
    ...(extra || {}),
    error: errorLogDetails(err)
  });
}

const ERROR_RESPONSE_HEADERS = {
  'Cache-Control': 'no-store',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff'
};

export function toErrorResponse(err: unknown, fallbackMessage: string) {
  const production = isProductionRuntime();

  const debugDetails =
    !production && err && typeof err === 'object'
      ? (() => {
          const errObj = err as Record<string, unknown>;
          return {
            type: typeof err,
            properties: Object.keys(errObj),
            status: errObj.status,
            body: errObj.body,
            message: errObj.message
          };
        })()
      : { type: typeof err };

  logServerError('[toErrorResponse]', err, {
    fallbackMessage,
    ...(production ? {} : debugDetails)
  });

  if (isHttpErrorLike(err)) {
    const status = Number(err.status || 500);
    const message =
      production && status >= 500 ? fallbackMessage : err.body?.message || fallbackMessage;
    return json({ error: message }, { status, headers: ERROR_RESPONSE_HEADERS });
  }

  // Verifica se é um erro do SvelteKit (pode ter status em outra propriedade)
  if (err && typeof err === 'object') {
    const errObj = err as Record<string, unknown>;
    if (typeof errObj.status === 'number') {
      const body = errObj.body as { message?: string } | undefined;
      const status = Number(errObj.status || 500);
      const message =
        production && status >= 500
          ? fallbackMessage
          : String(body?.message || errObj.message || fallbackMessage);
      return json({ error: message }, { status, headers: ERROR_RESPONSE_HEADERS });
    }
  }

  if (production) {
    return json({ error: fallbackMessage }, { status: 500, headers: ERROR_RESPONSE_HEADERS });
  }

  const errDetails =
    err && typeof err === 'object'
      ? (() => {
          const error = err as Record<string, unknown>;
          return {
            message: String(error.message || fallbackMessage),
            code: String(error.code || ''),
            details: String(error.details || ''),
            hint: String(error.hint || '')
          };
        })()
      : { message: fallbackMessage };

  return json(
    { error: fallbackMessage, ...errDetails },
    { status: 500, headers: ERROR_RESPONSE_HEADERS }
  );
}
