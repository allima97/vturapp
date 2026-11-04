// Migrado para Hono de src/routes/api/v1/viagens/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  logServerError,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { addDaysISODate, todayISODateLocal } from '$lib/date';
import { normalizeViagemStatus } from '$lib/viagens/status';
import { resolveStatusFromViagemRow, syncViagensStatus } from '$lib/server/viagensStatus';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import { getPlatformExecutionContext } from '$lib/server/readModelRebuild';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { chunkArray, QUERY_IN_BATCH_SIZE } from '$lib/utils/array';

const DEFAULT_LIST_LIMIT = 300;
const MAX_LIST_LIMIT = 500;
const INTERNACIONAL_DESTINO_KEYWORDS = [
  'europa',
  'asia',
  'africa',
  'oceania',
  'américa do norte',
  'eua',
  'canada',
  'mexico',
  'caribe',
  'orlando',
  'miami',
  'new york',
  'paris',
  'londres',
  'italia',
  'espanha',
  'portugal'
];
const VIAGENS_LIST_SELECT = `
  id,
  venda_id,
  orcamento_id,
  cliente_id,
  company_id,
  responsavel_user_id,
  origem,
  destino,
  data_inicio,
  data_fim,
  status,
  observacoes,
  follow_up_text,
  follow_up_fechado,
  recibo_id,
  created_at,
  updated_at
`;

