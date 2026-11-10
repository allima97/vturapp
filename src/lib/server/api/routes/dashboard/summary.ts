// Migrado para Hono de src/routes/api/v1/dashboard/summary/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  getAdminClient,
  getMonthRange,
  hasModuloAccess,
  fetchRankingVendedoresByCompanyIds,
  isUuid,
  isRankingEligibleUser,
  parseUuidList,
  requireAuthenticatedUser,
  resolveAccessibleClientIds,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { fetchVendasKpiDashboardSummary } from '$lib/server/vendas-kpis';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { fetchDashboardMetasSummaryRpc } from '$lib/server/reciboContribuicoesReadModel';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import {
  cleanStringSet,
  chunkArray,
  QUERY_IN_BATCH_SIZE,
  uniqueCleanStrings
} from '$lib/utils/array';
import { toFiniteNumber as toNum } from '$lib/utils/values';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DashboardQuoteRow = {
  id: string;
  created_at: string | null;
  status: string | null;
  status_negociacao: string | null;
  total: number | null;
  client_id: string | null;
  cliente?: { id?: string | null; nome?: string | null } | null;
  quote_item?: Array<{
    id?: string | null;
    title?: string | null;
    product_name?: string | null;
    item_type?: string | null;
    city_name?: string | null;
  }> | null;
};

