// Migrado para Hono de src/routes/api/v1/dashboard/ultimas-compras/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  fetchRankingVendedoresByCompanyIds,
  getAdminClient,
  hasModuloAccess,
  isUuid,
  parseUuidList,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import {
  fetchVendasKpiReciboContributions,
  type VendasKpiReciboContribution
} from '$lib/server/vendas-kpis';
import { getPlatformExecutionContext } from '$lib/server/readModelRebuild';
import { monthRangeFromKey, todayISODateLocal } from '$lib/date';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import {
  fetchDashboardComprasResumoRpc,
  type ReadModelComprasResumo
} from '$lib/server/reciboContribuicoesReadModel';
import { chunkArray, cleanStringSet, uniqueCleanStrings } from '$lib/utils/array';
import { toFiniteNumber as toNum } from '$lib/utils/values';

const NO_MATCH_USER_ID = '00000000-0000-0000-0000-000000000000';

type MaybeArray<T> = T | T[] | null;

type ClienteExtraRow = {
  id: string | null;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
  nascimento: string | null;
};

type VendedorNameRow = {
  id?: string | null;
  nome_completo?: string | null;
  email?: string | null;
};

type SaleDetailRow = {
  id?: string | null;
  numero_venda?: string | null;
  cliente_id?: string | null;
  vendedor_id?: string | null;
  company_id?: string | null;
  data_venda?: string | null;
  data_embarque?: string | null;
  clientes?: MaybeArray<ClienteExtraRow>;
  vendedor?: MaybeArray<VendedorNameRow>;
  destino_cidade?: MaybeArray<{ nome?: string | null }>;
  destinos?: MaybeArray<{ nome?: string | null }>;
};

type SaleAggregate = {
  key: string;
  venda_id: string | null;
  cliente_id: string | null;
  vendedor_id: string | null;
  company_id: string | null;
  data_compra: string | null;
  destino: string;
  valor: number;
};

type VendedorAggregate = {
  vendedor_id: string;
  vendedor_nome: string;
  valor: number;
  quantidade: number;
};

type ClienteAggregate = {
  cliente_id: string | null;
  cliente_nome: string;
  data_saida: string | null;
  destino: string;
  valor: number;
  quantidade: number;
  latest_sale_id?: string | null;
  latest_date?: string | null;
};

type DashboardCompanyRow = {
  id?: string | null;
  active?: boolean | null;
};

function getMonthRangeFromSearch(value?: string | null) {
  const raw = String(value || '').trim();
  const month = /^\d{4}-\d{2}$/.test(raw) ? raw : todayISODateLocal().slice(0, 7);
  return monthRangeFromKey(month) || { inicio: `${month}-01`, fim: todayISODateLocal() };
}

function normalizeLimit(value?: string | null, fallback = 5, max = 100) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(parsed)));
}

