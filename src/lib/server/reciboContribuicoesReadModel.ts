import type { DataClient } from '$lib/server/data';
import { isUuid } from '$lib/vendas/rateio';
import { getAdminClient, logServerError } from '$lib/server/v1';
import {
  buildReadModelCacheKey,
  registerSalesReadModelDirtyMarker
} from '$lib/server/readModelCache';
import { chunkArray, uniqueCleanStrings } from '$lib/utils/array';
import { toCleanString as toStr, toFiniteNumber as toNum } from '$lib/utils/values';
import type {
  VendasKpiAgg,
  VendasKpiReciboContribution,
  VendasTimelinePoint
} from '$lib/server/vendas-kpis';
import { guardContributionRowsForeignKeys } from '$lib/server/readModelRowGuard';

type ReadModelParams = {
  dataInicio: string;
  dataFim: string;
  companyIds: string[];
  vendedorIds: string[];
  accessibleClientIds?: string[];
};

export type ReciboContribuicoesReadModelOptions = {
  mode?: 'blocking' | 'stale-while-revalidate';
  executionContext?: { waitUntil: (promise: Promise<unknown>) => void } | null;
  fallbackToRawOnReadError?: boolean;
  fallbackToRawWhenEmpty?: boolean;
};

type ContributionPayload = {
  agg: VendasKpiAgg;
  contributions: VendasKpiReciboContribution[];
};

export type ReciboContribuicoesRawLoader = (
  params: ReadModelParams
) => Promise<ContributionPayload>;
type RawLoader = ReciboContribuicoesRawLoader;

export type ReadModelDashboardSummary = {
  agg: VendasKpiAgg;
  timeline: VendasTimelinePoint[];
  topDestinos: Array<{ name: string; value: number; count: number }>;
  porProduto: Array<{ id: string; name: string; value: number }>;
  /** ISO timestamp da última reconstrução do read model. Null se dados vieram do fallback raw. */
  rebuiltAt?: string | null;
};

export type ReadModelCompanyComparativoRow = {
  company_id: string;
  totalVendas: number;
  qtdVendas: number;
  totalMeta: number;
};

export type ReadModelMetasSummary = {
  metaGeral: number;
  metaDiferenciada: number;
  vendedorCount: number;
};

export type ReadModelComprasResumo = {
  topVendedores: Array<{
    vendedor_id: string;
    vendedor_nome: string;
    valor: number;
    quantidade: number;
  }>;
  topClientes: Array<{
    cliente_id: string | null;
    cliente_nome: string;
    data_saida: string | null;
    destino: string;
    valor: number;
    quantidade: number;
  }>;
  ultimasCompras: Array<{
    id: string;
    numero_venda?: string | null;
    cliente_id: string | null;
    cliente_nome: string;
    cliente_email: string | null;
    cliente_telefone: string | null;
    cliente_whatsapp: string | null;
    cliente_nascimento: string | null;
    vendedor_id: string | null;
    vendedor_nome: string;
    company_id: string | null;
    data_compra: string | null;
    data_saida: string | null;
    destino: string;
    valor: number;
  }>;
  total: number;
};

export type ReadModelProdutoRelatorioRow = {
  produto_id: string | null;
  produto: string;
  tipo: string;
  quantidade: number;
  receita: number;
  lucro: number;
};

export type ReadModelDestinoRelatorioRow = {
  destino: string;
  quantidade: number;
  receita: number;
};

export type ReadModelClienteRelatorioRow = {
  cliente_id: string | null;
  total_compras: number;
  total_gasto: number;
  ultima_compra: string | null;
};

type DashboardSummaryRpcRow = {
  total_vendas?: number | string | null;
  total_taxas?: number | string | null;
  total_seguro?: number | string | null;
  qtd_vendas?: number | string | null;
  qtd_recibos?: number | string | null;
  timeline?: unknown;
  top_destinos?: unknown;
  por_produto?: unknown;
  rebuilt_at?: string | null;
};

type CompanyComparativoRpcRow = {
  company_id?: string | null;
  total_vendas?: number | string | null;
  qtd_vendas?: number | string | null;
  total_meta?: number | string | null;
};

type MetasSummaryRpcRow = {
  meta_geral?: number | string | null;
  meta_diferenciada?: number | string | null;
  vendedor_count?: number | string | null;
};

type ComprasResumoRpcRow = {
  top_vendedores?: unknown;
  top_clientes?: unknown;
  ultimas_compras?: unknown;
  total?: number | string | null;
};

type ProdutoRelatorioRpcRow = {
  produto_id?: string | null;
  produto?: string | null;
  tipo?: string | null;
  quantidade?: number | string | null;
  receita?: number | string | null;
  lucro?: number | string | null;
};

type DestinoRelatorioRpcRow = {
  destino?: string | null;
  quantidade?: number | string | null;
  receita?: number | string | null;
};

type ClienteRelatorioRpcRow = {
  cliente_id?: string | null;
  total_compras?: number | string | null;
  total_gasto?: number | string | null;
  ultima_compra?: string | null;
};

type StatusRow = {
  company_id: string;
  mes: string;
  status: string;
  dirty_at?: string | null;
  rebuilt_at?: string | null;
};

type PersistentContributionRow = {
  company_id: string;
  mes: string;
  data_recibo: string;
  vendedor_id: string;
  cliente_id?: string | null;
  venda_id?: string | null;
  recibo_id?: string | null;
  venda_key: string;
  recibo_numero?: string | null;
  produto_id?: string | null;
  produto_nome?: string | null;
  destino_nome?: string | null;
  valor_bruto: number | string;
  valor_taxas: number | string;
  valor_seguro: number | string;
  is_seguro: boolean;
  fator: number | string;
  source_bruto: number | string;
  source_taxas: number | string;
};

