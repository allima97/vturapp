import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchEffectiveConciliacaoReceipts,
  fetchSuppressedConciliacaoReceipts,
  filterRecibosCanceladosMesmoMes,
} from "$lib/conciliacao/source";
import { mergeEffectiveRecibos } from "$lib/conciliacao/mergeEffectiveRecibos";
import {
  fetchSalesReportRows,
  getReceiptCidadeNome,
  getVendaDestino,
  type DestinationCityNameMap,
  type ReportReceiptRow,
  type ReportVendaRow,
} from "$lib/server/relatorios";
import { calcularRankingComissionavel } from "$lib/server/rankingComissionavel";
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags,
} from "$lib/server/readModelCache";
import {
  fetchDashboardSummaryReadModelRpc,
  fetchReciboContribuicoesReadModel,
  scheduleReciboContribuicoesReadModelEnsure,
  type ReciboContribuicoesReadModelOptions,
} from "$lib/server/reciboContribuicoesReadModel";
import { getAdminClient, logServerError } from "$lib/server/v1";
import {
  fetchRateioByReciboIds,
  fetchSplitSaleIdsForDestinationVendedores,
  isUuid,
  type RateioRow,
} from "$lib/vendas/rateio";
import { normalizeReceiptNumber } from "$lib/conciliacao/receiptNumber";
import { cleanStringSet, chunkArray, uniqueCleanStrings } from "$lib/utils/array";
import { toCleanString as toStr, toFiniteNumber as toNum } from "$lib/utils/values";
import { isFormaNaoComissionavel } from '$lib/naoComissionavel';
import { carregarTermosNaoComissionaveis as carregarTermosNaoComissionaveisBase } from '$lib/server/naoComissionavelTermos';

type PagamentoNaoComissionavelInput = {
  venda_id?: string | null;
  venda_recibo_id?: string | null;
  valor_total?: number | null;
  valor_bruto?: number | null;
  desconto_valor?: number | null;
  paga_comissao?: boolean | null;
  forma_nome?: string | null;
  operacao?: string | null;
  plano?: string | null;
  forma?: { nome?: string | null; paga_comissao?: boolean | null } | null;
};

type PagamentosNaoComissionaveisResumo = {
  porVenda: Map<string, number>;
  porVendaSemRecibo: Map<string, number>;
  porRecibo: Map<string, number>;
};

type VendaAggregateRow = ReportVendaRow & {
  source_venda_id?: string | null;
  linked_venda_id?: string | null;
  linked_recibo_id?: string | null;
  vendas_recibos?: ReportReceiptRow[] | null;
};

type VendaAggregateRowExtra = VendaAggregateRow & {
  destino_id?: string | null;
  valor_total?: number | string | null;
  valor_total_bruto?: number | string | null;
  status?: string | null;
  company_id?: string | null;
  cliente_id?: string | null;
  destino_cidade?: { id?: string | null; nome?: string | null } | null;
  destinos?: { nome?: string | null; cidade_id?: string | null } | null;
};

type NonNullReceiptRow = Exclude<ReportReceiptRow, null>;

type ScopedReceiptRow = NonNullReceiptRow & {
  rateio_scope_vendor_id?: string | null;
};

type SeguroReceiptFlags = ReportReceiptRow & {
  _conciliacao_is_seguro?: boolean | null;
  is_seguro_viagem?: boolean | null;
};

type IdOnlyRow = {
  id?: string | null;
};

type CompanyIdOnlyRow = {
  company_id?: string | null;
};


type VendaRowWithReceiptAliases = ReportVendaRow & {
  recibos?: ReportReceiptRow[] | null;
  vendas_recibos?: ReportReceiptRow[] | null;
};

type ConciliacaoIdSource = {
  id?: string | null;
  conciliacao_ids?: Array<string | number | null | undefined> | null;
};

type EffectiveConciliacaoReceipt = Awaited<
  ReturnType<typeof fetchEffectiveConciliacaoReceipts>
>[number];

type SplitConciliacaoRow = {
  conciliacao_recibo_id?: string | null;
};

function collectDestinationCityIds(rows: VendaAggregateRow[]) {
  const ids = new Set<string>();
  const add = (value?: string | null) => {
    const id = toStr(value);
    if (id) ids.add(id);
  };

  for (const row of rows) {
    const rowExtra = row as VendaAggregateRowExtra;
    add(rowExtra.destino_cidade?.id);
    add(rowExtra.destinos?.cidade_id);

    const recibos = Array.isArray(row?.vendas_recibos)
      ? row.vendas_recibos
      : Array.isArray(row?.recibos)
        ? row.recibos
        : [];

    for (const recibo of recibos) {
      add(recibo?.destino_cidade?.id);
      add(recibo?.produto_resolvido?.cidade_id);
    }
  }

  return Array.from(ids).sort();
}

async function fetchDestinationCityNames(
  client: SupabaseClient,
  rows: VendaAggregateRow[],
): Promise<DestinationCityNameMap> {
  const ids = uniqueCleanStrings(collectDestinationCityIds(rows)).sort();
  if (ids.length === 0) return new Map();

  return getCachedReadModel<Map<string, string>>({
    key: buildReadModelCacheKey("vendas-kpis:cidades-destino", { ids }),
    tags: [READ_MODEL_TAGS.catalog],
    ttlMs: 300_000,
    staleTtlMs: 1_800_000,
    loader: async () => {
      const map = new Map<string, string>();
      const batches = await Promise.all(
        chunkArray(ids, 200).map(async (batch) => {
          const { data, error } = await client
            .from("cidades")
            .select("id, nome")
            .in("id", batch);
          if (error) throw error;
          return data || [];
        }),
      );

      for (const row of batches.flat() as Array<{ id?: string | null; nome?: string | null }>) {
        const id = toStr(row?.id);
        const nome = toStr(row?.nome);
        if (id && nome) map.set(id, nome);
      }

      return map;
    },
  });
}

export type VendasKpiAgg = {
  totalVendas: number;
  totalTaxas: number;
  totalLiquido: number;
  totalSeguro: number;
  countVendas: number;
  countAtivas: number;
};

export type VendasTimelinePoint = {
  date: string;
  value: number;
};

export type VendasKpiDashboardSummary = {
  agg: VendasKpiAgg;
  timeline: VendasTimelinePoint[];
  topDestinos: Array<{ name: string; value: number; count: number }>;
  porProduto: Array<{ id: string; name: string; value: number }>;
  /** Última reconstrução do read model (só no caminho do read model; null/ausente no caminho raw). */
  rebuiltAt?: string | null;
};

export type VendasKpiReciboContribution = {
  companyId?: string | null;
  clienteId?: string | null;
  vendaId?: string | null;
  vendaKey: string;
  reciboId: string;
  reciboNumero: string;
  reciboDate: string;
  vendaDate: string;
  vendedorId: string;
  produtoId?: string | null;
  produtoNome?: string | null;
  destinoNome?: string | null;
  bruto: number;
  taxas: number;
  isSeguro: boolean;
  factor: number;
  sourceBruto: number;
  sourceTaxas: number;
  origem?: string | null;
};


function toDateKey(value?: string | null) {
  return String(value || "").slice(0, 10);
}


function normalizeCompanyScopeIds(companyIds?: string[] | null) {
  return uniqueCleanStrings(companyIds || []);
}

function normalizeIdScope(values?: string[] | null) {
  return uniqueCleanStrings(values || []).sort();
}

function buildScopeIdSet(values?: string[] | null) {
  const ids = new Set<string>();
  for (const value of values || []) {
    const id = toStr(value);
    if (id) ids.add(id);
  }
  return ids;
}

function buildVendaIdsFromRows(rows: VendaAggregateRow[]) {
  const ids = new Set<string>();
  for (const row of rows) {
    const id = toStr(row.source_venda_id || row.id);
    if (isUuid(id)) ids.add(id);
  }
  return Array.from(ids);
}


function calcularValorPagamento(pagamento: PagamentoNaoComissionavelInput) {
  const total = Number(pagamento.valor_total || 0);
  if (total > 0) return total;
  const bruto = Number(pagamento.valor_bruto || 0);
  const desconto = Number(pagamento.desconto_valor || 0);
  if (bruto > 0) return Math.max(0, bruto - desconto);
  return 0;
}