type DashboardScopeUserRow = {
  id?: string | null;
  nome_completo?: string | null;
  email?: string | null;
  company_id?: string | null;
  active?: boolean | null;
  uso_individual?: boolean | null;
  participa_ranking?: boolean | null;
  user_types?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

type DashboardMetaRow = {
  id?: string | null;
  vendedor_id?: string | null;
  periodo?: string | null;
  meta_geral?: number | null;
  meta_diferenciada?: number | null;
  ativo?: boolean | null;
  scope?: string | null;
};

type DashboardCompanyRow = {
  id?: string | null;
  active?: boolean | null;
};

type ExecutionContextLike = {
  waitUntil: (promise: Promise<unknown>) => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DASHBOARD_QUOTES_LIMIT = 20;
const NO_MATCH_USER_ID = '00000000-0000-0000-0000-000000000000';

function dedupeDashboardQuotes(rows: DashboardQuoteRow[]) {
  const map = new Map<string, DashboardQuoteRow>();
  for (const row of rows) {
    const id = String(row?.id || '').trim();
    if (id && !map.has(id)) map.set(id, row);
  }
  return Array.from(map.values())
    .sort((left, right) =>
      String(right.created_at || '').localeCompare(String(left.created_at || ''))
    )
    .slice(0, DASHBOARD_QUOTES_LIMIT);
}

function getExecutionContext(platform: unknown): ExecutionContextLike | null {
  const ctx = platform && typeof platform === 'object' ? (platform as { ctx?: unknown }).ctx : null;
  return ctx &&
    typeof ctx === 'object' &&
    typeof (ctx as ExecutionContextLike).waitUntil === 'function'
    ? (ctx as ExecutionContextLike)
    : null;
}

async function fetchAllVisibleCompanyIds(client: ReturnType<typeof getAdminClient>) {
  return getCachedReadModel<string[]>({
    key: buildReadModelCacheKey('dashboard-summary:all-visible-companies', {}),
    tags: [READ_MODEL_TAGS.dashboard, READ_MODEL_TAGS.catalog],
    ttlMs: 300_000,
    staleTtlMs: 1_800_000,
    loader: async () => {
      const { data, error } = await client.from('companies').select('id, active').limit(1000);

      if (error) throw error;

      return ((data || []) as DashboardCompanyRow[])
        .filter((row) => row?.active !== false)
        .map((row) => String(row?.id || '').trim())
        .filter(isUuid);
    }
  });
}

// Cache de escopo de request — evita bater no banco múltiplas vezes pelo mesmo conjunto
// de companyIds dentro de um único handler (metas + orçamentos + ranking usam a mesma query).
function makeRequestScopedGestorCache(client: ReturnType<typeof getAdminClient>) {
  const memo = new Map<string, Promise<string[]>>();
  return function fetchGestorCompanyScopeIdsMemo(options: {
    companyIds?: string[];
    userIds?: string[];
  }): Promise<string[]> {
    const key = JSON.stringify({
      c: uniqueCleanStrings(options.companyIds || []).sort(),
      u: uniqueCleanStrings(options.userIds || []).sort()
    });
    if (!memo.has(key)) {
      memo.set(key, fetchGestorCompanyScopeIds(client, options));
    }
    return memo.get(key)!;
  };
}

async function fetchGestorCompanyScopeIds(
  client: ReturnType<typeof getAdminClient>,
  options: { companyIds?: string[]; userIds?: string[] }
) {
  const companyIds = uniqueCleanStrings(options.companyIds || []);
  const companyIdSet = cleanStringSet(companyIds);
  const userIds = uniqueCleanStrings(options.userIds || []);

  if (userIds.length === 0 && companyIds.length > 0) {
    return getCachedReadModel<string[]>({
      key: buildReadModelCacheKey('dashboard-summary:scope-users-ranking', {
        companyIds
      }),
      tags: [READ_MODEL_TAGS.users, ...scopeCacheTags({ companyIds })],
      ttlMs: 300_000,
      staleTtlMs: 1_800_000,
      loader: async () =>
        uniqueCleanStrings(
          (await fetchRankingVendedoresByCompanyIds(client, companyIds)).map((row) => row?.id)
        )
    });
  }

  return getCachedReadModel<string[]>({
    key: buildReadModelCacheKey('dashboard-summary:scope-users', {
      companyIds,
      userIds
    }),
    tags: [READ_MODEL_TAGS.users, ...scopeCacheTags({ companyIds, vendedorIds: userIds })],
    ttlMs: 300_000,
    staleTtlMs: 1_800_000,
    loader: async () => {
      try {
        const rows: DashboardScopeUserRow[] = [];
        const idBatches =
          userIds.length > 0 ? chunkArray(userIds) : companyIds.length > 0 ? [] : [null];
        const companyBatches =
          userIds.length === 0 && companyIds.length > 0 ? chunkArray(companyIds) : [];

        const fetchBatch = async (filters?: {
          userIds?: string[] | null;
          companyIds?: string[] | null;
        }) => {
          let query = client
            .from('users')
            .select(
              'id, nome_completo, email, active, uso_individual, participa_ranking, user_types(name), company_id'
            )
            .limit(1000);

          if (filters?.userIds && filters.userIds.length > 0) {
            query =
              filters.userIds.length === 1
                ? query.eq('id', filters.userIds[0])
                : query.in('id', filters.userIds);
          } else if (filters?.companyIds && filters.companyIds.length > 0) {
            query =
              filters.companyIds.length === 1
                ? query.eq('company_id', filters.companyIds[0])
                : query.in('company_id', filters.companyIds);
          }

          const { data, error } = await query;
          if (error) throw error;
          rows.push(...((data || []) as DashboardScopeUserRow[]));
        };

        await Promise.all([
          ...idBatches.map((idBatch) => fetchBatch({ userIds: idBatch })),
          ...companyBatches.map((companyBatch) => fetchBatch({ companyIds: companyBatch }))
        ]);

        const eligibleRows = rows.filter((row) => {
          if (!row?.id) return false;
          if (row?.active === false) return false;
          if (row?.uso_individual === true) return false;
          if (!isRankingEligibleUser(row)) return false;
          if (companyIds.length > 0) return companyIdSet.has(String(row?.company_id || '').trim());
          return true;
        });
        return uniqueCleanStrings(eligibleRows.map((row) => row?.id));
      } catch {
        return [];
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleDashboardSummaryGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    // Memo de escopo de request: deduplica chamadas a fetchGestorCompanyScopeIds
    // que ocorrem para metas, orçamentos e KPIs dentro do mesmo handler.
    const fetchScopeIds = makeRequestScopedGestorCache(client);

    const { searchParams } = event.url;
    const { inicio: defaultInicio, fim: defaultFim } = getMonthRange();
    const inicio = String(searchParams.get('inicio') || defaultInicio).trim();
    const fim = String(searchParams.get('fim') || defaultFim).trim();
    const includeOrcamentos = String(searchParams.get('include_orcamentos') || '1').trim() === '1';

    const requestedCompanyId = searchParams.get('company_id');
    const requestedCompanyIdValue = String(
      requestedCompanyId || searchParams.get('empresa_id') || ''
    ).trim();
    const requestedVendedorRaw =
      searchParams.get('vendedor_ids') || searchParams.get('vendedor_id');
    const hasRequestedVendedorFilter = String(requestedVendedorRaw || '').trim().length > 0;
    const requestedVendedorIds = parseUuidList(requestedVendedorRaw);

    const tipoNome = String(scope.tipoNome || '').toUpperCase();
    const isAdminByType = tipoNome.includes('ADMIN');
    const isFinanceiroByType = tipoNome.includes('FINANCEIRO');
    const isGestorByType = tipoNome.includes('GESTOR');
    const isMasterByType = tipoNome.includes('MASTER');
    const hasConfiguredCompanyScope = (scope.companyIds || []).some(isUuid);
    const responsePapel = isAdminByType
      ? 'ADMIN'
      : isMasterByType
        ? 'MASTER'
        : isFinanceiroByType
          ? 'FINANCEIRO'
          : isGestorByType
            ? 'GESTOR'
            : 'VENDEDOR';

    let companyIds: string[] = [];
    let vendedorIds: string[] = [];

    const expandGlobalCompanyScope = async (ids: string[]) => {
      const normalized = uniqueCleanStrings(ids).filter(isUuid);
      if (normalized.length > 0) return normalized;

      const canSeeAllCompanies = isAdminByType || (isMasterByType && !hasConfiguredCompanyScope);
      if (!canSeeAllCompanies) return normalized;

      if (isUuid(requestedCompanyIdValue)) return [requestedCompanyIdValue];
      if (!requestedCompanyIdValue) return fetchAllVisibleCompanyIds(client);
      return normalized;
    };

    if (isAdminByType) {
      companyIds = await expandGlobalCompanyScope(
        resolveScopedCompanyIds(scope, requestedCompanyIdValue)
      );
      vendedorIds = requestedVendedorIds;
    } else if (isFinanceiroByType) {
      companyIds = resolveScopedCompanyIds(scope, requestedCompanyIdValue);
      const allowedFinanceiroIds = await fetchScopeIds({
        companyIds
      });
      const allowedFinanceiroIdSet = new Set(allowedFinanceiroIds);

      vendedorIds = hasRequestedVendedorFilter
        ? requestedVendedorIds.filter((id) => allowedFinanceiroIdSet.has(id))
        : [];
      if (hasRequestedVendedorFilter && vendedorIds.length === 0) {
        vendedorIds = [NO_MATCH_USER_ID];
      }
    } else if (isGestorByType) {
      companyIds = scope.companyId
        ? [scope.companyId]
        : resolveScopedCompanyIds(scope, requestedCompanyIdValue);
      if (hasRequestedVendedorFilter) {
        const allowedGestorIds = await fetchScopeIds({
          companyIds
        });
        const allowedGestorIdSet = new Set(allowedGestorIds);
        vendedorIds = requestedVendedorIds.filter((id) => allowedGestorIdSet.has(id));
        if (vendedorIds.length === 0) vendedorIds = [NO_MATCH_USER_ID];
      } else {
        vendedorIds = [];
      }
    } else if (isMasterByType) {
      companyIds = await expandGlobalCompanyScope(
        resolveScopedCompanyIds(scope, requestedCompanyIdValue)
      );
      if (hasRequestedVendedorFilter) {
        const allowedMasterIds = await fetchScopeIds({
          companyIds
        });
        const allowedMasterIdSet = new Set(allowedMasterIds);
        vendedorIds = requestedVendedorIds.filter((id) => allowedMasterIdSet.has(id));
        if (vendedorIds.length === 0) vendedorIds = [NO_MATCH_USER_ID];
      } else {
        vendedorIds = [];
      }
    } else {
      companyIds = resolveScopedCompanyIds(scope, requestedCompanyIdValue);
      vendedorIds = [scope.userId];
    }

    const canOperacao = scope.isAdmin || hasModuloAccess(scope, ['operacao'], 1);
    const canConsultoria =
      scope.isAdmin || hasModuloAccess(scope, ['consultoria_online', 'consultoria'], 1);

    const dashboardCacheKey = buildReadModelCacheKey('dashboard-summary', {
      cacheVersion: 2,
      userId: user.id,
      papel: responsePapel,
      inicio,
      fim,
      includeOrcamentos,
      companyIds: [...companyIds].sort(),
      vendedorIds: [...vendedorIds].sort()
    });

    const useCompanyWideSalesScope =
      !hasRequestedVendedorFilter &&
      companyIds.length > 0 &&
      (isAdminByType || isMasterByType || isFinanceiroByType || isGestorByType);
    const salesVendedorIds = useCompanyWideSalesScope ? [] : vendedorIds;

    const payload = await getCachedReadModel({
      key: dashboardCacheKey,
      ttlMs: 30_000,
      staleTtlMs: 300_000,
      tags: [
        READ_MODEL_TAGS.dashboard,
        READ_MODEL_TAGS.sales,
        READ_MODEL_TAGS.conciliacao,
        READ_MODEL_TAGS.quote,
        READ_MODEL_TAGS.metas,
        ...scopeCacheTags({ companyIds, vendedorIds, userId: user.id })
      ],
      loader: async () => {
        const accessibleClientIds =
          !scope.isAdmin && vendedorIds.length === 0 && companyIds.length === 0
            ? await resolveAccessibleClientIds(client, {
                companyIds,
                vendedorIds
              })
            : [];
        // -------------------------------------------------------------------------
        // 4-7. Disparar vendas KPIs, metas, orçamentos e widget prefs em paralelo.
        // Antes eram executados sequencialmente: vendas → metas → orçamentos → prefs.
        // Agora rodamos os 4 ao mesmo tempo, reduzindo o tempo total de resposta
        // ao tempo da query mais lenta (geralmente fetchVendasKpiReciboContributions).
        // -------------------------------------------------------------------------

        const buildMetasQuery = () =>
          client
            .from('metas_vendedor')
            .select('meta_geral, meta_diferenciada')
            .eq('ativo', true)
            .gte('periodo', inicio)
            .lte('periodo', fim)
            .limit(5000);

        const fetchMetasParallel = async (): Promise<{
          metasResumo: DashboardMetaRow[];
          vendedorCount: number;
        }> => {
          const metasRpc = await fetchDashboardMetasSummaryRpc(client, {
            dataInicio: inicio,
            dataFim: fim,
            companyIds,
            vendedorIds
          });
          if (metasRpc) {
            const metasResumo =
              metasRpc.metaGeral > 0 || metasRpc.metaDiferenciada > 0
                ? [
                    {
                      id: 'dashboard-summary',
                      vendedor_id: '',
                      periodo: inicio,
                      meta_geral: metasRpc.metaGeral,
                      meta_diferenciada: metasRpc.metaDiferenciada,
                      ativo: true,
                      scope: 'summary'
                    }
                  ]
                : [];

            return {
              metasResumo,
              vendedorCount: metasRpc.vendedorCount
            };
          }

          const rows: DashboardMetaRow[] = [];
          const metasVendedorIds =
            vendedorIds.length > 0
              ? vendedorIds
              : companyIds.length > 0
                ? await fetchScopeIds({ companyIds })
                : [];

          if (metasVendedorIds.length > 0) {
            const batchRows = await Promise.all(
              chunkArray(metasVendedorIds).map(async (vendedorBatch) => {
                const { data, error: metasError } = await buildMetasQuery().in(
                  'vendedor_id',
                  vendedorBatch
                );
                if (metasError) throw metasError;
                return (data || []) as DashboardMetaRow[];
              })
            );
            rows.push(...batchRows.flat());
          } else {
            const { data, error: metasError } = await buildMetasQuery();
            if (metasError) throw metasError;
            rows.push(...((data || []) as DashboardMetaRow[]));
          }
          const metaGeralTotal = (rows || []).reduce(
            (sum, item) => sum + toNum(item?.meta_geral),
            0
          );
          const metaDiferenciadaTotal = (rows || []).reduce(
            (sum, item) => sum + toNum(item?.meta_diferenciada),
            0
          );
          return {
            metasResumo:
              metaGeralTotal > 0 || metaDiferenciadaTotal > 0
                ? [
                    {
                      id: 'dashboard-summary',
                      vendedor_id: '',
                      periodo: inicio,
                      meta_geral: metaGeralTotal,
                      meta_diferenciada: metaDiferenciadaTotal,
                      ativo: true,
                      scope: 'summary'
                    }
                  ]
                : [],
            vendedorCount: metasVendedorIds.length || vendedorIds.length
          };
        };

        const buildQuotesQuery = () =>
          client
            .from('quote')
            .select(
              `
          id, created_at, status, status_negociacao, total, client_id,
          cliente:client_id (id, nome),
          quote_item (id, title, product_name, item_type, city_name)
        `
            )
            .gte('created_at', `${inicio}T00:00:00`)
            .lte('created_at', `${fim}T23:59:59.999`)
            .order('created_at', { ascending: false })
            .limit(DASHBOARD_QUOTES_LIMIT);

        const fetchQuotesByIds = async (field: 'created_by' | 'client_id', ids: string[]) => {
          const normalizedIds = uniqueCleanStrings(ids);
          if (normalizedIds.length === 0) return [] as DashboardQuoteRow[];
          if (normalizedIds.length <= QUERY_IN_BATCH_SIZE) {
            const { data, error } = await buildQuotesQuery().in(field, normalizedIds);
            if (error) throw error;
            return (data || []) as DashboardQuoteRow[];
          }
          const rows: DashboardQuoteRow[] = [];
          const batchRows = await Promise.all(
            chunkArray(normalizedIds).map(async (batch) => {
              const { data, error } = await buildQuotesQuery().in(field, batch);
              if (error) throw error;
              return (data || []) as DashboardQuoteRow[];
            })
          );
          rows.push(...batchRows.flat());
          return dedupeDashboardQuotes(rows);
        };

        const fetchOrcamentosParallel = async (): Promise<DashboardQuoteRow[]> => {
          if (!includeOrcamentos) return [];
          if (vendedorIds.length > 0) {
            return fetchQuotesByIds('created_by', vendedorIds);
          } else if (companyIds.length > 0) {
            const creatorIds = await fetchScopeIds({ companyIds });
            return fetchQuotesByIds('created_by', creatorIds);
          } else {
            const { data: quotesData, error: quotesError } = await buildQuotesQuery();
            if (quotesError) throw quotesError;
            return (quotesData || []) as DashboardQuoteRow[];
          }
        };

        const fetchWidgetPrefsParallel = async () => {
          const { data } = await client
            .from('dashboard_widgets')
            .select('widget, ordem, visivel, settings')
            .eq('usuario_id', user.id)
            .order('ordem', { ascending: true })
            .limit(100);
          return data;
        };

        const readModelOptions =
          companyIds.length > 0
            ? {
                mode: 'stale-while-revalidate' as const,
                executionContext: getExecutionContext(event.platform),
                fallbackToRawOnReadError: true,
                fallbackToRawWhenEmpty: true
              }
            : undefined;

        const [vendasSummary, metasResult, orcamentos, widgetPrefsData] = await Promise.all([
          fetchVendasKpiDashboardSummary(
            client,
            {
              dataInicio: inicio,
              dataFim: fim,
              companyIds,
              vendedorIds: salesVendedorIds,
              accessibleClientIds
            },
            readModelOptions
          ),
          fetchMetasParallel(),
          fetchOrcamentosParallel(),
          fetchWidgetPrefsParallel()
        ]);

        const vendasKpis = vendasSummary.agg;

        return {
          inicio,
          fim,
          userCtx: {
            usuarioId: user.id,
            nome: scope.nome,
            papel: responsePapel,
            vendedorIds,
            vendedorCount: metasResult.vendedorCount || vendedorIds.length
          },
          podeVerOperacao: canOperacao,
          podeVerConsultoria: canConsultoria,
          vendasAgg: {
            totalVendas: vendasKpis.totalVendas,
            totalTaxas: vendasKpis.totalTaxas,
            totalLiquido: vendasKpis.totalLiquido,
            totalSeguro: vendasKpis.totalSeguro,
            qtdVendas: vendasKpis.countAtivas,
            ticketMedio:
              vendasKpis.countAtivas > 0 ? vendasKpis.totalVendas / vendasKpis.countAtivas : 0,
            timeline: vendasSummary.timeline,
            topDestinos: vendasSummary.topDestinos,
            porProduto: vendasSummary.porProduto
          },
          metas: metasResult.metasResumo,
          orcamentos,
          widgetPrefs: widgetPrefsData || [],
          // Timestamp da última reconstrução do read model.
          // Nulo quando os dados vieram do caminho raw (sem read model persistido).
          // Usado no frontend para exibir "Dados atualizados há X min".
          readModelRebuiltAt: vendasSummary.rebuiltAt ?? null
        };
      }
    });

    return json(payload, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar dashboard.');
  }
}