const MODEL_NAME = 'recibo_contribuicoes_v4';
const TABLE_CONTRIBUICOES = 'ranking_recibo_contribuicoes';
const TABLE_STATUS = 'ranking_read_model_status';
const INSERT_CHUNK_SIZE = 500;
const READ_PAGE_SIZE = 1000;
const READ_FILTER_BATCH_SIZE = 100;
const READ_MODEL_REBUILD_CONCURRENCY = 2;
const READ_MODEL_READ_CONCURRENCY = 4;
const BACKGROUND_ENSURE_THROTTLE_MS = 60_000;

let readModelUnavailable = false;
let readModelUnavailableLogged = false;
const backgroundEnsureSchedule = new Map<string, number>();

function normalizeIds(values?: string[] | null) {
  return uniqueCleanStrings(values || []).sort();
}

function errorDetails(error: unknown) {
  return error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
}

function isUnavailableError(error: unknown) {
  const details = errorDetails(error);
  const code = toStr(details.code);
  const message = toStr(details.message).toLowerCase();
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST200' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes(TABLE_CONTRIBUICOES) ||
    message.includes(TABLE_STATUS)
  );
}

function isRpcUnavailableError(error: unknown) {
  const details = errorDetails(error);
  const code = toStr(details.code);
  const message = toStr(details.message).toLowerCase();
  return (
    isUnavailableError(error) ||
    code === '42883' ||
    code === 'PGRST202' ||
    message.includes('could not find the function') ||
    message.includes('function public.dashboard_')
  );
}

function markUnavailable(error: unknown) {
  readModelUnavailable = true;
  if (!readModelUnavailableLogged) {
    readModelUnavailableLogged = true;
    logServerError(
      '[read-model] ranking_recibo_contribuicoes indisponivel; usando calculo em tempo real.',
      error
    );
  }
}

function monthKeyFromDate(date: string) {
  return `${date.slice(0, 4)}-${date.slice(5, 7)}`;
}

function monthStartFromKey(monthKey: string) {
  return `${monthKey}-01`;
}