function addToMap(map: Map<string, number>, key: string, value: number) {
  if (!key || value <= 0) return;
  map.set(key, (map.get(key) || 0) + value);
}

function calcularNaoComissionavelResumo(
  pagamentos: PagamentoNaoComissionavelInput[],
  termos?: string[] | null,
): PagamentosNaoComissionaveisResumo {
  const porVenda = new Map<string, number>();
  const porVendaSemRecibo = new Map<string, number>();
  const porRecibo = new Map<string, number>();

  for (const pagamento of pagamentos) {
    const vendaId = toStr(pagamento.venda_id);
    if (!vendaId) continue;

    const formaNomeResolvida = [
      pagamento.forma_nome,
      pagamento.forma?.nome,
      pagamento.operacao,
      pagamento.plano,
    ]
      .filter(Boolean)
      .join(" ");
    const pagaComissaoResolvido =
      pagamento.paga_comissao ?? pagamento.forma?.paga_comissao ?? null;
    const naoComissiona =
      pagaComissaoResolvido === false ||
      isFormaNaoComissionavel(formaNomeResolvida, termos);
    if (!naoComissiona) continue;

    const valorBase = calcularValorPagamento(pagamento);
    if (valorBase <= 0) continue;

    addToMap(porVenda, vendaId, valorBase);

    const vendaReciboId = toStr(pagamento.venda_recibo_id);
    if (vendaReciboId) {
      addToMap(porRecibo, vendaReciboId, valorBase);
    } else {
      addToMap(porVendaSemRecibo, vendaId, valorBase);
    }
  }

  return { porVenda, porVendaSemRecibo, porRecibo };
}

function buildReciboBusinessKey(recibo?: ReportReceiptRow | null) {
  if (!recibo) return "";
  if (isConsolidadoraReceipt(recibo?.numero_recibo)) {
    const reciboId = toStr(recibo?.id);
    if (reciboId) return `consolidadora:${reciboId}`;
  }
  const numeroBase = isConsolidadoraReceipt(recibo?.numero_recibo)
    ? String(recibo?.numero_reserva || recibo?.numero_recibo || "")
    : String(recibo?.numero_recibo || "");
  const numero = normalizeReceiptNumber(numeroBase);
  const produtoId = toStr(
    recibo?.tipo_produtos?.id || recibo?.produto_id,
  ).toLowerCase();
  const data = toDateKey(recibo?.data_venda);
  if (!numero || !data) return "";
  return `${numero}::${produtoId || "sem-produto"}::${data}`;
}

function isConsolidadoraReceipt(value?: string | null) {
  return normalizeReceiptNumber(value).includes("rextur");
}

function isSeguroPercentual(value?: unknown) {
  const pct = toNum(value);
  return pct >= 31.5 && pct <= 35.5;
}

function isSeguroFaixa(value?: unknown) {
  return String(value || "")
    .toUpperCase()
    .includes("SEGURO");
}

function isSeguroPorComissao(recibo?: ReportReceiptRow | null) {
  const comissao = toNum(recibo?.valor_comissao_loja);
  const bruto = getReciboBruto(recibo);
  if (comissao <= 0 || bruto <= 0) return false;
  return isSeguroPercentual((comissao / bruto) * 100);
}

function getReciboProdutoIdentity(recibo?: ReportReceiptRow | null) {
  const tipo = String(recibo?.tipo_produtos?.tipo || "").toLowerCase();
  const nome = String(
    recibo?.tipo_produtos?.nome || recibo?.produto_resolvido?.nome || "",
  ).toLowerCase();
  const produtoId = toStr(
    recibo?.tipo_produtos?.id ||
      recibo?.produto_id ||
      recibo?.produto_resolvido?.id,
  );
  return {
    hasProduto: Boolean(produtoId || tipo || nome),
    isSeguro: tipo.includes("seguro") || nome.includes("seguro"),
  };
}

function isSeguroProduto(recibo?: ReportReceiptRow | null) {
  const produto = getReciboProdutoIdentity(recibo);
  if (produto.isSeguro) return true;
  if (produto.hasProduto) return false;

  const reciboFlags = recibo as SeguroReceiptFlags | null | undefined;
  if (
    reciboFlags?._conciliacao_is_seguro === true ||
    reciboFlags?.is_seguro_viagem === true
  )
    return true;
  if (isSeguroFaixa(recibo?.faixa_comissao)) return true;
  if (isSeguroPercentual(recibo?.percentual_comissao_loja)) return true;
  if (isSeguroPorComissao(recibo)) return true;
  return false;
}

function hasConciliacaoOverride(recibo?: ReportReceiptRow | null) {
  return (
    recibo?.valor_bruto_override != null ||
    recibo?.valor_liquido_override != null
  );
}

function getReciboBruto(recibo?: ReportReceiptRow | null) {
  if (!recibo) return 0;
  if (hasConciliacaoOverride(recibo)) {
    return toNum(recibo.valor_bruto_override ?? recibo.valor_total);
  }
  return Math.max(0, toNum(recibo.valor_total) - toNum(recibo.valor_rav));
}

function getReciboTaxas(recibo?: ReportReceiptRow | null) {
  if (!recibo) return 0;
  return Math.max(0, toNum(recibo.valor_taxas));
}

function isStatusCancelado(status?: string | null, cancelada?: boolean | null) {
  if (cancelada) return true;
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  return normalized === "cancelado" || normalized === "cancelada";
}

function normalizeReceiptRows(
  recibos?: ReportReceiptRow[] | null,
): NonNullReceiptRow[] {
  return (Array.isArray(recibos) ? recibos : []).filter(
    (recibo): recibo is NonNullReceiptRow => Boolean(recibo),
  );
}

async function fetchBaixaRacVendedorIds(
  client: SupabaseClient,
  companyIds: string[],
) {
  if (companyIds.length === 0) return [] as string[];

  const batchRows = await Promise.all(
    chunkArray(companyIds).map(async (companyBatch) => {
      let query = client
        .from("users")
        .select("id")
        .eq("active", true)
        .ilike("nome_completo", "Baixa RAC");

      query =
        companyBatch.length === 1
          ? query.eq("company_id", companyBatch[0])
          : query.in("company_id", companyBatch);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as IdOnlyRow[];
    }),
  );

  return uniqueCleanStrings(batchRows.flat().map((row) => row?.id));
}

async function fetchConciliacaoCompanyIds(
  client: SupabaseClient,
  companyIds: string[],
) {
  if (companyIds.length === 0) return [] as string[];

  const batchRows = await Promise.all(
    chunkArray(companyIds).map(async (companyBatch) => {
      let query = client
        .from("parametros_comissao")
        .select("company_id")
        .eq("conciliacao_sobrepoe_vendas", true);

      query =
        companyBatch.length === 1
          ? query.eq("company_id", companyBatch[0])
          : query.in("company_id", companyBatch);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as CompanyIdOnlyRow[];
    }),
  );

  const companyIdSet = new Set<string>();
  for (const row of batchRows.flat()) {
    const companyId = toStr(row?.company_id);
    if (companyId) companyIdSet.add(companyId);
  }

  return Array.from(companyIdSet);
}

async function carregarTermosNaoComissionaveis(
  client: SupabaseClient,
): Promise<string[]> {
  return getCachedReadModel({
    key: buildReadModelCacheKey("vendas-kpis:termos-nao-comissionaveis", {}),
    tags: [READ_MODEL_TAGS.sales, READ_MODEL_TAGS.finance],
    ttlMs: 300_000,
    staleTtlMs: 1_800_000,
    loader: () =>
      carregarTermosNaoComissionaveisBase(client, {
        onError: (error) =>
          logServerError("[vendas-kpis] falha ao carregar termos nao comissionaveis", error),
      }),
  });
}

