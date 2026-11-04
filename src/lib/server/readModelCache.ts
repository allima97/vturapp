import { cleanStringSet, uniqueCleanStrings } from '$lib/utils/array';

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  staleUntil: number;
  lastAccessAt: number;
  tags: Set<string>;
};

type CacheOptions<T> = {
  key: string;
  tags?: string[];
  ttlMs?: number;
  staleTtlMs?: number;
  loader: () => Promise<T>;
};

// TTL padrão para dados que mudam com frequência (vendas, ranking, KPIs).
// Usado quando nenhum TTL explícito é passado e não é dado transacional.
const DEFAULT_TTL_MS = 30_000;
// Stale padrão — mantém cache válido para revalidação em background.
const DEFAULT_STALE_TTL_MS = 120_000;

// TTL para catálogos semi-estáticos: países, cidades, produtos base, planos, módulos.
// Mudam raramente (operação admin) — cache agressivo sem thrash no banco.
export const CATALOG_TTL_MS = 600_000; // 10 min fresco
export const CATALOG_STALE_TTL_MS = 3_600_000; // 1h stale

// TTL para dados de usuários/empresas — mudam em operações admin pontuais.
export const USER_TTL_MS = 300_000; // 5 min fresco
export const USER_STALE_TTL_MS = 1_800_000; // 30 min stale
// Aumentado de 250 para 600: sistema multi-tenant com múltiplas empresas/usuários
// esgota 250 entradas rapidamente, causando expulsão prematura e recarga constante.
const MAX_ENTRIES = 600;
const MAX_CACHE_KEY_LENGTH = 900;

// Tags de dados transacionais: vendas, ranking, KPIs, dashboard, conciliacao.
// Em Cloudflare Workers cada instância tem seu próprio Map em memória —
// o cache é local por instância e NÃO é compartilhado entre Workers.
// Por isso evitamos TTLs muito curtos (não ajudam a desempenho e causam
// thrash), e confiamos na invalidação explícita via invalidateSalesReadModels
// após cada mutação. TTL de 30s é o equilíbrio entre frescura e throughput.
const TRANSACTIONAL_TTL_MS = 30_000;
const TRANSACTIONAL_STALE_TTL_MS = 120_000;
const ERROR_FALLBACK_STALE_MS = 300_000;

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
let invalidationEpoch = 0;

type SalesInvalidationPublisher = (scope?: { companyIds?: string[] | null }) => void;
let salesInvalidationPublisher: SalesInvalidationPublisher | null = null;

/**
 * Registra o publisher de invalidacao cross-instance (KV) para vendas.
 * kvInvalidation.ts chama isto na carga do modulo (ele ja importa deste
 * arquivo, entao a ligacao e feita nesse sentido para evitar import
 * circular). Com isso, TODA chamada a invalidateSalesReadModels() -- em
 * qualquer endpoint, presente ou futuro -- tambem publica o epoch no KV
 * automaticamente, sem depender de cada endpoint lembrar de chamar
 * publishKvInvalidationAsync() separadamente. Essa era a causa do dashboard
 * nao refletir vendas atualizadas: varias rotas so limpavam o cache em
 * memoria da propria instancia do Worker, deixando as demais instancias
 * servindo dados stale ate o TTL (ate TRANSACTIONAL_STALE_TTL_MS).
 */
export function registerSalesInvalidationPublisher(fn: SalesInvalidationPublisher) {
  salesInvalidationPublisher = fn;
}

type SalesReadModelDirtyMarker = (scope?: { companyIds?: string[] | null }) => void;
let salesReadModelDirtyMarker: SalesReadModelDirtyMarker | null = null;

/**
 * Registra o marcador de "dirty" do read model v4 persistido no Postgres
 * (ranking_recibo_contribuicoes / ranking_read_model_status, modelo
 * recibo_contribuicoes_v4 -- ver reciboContribuicoesReadModel.ts).
 *
 * Diferente do cache em memoria/KV (acima), esse read model so fica
 * desatualizado enquanto ninguem marcar seu status como dirty -- e
 * NAO EXISTE trigger de banco que faca isso para o modelo v4 (so existe
 * para o v1, usado pelo cron, que grava numa tabela de status separada).
 * Por isso toda invalidacao de vendas tambem marca o v4 como dirty aqui,
 * o que faz o proximo carregamento do dashboard (via
 * scheduleReciboContribuicoesReadModelEnsure, ja chamado em todo request
 * de resumo do dashboard) reconstruir o read model em vez de continuar
 * servindo os dados persistidos desatualizados indefinidamente.
 */