function monthEndFromKey(monthKey: string) {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return monthStartFromKey(monthKey);
  }
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function monthKeysBetween(inicio: string, fim: string) {
  const startYear = Number(inicio.slice(0, 4));
  const startMonth = Number(inicio.slice(5, 7));
  const endYear = Number(fim.slice(0, 4));
  const endMonth = Number(fim.slice(5, 7));
  if (
    !Number.isFinite(startYear) ||
    !Number.isFinite(startMonth) ||
    !Number.isFinite(endYear) ||
    !Number.isFinite(endMonth)
  ) {
    return [monthKeyFromDate(inicio)];
  }

  const keys: string[] = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

function buildSourceKey(contribution: VendasKpiReciboContribution, companyId: string, mes: string) {
  return [
    companyId,
    mes,
    contribution.vendedorId,
    contribution.vendaKey,
    contribution.reciboId || contribution.reciboNumero || 'sem-recibo',
    contribution.reciboDate,
    contribution.factor,
    contribution.bruto,
    contribution.taxas
  ]
    .map((part) => String(part ?? '').replace(/\|/g, '/'))
    .join('|');
}

function toUuidOrNull(value?: string | null) {
  const normalized = toStr(value);
  return isUuid(normalized) ? normalized : null;
}

function contributionToRow(
  contribution: VendasKpiReciboContribution,
  fallbackCompanyId: string,
  mes: string
) {
  const companyId = toStr(contribution.companyId) || fallbackCompanyId;
  if (!companyId || !contribution.vendedorId) return null;
  const bruto = Number(toNum(contribution.bruto).toFixed(2));
  const taxas = Number(toNum(contribution.taxas).toFixed(2));
  const sourceBruto = Number(toNum(contribution.sourceBruto).toFixed(2));
  const sourceTaxas = Number(toNum(contribution.sourceTaxas).toFixed(2));

  return {
    source_key: buildSourceKey(contribution, companyId, mes),
    company_id: companyId,
    mes,
    data_recibo: contribution.reciboDate || mes,
    vendedor_id: contribution.vendedorId,
    cliente_id: toUuidOrNull(contribution.clienteId),
    venda_id: toUuidOrNull(contribution.vendaId),
    recibo_id: toUuidOrNull(contribution.reciboId),
    venda_key: contribution.vendaKey || 'sem-venda',
    recibo_numero: contribution.reciboNumero || null,
    produto_id: toUuidOrNull(contribution.produtoId),
    produto_nome: contribution.produtoNome || null,
    destino_nome: contribution.destinoNome || null,
    valor_bruto: bruto,
    valor_taxas: taxas,
    valor_seguro: contribution.isSeguro ? bruto : 0,
    is_seguro: Boolean(contribution.isSeguro),
    fator: Number(toNum(contribution.factor).toFixed(6)),
    source_bruto: sourceBruto,
    source_taxas: sourceTaxas,
    origem: contribution.origem || 'ranking_ts',
    built_at: new Date().toISOString()
  };
}

function rowToContribution(row: PersistentContributionRow): VendasKpiReciboContribution {
  return {
    companyId: row.company_id,
    clienteId: row.cliente_id || null,
    vendaId: row.venda_id || null,
    vendaKey: row.venda_key,
    reciboId: row.recibo_id || '',
    reciboNumero: row.recibo_numero || '',
    reciboDate: String(row.data_recibo || '').slice(0, 10),
    vendaDate: String(row.data_recibo || '').slice(0, 10),
    vendedorId: row.vendedor_id,
    produtoId: row.produto_id || null,
    produtoNome: row.produto_nome || null,
    destinoNome: row.destino_nome || null,
    bruto: Number(toNum(row.valor_bruto).toFixed(2)),
    taxas: Number(toNum(row.valor_taxas).toFixed(2)),
    isSeguro: Boolean(row.is_seguro),
    factor: Number(toNum(row.fator).toFixed(6)),
    sourceBruto: Number(toNum(row.source_bruto).toFixed(2)),
    sourceTaxas: Number(toNum(row.source_taxas).toFixed(2)),
    origem: 'read_model'
  };
}

function aggregateContributions(contributions: VendasKpiReciboContribution[]): VendasKpiAgg {
  const receiptKeys = new Set<string>();
  const saleKeys = new Set<string>();
  const totalVendas = contributions.reduce((sum, item) => sum + toNum(item.bruto), 0);
  const totalTaxas = contributions.reduce((sum, item) => sum + toNum(item.taxas), 0);
  const totalSeguro = contributions.reduce(
    (sum, item) => sum + (item.isSeguro ? toNum(item.bruto) : 0),
    0
  );

  for (const item of contributions) {
    if (item.vendaKey) saleKeys.add(item.vendaKey);
    const receiptKey = [item.vendaKey, item.reciboId || item.reciboNumero, item.reciboDate].join(
      '|'
    );
    if (receiptKey.trim() !== '||') receiptKeys.add(receiptKey);
  }

  return {
    totalVendas,
    totalTaxas,
    totalLiquido: totalVendas - totalTaxas,
    totalSeguro,
    countVendas: receiptKeys.size,
    countAtivas: saleKeys.size
  };
}

function emptyContributionPayload(): ContributionPayload {
  return {
    agg: {
      totalVendas: 0,
      totalTaxas: 0,
      totalLiquido: 0,
      totalSeguro: 0,
      countVendas: 0,
      countAtivas: 0
    },
    contributions: []
  };
}

function hasContributionPayloadData(payload: ContributionPayload) {
  return (
    payload.contributions.length > 0 ||
    toNum(payload.agg.totalVendas) > 0 ||
    toNum(payload.agg.totalTaxas) > 0 ||
    toNum(payload.agg.totalSeguro) > 0 ||
    toNum(payload.agg.countVendas) > 0 ||
    toNum(payload.agg.countAtivas) > 0
  );
}

function emptyDashboardSummary(): ReadModelDashboardSummary {
  return {
    agg: emptyContributionPayload().agg,
    timeline: [],
    topDestinos: [],
    porProduto: []
  };
}

function rpcIdArray(values?: string[] | null) {
  const ids = normalizeIds(values);
  return ids.length > 0 ? ids : null;
}

function parseJsonArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value))
    return value.filter((item) => item && typeof item === 'object') as Array<
      Record<string, unknown>
    >;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? (parsed.filter((item) => item && typeof item === 'object') as Array<
            Record<string, unknown>
          >)
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeDashboardSummaryRow(
  row?: DashboardSummaryRpcRow | null
): ReadModelDashboardSummary {
  if (!row) return emptyDashboardSummary();
  const totalVendas = toNum(row.total_vendas);
  const totalTaxas = toNum(row.total_taxas);
  const totalSeguro = toNum(row.total_seguro);
  return {
    agg: {
      totalVendas,
      totalTaxas,
      totalLiquido: totalVendas - totalTaxas,
      totalSeguro,
      countVendas: Math.max(0, Math.round(toNum(row.qtd_recibos))),
      countAtivas: Math.max(0, Math.round(toNum(row.qtd_vendas)))
    },
    timeline: parseJsonArray(row.timeline)
      .map((item) => ({
        date: toStr(item.date),
        value: toNum(item.value)
      }))
      .filter((item) => item.date),
    topDestinos: parseJsonArray(row.top_destinos).map((item) => ({
      name: toStr(item.name) || 'Destino nao informado',
      value: toNum(item.value),
      count: Math.max(0, Math.round(toNum(item.count)))
    })),
    porProduto: parseJsonArray(row.por_produto).map((item) => ({
      id: toStr(item.id) || 'sem-produto',
      name: toStr(item.name) || 'Produto',
      value: toNum(item.value)
    })),
    rebuiltAt: toStr(row.rebuilt_at) || null
  };
}

function normalizeNullableString(value: unknown) {
  return toStr(value) || null;
}