async function resolveDashboardSalesScope(
  client: ReturnType<typeof getAdminClient>,
  scope: Awaited<ReturnType<typeof resolveUserScope>>,
  params: URLSearchParams
) {
  const requestedCompanyId = params.get('company_id') || params.get('empresa_id');
  const requestedVendedorRaw = params.get('vendedor_ids') || params.get('vendedor_id');
  const hasRequestedVendedorFilter = String(requestedVendedorRaw || '').trim().length > 0;
  const requestedVendedorIds = parseUuidList(requestedVendedorRaw);
  const tipoNome = String(scope.tipoNome || '').toUpperCase();
  const isAdminByType = tipoNome.includes('ADMIN');
  const isFinanceiroByType = tipoNome.includes('FINANCEIRO');
  const isGestorByType = tipoNome.includes('GESTOR');
  const isMasterByType = tipoNome.includes('MASTER');
  const hasConfiguredCompanyScope = (scope.companyIds || []).some(isUuid);

  let companyIds = resolveScopedCompanyIds(scope, requestedCompanyId);
  if (isGestorByType && scope.companyId) companyIds = [scope.companyId];

  const canExpandAllCompanies = isAdminByType || (isMasterByType && !hasConfiguredCompanyScope);
  if (companyIds.length === 0 && canExpandAllCompanies) {
    const requestedCompanyIdValue = String(requestedCompanyId || '').trim();
    if (isUuid(requestedCompanyIdValue)) {
      companyIds = [requestedCompanyIdValue];
    } else if (!requestedCompanyIdValue) {
      companyIds = await fetchAllVisibleCompanyIds(client);
    }
  }

  if (isAdminByType) {
    return {
      companyIds,
      vendedorIds: hasRequestedVendedorFilter ? requestedVendedorIds : []
    };
  }

  if (isMasterByType || isGestorByType || isFinanceiroByType) {
    if (hasRequestedVendedorFilter) {
      const allowedRows = await fetchRankingVendedoresByCompanyIds(client, companyIds);
      const allowedIds = uniqueCleanStrings(allowedRows.map((row) => row?.id));
      const allowedIdSet = cleanStringSet(allowedIds);
      const filtered = requestedVendedorIds.filter((id) => allowedIdSet.has(id));
      return { companyIds, vendedorIds: filtered.length > 0 ? filtered : [NO_MATCH_USER_ID] };
    }
    return { companyIds, vendedorIds: [] };
  }

  return { companyIds, vendedorIds: [scope.userId] };
}

function contributionSaleKey(item: VendasKpiReciboContribution) {
  return String(item.vendaId || item.vendaKey || item.reciboId || '').trim();
}

function one<T>(value?: MaybeArray<T>) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function buildSaleAggregates(contributions: VendasKpiReciboContribution[]) {
  const map = new Map<string, SaleAggregate>();
  for (const item of contributions || []) {
    const key = contributionSaleKey(item);
    const bruto = toNum(item?.bruto);
    if (!key || bruto <= 0) continue;

    const current = map.get(key) || {
      key,
      venda_id: String(item?.vendaId || '').trim() || null,
      cliente_id: String(item?.clienteId || '').trim() || null,
      vendedor_id: String(item?.vendedorId || '').trim() || null,
      company_id: String(item?.companyId || '').trim() || null,
      data_compra: null,
      destino: 'Destino não informado',
      valor: 0
    };
    const date = String(item?.reciboDate || '').slice(0, 10);
    current.valor += bruto;
    if (date && date >= String(current.data_compra || '')) {
      current.data_compra = date;
      current.venda_id = String(item?.vendaId || current.venda_id || '').trim() || null;
      current.cliente_id = String(item?.clienteId || current.cliente_id || '').trim() || null;
      current.vendedor_id = String(item?.vendedorId || current.vendedor_id || '').trim() || null;
      current.company_id = String(item?.companyId || current.company_id || '').trim() || null;
      current.destino = String(item?.destinoNome || current.destino || 'Destino não informado');
    }
    map.set(key, current);
  }

  return Array.from(map.values());
}

async function fetchClientesByIds(client: ReturnType<typeof getAdminClient>, ids: string[]) {
  const rows: ClienteExtraRow[] = [];
  for (const batch of chunkArray(uniqueCleanStrings(ids))) {
    if (batch.length === 0) continue;
    const { data, error } = await client
      .from('clientes')
      .select('id, nome, email, telefone, whatsapp, nascimento')
      .in('id', batch);
    if (error) throw error;
    rows.push(...((data || []) as ClienteExtraRow[]));
  }
  return new Map(rows.map((row) => [String(row.id), row]));
}

async function fetchVendedoresByIds(client: ReturnType<typeof getAdminClient>, ids: string[]) {
  const rows: VendedorNameRow[] = [];
  for (const batch of chunkArray(uniqueCleanStrings(ids))) {
    if (batch.length === 0) continue;
    const { data, error } = await client
      .from('users')
      .select('id, nome_completo, email')
      .in('id', batch);
    if (error) throw error;
    rows.push(...((data || []) as VendedorNameRow[]));
  }
  return new Map(rows.map((row) => [String(row.id), row]));
}