type ViagemListRow = {
  id: string | null;
  venda_id: string | null;
  orcamento_id: string | null;
  cliente_id: string | null;
  company_id: string | null;
  responsavel_user_id: string | null;
  origem: string | null;
  destino: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  status: string | null;
  observacoes: string | null;
  follow_up_text: string | null;
  follow_up_fechado: boolean | null;
  recibo_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ViagemListItem = {
  id: string | null;
  venda_id: string | null;
  orcamento_id: string | null;
  cliente_id: string | null;
  cliente_nome: string;
  destino: string;
  origem: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  status: string;
  observacoes: string;
  follow_up_text: string;
  follow_up_fechado: boolean;
  recibo_id: string | null;
  numero_passageiros: number;
  tipo_viagem: 'internacional' | 'nacional';
  valor_total: number;
  responsavel_nome: string;
  created_at: string | null;
};

type ViagensListQueryResult = PromiseLike<{
  data: unknown;
  error: unknown;
}>;

type ViagensListQueryBuilder = {
  order: (
    column: string,
    options: { ascending: boolean; nullsFirst: boolean }
  ) => ViagensListQueryBuilder;
  in: (column: string, values: readonly string[]) => ViagensListQueryBuilder;
  gte: (column: string, value: string) => ViagensListQueryBuilder;
  lte: (column: string, value: string) => ViagensListQueryBuilder;
  eq: (column: string, value: string) => ViagensListQueryBuilder;
  limit: (value: number) => ViagensListQueryResult;
  range: (from: number, to: number) => ViagensListQueryResult;
};

function clampInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function getPeriodoFilter(periodo: string | null): { from?: string; to?: string } | null {
  if (!periodo) return null;

  const hojeStr = todayISODateLocal();

  switch (periodo) {
    case 'hoje': {
      return { from: hojeStr, to: hojeStr };
    }
    case 'semana': {
      return { from: hojeStr, to: addDaysISODate(hojeStr, 7) };
    }
    case 'quinzena': {
      return { from: hojeStr, to: addDaysISODate(hojeStr, 15) };
    }
    case 'mes': {
      return { from: hojeStr, to: addDaysISODate(hojeStr, 30) };
    }
    case 'proximos_30': {
      return { from: hojeStr, to: addDaysISODate(hojeStr, 30) };
    }
    default:
      return null;
  }
}

function compareNullableDate(
  a: string | null | undefined,
  b: string | null | undefined,
  ascending: boolean
) {
  const left = String(a || '').trim();
  const right = String(b || '').trim();
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return ascending ? left.localeCompare(right) : right.localeCompare(left);
}

function sortViagemRows(rows: ViagemListRow[], ordenar: string) {
  return [...rows].sort((a, b) => {
    if (ordenar === 'embarque_desc') {
      return (
        compareNullableDate(a?.data_inicio, b?.data_inicio, false) ||
        compareNullableDate(a?.data_fim, b?.data_fim, false)
      );
    }
    if (ordenar === 'retorno_asc') {
      return (
        compareNullableDate(a?.data_fim, b?.data_fim, true) ||
        compareNullableDate(a?.data_inicio, b?.data_inicio, true)
      );
    }
    if (ordenar === 'cadastro_desc') {
      return (
        compareNullableDate(a?.created_at, b?.created_at, false) ||
        compareNullableDate(a?.data_inicio, b?.data_inicio, true)
      );
    }
    return (
      compareNullableDate(a?.data_inicio, b?.data_inicio, true) ||
      compareNullableDate(a?.data_fim, b?.data_fim, true)
    );
  });
}

function mergeUniqueViagemRows(...groups: ViagemListRow[][]) {
  const byId = new Map<string, ViagemListRow>();
  for (const group of groups) {
    for (const row of group) {
      const id = String(row?.id || '').trim();
      if (id && !byId.has(id)) byId.set(id, row);
    }
  }
  return Array.from(byId.values());
}

export async function handleViagensGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['operacao_viagens', 'Viagens', 'viagens', 'operacao'],
        1,
        'Sem acesso a Viagens.'
      );
    }

    const { searchParams } = event.url;
    const status = searchParams.get('status');
    const periodo = searchParams.get('periodo');
    const ordenar = String(searchParams.get('ordenar') || 'embarque_asc')
      .trim()
      .toLowerCase();
    const companyIds = resolveScopedCompanyIds(scope, searchParams.get('empresa_id'));
    const page = clampInt(searchParams.get('page'), 1, 1, 10_000);
    const limit = clampInt(searchParams.get('limit'), DEFAULT_LIST_LIMIT, 1, MAX_LIST_LIMIT);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Guard: sem empresa identificada, retorna vazio (exceto admin)
    if (!scope.isAdmin && companyIds.length === 0) {
      return json({ items: [], total: 0 }, { headers: DYNAMIC_READ_HEADERS });
    }

    const vendedorTagIds = scope.isVendedor ? [user.id] : [];
    const cacheKey = buildReadModelCacheKey('viagens:list', {
      status,
      periodo,
      ordenar,
      companyIds,
      page,
      limit,
      userId: user.id,
      isAdmin: scope.isAdmin,
      isVendedor: scope.isVendedor
    });
    const payload = await getCachedReadModel({
      key: cacheKey,
      tags: [
        READ_MODEL_TAGS.trips,
        READ_MODEL_TAGS.sales,
        READ_MODEL_TAGS.clients,
        READ_MODEL_TAGS.users,
        READ_MODEL_TAGS.dashboard,
        ...scopeCacheTags({
          companyIds,
          vendedorIds: vendedorTagIds,
          userId: user.id
        })
      ],
      ttlMs: 120_000,
      staleTtlMs: 600_000,
      loader: async () => {
        const normalizedStatus = normalizeViagemStatus(status);
        const hasStatusFilter =
          Boolean(String(status || '').trim()) &&
          String(status || '')
            .trim()
            .toLowerCase() !== 'todas';

        const periodoFilter = getPeriodoFilter(periodo);

        const applyOrdering = (query: ViagensListQueryBuilder) => {
          if (ordenar === 'embarque_desc') {
            return query
              .order('data_inicio', { ascending: false, nullsFirst: false })
              .order('data_fim', { ascending: false, nullsFirst: false });
          }
          if (ordenar === 'retorno_asc') {
            return query
              .order('data_fim', { ascending: true, nullsFirst: false })
              .order('data_inicio', { ascending: true, nullsFirst: false });
          }
          if (ordenar === 'cadastro_desc') {
            return query
              .order('created_at', { ascending: false, nullsFirst: false })
              .order('data_inicio', { ascending: true, nullsFirst: false });
          }
          return query
            .order('data_inicio', { ascending: true, nullsFirst: false })
            .order('data_fim', { ascending: true, nullsFirst: false });
        };

        const buildQuery = (selectFields: string, companyIdsFilter = companyIds) => {
          let query = client.from('viagens').select(selectFields);

          if (companyIdsFilter.length > 0) {
            query = query.in('company_id', companyIdsFilter);
          }

          if (periodoFilter?.from && periodoFilter?.to) {
            query = query
              .gte('data_inicio', periodoFilter.from)
              .lte('data_inicio', periodoFilter.to + 'T23:59:59');
          }

          return applyOrdering(query);
        };

        const fetchBatchedViagens = async (
          selectFields: string,
          configure: (query: ViagensListQueryBuilder) => ViagensListQueryBuilder,
          limitRows: number
        ) => {
          const companyBatches =
            companyIds.length > QUERY_IN_BATCH_SIZE ? chunkArray(companyIds) : [companyIds];
          const batchRows = await Promise.all(
            companyBatches.map(async (batch) => {
              const result = await configure(buildQuery(selectFields, batch)).limit(limitRows);
              if (result.error) throw result.error;
              return (result.data as ViagemListRow[] | null) || [];
            })
          );
          return batchRows.flat();
        };

        let scopedData: ViagemListRow[] = [];

        if (scope.isVendedor) {
          const candidateLimit = Math.min(MAX_LIST_LIMIT, Math.max(limit, to + 1));
          const [responsavelRows, vendaRows] = await Promise.all([
            fetchBatchedViagens(
              VIAGENS_LIST_SELECT,
              (query) => query.eq('responsavel_user_id', user.id),
              candidateLimit
            ),
            fetchBatchedViagens(
              `${VIAGENS_LIST_SELECT}, venda:vendas!inner(id, vendedor_id)`,
              (query) => query.eq('venda.vendedor_id', user.id),
              candidateLimit
            )
          ]);

          scopedData = sortViagemRows(
            mergeUniqueViagemRows(responsavelRows, vendaRows),
            ordenar
          ).slice(from, to + 1);
        } else if (companyIds.length > QUERY_IN_BATCH_SIZE) {
          const rows = await fetchBatchedViagens(VIAGENS_LIST_SELECT, (query) => query, to + 1);
          scopedData = sortViagemRows(mergeUniqueViagemRows(rows), ordenar).slice(from, to + 1);
        } else {
          const { data, error } = await buildQuery(VIAGENS_LIST_SELECT).range(from, to);
          if (error) throw error;
          scopedData = (data as ViagemListRow[] | null) || [];
        }

        const resolvedStatuses = new Map<string, ReturnType<typeof resolveStatusFromViagemRow>>();
        for (const row of scopedData) {
          const id = String(row?.id || '').trim();
          if (id) resolvedStatuses.set(id, resolveStatusFromViagemRow(row));
        }

        const syncPromise = syncViagensStatus(client, scopedData).catch((error) => {
          logServerError('[viagens] sincronização de status em background falhou', error);
        });
        const executionContext = getPlatformExecutionContext(event.platform);
        if (executionContext) executionContext.waitUntil(syncPromise);
        else void syncPromise;

        const clienteIdSet = new Set<string>();
        const responsavelIdSet = new Set<string>();
        const viagemIdSet = new Set<string>();
        const vendaIdSet = new Set<string>();
        for (const viagem of scopedData || []) {
          if (viagem.cliente_id) clienteIdSet.add(viagem.cliente_id);
          if (viagem.responsavel_user_id) responsavelIdSet.add(viagem.responsavel_user_id);
          if (viagem.id) viagemIdSet.add(viagem.id);
          if (viagem.venda_id) vendaIdSet.add(viagem.venda_id);
        }

        const [clientesMap, responsaveisMap, passageirosCountMap, vendasMap] = await Promise.all([
          (async () => {
            const map = new Map<string, string>();
            const ids = Array.from(clienteIdSet);
            for (const batch of chunkArray(ids)) {
              const { data, error } = await client
                .from('clientes')
                .select('id, nome')
                .in('id', batch);
              if (error) throw error;
              for (const c of data || []) {
                map.set(c.id, c.nome);
              }
            }
            return map;
          })(),
          (async () => {
            const map = new Map<string, string>();
            const ids = Array.from(responsavelIdSet);
            for (const batch of chunkArray(ids)) {
              const { data, error } = await client
                .from('users')
                .select('id, nome_completo')
                .in('id', batch);
              if (error) throw error;
              for (const u of data || []) {
                map.set(u.id, u.nome_completo);
              }
            }
            return map;
          })(),
          (async () => {
            const map = new Map<string, number>();
            const ids = Array.from(viagemIdSet);
            for (const batch of chunkArray(ids)) {
              const { data, error } = await client
                .from('viagem_passageiros')
                .select('viagem_id')
                .in('viagem_id', batch);
              if (error) throw error;
              for (const p of data || []) {
                map.set(p.viagem_id, (map.get(p.viagem_id) || 0) + 1);
              }
            }
            return map;
          })(),
          (async () => {
            const map = new Map<string, number>();
            const ids = Array.from(vendaIdSet);
            for (const batch of chunkArray(ids)) {
              const { data, error } = await client
                .from('vendas')
                .select('id, valor_total')
                .in('id', batch);
              if (error) throw error;
              for (const v of data || []) {
                map.set(v.id, v.valor_total);
              }
            }
            return map;
          })()
        ]);

        const items = (scopedData || [])
          .map((row): ViagemListItem => {
            const resolvedStatus =
              resolvedStatuses.get(String(row.id || '')) || normalizeViagemStatus(row.status);
            const rowId = String(row.id || '');
            const clienteId = String(row.cliente_id || '');
            const responsavelUserId = String(row.responsavel_user_id || '');
            const destinoTexto = String(row.destino || '');
            const numPassageiros = passageirosCountMap.get(rowId) || 1;
            const valorVenda = row.venda_id ? vendasMap.get(row.venda_id) || 0 : 0;
            const tipoViagem =
              destinoTexto &&
              INTERNACIONAL_DESTINO_KEYWORDS.some((k) => destinoTexto.toLowerCase().includes(k))
                ? 'internacional'
                : 'nacional';

            return {
              id: row.id,
              venda_id: row.venda_id,
              orcamento_id: row.orcamento_id,
              cliente_id: row.cliente_id,
              cliente_nome: clientesMap.get(clienteId) || 'Cliente não encontrado',
              destino: row.destino || row.origem || 'Destino não informado',
              origem: row.origem,
              data_inicio: row.data_inicio,
              data_fim: row.data_fim,
              status: resolvedStatus,
              observacoes: row.observacoes || '',
              follow_up_text: row.follow_up_text || '',
              follow_up_fechado: row.follow_up_fechado || false,
              recibo_id: row.recibo_id,
              numero_passageiros: numPassageiros,
              tipo_viagem: tipoViagem,
              valor_total: valorVenda,
              responsavel_nome: responsaveisMap.get(responsavelUserId) || 'Não atribuído',
              created_at: row.created_at
            };
          })
          .filter((item) => !hasStatusFilter || item.status === normalizedStatus);

        return {
          items,
          total: items.length,
          page,
          limit,
          hasMore: scopedData.length === limit
        };
      }
    });

    return json(payload, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar viagens.');
  }
}