function normalizeComprasResumoRow(row?: ComprasResumoRpcRow | null): ReadModelComprasResumo {
  return {
    topVendedores: parseJsonArray(row?.top_vendedores).map((item) => ({
      vendedor_id: toStr(item.vendedor_id),
      vendedor_nome: toStr(item.vendedor_nome) || 'Vendedor não informado',
      valor: toNum(item.valor),
      quantidade: Math.max(0, Math.round(toNum(item.quantidade)))
    })),
    topClientes: parseJsonArray(row?.top_clientes).map((item) => ({
      cliente_id: normalizeNullableString(item.cliente_id),
      cliente_nome: toStr(item.cliente_nome) || 'Cliente sem nome',
      data_saida: normalizeNullableString(item.data_saida),
      destino: toStr(item.destino) || 'Destino não informado',
      valor: toNum(item.valor),
      quantidade: Math.max(0, Math.round(toNum(item.quantidade)))
    })),
    ultimasCompras: parseJsonArray(row?.ultimas_compras)
      .map((item) => ({
        id: toStr(item.id),
        numero_venda: normalizeNullableString(item.numero_venda),
        cliente_id: normalizeNullableString(item.cliente_id),
        cliente_nome: toStr(item.cliente_nome) || 'Cliente sem nome',
        cliente_email: normalizeNullableString(item.cliente_email),
        cliente_telefone: normalizeNullableString(item.cliente_telefone),
        cliente_whatsapp: normalizeNullableString(item.cliente_whatsapp),
        cliente_nascimento: normalizeNullableString(item.cliente_nascimento),
        vendedor_id: normalizeNullableString(item.vendedor_id),
        vendedor_nome: toStr(item.vendedor_nome) || 'Vendedor não informado',
        company_id: normalizeNullableString(item.company_id),
        data_compra: normalizeNullableString(item.data_compra),
        data_saida: normalizeNullableString(item.data_saida),
        destino: toStr(item.destino) || 'Destino não informado',
        valor: toNum(item.valor)
      }))
      .filter((item) => item.id),
    total: Math.max(0, Math.round(toNum(row?.total)))
  };
}

/** Instante em que o mês termina em Brasília (dia 1 do mês seguinte, 00:00 -03:00). */
function monthEndInstantBrazil(monthStart: string): number {
  const [year, month] = String(monthStart).slice(0, 10).split('-').map(Number);
  return Date.UTC(year, month, 1, 3, 0, 0);
}

export function isStatusReady(row?: StatusRow | null, nowMs: number = Date.now()) {
  if (!row || row.status !== 'ready' || !row.rebuilt_at) return false;
  const rebuiltAtMs = new Date(row.rebuilt_at).getTime();
  // Mês já encerrado, mas montado ANTES de terminar (ex.: julho montado em 01/07,
  // ainda vazio): não conta como pronto, para ser refeito uma vez. Depois disso o
  // rebuilt_at fica posterior ao fim do mês e volta a valer. A rodada noturna usa a
  // mesma regra (selectNightlyDirtyMonths em readModelRebuild.ts).
  const monthEnd = monthEndInstantBrazil(row.mes);
  if (nowMs >= monthEnd && rebuiltAtMs < monthEnd) return false;
  if (!row.dirty_at) return true;
  return rebuiltAtMs >= new Date(row.dirty_at).getTime();
}

async function fetchStatusRows(client: DataClient, companyIds: string[], monthStarts: string[]) {
  const batchRows = await Promise.all(
    chunkArray(companyIds, READ_FILTER_BATCH_SIZE).flatMap((companyBatch) =>
      chunkArray(monthStarts, READ_FILTER_BATCH_SIZE).map(async (monthBatch) => {
        const { data, error } = await client
          .from(TABLE_STATUS)
          .select('company_id, mes, status, dirty_at, rebuilt_at')
          .eq('modelo', MODEL_NAME)
          .in('company_id', companyBatch)
          .in('mes', monthBatch);

        if (error) throw error;
        return (data || []) as StatusRow[];
      })
    )
  );

  return batchRows.flat();
}

async function mapLimited<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let index = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (;;) {
        const currentIndex = index;
        index += 1;
        if (currentIndex >= items.length) return;
        results[currentIndex] = await worker(items[currentIndex]);
      }
    })
  );
  return results;
}

async function runLimited<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  await mapLimited(items, concurrency, worker);
}

async function upsertStatus(
  client: DataClient,
  companyId: string,
  mes: string,
  values: Partial<StatusRow> & { last_error?: string | null }
) {
  const { error } = await client.from(TABLE_STATUS).upsert(
    {
      modelo: MODEL_NAME,
      company_id: companyId,
      mes,
      ...values,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'modelo,company_id,mes' }
  );
  if (error) throw error;
}

function currentMonthKeyLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function previousMonthKeyLocal() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function markMonthsDirty(companyIds: string[], monthKeys: string[]) {
  const ids = normalizeIds(companyIds);
  const keys = uniqueCleanStrings(monthKeys);
  if (ids.length === 0 || keys.length === 0) return;
  const client = getAdminClient();
  await Promise.all(
    ids.flatMap((companyId) =>
      keys.map((monthKey) =>
        upsertStatus(client, companyId, monthStartFromKey(monthKey), {
          status: 'dirty',
          dirty_at: new Date().toISOString()
        }).catch((err) => {
          logServerError(
            '[reciboContribuicoesReadModel] falha ao marcar read model v4 como dirty',
            err
          );
        })
      )
    )
  );
}

// Liga invalidateSalesReadModels() (readModelCache.ts) a este modulo: toda
// invalidacao de vendas com escopo de empresa tambem marca o mes atual e o
// anterior como dirty aqui. Desde a migration 20260924184114 o banco tambem
// marca o v4 como dirty por trigger (vendas, recibos, rateio, conciliacao),
// entao esta marcacao pela aplicacao fica como reforco, nao como unica fonte.
// O proximo dashboard/summary para essa empresa ja chama
// scheduleReciboContribuicoesReadModelEnsure() (ver fetchVendasKpiDashboardSummary
// em vendas-kpis.ts), que detecta o status dirty e reconstroi o read model
// em vez de continuar servindo os dados persistidos desatualizados.
registerSalesReadModelDirtyMarker((scope) => {
  const companyIds = normalizeIds(scope?.companyIds);
  if (companyIds.length === 0) return;
  const monthKeys = [currentMonthKeyLocal(), previousMonthKeyLocal()];
  void markMonthsDirty(companyIds, monthKeys);
});