export function registerSalesReadModelDirtyMarker(fn: SalesReadModelDirtyMarker) {
  salesReadModelDirtyMarker = fn;
}

export const READ_MODEL_TAGS = {
  sales: 'data:sales',
  clients: 'data:clients',
  catalog: 'data:catalog',
  payments: 'data:payments',
  finance: 'data:finance',
  users: 'data:users',
  conciliacao: 'data:conciliacao',
  quote: 'data:quote',
  trips: 'data:trips',
  consultorias: 'data:consultorias',
  todo: 'data:todo',
  preferences: 'data:preferences',
  mural: 'data:mural',
  metas: 'data:metas',
  dashboard: 'view:dashboard',
  vendasKpis: 'view:vendas-kpis',
  ranking: 'view:ranking',
  comissoes: 'view:comissoes'
} as const;

const TRANSACTIONAL_READ_MODEL_TAGS = new Set<string>([
  READ_MODEL_TAGS.sales,
  READ_MODEL_TAGS.dashboard,
  READ_MODEL_TAGS.vendasKpis,
  READ_MODEL_TAGS.ranking,
  READ_MODEL_TAGS.comissoes,
  READ_MODEL_TAGS.conciliacao
]);

function nowMs() {
  return Date.now();
}

export function invalidateConsultoriaReadModels(params?: {
  companyIds?: string[] | null;
  vendedorIds?: string[] | null;
  userId?: string | null;
}) {
  const scopedTags = scopeCacheTags(params || {});
  invalidateReadModelCache({
    tags: [READ_MODEL_TAGS.consultorias, READ_MODEL_TAGS.dashboard, READ_MODEL_TAGS.clients],
    scopeTags: scopedTags
  });
}

export function invalidateTodoReadModels(params?: {
  companyIds?: string[] | null;
  vendedorIds?: string[] | null;
  userId?: string | null;
}) {
  const scopedTags = scopeCacheTags(params || {});
  invalidateReadModelCache({
    tags: [READ_MODEL_TAGS.todo, READ_MODEL_TAGS.dashboard, READ_MODEL_TAGS.users],
    scopeTags: scopedTags
  });
}

export function invalidatePreferenceReadModels(params?: {
  companyIds?: string[] | null;
  vendedorIds?: string[] | null;
  userId?: string | null;
}) {
  const scopedTags = scopeCacheTags(params || {});
  invalidateReadModelCache({
    tags: [READ_MODEL_TAGS.preferences, READ_MODEL_TAGS.catalog, READ_MODEL_TAGS.users],
    scopeTags: scopedTags
  });
}