async function fetchSaleDetailsByIds(client: ReturnType<typeof getAdminClient>, ids: string[]) {
  const rows: SaleDetailRow[] = [];
  for (const batch of chunkArray(uniqueCleanStrings(ids))) {
    if (batch.length === 0) continue;
    const { data, error } = await client
      .from('vendas')
      .select(
        `
        id,
        numero_venda,
        cliente_id,
        vendedor_id,
        company_id,
        data_venda,
        data_embarque,
        clientes (id, nome, email, telefone, whatsapp, nascimento),
        vendedor:users!vendedor_id (id, nome_completo, email),
        destino_cidade:cidades!destino_cidade_id (nome),
        destinos:produtos!destino_id (nome)
      `
      )
      .in('id', batch);
    if (error) throw error;
    rows.push(...((data || []) as SaleDetailRow[]));
  }
  return new Map(rows.map((row) => [String(row.id), row]));
}

function resolveClienteNome(
  clienteId: string | null,
  clienteExtra: Map<string, ClienteExtraRow>,
  detail?: SaleDetailRow | null
) {
  const extra = clienteId ? clienteExtra.get(clienteId) : null;
  const cliente = one(detail?.clientes);
  return String(cliente?.nome || extra?.nome || 'Cliente sem nome');
}

function resolveVendedorNome(
  vendedorId: string | null,
  vendedores: Map<string, VendedorNameRow>,
  detail?: SaleDetailRow | null
) {
  const vendedor = vendedorId ? vendedores.get(vendedorId) : null;
  const vendedorDetail = one(detail?.vendedor);
  return String(
    vendedorDetail?.nome_completo ||
      vendedor?.nome_completo ||
      vendedorDetail?.email ||
      vendedor?.email ||
      'Vendedor não informado'
  );
}

function resolveDestino(item: SaleAggregate, detail?: SaleDetailRow | null) {
  const destinoCidade = one(detail?.destino_cidade);
  const destinoProduto = one(detail?.destinos);
  return String(
    destinoCidade?.nome || destinoProduto?.nome || item.destino || 'Destino não informado'
  );
}

function resolveClienteExtraFromDetail(detail?: SaleDetailRow | null) {
  return one(detail?.clientes);
}