async function rebuildMonth(
  client: DataClient,
  companyId: string,
  monthKey: string,
  rawLoader: RawLoader
) {
  const mes = monthStartFromKey(monthKey);
  const dataInicio = mes;
  const dataFim = monthEndFromKey(monthKey);

  await upsertStatus(client, companyId, mes, {
    status: 'rebuilding',
    dirty_at: null,
    rebuilt_at: null,
    last_error: null
  });

  try {
    const payload = await rawLoader({
      dataInicio,
      dataFim,
      companyIds: [companyId],
      vendedorIds: [],
      accessibleClientIds: []
    });

    const builtRows = payload.contributions
      .map((contribution) => contributionToRow(contribution, companyId, mes))
      .filter((row): row is NonNullable<ReturnType<typeof contributionToRow>> => Boolean(row));

    // recibo_id que não existe em vendas_recibos (recibo só da conciliação) vira null,
    // sem mudar nenhuma contagem — ver readModelRowGuard.ts. Roda ANTES de apagar o mês.
    const { rows } = await guardContributionRowsForeignKeys(client, builtRows);

    const { error: deleteError } = await client
      .from(TABLE_CONTRIBUICOES)
      .delete()
      .eq('company_id', companyId)
      .eq('mes', mes);

    if (deleteError) throw deleteError;

    for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
      const chunk = rows.slice(index, index + INSERT_CHUNK_SIZE);
      if (chunk.length === 0) continue;
      const { error } = await client
        .from(TABLE_CONTRIBUICOES)
        .upsert(chunk, { onConflict: 'source_key' });
      if (error) throw error;
    }

    // So marca 'ready' se ninguem marcou 'dirty' durante o rebuild (trigger do
    // banco ou invalidateSalesReadModels). Caso contrario o mes continua
    // 'dirty' e e reconstruido de novo no proximo acesso -- sem perder a escrita.
    const nowIso = new Date().toISOString();
    const { error: finishError } = await client
      .from(TABLE_STATUS)
      .update({
        status: 'ready',
        dirty_at: null,
        rebuilt_at: nowIso,
        last_error: null,
        updated_at: nowIso
      })
      .eq('modelo', MODEL_NAME)
      .eq('company_id', companyId)
      .eq('mes', mes)
      .eq('status', 'rebuilding');
    if (finishError) throw finishError;
  } catch (error) {
    const details = errorDetails(error);
    await upsertStatus(client, companyId, mes, {
      status: 'error',
      dirty_at: new Date().toISOString(),
      rebuilt_at: null,
      last_error: String(details.message || error).slice(0, 500)
    }).catch(() => undefined);
    throw error;
  }
}

async function ensureReadModelReady(
  client: DataClient,
  params: ReadModelParams,
  rawLoader: RawLoader
) {
  const companyIds = normalizeIds(params.companyIds);
  const monthKeys = monthKeysBetween(params.dataInicio, params.dataFim);
  const monthStarts = monthKeys.map(monthStartFromKey);

  const statuses = await fetchStatusRows(client, companyIds, monthStarts);
  const statusMap = new Map(
    statuses.map((row) => [`${row.company_id}|${String(row.mes).slice(0, 10)}`, row])
  );

  const pendingRebuilds: Array<{ companyId: string; monthKey: string }> = [];
  for (const companyId of companyIds) {
    for (const monthKey of monthKeys) {
      const mes = monthStartFromKey(monthKey);
      if (isStatusReady(statusMap.get(`${companyId}|${mes}`))) continue;
      pendingRebuilds.push({ companyId, monthKey });
    }
  }

  await runLimited(pendingRebuilds, READ_MODEL_REBUILD_CONCURRENCY, ({ companyId, monthKey }) =>
    rebuildMonth(client, companyId, monthKey, rawLoader)
  );
}