async function fetchNaoComissionadoPorVenda(
  client: SupabaseClient,
  vendaIds: string[],
  termosNaoComissionaveis: string[],
) {
  if (vendaIds.length === 0) {
    return {
      porVenda: new Map<string, number>(),
      porVendaSemRecibo: new Map<string, number>(),
      porRecibo: new Map<string, number>(),
    };
  }

  const batchRows = await Promise.all(
    chunkArray(vendaIds, 200).map(async (chunk) => {
      const { data, error } = await client
        .from("vendas_pagamentos")
        .select(
          "venda_id, venda_recibo_id, forma_nome, operacao, plano, valor_total, valor_bruto, desconto_valor, paga_comissao, forma:formas_pagamento(nome, paga_comissao)",
        )
        .in("venda_id", chunk);

      if (error) throw error;
      return (data || []) as PagamentoNaoComissionavelInput[];
    }),
  );

  return calcularNaoComissionavelResumo(batchRows.flat(), termosNaoComissionaveis);
}

function mergeRowsById(
  baseRows: VendaAggregateRow[],
  extraRows: VendaAggregateRow[],
) {
  const map = new Map<string, VendaAggregateRow>();
  for (const row of [...baseRows, ...extraRows]) {
    const id = toStr(row?.id);
    if (!id) continue;
    if (!map.has(id)) map.set(id, row);
  }
  return Array.from(map.values());
}

function toRateioShape(rows: ReportVendaRow[]): VendaAggregateRow[] {
  return rows.map((row) => ({
    ...row,
    vendas_recibos: Array.isArray((row as VendaRowWithReceiptAliases)?.recibos)
      ? (((row as VendaRowWithReceiptAliases).recibos || []) as ReportReceiptRow[])
      : Array.isArray((row as VendaRowWithReceiptAliases)?.vendas_recibos)
        ? (((row as VendaRowWithReceiptAliases).vendas_recibos || []) as ReportReceiptRow[])
        : [],
  }));
}

function getConciliacaoIds(item: ConciliacaoIdSource) {
  const ids = Array.isArray(item?.conciliacao_ids)
    ? item.conciliacao_ids
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    : [];
  if (ids.length > 0) return ids;
  const id = String(item?.id || "").trim();
  return id ? [id] : [];
}