async function fetchAllVisibleCompanyIds(client: ReturnType<typeof getAdminClient>) {
  return getCachedReadModel<string[]>({
    key: buildReadModelCacheKey('dashboard:ultimas-compras:all-visible-companies', {}),
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

function hasComprasResumoData(payload?: ReadModelComprasResumo | null) {
  if (!payload) return false;
  return (
    toNum(payload.total) > 0 ||
    payload.topVendedores.some((item) => toNum(item.valor) > 0 || toNum(item.quantidade) > 0) ||
    payload.topClientes.some((item) => toNum(item.valor) > 0 || toNum(item.quantidade) > 0) ||
    payload.ultimasCompras.some((item) => toNum(item.valor) > 0)
  );
}

export async function handleDashboardUltimasComprasGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (
      !scope.isAdmin &&
      !scope.isMaster &&
      !scope.isGestor &&
      !hasModuloAccess(scope, ['dashboard'], 1)
    ) {
      return json(
        { error: 'Sem acesso às últimas compras.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const { searchParams } = event.url;
    const range = getMonthRangeFromSearch(searchParams.get('mes'));
    const inicio = String(searchParams.get('inicio') || range.inicio).trim();
    const fim = String(searchParams.get('fim') || range.fim).trim();
    const limit = normalizeLimit(searchParams.get('limit'), 5, 100);
    const { companyIds, vendedorIds } = await resolveDashboardSalesScope(
      client,
      scope,
      searchParams
    );
    const tipoNome = String(scope.tipoNome || '').toUpperCase();
    const isAdminByType = tipoNome.includes('ADMIN');
    const isMasterByType = tipoNome.includes('MASTER');
    const hasRequestedVendedorFilter =
      String(searchParams.get('vendedor_ids') || searchParams.get('vendedor_id') || '').trim()
        .length > 0;
    const useNonBlockingReadModel =
      (scope.isAdmin || isAdminByType || isMasterByType) &&
      companyIds.length > 1 &&
      !hasRequestedVendedorFilter;

    const payload = await getCachedReadModel({
      key: buildReadModelCacheKey('dashboard:ultimas-compras', {
        cacheVersion: 2,
        userId: user.id,
        inicio,
        fim,
        limit,
        companyIds,
        vendedorIds
      }),
      tags: [
        READ_MODEL_TAGS.dashboard,
        READ_MODEL_TAGS.sales,
        READ_MODEL_TAGS.clients,
        READ_MODEL_TAGS.users,
        ...scopeCacheTags({ companyIds, vendedorIds, userId: user.id })
      ],
      ttlMs: 120_000,
      staleTtlMs: 900_000,
      loader: async () => {
        const rpcResumo = await fetchDashboardComprasResumoRpc(client, {
          dataInicio: inicio,
          dataFim: fim,
          companyIds,
          vendedorIds,
          limit
        });

        if (rpcResumo && hasComprasResumoData(rpcResumo)) {
          return {
            inicio,
            fim,
            ...rpcResumo
          };
        }

        let contributionsPayload = await fetchVendasKpiReciboContributions(
          client,
          {
            dataInicio: inicio,
            dataFim: fim,
            companyIds,
            vendedorIds,
            accessibleClientIds: []
          },
          useNonBlockingReadModel
            ? {
                mode: 'stale-while-revalidate',
                executionContext: getPlatformExecutionContext(event.platform),
                fallbackToRawOnReadError: true,
                fallbackToRawWhenEmpty: true
              }
            : undefined
        );

        if (useNonBlockingReadModel && contributionsPayload.contributions.length === 0) {
          contributionsPayload = await fetchVendasKpiReciboContributions(
            client,
            {
              dataInicio: inicio,
              dataFim: fim,
              companyIds,
              vendedorIds,
              accessibleClientIds: []
            },
            { mode: 'blocking' }
          );
        }

        const { contributions } = contributionsPayload;
        const sales = buildSaleAggregates(contributions);

        const vendedorMap = new Map<string, VendedorAggregate>();
        const clienteMap = new Map<string, ClienteAggregate>();

        for (const item of sales) {
          const vendedorId = item.vendedor_id || 'sem-vendedor';
          const vendedor = vendedorMap.get(vendedorId) || {
            vendedor_id: vendedorId,
            vendedor_nome: '',
            valor: 0,
            quantidade: 0
          };
          vendedor.valor += item.valor;
          vendedor.quantidade += 1;
          vendedorMap.set(vendedorId, vendedor);

          const clienteKey = item.cliente_id || `sem-cliente:${item.key}`;
          const cliente = clienteMap.get(clienteKey) || {
            cliente_id: item.cliente_id,
            cliente_nome: '',
            data_saida: null,
            destino: item.destino,
            valor: 0,
            quantidade: 0,
            latest_sale_id: item.venda_id,
            latest_date: item.data_compra
          };
          cliente.valor += item.valor;
          cliente.quantidade += 1;
          if (String(item.data_compra || '') >= String(cliente.latest_date || '')) {
            cliente.latest_date = item.data_compra;
            cliente.latest_sale_id = item.venda_id;
            cliente.destino = item.destino;
          }
          clienteMap.set(clienteKey, cliente);
        }

        const recentSales = [...sales]
          .sort((left, right) =>
            String(right.data_compra || '').localeCompare(String(left.data_compra || ''))
          )
          .slice(0, limit);
        const topVendedorRows = Array.from(vendedorMap.values())
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 3);
        const topClienteRows = Array.from(clienteMap.values())
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 5);

        const saleIds = uniqueCleanStrings([
          ...recentSales.map((item) => item.venda_id),
          ...topClienteRows.map((item) => item.latest_sale_id)
        ]).filter(isUuid);
        const clienteIds = uniqueCleanStrings([
          ...recentSales.map((item) => item.cliente_id),
          ...topClienteRows.map((item) => item.cliente_id)
        ]).filter(isUuid);
        const vendedorNameIds = uniqueCleanStrings([
          ...recentSales.map((item) => item.vendedor_id),
          ...topVendedorRows.map((item) => item.vendedor_id)
        ]).filter(isUuid);

        const [clienteExtra, vendedorNames, saleDetails] = await Promise.all([
          fetchClientesByIds(client, clienteIds),
          fetchVendedoresByIds(client, vendedorNameIds),
          fetchSaleDetailsByIds(client, saleIds)
        ]);

        const topVendedores = topVendedorRows.map((item) => ({
          ...item,
          vendedor_nome: resolveVendedorNome(item.vendedor_id, vendedorNames)
        }));

        const topClientes = topClienteRows.map((item) => {
          const detail = item.latest_sale_id ? saleDetails.get(item.latest_sale_id) : null;
          const clienteId = String(detail?.cliente_id || item.cliente_id || '').trim() || null;
          return {
            ...item,
            cliente_id: clienteId,
            cliente_nome: resolveClienteNome(clienteId, clienteExtra, detail),
            data_saida: detail?.data_embarque || null,
            destino: resolveDestino(
              {
                key: item.latest_sale_id || String(clienteId || item.cliente_id || ''),
                venda_id: item.latest_sale_id || null,
                cliente_id: clienteId,
                vendedor_id: null,
                company_id: null,
                data_compra: item.latest_date || null,
                destino: item.destino,
                valor: item.valor
              },
              detail
            )
          };
        });

        const ultimasCompras = recentSales.map((item) => {
          const detail = item.venda_id ? saleDetails.get(item.venda_id) : null;
          const clienteId = String(detail?.cliente_id || item.cliente_id || '').trim() || null;
          const vendedorId = String(detail?.vendedor_id || item.vendedor_id || '').trim() || null;
          const extra = clienteId ? clienteExtra.get(clienteId) : null;
          const clienteDetail = resolveClienteExtraFromDetail(detail);
          return {
            id: item.venda_id || item.key,
            numero_venda: detail?.numero_venda || null,
            cliente_id: clienteId,
            cliente_nome: resolveClienteNome(clienteId, clienteExtra, detail),
            cliente_email: String(clienteDetail?.email || extra?.email || '').trim() || null,
            cliente_telefone:
              String(
                clienteDetail?.whatsapp ||
                  clienteDetail?.telefone ||
                  extra?.whatsapp ||
                  extra?.telefone ||
                  ''
              ).trim() || null,
            cliente_whatsapp:
              String(clienteDetail?.whatsapp || extra?.whatsapp || '').trim() || null,
            cliente_nascimento:
              String(clienteDetail?.nascimento || extra?.nascimento || '').trim() || null,
            vendedor_id: vendedorId,
            vendedor_nome: resolveVendedorNome(vendedorId, vendedorNames, detail),
            company_id: String(detail?.company_id || item.company_id || '').trim() || null,
            data_compra: item.data_compra || detail?.data_venda || null,
            data_saida: detail?.data_embarque || null,
            destino: resolveDestino(item, detail),
            valor: item.valor
          };
        });

        return {
          inicio,
          fim,
          topVendedores,
          topClientes,
          ultimasCompras,
          total: sales.length
        };
      }
    });

    return json(payload, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar últimas compras.');
  }
}