export function invalidateMuralReadModels(params?: {
  companyIds?: string[] | null;
  vendedorIds?: string[] | null;
  userId?: string | null;
}) {
  const scopedTags = scopeCacheTags(params || {});
  invalidateReadModelCache({
    tags: [READ_MODEL_TAGS.mural, READ_MODEL_TAGS.users],
    scopeTags: scopedTags
  });
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const normalized = value.map(stableValue);
    if (
      normalized.every(
        (item) =>
          item == null ||
          typeof item === 'string' ||
          typeof item === 'number' ||
          typeof item === 'boolean'
      )
    ) {
      return [...normalized].sort((left, right) =>
        String(left ?? '').localeCompare(String(right ?? ''))
      );
    }
    return normalized;
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return value;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeCacheKey(key: string) {
  const normalized = String(key || '').trim() || 'cache';
  if (normalized.length <= MAX_CACHE_KEY_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_CACHE_KEY_LENGTH)}:${hashString(normalized)}`;
}

function normalizeIds(values?: string[] | null) {
  return uniqueCleanStrings(values).sort();
}

export function scopeCacheTags(params: {
  companyIds?: string[] | null;
  vendedorIds?: string[] | null;
  userId?: string | null;
}) {
  const tags: string[] = [];
  for (const id of normalizeIds(params.companyIds)) tags.push(`company:${id}`);
  for (const id of normalizeIds(params.vendedorIds)) tags.push(`vendedor:${id}`);
  if (params.userId) tags.push(`user:${String(params.userId).trim()}`);
  return tags;
}

function isScopeTag(tag: string) {
  return tag.startsWith('company:') || tag.startsWith('vendedor:') || tag.startsWith('user:');
}

export function buildReadModelCacheKey(namespace: string, parts: Record<string, unknown>) {
  return normalizeCacheKey(`${namespace}:${JSON.stringify(stableValue(parts))}`);
}

function pruneExpired(now = nowMs()) {
  for (const [key, entry] of cache.entries()) {
    if (entry.staleUntil <= now) cache.delete(key);
  }
}

function pruneBySize() {
  if (cache.size <= MAX_ENTRIES) return;

  const ordered = Array.from(cache.entries()).sort(
    (left, right) => left[1].lastAccessAt - right[1].lastAccessAt
  );
  const removeCount = Math.max(0, ordered.length - MAX_ENTRIES);
  for (let i = 0; i < removeCount; i += 1) {
    cache.delete(ordered[i][0]);
  }
}

export async function getCachedReadModel<T>(options: CacheOptions<T>): Promise<T> {
  const optionTags: string[] = [];
  for (const tag of options.tags || []) {
    const normalizedTag = String(tag || '').trim();
    if (normalizedTag) optionTags.push(normalizedTag);
  }

  // Dados transacionais: usamos TTL dedicado em vez de forçar 5s por instância.
  // Em Workers o cache é local — forçar TTL baixo só gera thrash sem ganho
  // de consistência cross-instance. A consistência é garantida pela
  // invalidação explícita após mutações (invalidateSalesReadModels etc.).
  const isTransactional = optionTags.some((tag) => TRANSACTIONAL_READ_MODEL_TAGS.has(tag));

  const defaultTtl = isTransactional ? TRANSACTIONAL_TTL_MS : DEFAULT_TTL_MS;
  const defaultStale = isTransactional ? TRANSACTIONAL_STALE_TTL_MS : DEFAULT_STALE_TTL_MS;

  const ttlMs = Math.max(1_000, options.ttlMs ?? defaultTtl);
  const staleTtlMs = Math.max(ttlMs, options.staleTtlMs ?? defaultStale);
  const now = nowMs();
  const existing = cache.get(options.key) as CacheEntry<T> | undefined;
  const loaderEpoch = invalidationEpoch;
  const tags = new Set(optionTags);

  const writeEntry = (value: T) => {
    if (loaderEpoch !== invalidationEpoch) return value;

    const writtenAt = nowMs();
    cache.set(options.key, {
      value,
      expiresAt: writtenAt + ttlMs,
      staleUntil: writtenAt + staleTtlMs,
      lastAccessAt: writtenAt,
      tags
    });
    pruneExpired();
    pruneBySize();
    return value;
  };

  if (existing && existing.expiresAt > now) {
    existing.lastAccessAt = now;
    return existing.value;
  }

  if (existing && existing.staleUntil > now) {
    existing.lastAccessAt = now;
    if (!inflight.has(options.key)) {
      const refreshPromise = options
        .loader()
        .then(writeEntry)
        .catch(() => existing.value)
        .finally(() => {
          if (inflight.get(options.key) === refreshPromise) {
            inflight.delete(options.key);
          }
        });
      inflight.set(options.key, refreshPromise);
    }
    return existing.value;
  }

  const pending = inflight.get(options.key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = options
    .loader()
    .then(writeEntry)
    .catch((error) => {
      // Produção deve preferir dado antigo a erro/timeout em telas analíticas.
      // Se já havia uma versão em memória, mantém por uma janela curta enquanto
      // a próxima tentativa tenta recomputar novamente.
      if (existing) {
        const fallbackAt = nowMs();
        existing.lastAccessAt = fallbackAt;
        existing.staleUntil = fallbackAt + Math.min(staleTtlMs, ERROR_FALLBACK_STALE_MS);
        return existing.value;
      }
      throw error;
    })
    .finally(() => {
      if (inflight.get(options.key) === promise) {
        inflight.delete(options.key);
      }
    });

  inflight.set(options.key, promise);
  return promise;
}

export function invalidateReadModelCache(options?: {
  tags?: string[];
  scopeTags?: string[];
  keyPrefix?: string;
}) {
  invalidationEpoch += 1;
  inflight.clear();

  const tags = cleanStringSet(options?.tags);
  const scopeTags = cleanStringSet(options?.scopeTags);
  const keyPrefix = String(options?.keyPrefix || '').trim();

  if (tags.size === 0 && scopeTags.size === 0 && !keyPrefix) {
    cache.clear();
    return;
  }

  for (const [key, entry] of cache.entries()) {
    const matchesPrefix = keyPrefix ? key.startsWith(keyPrefix) : false;
    const matchesDataTag = tags.size > 0 && Array.from(tags).some((tag) => entry.tags.has(tag));
    const entryHasScopeTag = Array.from(entry.tags).some(isScopeTag);
    const matchesScope =
      scopeTags.size === 0 ||
      Array.from(scopeTags).some((tag) => entry.tags.has(tag)) ||
      !entryHasScopeTag;
    const matchesTag = matchesDataTag && matchesScope;
    if (matchesPrefix || matchesTag) cache.delete(key);
  }
}

export function invalidateSalesReadModels(params?: {
  companyIds?: string[] | null;
  vendedorIds?: string[] | null;
  userId?: string | null;
}) {
  const scopedTags = scopeCacheTags(params || {});
  invalidateReadModelCache({
    tags: [
      READ_MODEL_TAGS.sales,
      READ_MODEL_TAGS.payments,
      READ_MODEL_TAGS.finance,
      READ_MODEL_TAGS.clients,
      READ_MODEL_TAGS.trips,
      READ_MODEL_TAGS.conciliacao,
      READ_MODEL_TAGS.dashboard,
      READ_MODEL_TAGS.vendasKpis,
      READ_MODEL_TAGS.ranking,
      READ_MODEL_TAGS.comissoes
    ],
    scopeTags: scopedTags
  });
  // Propaga a invalidacao para as demais instancias do Worker via KV -- sem
  // isso, so a instancia que processou a mutacao teria seu cache local
  // limpo (ver registerSalesInvalidationPublisher acima).
  salesInvalidationPublisher?.(params ? { companyIds: params.companyIds } : undefined);
  // Marca o read model persistido (Postgres) como dirty -- sem isso o
  // dashboard pode continuar servindo dados persistidos desatualizados
  // mesmo com os caches em memoria/KV corretamente invalidados (ver
  // registerSalesReadModelDirtyMarker acima).
  salesReadModelDirtyMarker?.(params ? { companyIds: params.companyIds } : undefined);
}

export function invalidateQuoteReadModels(params?: {
  companyIds?: string[] | null;
  vendedorIds?: string[] | null;
  userId?: string | null;
}) {
  const scopedTags = scopeCacheTags(params || {});
  invalidateReadModelCache({
    tags: [READ_MODEL_TAGS.quote, READ_MODEL_TAGS.dashboard, READ_MODEL_TAGS.ranking],
    scopeTags: scopedTags
  });
}

export function invalidateClientReadModels(params?: {
  companyIds?: string[] | null;
  vendedorIds?: string[] | null;
  userId?: string | null;
}) {
  const scopedTags = scopeCacheTags(params || {});
  invalidateReadModelCache({
    tags: [READ_MODEL_TAGS.clients, READ_MODEL_TAGS.trips, READ_MODEL_TAGS.dashboard],
    scopeTags: scopedTags
  });
}

export function invalidateCatalogReadModels(params?: {
  companyIds?: string[] | null;
  vendedorIds?: string[] | null;
  userId?: string | null;
}) {
  const scopedTags = scopeCacheTags(params || {});
  invalidateReadModelCache({
    tags: [
      READ_MODEL_TAGS.catalog,
      READ_MODEL_TAGS.trips,
      READ_MODEL_TAGS.dashboard,
      READ_MODEL_TAGS.vendasKpis,
      READ_MODEL_TAGS.ranking,
      READ_MODEL_TAGS.comissoes
    ],
    scopeTags: scopedTags
  });
}

export function invalidateCommissionReadModels(params?: {
  companyIds?: string[] | null;
  vendedorIds?: string[] | null;
  userId?: string | null;
}) {
  const hasDataScope =
    normalizeIds(params?.companyIds).length > 0 || normalizeIds(params?.vendedorIds).length > 0;
  const scopedTags = hasDataScope ? scopeCacheTags(params || {}) : [];
  invalidateReadModelCache({
    tags: [
      READ_MODEL_TAGS.comissoes,
      READ_MODEL_TAGS.finance,
      READ_MODEL_TAGS.dashboard,
      READ_MODEL_TAGS.vendasKpis,
      READ_MODEL_TAGS.ranking
    ],
    scopeTags: scopedTags
  });
}

export function invalidateUserReadModels(params?: {
  companyIds?: string[] | null;
  vendedorIds?: string[] | null;
  userId?: string | null;
}) {
  const scopedTags = scopeCacheTags(params || {});
  invalidateReadModelCache({
    tags: [
      READ_MODEL_TAGS.users,
      READ_MODEL_TAGS.trips,
      READ_MODEL_TAGS.ranking,
      READ_MODEL_TAGS.dashboard
    ],
    scopeTags: scopedTags
  });
}

export function invalidateTripReadModels(params?: {
  companyIds?: string[] | null;
  vendedorIds?: string[] | null;
  userId?: string | null;
}) {
  const scopedTags = scopeCacheTags(params || {});
  invalidateReadModelCache({
    tags: [READ_MODEL_TAGS.trips, READ_MODEL_TAGS.dashboard, READ_MODEL_TAGS.clients],
    scopeTags: scopedTags
  });
}