async function fetchResolvedRowsUncached(
  client: SupabaseClient,
  params: {
    dataInicio: string;
    dataFim: string;
    companyIds: string[];
    vendedorIds: string[];
    accessibleClientIds?: string[];
    deferVendedorScopeFilter?: boolean;
  },
) {
  const normalizedCompanyIds = normalizeCompanyScopeIds(params.companyIds);
  const initialVendedorIds = params.deferVendedorScopeFilter
    ? []
    : params.vendedorIds;

  // --- Fase 1: buscar dados independentes em paralelo ---
  // baixaRac e conciliacaoCompanyIds são independentes entre si e das vendas.
  const [baixaRacIds, conciliacaoCompanyIds, rawRows] = await Promise.all([
    fetchBaixaRacVendedorIds(client, normalizedCompanyIds).catch(() => [] as string[]),
    fetchConciliacaoCompanyIds(client, normalizedCompanyIds).catch(() => [] as string[]),
    fetchSalesReportRows(client, {
      companyIds: normalizedCompanyIds,
      vendedorIds: initialVendedorIds,
      includeCancelled: false,
      dataInicio: params.dataInicio,
      dataFim: params.dataFim,
      filterByReceiptDate: false,
    }),
  ]);

  const baixaRacSet = new Set(baixaRacIds);

  let rows = toRateioShape(rawRows).filter(
    (row) => !baixaRacSet.has(toStr(row?.vendedor_id)),
  );

  if ((params.accessibleClientIds || []).length > 0) {
    const clientScope = new Set<string>();
    for (const id of params.accessibleClientIds || []) {
      const clientId = toStr(id);
      if (clientId) clientScope.add(clientId);
    }
    rows = rows.filter((row) => clientScope.has(toStr(row?.cliente_id)));
  }

  // --- Fase 2: buscar conciliação e split em paralelo ---
  // splitSaleIds precisa de baixaRacIds (já disponível), mas independe de concReceipts.
  // concReceipts precisa de baixaRacIds (já disponível).
  const [splitSaleIds, concReceipts] = await Promise.all([
    params.vendedorIds.length > 0
      ? fetchSplitSaleIdsForDestinationVendedores(client, {
          companyId: normalizedCompanyIds[0] || null,
          companyIds: normalizedCompanyIds,
          vendedorIds: params.vendedorIds,
        }).catch((error) => {
          logServerError("[vendas-kpis] split sales indisponivel, seguindo sem rateio destino", error);
          return [] as string[];
        })
      : Promise.resolve([] as string[]),
    normalizedCompanyIds.length > 0
      ? fetchEffectiveConciliacaoReceipts({
          client,
          companyId: normalizedCompanyIds[0] || null,
          companyIds: normalizedCompanyIds,
          inicio: params.dataInicio,
          fim: params.dataFim,
          vendedorIds: params.vendedorIds,
          excludeVendedorIds: baixaRacIds,
        }).catch((error) => {
          logServerError("[vendas-kpis] conciliacao indisponivel, seguindo sem overrides", error);
          return [] as EffectiveConciliacaoReceipt[];
        })
      : Promise.resolve([] as EffectiveConciliacaoReceipt[]),
  ]);

  // Carregar split rows se necessário (depende de splitSaleIds)
  if (splitSaleIds.length > 0) {
    const splitRows = toRateioShape(
      await fetchSalesReportRows(client, {
        companyIds: normalizedCompanyIds,
        vendaIds: splitSaleIds,
        includeCancelled: false,
        dataInicio: params.dataInicio,
        dataFim: params.dataFim,
        filterByReceiptDate: false,
      }),
    ).filter((row) => !baixaRacSet.has(toStr(row?.vendedor_id)));
    rows = mergeRowsById(rows, splitRows);
  }

  // --- Fase 3: split-conc e suppressedConcReceipts em paralelo ---
  // Ambas são independentes entre si. splitConcRows depende de concReceipts (para merge),
  // mas a query em si pode rodar em paralelo com suppressedConcReceipts.
  const [splitConcRows, suppressedConcReceipts] = await Promise.all([
    params.vendedorIds.length > 0 && normalizedCompanyIds.length > 0
      ? (async () => {
          const collectedRows: SplitConciliacaoRow[] = [];
          const batches: Array<PromiseLike<void>> = [];
          for (const vendedorBatch of chunkArray(params.vendedorIds)) {
            for (const companyBatch of chunkArray(normalizedCompanyIds)) {
              batches.push(
                client
                  .from("vendas_recibos_rateio")
                  .select("conciliacao_recibo_id")
                  .eq("ativo", true)
                  .gt("percentual_destino", 0)
                  .in("vendedor_destino_id", vendedorBatch)
                  .not("conciliacao_recibo_id", "is", null)
                  .in("company_id", companyBatch)
                  .then(({ data, error: splitConcErr }) => {
                    if (splitConcErr) {
                      logServerError("[vendas-kpis] split conciliation indisponivel", splitConcErr);
                    } else {
                      collectedRows.push(...((data || []) as SplitConciliacaoRow[]));
                    }
                  })
              );
            }
          }
          await Promise.all(batches);
          return collectedRows;
        })()
      : Promise.resolve([] as SplitConciliacaoRow[]),
    normalizedCompanyIds.length > 0
      ? fetchSuppressedConciliacaoReceipts({
          client,
          companyId: normalizedCompanyIds[0] || null,
          companyIds: normalizedCompanyIds,
          inicio: params.dataInicio,
          fim: params.dataFim,
        }).catch((error) => {
          logServerError("[vendas-kpis] conciliacao suprimida indisponivel", error);
          return [] as Array<{ documento: string; numero_reserva?: string | null; linked_recibo_id: string | null }>;
        })
      : Promise.resolve([] as Array<{ documento: string; numero_reserva?: string | null; linked_recibo_id: string | null }>),
  ]);

  const splitConcIdSet = cleanStringSet(
    splitConcRows.map((row) => row?.conciliacao_recibo_id),
  );

  if (splitConcIdSet.size > 0) {
    let concAll: EffectiveConciliacaoReceipt[] = [];
    try {
      concAll = await fetchEffectiveConciliacaoReceipts({
        client,
        companyId: normalizedCompanyIds[0] || null,
        companyIds: normalizedCompanyIds,
        inicio: params.dataInicio,
        fim: params.dataFim,
        vendedorIds: null,
        excludeVendedorIds: baixaRacIds,
      });
    } catch (error) {
      logServerError("[vendas-kpis] conciliation all indisponivel", error);
      concAll = [];
    }

    const seenConcIds = new Set(
      (concReceipts || []).flatMap((item: ConciliacaoIdSource) => getConciliacaoIds(item)),
    );
    for (const item of concAll) {
      const candidateIds = getConciliacaoIds(item);
      if (candidateIds.length === 0) continue;
      if (!candidateIds.some((id: string) => splitConcIdSet.has(id))) continue;
      if (candidateIds.some((id: string) => seenConcIds.has(id))) continue;
      for (const id of candidateIds) seenConcIds.add(id);
      concReceipts.push(item);
    }
  }

  const overriddenReceiptIds = cleanStringSet(
    concReceipts.map((item) => item.linked_recibo_id),
  );
  const suppressedReceiptIds = cleanStringSet(
    suppressedConcReceipts.map((item) => item.linked_recibo_id),
  );
  const suppressedReceiptNumbers = new Set(
    suppressedConcReceipts
      .filter(
        (item) =>
          !(
            toStr(item.documento).toUpperCase() === "REXTUR" &&
            toStr(item.numero_reserva)
          ),
      )
      .map((item) => normalizeReceiptNumber(item.documento))
      .filter(Boolean),
  );
  const overrideCompanySet = new Set(conciliacaoCompanyIds);

  const baseRows = rows.map((row) => {
    const recibos = normalizeReceiptRows(row?.vendas_recibos);
    const shouldOverrideCompany = overrideCompanySet.has(
      toStr(row?.company_id),
    );
    const withoutSuppressed = recibos.filter((recibo) => {
      const reciboId = toStr(recibo?.id);
      const reciboNumero = normalizeReceiptNumber(recibo?.numero_recibo);
      return (
        !suppressedReceiptIds.has(reciboId) &&
        !(reciboNumero && suppressedReceiptNumbers.has(reciboNumero))
      );
    });
    const withoutOverridden = shouldOverrideCompany
      ? withoutSuppressed.filter(
          (recibo) => !overriddenReceiptIds.has(toStr(recibo?.id)),
        )
      : withoutSuppressed;

    return {
      ...row,
      vendas_recibos: filterRecibosCanceladosMesmoMes(withoutOverridden),
    };
  });

  function buildConcRecibo(item: (typeof concReceipts)[0]): NonNullReceiptRow {
    return {
      id: item.linked_recibo_id || item.id,
      numero_recibo: item.documento,
      data_venda: item.data_venda,
      valor_total: item.valor_bruto,
      valor_taxas: item.valor_taxas,
      valor_du: 0,
      vendedor_id: item.vendedor_id,
      valor_bruto_override: item.valor_bruto,
      valor_liquido_override: item.valor_liquido_override,
      valor_comissao_loja: item.valor_comissao_loja,
      percentual_comissao_loja: item.percentual_comissao_loja,
      faixa_comissao: item.faixa_comissao,
      is_seguro_viagem: item.is_seguro_viagem,
      cancelado_por_conciliacao_em: null,
      cancelado_por_conciliacao_observacao: null,
      produto_id: item.produto_id,
      tipo_produtos: item.produto
        ? {
            id: item.produto.id,
            nome: item.produto.nome,
            tipo:
              item.produto.tipo || (item.is_seguro_viagem ? "Seguro" : null),
          }
        : null,
      produto_resolvido: item.produto
        ? {
            id: item.produto.id,
            nome: item.produto.nome,
            tipo:
              item.produto.tipo || (item.is_seguro_viagem ? "Seguro" : null),
          }
        : null,
      _conciliacao_is_seguro: item.is_seguro_viagem,
    } as NonNullReceiptRow;
  }

  const mergedRows =
    concReceipts.length > 0
      ? mergeEffectiveRecibos<VendaAggregateRow, NonNullReceiptRow>(
          baseRows,
          concReceipts,
          {
            getVendaId: (venda) => toStr(venda?.id),
            getRecibos: (venda) => normalizeReceiptRows(venda?.vendas_recibos),
            getReciboId: (recibo) => toStr(recibo?.id),
            getReciboNumero: (recibo) => toStr(recibo?.numero_recibo),
            getReciboDataVenda: (recibo) => toDateKey(recibo?.data_venda),
            getReciboCanceledAt: (recibo) =>
              recibo?.cancelado_por_conciliacao_em ?? null,
            withRecibos: (venda, recibos) => ({
              ...venda,
              vendas_recibos: recibos,
            }),
            buildSyntheticRecibo: (item) => buildConcRecibo(item),
            buildSyntheticVenda: (item) =>
              ({
                id: item.id,
                numero_venda: null,
                cliente_id: null,
                company_id: item.company_id,
                data_embarque: null,
                data_retorno: null,
                source_venda_id: item.linked_venda_id || null,
                linked_venda_id: item.linked_venda_id || null,
                linked_recibo_id: item.linked_recibo_id || null,
                vendedor_id: item.vendedor_id,
                destino_id: null,
                status: "confirmado",
                data_venda: item.data_venda,
                valor_total: item.valor_meta_override ?? item.valor_bruto,
                valor_total_bruto: item.valor_bruto,
                valor_total_pago: item.valor_bruto,
                valor_nao_comissionado: 0,
                valor_taxas: item.valor_taxas,
                destinos: null,
                vendas_recibos: [buildConcRecibo(item)],
              }) as unknown as VendaAggregateRow,
          },
        ).vendas
      : baseRows;

  const reciboIds = mergedRows
    .flatMap((row) => normalizeReceiptRows(row?.vendas_recibos))
    .map((recibo) => toStr(recibo?.id))
    .filter(isUuid);

  const rateioMap = await fetchRateioByReciboIds(client, reciboIds).catch(
    (error) => {
      logServerError("[vendas-kpis] rateio indisponivel, seguindo sem rateio", error);
      return new Map<string, RateioRow>();
    },
  );

  return { rows: mergedRows, rateioMap };
}

async function fetchResolvedRows(
  client: SupabaseClient,
  params: {
    dataInicio: string;
    dataFim: string;
    companyIds: string[];
    vendedorIds: string[];
    accessibleClientIds?: string[];
    deferVendedorScopeFilter?: boolean;
  },
) {
  const companyIds = normalizeIdScope(params.companyIds);
  const vendedorIds = normalizeIdScope(params.vendedorIds);
  const accessibleClientIds = normalizeIdScope(params.accessibleClientIds);
  const deferVendedorScopeFilter = Boolean(params.deferVendedorScopeFilter);

  const key = buildReadModelCacheKey("vendas-resolved-rows", {
    dataInicio: params.dataInicio,
    dataFim: params.dataFim,
    companyIds,
    vendedorIds,
    accessibleClientIds,
    deferVendedorScopeFilter,
  });

  return getCachedReadModel({
    key,
    ttlMs: 300_000,
    staleTtlMs: 1_800_000,
    tags: [
      READ_MODEL_TAGS.sales,
      READ_MODEL_TAGS.conciliacao,
      READ_MODEL_TAGS.vendasKpis,
      READ_MODEL_TAGS.ranking,
      ...scopeCacheTags({ companyIds, vendedorIds }),
    ],
    loader: () =>
      fetchResolvedRowsUncached(client, {
        ...params,
        companyIds,
        vendedorIds,
        accessibleClientIds,
        deferVendedorScopeFilter,
      }),
  });
}

export async function fetchAndComputeVendasKpis(
  client: SupabaseClient,
  params: {
    dataInicio: string;
    dataFim: string;
    companyIds: string[];
    vendedorIds: string[];
    accessibleClientIds?: string[];
  },
): Promise<VendasKpiAgg> {
  const { agg } = await fetchVendasKpiReciboContributions(client, params);
  return agg;
}