async function readPersistentContributions(client: DataClient, params: ReadModelParams) {
  const companyIds = normalizeIds(params.companyIds);
  const vendedorIds = normalizeIds(params.vendedorIds);
  const accessibleClientIds = normalizeIds(params.accessibleClientIds);
  const readBatch = async (filters?: {
    companyIds?: string[] | null;
    vendedorIds?: string[] | null;
    clientIds?: string[] | null;
  }) => {
    const rows: PersistentContributionRow[] = [];
    for (let from = 0; ; from += READ_PAGE_SIZE) {
      let query = client
        .from(TABLE_CONTRIBUICOES)
        .select(
          'company_id, mes, data_recibo, vendedor_id, cliente_id, venda_id, recibo_id, venda_key, recibo_numero, produto_id, produto_nome, destino_nome, valor_bruto, valor_taxas, valor_seguro, is_seguro, fator, source_bruto, source_taxas'
        )
        .gte('data_recibo', params.dataInicio)
        .lte('data_recibo', params.dataFim)
        .order('data_recibo', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + READ_PAGE_SIZE - 1);

      if (filters?.companyIds && filters.companyIds.length > 0) {
        query = query.in('company_id', filters.companyIds);
      }
      if (filters?.vendedorIds && filters.vendedorIds.length > 0) {
        query = query.in('vendedor_id', filters.vendedorIds);
      }
      if (filters?.clientIds && filters.clientIds.length > 0) {
        query = query.in('cliente_id', filters.clientIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      const page = (data || []) as PersistentContributionRow[];
      rows.push(...page);
      if (page.length < READ_PAGE_SIZE) break;
    }
    return rows;
  };

  const companyBatches =
    companyIds.length > 0 ? chunkArray(companyIds, READ_FILTER_BATCH_SIZE) : [null];
  const vendedorBatches =
    vendedorIds.length > 0 ? chunkArray(vendedorIds, READ_FILTER_BATCH_SIZE) : [null];
  const readFilters: Array<Parameters<typeof readBatch>[0]> = [];

  if (vendedorIds.length === 0 && accessibleClientIds.length > 0) {
    for (const companyBatch of companyBatches) {
      for (const clientBatch of chunkArray(accessibleClientIds, READ_FILTER_BATCH_SIZE)) {
        readFilters.push({
          companyIds: companyBatch,
          clientIds: clientBatch
        });
      }
    }
  } else {
    for (const companyBatch of companyBatches) {
      for (const vendedorBatch of vendedorBatches) {
        readFilters.push({
          companyIds: companyBatch,
          vendedorIds: vendedorBatch
        });
      }
    }
  }

  const rows = (await mapLimited(readFilters, READ_MODEL_READ_CONCURRENCY, readBatch)).flat();
  const contributions = rows.map(rowToContribution);
  return {
    agg: aggregateContributions(contributions),
    contributions
  };
}

function scheduleReadModelEnsure(
  client: DataClient,
  params: ReadModelParams,
  rawLoader: RawLoader,
  executionContext?: ReciboContribuicoesReadModelOptions['executionContext']
) {
  const companyIds = normalizeIds(params.companyIds);
  if (companyIds.length === 0) return;

  const key = buildReadModelCacheKey('recibo-contribuicoes:background-ensure', {
    dataInicio: params.dataInicio,
    dataFim: params.dataFim,
    companyIds
  });
  const now = Date.now();
  const lastScheduledAt = backgroundEnsureSchedule.get(key) || 0;
  if (now - lastScheduledAt < BACKGROUND_ENSURE_THROTTLE_MS) return;
  backgroundEnsureSchedule.set(key, now);

  const ensurePromise = ensureReadModelReady(client, { ...params, companyIds }, rawLoader).catch(
    (error) => {
      logServerError('[read-model] reconstrução em background falhou', error);
    }
  );

  if (executionContext?.waitUntil) {
    executionContext.waitUntil(ensurePromise);
  } else {
    void ensurePromise;
  }
}

export function scheduleReciboContribuicoesReadModelEnsure(
  _client: DataClient,
  params: ReadModelParams,
  rawLoader: RawLoader,
  executionContext?: ReciboContribuicoesReadModelOptions['executionContext']
) {
  const companyIds = normalizeIds(params.companyIds);
  if (companyIds.length === 0 || readModelUnavailable) return;
  scheduleReadModelEnsure(getAdminClient(), { ...params, companyIds }, rawLoader, executionContext);
}

/**
 * Data da reconstrução MAIS ANTIGA entre os meses/empresas exibidos — é o
 * "Dados atualizados há X min" do dashboard (Fase 3). A RPC de resumo não
 * devolve rebuilt_at, por isso o valor vem de ranking_read_model_status.
 * Só leitura; qualquer falha resulta em null (o dashboard não é afetado).
 */
export function oldestRebuiltAt(rows: Array<{ rebuilt_at?: string | null }>): string | null {
  let oldest: number | null = null;
  for (const row of rows) {
    const time = row?.rebuilt_at ? new Date(row.rebuilt_at).getTime() : NaN;
    if (!Number.isFinite(time)) continue;
    if (oldest === null || time < oldest) oldest = time;
  }
  return oldest === null ? null : new Date(oldest).toISOString();
}

async function fetchReadModelRebuiltAt(params: ReadModelParams): Promise<string | null> {
  const companyIds = normalizeIds(params.companyIds);
  if (companyIds.length === 0) return null;
  try {
    const monthStarts = monthKeysBetween(params.dataInicio, params.dataFim).map(monthStartFromKey);
    const rows = await fetchStatusRows(getAdminClient(), companyIds, monthStarts);
    return oldestRebuiltAt(rows);
  } catch {
    return null;
  }
}

export async function fetchDashboardSummaryReadModelRpc(
  _client: DataClient,
  params: ReadModelParams
): Promise<ReadModelDashboardSummary | null> {
  if (readModelUnavailable) return null;

  try {
    const [{ data, error }, rebuiltAt] = await Promise.all([
      getAdminClient().rpc('dashboard_vendas_summary_from_read_model', {
        p_company_ids: rpcIdArray(params.companyIds),
        p_vendedor_ids: rpcIdArray(params.vendedorIds),
        p_cliente_ids: rpcIdArray(params.accessibleClientIds),
        p_inicio: params.dataInicio,
        p_fim: params.dataFim
      }),
      fetchReadModelRebuiltAt(params)
    ]);

    if (error) {
      if (!isRpcUnavailableError(error)) {
        logServerError(
          '[read-model] RPC dashboard_vendas_summary_from_read_model falhou; usando fallback.',
          error
        );
      }
      return null;
    }

    const row = Array.isArray(data)
      ? (data[0] as DashboardSummaryRpcRow | undefined)
      : (data as DashboardSummaryRpcRow | null);
    const summary = normalizeDashboardSummaryRow(row);
    if (summary && !summary.rebuiltAt) summary.rebuiltAt = rebuiltAt;
    return summary;
  } catch (error) {
    if (!isRpcUnavailableError(error)) {
      logServerError(
        '[read-model] erro ao executar RPC de resumo do dashboard; usando fallback.',
        error
      );
    }
    return null;
  }
}

export async function fetchCompanyComparativoReadModelRpc(
  _client: DataClient,
  params: {
    dataInicio: string;
    dataFim: string;
    metaInicio: string;
    metaFim: string;
    companyIds: string[];
  }
): Promise<ReadModelCompanyComparativoRow[] | null> {
  const companyIds = normalizeIds(params.companyIds);
  if (readModelUnavailable || companyIds.length === 0) return null;

  try {
    const { data, error } = await getAdminClient().rpc(
      'dashboard_empresa_comparativo_from_read_model',
      {
        p_company_ids: companyIds,
        p_inicio: params.dataInicio,
        p_fim: params.dataFim,
        p_meta_inicio: params.metaInicio,
        p_meta_fim: params.metaFim
      }
    );

    if (error) {
      if (!isRpcUnavailableError(error)) {
        logServerError(
          '[read-model] RPC dashboard_empresa_comparativo_from_read_model falhou; usando fallback.',
          error
        );
      }
      return null;
    }

    return ((data || []) as CompanyComparativoRpcRow[])
      .map((row) => ({
        company_id: toStr(row.company_id),
        totalVendas: toNum(row.total_vendas),
        qtdVendas: Math.max(0, Math.round(toNum(row.qtd_vendas))),
        totalMeta: toNum(row.total_meta)
      }))
      .filter((row) => row.company_id);
  } catch (error) {
    if (!isRpcUnavailableError(error)) {
      logServerError(
        '[read-model] erro ao executar RPC de comparativo por empresa; usando fallback.',
        error
      );
    }
    return null;
  }
}

export async function fetchDashboardMetasSummaryRpc(
  _client: DataClient,
  params: {
    dataInicio: string;
    dataFim: string;
    companyIds: string[];
    vendedorIds: string[];
  }
): Promise<ReadModelMetasSummary | null> {
  try {
    const { data, error } = await getAdminClient().rpc('dashboard_metas_summary', {
      p_company_ids: rpcIdArray(params.companyIds),
      p_vendedor_ids: rpcIdArray(params.vendedorIds),
      p_inicio: params.dataInicio,
      p_fim: params.dataFim
    });

    if (error) {
      if (!isRpcUnavailableError(error)) {
        logServerError('[read-model] RPC dashboard_metas_summary falhou; usando fallback.', error);
      }
      return null;
    }

    const row = Array.isArray(data)
      ? (data[0] as MetasSummaryRpcRow | undefined)
      : (data as MetasSummaryRpcRow | null);
    return {
      metaGeral: toNum(row?.meta_geral),
      metaDiferenciada: toNum(row?.meta_diferenciada),
      vendedorCount: Math.max(0, Math.round(toNum(row?.vendedor_count)))
    };
  } catch (error) {
    if (!isRpcUnavailableError(error)) {
      logServerError(
        '[read-model] erro ao executar RPC de metas do dashboard; usando fallback.',
        error
      );
    }
    return null;
  }
}

export async function fetchDashboardComprasResumoRpc(
  _client: DataClient,
  params: {
    dataInicio: string;
    dataFim: string;
    companyIds: string[];
    vendedorIds: string[];
    limit: number;
  }
): Promise<ReadModelComprasResumo | null> {
  if (readModelUnavailable) return null;

  try {
    const { data, error } = await getAdminClient().rpc('dashboard_compras_resumo_from_read_model', {
      p_company_ids: rpcIdArray(params.companyIds),
      p_vendedor_ids: rpcIdArray(params.vendedorIds),
      p_inicio: params.dataInicio,
      p_fim: params.dataFim,
      p_limit: params.limit
    });

    if (error) {
      if (!isRpcUnavailableError(error)) {
        logServerError(
          '[read-model] RPC dashboard_compras_resumo_from_read_model falhou; usando fallback.',
          error
        );
      }
      return null;
    }

    const row = Array.isArray(data)
      ? (data[0] as ComprasResumoRpcRow | undefined)
      : (data as ComprasResumoRpcRow | null);
    return normalizeComprasResumoRow(row);
  } catch (error) {
    if (!isRpcUnavailableError(error)) {
      logServerError(
        '[read-model] erro ao executar RPC de compras do dashboard; usando fallback.',
        error
      );
    }
    return null;
  }
}

export async function fetchRelatorioProdutosReadModelRpc(
  _client: DataClient,
  params: {
    dataInicio: string;
    dataFim: string;
    companyIds: string[];
    vendedorIds: string[];
  }
): Promise<ReadModelProdutoRelatorioRow[] | null> {
  if (readModelUnavailable) return null;

  try {
    const { data, error } = await getAdminClient().rpc('relatorio_produtos_from_read_model', {
      p_company_ids: rpcIdArray(params.companyIds),
      p_vendedor_ids: rpcIdArray(params.vendedorIds),
      p_inicio: params.dataInicio,
      p_fim: params.dataFim
    });

    if (error) {
      if (!isRpcUnavailableError(error)) {
        logServerError(
          '[read-model] RPC relatorio_produtos_from_read_model falhou; usando fallback.',
          error
        );
      }
      return null;
    }

    return ((data || []) as ProdutoRelatorioRpcRow[]).map((row) => ({
      produto_id: normalizeNullableString(row.produto_id),
      produto: toStr(row.produto) || 'Produto nao informado',
      tipo: toStr(row.tipo) || 'Produto',
      quantidade: Math.max(0, Math.round(toNum(row.quantidade))),
      receita: toNum(row.receita),
      lucro: toNum(row.lucro)
    }));
  } catch (error) {
    if (!isRpcUnavailableError(error)) {
      logServerError('[read-model] erro ao executar RPC de produtos; usando fallback.', error);
    }
    return null;
  }
}

export async function fetchRelatorioDestinosReadModelRpc(
  _client: DataClient,
  params: {
    dataInicio: string;
    dataFim: string;
    companyIds: string[];
    vendedorIds: string[];
  }
): Promise<ReadModelDestinoRelatorioRow[] | null> {
  if (readModelUnavailable) return null;

  try {
    const { data, error } = await getAdminClient().rpc('relatorio_destinos_from_read_model', {
      p_company_ids: rpcIdArray(params.companyIds),
      p_vendedor_ids: rpcIdArray(params.vendedorIds),
      p_inicio: params.dataInicio,
      p_fim: params.dataFim
    });

    if (error) {
      if (!isRpcUnavailableError(error)) {
        logServerError(
          '[read-model] RPC relatorio_destinos_from_read_model falhou; usando fallback.',
          error
        );
      }
      return null;
    }

    return ((data || []) as DestinoRelatorioRpcRow[]).map((row) => ({
      destino: toStr(row.destino) || 'Destino nao informado',
      quantidade: Math.max(0, Math.round(toNum(row.quantidade))),
      receita: toNum(row.receita)
    }));
  } catch (error) {
    if (!isRpcUnavailableError(error)) {
      logServerError('[read-model] erro ao executar RPC de destinos; usando fallback.', error);
    }
    return null;
  }
}

export async function fetchRelatorioClientesReadModelRpc(
  _client: DataClient,
  params: {
    dataInicio: string;
    dataFim: string;
    companyIds: string[];
    vendedorIds: string[];
  }
): Promise<ReadModelClienteRelatorioRow[] | null> {
  if (readModelUnavailable) return null;

  try {
    const { data, error } = await getAdminClient().rpc('relatorio_clientes_from_read_model', {
      p_company_ids: rpcIdArray(params.companyIds),
      p_vendedor_ids: rpcIdArray(params.vendedorIds),
      p_inicio: params.dataInicio,
      p_fim: params.dataFim
    });

    if (error) {
      if (!isRpcUnavailableError(error)) {
        logServerError(
          '[read-model] RPC relatorio_clientes_from_read_model falhou; usando fallback.',
          error
        );
      }
      return null;
    }

    return ((data || []) as ClienteRelatorioRpcRow[]).map((row) => ({
      cliente_id: normalizeNullableString(row.cliente_id),
      total_compras: Math.max(0, Math.round(toNum(row.total_compras))),
      total_gasto: toNum(row.total_gasto),
      ultima_compra: normalizeNullableString(row.ultima_compra)
    }));
  } catch (error) {
    if (!isRpcUnavailableError(error)) {
      logServerError('[read-model] erro ao executar RPC de clientes; usando fallback.', error);
    }
    return null;
  }
}

export async function fetchReciboContribuicoesReadModel(
  _client: DataClient,
  params: ReadModelParams,
  rawLoader: RawLoader,
  rebuildRawLoader: RawLoader = rawLoader,
  options: ReciboContribuicoesReadModelOptions = {}
): Promise<ContributionPayload> {
  const companyIds = normalizeIds(params.companyIds);
  if (companyIds.length === 0) {
    return rawLoader(params);
  }
  if (readModelUnavailable) {
    if (options.mode === 'stale-while-revalidate' && options.fallbackToRawOnReadError === false) {
      return emptyContributionPayload();
    }
    return rawLoader(params);
  }

  try {
    const modelClient = getAdminClient();
    if (options.mode === 'stale-while-revalidate') {
      try {
        const monthStarts = monthKeysBetween(params.dataInicio, params.dataFim).map(
          monthStartFromKey
        );
        const statuses = await fetchStatusRows(modelClient, companyIds, monthStarts);
        const statusMap = new Map(
          statuses.map((row) => [`${row.company_id}|${String(row.mes).slice(0, 10)}`, row])
        );
        const allReady = companyIds.every((companyId) =>
          monthStarts.every((mes) => isStatusReady(statusMap.get(`${companyId}|${mes}`)))
        );

        if (!allReady) {
          scheduleReadModelEnsure(
            modelClient,
            { ...params, companyIds },
            rebuildRawLoader,
            options.executionContext
          );
          if (options.fallbackToRawOnReadError !== false) return rawLoader(params);
          return emptyContributionPayload();
        }

        const payload = await readPersistentContributions(modelClient, {
          ...params,
          companyIds
        });
        scheduleReadModelEnsure(
          modelClient,
          { ...params, companyIds },
          rebuildRawLoader,
          options.executionContext
        );
        if (options.fallbackToRawWhenEmpty && !hasContributionPayloadData(payload)) {
          return rawLoader(params);
        }
        return payload;
      } catch (error) {
        if (isUnavailableError(error)) {
          markUnavailable(error);
          if (options.fallbackToRawOnReadError !== false) return rawLoader(params);
          return emptyContributionPayload();
        }
        logServerError(
          '[read-model] falha ao ler dados persistidos em modo stale; seguindo sem bloquear.',
          error
        );
        scheduleReadModelEnsure(
          modelClient,
          { ...params, companyIds },
          rebuildRawLoader,
          options.executionContext
        );
        if (options.fallbackToRawOnReadError !== false) return rawLoader(params);
        return emptyContributionPayload();
      }
    }

    await ensureReadModelReady(modelClient, { ...params, companyIds }, rebuildRawLoader);
    return await readPersistentContributions(modelClient, {
      ...params,
      companyIds
    });
  } catch (error) {
    if (isUnavailableError(error)) {
      markUnavailable(error);
      return rawLoader(params);
    }
    logServerError(
      '[read-model] falha ao usar ranking_recibo_contribuicoes; usando calculo em tempo real.',
      error
    );
    return rawLoader(params);
  }
}