async function fetchAndComputeVendasKpisLegacy(
  client: SupabaseClient,
  params: {
    dataInicio: string;
    dataFim: string;
    companyIds: string[];
    vendedorIds: string[];
    accessibleClientIds?: string[];
  },
): Promise<VendasKpiAgg> {
  const [{ rows, rateioMap }, termosNaoComissionaveis] = await Promise.all([
    fetchResolvedRows(client, params),
    carregarTermosNaoComissionaveis(client),
  ]);

  const vendaIds = buildVendaIdsFromRows(rows);
  const naoComissionadoPorVenda = await fetchNaoComissionadoPorVenda(
    client,
    vendaIds,
    termosNaoComissionaveis,
  );

  const scopeVendedorIds = buildScopeIdSet(params.vendedorIds);
  const hasScopeVendedores = scopeVendedorIds.size > 0;

  let totalVendas = 0;
  let totalTaxas = 0;
  let totalSeguro = 0;
  let qtdVendas = 0;
  let countAtivas = 0;

  const groupedByVenda = new Map<
    string,
    { vendaRows: VendaAggregateRow[]; recibos: NonNullReceiptRow[] }
  >();

  for (const row of rows) {
    const rowExtra = row as VendaAggregateRowExtra;
    const syntheticKey = [
      toDateKey(row?.data_venda),
      toStr(row?.vendedor_id),
      toStr(rowExtra.destino_id),
      toStr(rowExtra.valor_total || rowExtra.valor_total_bruto),
    ].join("|");
    const vendaKey =
      toStr(rowExtra.source_venda_id || row?.id) || `synt:${syntheticKey}`;
    const current = groupedByVenda.get(vendaKey) || {
      vendaRows: [],
      recibos: [],
    };
    current.vendaRows.push(row);
    if (Array.isArray(row?.vendas_recibos) && row.vendas_recibos.length > 0) {
      current.recibos.push(...normalizeReceiptRows(row.vendas_recibos));
    }
    groupedByVenda.set(vendaKey, current);
  }

  for (const [vendaKey, group] of groupedByVenda) {
    const vendaPrincipal =
      group.vendaRows.find((row) => toStr(row?.id) === vendaKey) ||
      group.vendaRows[0];
    const vendaPrincipalExtra = vendaPrincipal as VendaAggregateRowExtra;

    if (
      isStatusCancelado(
        vendaPrincipalExtra.status,
        vendaPrincipal?.cancelada,
      )
    )
      continue;

    const vendaDate = toDateKey(vendaPrincipal?.data_venda);
    const recibosAll = filterRecibosCanceladosMesmoMes(group.recibos || []);

    const recibosByKey = new Map<string, ReportReceiptRow>();
    const recibosByBusiness = new Set<string>();
    for (const recibo of recibosAll) {
      const reciboId = toStr(recibo?.id);
      const businessKey = buildReciboBusinessKey(recibo);
      if (businessKey && recibosByBusiness.has(businessKey)) continue;
      if (businessKey) recibosByBusiness.add(businessKey);
      const key =
        reciboId ||
        businessKey ||
        `${toDateKey(recibo?.data_venda)}|${getReciboBruto(recibo)}|${getReciboTaxas(recibo)}`;
      if (!recibosByKey.has(key)) recibosByKey.set(key, recibo);
    }
    const recibosUnique = Array.from(recibosByKey.values());
    const somaBrutoRecibos = recibosUnique.reduce(
      (acc, recibo) => acc + getReciboBruto(recibo),
      0,
    );
    const somaTaxasRecibos = recibosUnique.reduce(
      (acc, recibo) => acc + getReciboTaxas(recibo),
      0,
    );

    const linkedNaoComissionado = toNum(
      naoComissionadoPorVenda.porVenda.get(vendaKey) || 0,
    );
    const naoComissionadoSemRecibo = toNum(
      naoComissionadoPorVenda.porVendaSemRecibo.get(vendaKey) || 0,
    );
    const usarModoPorRecibo =
      linkedNaoComissionado > 0 && naoComissionadoSemRecibo <= 0;
    const naoComissionadoTotalPagamentos = Math.max(
      0,
      toNum(naoComissionadoPorVenda.porVenda.get(vendaKey) || 0),
    );
    const rankingGrupo = calcularRankingComissionavel({
      valorBruto: somaBrutoRecibos,
      valorTaxas: somaTaxasRecibos,
      valorNaoComissionado: usarModoPorRecibo
        ? 0
        : naoComissionadoTotalPagamentos,
    });

    const recibosPeriodo = recibosUnique.filter((recibo) => {
      const reciboDate = toDateKey(recibo?.data_venda) || vendaDate;
      return (
        Boolean(reciboDate) &&
        reciboDate >= params.dataInicio &&
        reciboDate <= params.dataFim
      );
    });

    if (recibosPeriodo.length === 0) {
      continue;
    }

    countAtivas += 1;

    for (const recibo of recibosPeriodo) {
      const reciboExtra = recibo as ScopedReceiptRow;
      const reciboId = toStr(recibo?.id);
      const reciboJaAjustadoPorConciliacao = hasConciliacaoOverride(recibo);
      const naoComissionadoRecibo =
        usarModoPorRecibo && reciboId && !reciboJaAjustadoPorConciliacao
          ? toNum(naoComissionadoPorVenda.porRecibo.get(reciboId) || 0)
          : 0;

      const rankingRecibo = calcularRankingComissionavel({
        valorBruto: getReciboBruto(recibo),
        valorTaxas: getReciboTaxas(recibo),
        valorNaoComissionado: usarModoPorRecibo ? naoComissionadoRecibo : 0,
      });
      const fatorRecibo = usarModoPorRecibo
        ? rankingRecibo.fatorValor
        : rankingGrupo.fatorValor;
      const bruto = usarModoPorRecibo
        ? rankingRecibo.valorRanking
        : getReciboBruto(recibo) * fatorRecibo;
      const taxasEfetivas = usarModoPorRecibo
        ? rankingRecibo.valorTaxasRanking
        : getReciboTaxas(recibo) * rankingGrupo.fatorTaxas;

      const vendedorId =
        toStr(reciboExtra.rateio_scope_vendor_id) ||
        toStr(reciboExtra.vendedor_id) ||
        toStr(vendaPrincipalExtra.vendedor_id);
      const rateio = reciboId ? rateioMap.get(reciboId) : null;
      const baseAllocations =
        rateio &&
        rateio.ativo &&
        isUuid(rateio.vendedor_origem_id) &&
        isUuid(rateio.vendedor_destino_id) &&
        toNum(rateio.percentual_destino) > 0 &&
        toNum(rateio.percentual_origem) > 0
          ? [
              {
                vendedorId: toStr(rateio.vendedor_origem_id),
                fator: Math.max(
                  0,
                  Math.min(1, toNum(rateio.percentual_origem) / 100),
                ),
              },
              {
                vendedorId: toStr(rateio.vendedor_destino_id),
                fator: Math.max(
                  0,
                  Math.min(1, toNum(rateio.percentual_destino) / 100),
                ),
              },
            ]
          : [{ vendedorId, fator: 1 }];

      const allocations = hasScopeVendedores
        ? baseAllocations.filter((item) =>
            scopeVendedorIds.has(item.vendedorId),
          )
        : baseAllocations;
      if (allocations.length === 0) continue;

      let countedRecibo = false;
      for (const allocation of allocations) {
        const brutoAlloc = bruto * allocation.fator;
        const taxasAlloc = taxasEfetivas * allocation.fator;

        if (brutoAlloc <= 0 && taxasAlloc <= 0) continue;

        totalVendas += brutoAlloc;
        totalTaxas += taxasAlloc;
        if (!countedRecibo) {
          qtdVendas += 1;
          countedRecibo = true;
        }

        if (isSeguroProduto(recibo)) {
          totalSeguro += brutoAlloc;
        }
      }
    }
  }

  return {
    totalVendas,
    totalTaxas,
    totalLiquido: totalVendas - totalTaxas,
    totalSeguro,
    countVendas: qtdVendas,
    countAtivas,
  };
}

export async function fetchVendasKpiReciboContributionsRaw(
  client: SupabaseClient,
  params: {
    dataInicio: string;
    dataFim: string;
    companyIds: string[];
    vendedorIds: string[];
    accessibleClientIds?: string[];
  },
): Promise<{
  agg: VendasKpiAgg;
  contributions: VendasKpiReciboContribution[];
}> {
  const shouldDeferVendedorScopeFilter =
    params.vendedorIds.length > 0 &&
    normalizeCompanyScopeIds(params.companyIds).length === 1;

  const [{ rows, rateioMap }, termosNaoComissionaveis] = await Promise.all([
    fetchResolvedRows(client, {
      ...params,
      deferVendedorScopeFilter: shouldDeferVendedorScopeFilter,
    }),
    carregarTermosNaoComissionaveis(client),
  ]);

  const vendaIds = buildVendaIdsFromRows(rows);
  const [naoComissionadoPorVenda, destinationCityNames] = await Promise.all([
    fetchNaoComissionadoPorVenda(
      client,
      vendaIds,
      termosNaoComissionaveis,
    ),
    fetchDestinationCityNames(client, rows),
  ]);

  const scopeVendedorIds = buildScopeIdSet(params.vendedorIds);
  const hasScopeVendedores = scopeVendedorIds.size > 0;

  let totalVendas = 0;
  let totalTaxas = 0;
  let totalSeguro = 0;
  let qtdVendas = 0;
  let countAtivas = 0;
  const contributions: VendasKpiReciboContribution[] = [];

  const groupedByVenda = new Map<
    string,
    { vendaRows: VendaAggregateRow[]; recibos: NonNullReceiptRow[] }
  >();

  for (const row of rows) {
    const rowExtra = row as VendaAggregateRowExtra;
    const syntheticKey = [
      toDateKey(row?.data_venda),
      toStr(row?.vendedor_id),
      toStr(rowExtra.destino_id),
      toStr(rowExtra.valor_total || rowExtra.valor_total_bruto),
    ].join("|");
    const vendaKey =
      toStr(rowExtra.source_venda_id || row?.id) || `synt:${syntheticKey}`;
    const current = groupedByVenda.get(vendaKey) || {
      vendaRows: [],
      recibos: [],
    };
    current.vendaRows.push(row);
    if (Array.isArray(row?.vendas_recibos) && row.vendas_recibos.length > 0) {
      current.recibos.push(...normalizeReceiptRows(row.vendas_recibos));
    }
    groupedByVenda.set(vendaKey, current);
  }

  for (const [vendaKey, group] of groupedByVenda) {
    const vendaPrincipal =
      group.vendaRows.find((row) => toStr(row?.id) === vendaKey) ||
      group.vendaRows[0];
    const vendaPrincipalExtra = vendaPrincipal as VendaAggregateRowExtra;
    // Linhas sinteticas (originadas de conciliacao sem venda vinculada) sempre
    // carregam a propriedade `linked_venda_id` (mesmo que null) - ver
    // buildSyntheticVenda em reciboContribuicoesReadModel.ts. Vendas reais do
    // banco nunca tem essa propriedade. Sem essa distincao, `vendaKey` cai
    // para o id do proprio registro de conciliacao, que nao existe na tabela
    // `vendas` e quebra a FK `ranking_recibo_contribuicoes_venda_id_fkey`
    // ao persistir o read model.
    const isSyntheticVenda = Object.prototype.hasOwnProperty.call(
      vendaPrincipalExtra,
      "linked_venda_id",
    );
    const realVendaId = isSyntheticVenda
      ? isUuid(vendaPrincipalExtra.linked_venda_id)
        ? toStr(vendaPrincipalExtra.linked_venda_id)
        : null
      : isUuid(vendaKey)
        ? vendaKey
        : null;

    if (
      isStatusCancelado(
        vendaPrincipalExtra.status,
        vendaPrincipal?.cancelada,
      )
    )
      continue;

    const vendaDate = toDateKey(vendaPrincipal?.data_venda);
    const recibosAll = filterRecibosCanceladosMesmoMes(group.recibos || []);

    const recibosByKey = new Map<string, ReportReceiptRow>();
    const recibosByBusiness = new Set<string>();
    for (const recibo of recibosAll) {
      const reciboId = toStr(recibo?.id);
      const businessKey = buildReciboBusinessKey(recibo);
      if (businessKey && recibosByBusiness.has(businessKey)) continue;
      if (businessKey) recibosByBusiness.add(businessKey);
      const key =
        reciboId ||
        businessKey ||
        `${toDateKey(recibo?.data_venda)}|${getReciboBruto(recibo)}|${getReciboTaxas(recibo)}`;
      if (!recibosByKey.has(key)) recibosByKey.set(key, recibo);
    }
    const recibosUnique = Array.from(recibosByKey.values());
    const somaBrutoRecibos = recibosUnique.reduce(
      (acc, recibo) => acc + getReciboBruto(recibo),
      0,
    );
    const somaTaxasRecibos = recibosUnique.reduce(
      (acc, recibo) => acc + getReciboTaxas(recibo),
      0,
    );

    const linkedNaoComissionado = toNum(
      naoComissionadoPorVenda.porVenda.get(vendaKey) || 0,
    );
    const naoComissionadoSemRecibo = toNum(
      naoComissionadoPorVenda.porVendaSemRecibo.get(vendaKey) || 0,
    );
    const usarModoPorRecibo =
      linkedNaoComissionado > 0 && naoComissionadoSemRecibo <= 0;
    const naoComissionadoTotalPagamentos = Math.max(
      0,
      toNum(naoComissionadoPorVenda.porVenda.get(vendaKey) || 0),
    );
    const rankingGrupo = calcularRankingComissionavel({
      valorBruto: somaBrutoRecibos,
      valorTaxas: somaTaxasRecibos,
      valorNaoComissionado: usarModoPorRecibo
        ? 0
        : naoComissionadoTotalPagamentos,
    });

    const recibosPeriodo = recibosUnique.filter((recibo) => {
      const reciboDate = toDateKey(recibo?.data_venda) || vendaDate;
      return (
        Boolean(reciboDate) &&
        reciboDate >= params.dataInicio &&
        reciboDate <= params.dataFim
      );
    });

    if (recibosPeriodo.length === 0) {
      continue;
    }

    countAtivas += 1;

    for (const recibo of recibosPeriodo) {
      const reciboExtra = recibo as ScopedReceiptRow;
      const reciboId = toStr(recibo?.id);
      const reciboJaAjustadoPorConciliacao = hasConciliacaoOverride(recibo);
      const naoComissionadoRecibo =
        usarModoPorRecibo && reciboId && !reciboJaAjustadoPorConciliacao
          ? toNum(naoComissionadoPorVenda.porRecibo.get(reciboId) || 0)
          : 0;

      const sourceBruto = getReciboBruto(recibo);
      const sourceTaxas = getReciboTaxas(recibo);
      const rankingRecibo = calcularRankingComissionavel({
        valorBruto: sourceBruto,
        valorTaxas: sourceTaxas,
        valorNaoComissionado: usarModoPorRecibo ? naoComissionadoRecibo : 0,
      });
      const fatorRecibo = usarModoPorRecibo
        ? rankingRecibo.fatorValor
        : rankingGrupo.fatorValor;
      const bruto = usarModoPorRecibo
        ? rankingRecibo.valorRanking
        : sourceBruto * fatorRecibo;
      const taxasEfetivas = usarModoPorRecibo
        ? rankingRecibo.valorTaxasRanking
        : sourceTaxas * rankingGrupo.fatorTaxas;

      const vendedorId =
        toStr(reciboExtra.rateio_scope_vendor_id) ||
        toStr(reciboExtra.vendedor_id) ||
        toStr(vendaPrincipalExtra.vendedor_id);
      const rateio = reciboId ? rateioMap.get(reciboId) : null;
      const baseAllocations =
        rateio &&
        rateio.ativo &&
        isUuid(rateio.vendedor_origem_id) &&
        isUuid(rateio.vendedor_destino_id) &&
        toNum(rateio.percentual_destino) > 0 &&
        toNum(rateio.percentual_origem) > 0
          ? [
              {
                vendedorId: toStr(rateio.vendedor_origem_id),
                fator: Math.max(
                  0,
                  Math.min(1, toNum(rateio.percentual_origem) / 100),
                ),
              },
              {
                vendedorId: toStr(rateio.vendedor_destino_id),
                fator: Math.max(
                  0,
                  Math.min(1, toNum(rateio.percentual_destino) / 100),
                ),
              },
            ]
          : [{ vendedorId, fator: 1 }];

      const allocations = hasScopeVendedores
        ? baseAllocations.filter((item) =>
            scopeVendedorIds.has(item.vendedorId),
          )
        : baseAllocations;
      if (allocations.length === 0) continue;

      let countedRecibo = false;
      for (const allocation of allocations) {
        const brutoAlloc = bruto * allocation.fator;
        const taxasAlloc = taxasEfetivas * allocation.fator;

        if (brutoAlloc <= 0 && taxasAlloc <= 0) continue;

        totalVendas += brutoAlloc;
        totalTaxas += taxasAlloc;
        if (!countedRecibo) {
          qtdVendas += 1;
          countedRecibo = true;
        }

        const seguro = isSeguroProduto(recibo);
        if (seguro) {
          totalSeguro += brutoAlloc;
        }

        const produtoId = toStr(
          recibo?.tipo_produtos?.id ||
            recibo?.produto_id ||
            recibo?.produto_resolvido?.id,
        );
        const produtoNome = toStr(
          recibo?.tipo_produtos?.nome ||
            recibo?.produto_resolvido?.nome ||
            "Produto",
        );
        const destinoNome =
          getReceiptCidadeNome(recibo, vendaPrincipalExtra, destinationCityNames) ||
          getVendaDestino(vendaPrincipalExtra, destinationCityNames);

        contributions.push({
          companyId: toStr(vendaPrincipalExtra.company_id),
          clienteId: toStr(vendaPrincipalExtra.cliente_id),
          vendaId: realVendaId,
          vendaKey,
          reciboId,
          reciboNumero: toStr(recibo?.numero_recibo),
          reciboDate: toDateKey(recibo?.data_venda) || vendaDate,
          // `mes` nao existe neste escopo: quando a venda nao tinha data_venda
          // isso lancava ReferenceError e derrubava o rebuild do mes inteiro.
          vendaDate: vendaDate || toDateKey(recibo?.data_venda) || "",
          vendedorId: allocation.vendedorId,
          produtoId,
          produtoNome,
          destinoNome,
          bruto: Number(brutoAlloc.toFixed(2)),
          taxas: Number(taxasAlloc.toFixed(2)),
          isSeguro: seguro,
          factor: Number((fatorRecibo * allocation.fator).toFixed(6)),
          sourceBruto: Number(sourceBruto.toFixed(2)),
          sourceTaxas: Number(sourceTaxas.toFixed(2)),
          origem: hasConciliacaoOverride(recibo) ? "conciliacao" : "venda",
        });
      }
    }
  }

  return {
    agg: {
      totalVendas,
      totalTaxas,
      totalLiquido: totalVendas - totalTaxas,
      totalSeguro,
      countVendas: qtdVendas,
      countAtivas,
    },
    contributions,
  };
}

export async function fetchVendasKpiReciboContributions(
  client: SupabaseClient,
  params: {
    dataInicio: string;
    dataFim: string;
    companyIds: string[];
    vendedorIds: string[];
    accessibleClientIds?: string[];
  },
  readModelOptions?: ReciboContribuicoesReadModelOptions,
): Promise<{
  agg: VendasKpiAgg;
  contributions: VendasKpiReciboContribution[];
}> {
  return fetchReciboContribuicoesReadModel(
    client,
    params,
    (loaderParams) =>
      fetchVendasKpiReciboContributionsRaw(client, loaderParams),
    (loaderParams) =>
      fetchVendasKpiReciboContributionsRaw(getAdminClient(), loaderParams),
    readModelOptions,
  );
}

function buildDashboardSummaryFromContributions(payload: {
  agg: VendasKpiAgg;
  contributions: VendasKpiReciboContribution[];
}): VendasKpiDashboardSummary {
  const timelineMap = new Map<string, number>();
  const destinoMap = new Map<string, number>();
  const destinoCountMap = new Map<string, number>();
  const destinoReceiptCount = new Set<string>();
  const produtoMap = new Map<
    string,
    { id: string; name: string; value: number }
  >();

  for (const contribution of payload.contributions) {
    const bruto = toNum(contribution.bruto);
    if (bruto <= 0) continue;

    const reciboDate = toDateKey(contribution.reciboDate);
    if (reciboDate) {
      timelineMap.set(reciboDate, (timelineMap.get(reciboDate) || 0) + bruto);
    }

    const destinoNome =
      toStr(contribution.destinoNome) || "Destino nao informado";
    destinoMap.set(destinoNome, (destinoMap.get(destinoNome) || 0) + bruto);

    const destinoKey = [
      destinoNome,
      contribution.vendaKey,
      contribution.reciboId || contribution.reciboNumero,
    ].join("|");
    if (!destinoReceiptCount.has(destinoKey)) {
      destinoReceiptCount.add(destinoKey);
      destinoCountMap.set(destinoNome, (destinoCountMap.get(destinoNome) || 0) + 1);
    }

    const productId = toStr(contribution.produtoId) || "sem-produto";
    const productName = toStr(contribution.produtoNome) || "Produto";
    const curProd = produtoMap.get(productId) || {
      id: productId,
      name: productName,
      value: 0,
    };
    produtoMap.set(productId, {
      ...curProd,
      value: curProd.value + bruto,
    });
  }

  return {
    agg: payload.agg,
    timeline: Array.from(timelineMap.entries()).map(([date, value]) => ({
      date,
      value,
    })),
    topDestinos: Array.from(destinoMap.entries())
      .map(([name, value]) => ({
        name,
        value,
        count: destinoCountMap.get(name) || 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5),
    porProduto: Array.from(produtoMap.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 6),
  };
}

function hasDashboardSummaryData(summary?: VendasKpiDashboardSummary | null) {
  if (!summary) return false;
  const agg = summary.agg;
  if (
    toNum(agg?.totalVendas) > 0 ||
    toNum(agg?.totalTaxas) > 0 ||
    toNum(agg?.totalSeguro) > 0 ||
    toNum(agg?.countVendas) > 0 ||
    toNum(agg?.countAtivas) > 0
  ) {
    return true;
  }

  return (
    summary.timeline.some((item) => toNum(item.value) > 0) ||
    summary.topDestinos.some((item) => toNum(item.value) > 0 || toNum(item.count) > 0) ||
    summary.porProduto.some((item) => toNum(item.value) > 0)
  );
}

export async function fetchVendasKpiDashboardSummary(
  client: SupabaseClient,
  params: {
    dataInicio: string;
    dataFim: string;
    companyIds: string[];
    vendedorIds: string[];
    accessibleClientIds?: string[];
  },
  readModelOptions?: ReciboContribuicoesReadModelOptions,
): Promise<VendasKpiDashboardSummary> {
  const useAggregatedReadModel =
    readModelOptions?.mode === "stale-while-revalidate" &&
    normalizeCompanyScopeIds(params.companyIds).length > 0;

  if (useAggregatedReadModel) {
    const aggregated = await fetchDashboardSummaryReadModelRpc(client, params);
    if (aggregated) {
      if (hasDashboardSummaryData(aggregated)) {
        scheduleReciboContribuicoesReadModelEnsure(
          client,
          params,
          (loaderParams) =>
            fetchVendasKpiReciboContributionsRaw(getAdminClient(), loaderParams),
          readModelOptions?.executionContext,
        );
        return aggregated;
      }

      if (readModelOptions?.fallbackToRawOnReadError === false) {
        scheduleReciboContribuicoesReadModelEnsure(
          client,
          params,
          (loaderParams) =>
            fetchVendasKpiReciboContributionsRaw(getAdminClient(), loaderParams),
          readModelOptions?.executionContext,
        );
        if (readModelOptions?.fallbackToRawWhenEmpty) {
          try {
            return buildDashboardSummaryFromContributions(
              await fetchVendasKpiReciboContributionsRaw(client, params),
            );
          } catch (error) {
            logServerError(
              "[vendas-kpis] fallback bruto do dashboard falhou; mantendo read model vazio.",
              error,
            );
          }
        }
        return aggregated;
      }

      // Um RPC vazio pode significar read model ainda não reconstruído. Nesse caso
      // bloqueamos uma vez para popular/ler a tabela antes de responder zero real.
      return buildDashboardSummaryFromContributions(
        await fetchVendasKpiReciboContributions(client, params, {
          mode: "blocking",
          executionContext: readModelOptions?.executionContext,
        }),
      );
    }
  }

  return buildDashboardSummaryFromContributions(
    await fetchVendasKpiReciboContributions(client, params, readModelOptions),
  );
}

export async function fetchAndComputeVendasTimeline(
  client: SupabaseClient,
  params: {
    dataInicio: string;
    dataFim: string;
    companyIds: string[];
    vendedorIds: string[];
    accessibleClientIds?: string[];
  },
): Promise<VendasTimelinePoint[]> {
  const [{ rows, rateioMap }, termosNaoComissionaveis] = await Promise.all([
    fetchResolvedRows(client, params),
    carregarTermosNaoComissionaveis(client),
  ]);

  const vendaIds = buildVendaIdsFromRows(rows);
  const naoComissionadoPorVenda = await fetchNaoComissionadoPorVenda(
    client,
    vendaIds,
    termosNaoComissionaveis,
  );

  const scopeVendedorIds = buildScopeIdSet(params.vendedorIds);
  const hasScopeVendedores = scopeVendedorIds.size > 0;
  const timelineMap = new Map<string, number>();

  const groupedByVenda = new Map<
    string,
    { vendaRows: VendaAggregateRow[]; recibos: NonNullReceiptRow[] }
  >();

  for (const row of rows) {
    const rowExtra = row as VendaAggregateRowExtra;
    const syntheticKey = [
      toDateKey(row?.data_venda),
      toStr(row?.vendedor_id),
      toStr(rowExtra.destino_id),
      toStr(rowExtra.valor_total || rowExtra.valor_total_bruto),
    ].join("|");
    const vendaKey =
      toStr(rowExtra.source_venda_id || row?.id) || `synt:${syntheticKey}`;
    const current = groupedByVenda.get(vendaKey) || {
      vendaRows: [],
      recibos: [],
    };
    current.vendaRows.push(row);
    if (Array.isArray(row?.vendas_recibos) && row.vendas_recibos.length > 0) {
      current.recibos.push(...normalizeReceiptRows(row.vendas_recibos));
    }
    groupedByVenda.set(vendaKey, current);
  }

  for (const [vendaKey, group] of groupedByVenda) {
    const vendaPrincipal =
      group.vendaRows.find((row) => toStr(row?.id) === vendaKey) ||
      group.vendaRows[0];
    const vendaPrincipalExtra = vendaPrincipal as VendaAggregateRowExtra;

    if (
      isStatusCancelado(
        vendaPrincipalExtra.status,
        vendaPrincipal?.cancelada,
      )
    )
      continue;

    const vendaDate = toDateKey(vendaPrincipal?.data_venda);
    const recibosAll = filterRecibosCanceladosMesmoMes(group.recibos || []);

    const recibosByKey = new Map<string, ReportReceiptRow>();
    const recibosByBusiness = new Set<string>();
    for (const recibo of recibosAll) {
      const reciboId = toStr(recibo?.id);
      const businessKey = buildReciboBusinessKey(recibo);
      if (businessKey && recibosByBusiness.has(businessKey)) continue;
      if (businessKey) recibosByBusiness.add(businessKey);
      const key =
        reciboId ||
        businessKey ||
        `${toDateKey(recibo?.data_venda)}|${getReciboBruto(recibo)}|${getReciboTaxas(recibo)}`;
      if (!recibosByKey.has(key)) recibosByKey.set(key, recibo);
    }
    const recibosUnique = Array.from(recibosByKey.values());
    const somaBrutoRecibos = recibosUnique.reduce(
      (acc, recibo) => acc + getReciboBruto(recibo),
      0,
    );
    const somaTaxasRecibos = recibosUnique.reduce(
      (acc, recibo) => acc + getReciboTaxas(recibo),
      0,
    );

    const linkedNaoComissionado = toNum(
      naoComissionadoPorVenda.porVenda.get(vendaKey) || 0,
    );
    const naoComissionadoSemRecibo = toNum(
      naoComissionadoPorVenda.porVendaSemRecibo.get(vendaKey) || 0,
    );
    const usarModoPorRecibo =
      linkedNaoComissionado > 0 && naoComissionadoSemRecibo <= 0;
    const naoComissionadoTotalPagamentos = Math.max(
      0,
      toNum(naoComissionadoPorVenda.porVenda.get(vendaKey) || 0),
    );
    const rankingGrupo = calcularRankingComissionavel({
      valorBruto: somaBrutoRecibos,
      valorTaxas: somaTaxasRecibos,
      valorNaoComissionado: usarModoPorRecibo
        ? 0
        : naoComissionadoTotalPagamentos,
    });

    const recibosPeriodo = recibosUnique.filter((recibo) => {
      const reciboDate = toDateKey(recibo?.data_venda) || vendaDate;
      return (
        Boolean(reciboDate) &&
        reciboDate >= params.dataInicio &&
        reciboDate <= params.dataFim
      );
    });

    for (const recibo of recibosPeriodo) {
      const reciboExtra = recibo as ScopedReceiptRow;
      const reciboId = toStr(recibo?.id);
      const reciboJaAjustadoPorConciliacao = hasConciliacaoOverride(recibo);
      const naoComissionadoRecibo =
        usarModoPorRecibo && reciboId && !reciboJaAjustadoPorConciliacao
          ? toNum(naoComissionadoPorVenda.porRecibo.get(reciboId) || 0)
          : 0;

      const rankingRecibo = calcularRankingComissionavel({
        valorBruto: getReciboBruto(recibo),
        valorTaxas: getReciboTaxas(recibo),
        valorNaoComissionado: usarModoPorRecibo ? naoComissionadoRecibo : 0,
      });
      const fatorRecibo = usarModoPorRecibo
        ? rankingRecibo.fatorValor
        : rankingGrupo.fatorValor;
      const bruto = usarModoPorRecibo
        ? rankingRecibo.valorRanking
        : getReciboBruto(recibo) * fatorRecibo;

      const vendedorId =
        toStr(reciboExtra.rateio_scope_vendor_id) ||
        toStr(reciboExtra.vendedor_id) ||
        toStr(vendaPrincipalExtra.vendedor_id);
      const rateio = reciboId ? rateioMap.get(reciboId) : null;
      const baseAllocations =
        rateio &&
        rateio.ativo &&
        isUuid(rateio.vendedor_origem_id) &&
        isUuid(rateio.vendedor_destino_id) &&
        toNum(rateio.percentual_destino) > 0 &&
        toNum(rateio.percentual_origem) > 0
          ? [
              {
                vendedorId: toStr(rateio.vendedor_origem_id),
                fator: Math.max(
                  0,
                  Math.min(1, toNum(rateio.percentual_origem) / 100),
                ),
              },
              {
                vendedorId: toStr(rateio.vendedor_destino_id),
                fator: Math.max(
                  0,
                  Math.min(1, toNum(rateio.percentual_destino) / 100),
                ),
              },
            ]
          : [{ vendedorId, fator: 1 }];

      const allocations = hasScopeVendedores
        ? baseAllocations.filter((item) =>
            scopeVendedorIds.has(item.vendedorId),
          )
        : baseAllocations;

      const reciboDate = toDateKey(recibo?.data_venda) || vendaDate;
      if (!reciboDate) continue;

      for (const allocation of allocations) {
        const brutoAlloc = bruto * allocation.fator;
        if (brutoAlloc <= 0) continue;
        timelineMap.set(
          reciboDate,
          (timelineMap.get(reciboDate) || 0) + brutoAlloc,
        );
      }
    }
  }

  return Array.from(timelineMap.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, value]) => ({ date, value: Number(value.toFixed(2)) }));
}