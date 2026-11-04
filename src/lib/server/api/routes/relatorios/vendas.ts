// Migrado para Hono de src/routes/api/v1/relatorios/vendas/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from "@sveltejs/kit";
import {
  ensureModuloAccess,
  getAdminClient,
  logServerError,
  NO_MATCH_COMPANY_ID,
  requireAuthenticatedUser,
  resolveAccessibleClientIds,
  resolveScopedCompanyIds,
  resolveScopedVendedorIds,
  resolveUserScope,
  toErrorResponse,
} from "$lib/server/v1";
import {
  fetchLatestPaymentForms,
  fetchSalesReportRows,
  type DestinationCityNameMap,
  type ReportReceiptRow,
  type ReportVendaRow,
  getCurrentYearRange,
  getReceiptCidadeNome,
  getReceiptProductDescriptor,
  getVendaClienteNome,
  getVendaCodigo,
  getVendaDestino,
  getVendaStatus,
  getVendaVendedorNome,
} from "$lib/server/relatorios";
import { DYNAMIC_READ_HEADERS } from "$lib/server/httpCache";
import {
  buildConciliacaoSyntheticVendas,
  fetchEffectiveConciliacaoReceipts,
  fetchSuppressedConciliacaoReceipts,
  filterRecibosCanceladosMesmoMes,
} from "$lib/conciliacao/source";
import {
  applyRateioToSalesForScopedVendedores,
  fetchRateioByReciboIds,
  fetchSplitSaleIdsForDestinationVendedores,
} from "$lib/vendas/rateio";
import {
  addMonthsISODate,
  monthRangeFromYearMonth,
  parseISODateParts,
  todayISODateLocal,
} from "$lib/date";
import { resolveGroupedReceiptCommissions } from "$lib/server/comissoes";
import { calcularRankingComissionavel } from "$lib/server/rankingComissionavel";
import { isEquipeVturNome } from "$lib/conciliacao/baixaRac";
import { normalizeReceiptNumber } from "$lib/conciliacao/receiptNumber";
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags,
} from "$lib/server/readModelCache";
import {
  cleanStringSet,
  chunkArray,
  dedupeById as dedupeRowsById,
  QUERY_IN_BATCH_SIZE,
  uniqueCleanStrings,
} from "$lib/utils/array";
import { toCleanString as toStr, toFiniteNumber as toNum } from "$lib/utils/values";
import { isFormaNaoComissionavel } from '$lib/naoComissionavel';
import { carregarTermosNaoComissionaveis as carregarTermosNaoComissionaveisBase } from '$lib/server/naoComissionavelTermos';

const PT_BR_COLLATOR = new Intl.Collator("pt-BR");
const DEFAULT_ITEMS_LIMIT = 1000;
const MAX_ITEMS_LIMIT = 5000;

type AdminClient = ReturnType<typeof getAdminClient>;

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

type VendedorLookupRow = {
  id?: string | null;
  nome_completo?: string | null;
  email?: string | null;
};


type ReportSalesRowLike = {
  id?: string | null;
  vendedor_id?: string | null;
  data_venda?: string | null;
  recibos?: ReportReceiptRow[] | null;
  vendas_recibos?: ReportReceiptRow[] | null;
};

type ParametrosComissaoRow = {
  company_id?: string | null;
  conciliacao_sobrepoe_vendas?: boolean | null;
};

type ReportReceiptItem = NonNullable<ReportReceiptRow> & {
  numero_recibo_normalizado?: string | null;
};

type ConciliacaoReceiptView = Awaited<
  ReturnType<typeof fetchEffectiveConciliacaoReceipts>
>[number];

type SplitConciliacaoRow = {
  conciliacao_recibo_id?: string | null;
};

type ReportSalesViewRow = ReportVendaRow & {
  conciliacao_ids?: string[] | null;
  vendas_recibos?: ReportReceiptItem[] | null;
  recibos?: ReportReceiptItem[] | null;
  linked_venda_id?: string | null;
  linked_recibo_id?: string | null;
};

type SyntheticConciliacaoVendaRow = ReturnType<
  typeof buildConciliacaoSyntheticVendas
>[number];

type ConsultaReceiptRow = {
  id?: string | null;
  numero_recibo?: string | null;
  numero_reserva?: string | null;
  destino_cidade?: { id?: string | null; nome?: string | null } | null;
  tipo_pacote?: string | null;
  valor_total?: number | null;
  valor_taxas?: number | null;
  valor_du?: number | null;
  valor_rav?: number | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  tipo_produtos?: { id?: string | null; nome?: string | null; tipo?: string | null } | null;
  produto_resolvido?: { id?: string | null; nome?: string | null; cidade_id?: string | null } | null;
  vendedor_id?: string | null;
  rateio_scope_vendor_id?: string | null;
};

type ConsultaVendaRow = ReportVendaRow & {
  clientes?: {
    nome?: string | null;
    whatsapp?: string | null;
  } | null;
  recibos: ConsultaReceiptRow[];
  vendas_recibos?: ConsultaReceiptRow[] | null;
};

function clampIntParam(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function isReportReceiptItem(
  recibo: ReportReceiptRow,
): recibo is ReportReceiptItem {
  return Boolean(recibo);
}



function hasConciliacaoOverride(recibo?: ReportReceiptRow | null) {
  return (
    recibo?.valor_bruto_override != null ||
    recibo?.valor_liquido_override != null ||
    recibo?.valor_meta_override != null ||
    Boolean(recibo?.faixa_comissao) ||
    recibo?.percentual_comissao_loja != null
  );
}

function getReciboBrutoExibicao(recibo?: ReportReceiptRow | null) {
  if (!recibo) return 0;
  if (hasConciliacaoOverride(recibo) && recibo.valor_bruto_override != null) {
    return Math.max(0, toNum(recibo.valor_bruto_override));
  }
  return Math.max(0, toNum(recibo.valor_total) - toNum(recibo.valor_rav));
}

function getReciboTaxasExibicao(recibo?: ReportReceiptRow | null) {
  if (!recibo) return 0;
  if (hasConciliacaoOverride(recibo)) {
    return Math.max(0, toNum(recibo.valor_taxas));
  }
  return Math.max(0, toNum(recibo.valor_taxas) - toNum(recibo.valor_du));
}


function calcularValorPagamento(pagamento: PagamentoNaoComissionavelInput) {
  const total = toNum(pagamento.valor_total);
  if (total > 0) return total;
  const bruto = toNum(pagamento.valor_bruto);
  const desconto = toNum(pagamento.desconto_valor);
  if (bruto > 0) return Math.max(0, bruto - desconto);
  return 0;
}

function addToMap(map: Map<string, number>, key: string, value: number) {
  if (!key || value <= 0) return;
  map.set(key, (map.get(key) || 0) + value);
}

async function fetchVendedoresByIds(client: AdminClient, vendedorIds: string[]) {
  const ids = uniqueCleanStrings(vendedorIds).sort();
  if (ids.length === 0) {
    return new Map<string, { nome_completo?: string | null; email?: string | null }>();
  }

  return getCachedReadModel<Map<string, { nome_completo?: string | null; email?: string | null }>>({
    key: buildReadModelCacheKey("relatorios:vendas:vendedores-map", { ids }),
    tags: [
      READ_MODEL_TAGS.users,
      ...scopeCacheTags({ vendedorIds: ids }),
    ],
    ttlMs: 300_000,
    staleTtlMs: 1_800_000,
    loader: async () => {
      const vendedorMap = new Map<
        string,
        { nome_completo?: string | null; email?: string | null }
      >();
      const batchRows = await Promise.all(
        chunkArray(ids, 200).map(async (batch) => {
          const { data, error } = await client
            .from("users")
            .select("id, nome_completo, email")
            .in("id", batch);
          if (error) throw error;
          return data || [];
        }),
      );

      for (const row of batchRows.flat()) {
        const id = toStr(row?.id);
        if (!id) continue;
        vendedorMap.set(id, {
          nome_completo: row?.nome_completo ?? null,
          email: row?.email ?? null,
        });
      }

      return vendedorMap;
    },
  });
}

function collectDestinationCityIds(rows: ReportSalesViewRow[]) {
  const ids = new Set<string>();
  const add = (value?: string | null) => {
    const id = toStr(value);
    if (id) ids.add(id);
  };

  for (const row of rows) {
    add(row?.destino_cidade?.id);
    add(row?.destinos?.cidade_id);

    const recibos = Array.isArray(row?.recibos)
      ? row.recibos
      : Array.isArray(row?.vendas_recibos)
        ? row.vendas_recibos
        : [];

    for (const recibo of recibos) {
      add(recibo?.destino_cidade?.id);
      add(recibo?.produto_resolvido?.cidade_id);
    }
  }

  return Array.from(ids).sort();
}

async function fetchDestinationCityNames(
  client: AdminClient,
  cityIds: string[],
): Promise<DestinationCityNameMap> {
  const ids = uniqueCleanStrings(cityIds).sort();
  if (ids.length === 0) return new Map();

  return getCachedReadModel<Map<string, string>>({
    key: buildReadModelCacheKey("relatorios:vendas:cidades-destino", { ids }),
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

async function hydrateMissingVendedores<T extends ReportSalesRowLike>(
  client: AdminClient,
  rows: T[],
) {
  const vendedorIds = uniqueCleanStrings(rows.map((row) => row?.vendedor_id));

  if (vendedorIds.length === 0) return rows;

  const vendedorMap = await fetchVendedoresByIds(client, vendedorIds);
  return rows.map((row) => {
    const vendedor = vendedorMap.get(toStr(row.vendedor_id));
    return vendedor ? ({ ...row, vendedor } as T) : row;
  });
}

function enrichSyntheticRowsFromBaseRows(
  baseRows: ReportSalesViewRow[],
  syntheticRows: ReportSalesViewRow[],
) {
  if (!Array.isArray(syntheticRows) || syntheticRows.length === 0) return syntheticRows;

  const baseByVendaId = new Map<string, ReportSalesViewRow>();
  const baseByReciboId = new Map<string, ReportSalesViewRow>();

  for (const row of baseRows) {
    const rowId = toStr(row?.id);
    if (rowId) baseByVendaId.set(rowId, row);

    const recibos = Array.isArray(row?.vendas_recibos)
      ? row.vendas_recibos
      : Array.isArray(row?.recibos)
        ? row.recibos
        : [];

    for (const recibo of recibos) {
      const reciboId = toStr(recibo?.id);
      if (reciboId && !baseByReciboId.has(reciboId)) {
        baseByReciboId.set(reciboId, row);
      }
    }
  }

  return syntheticRows.map((row) => {
    const linkedVendaId = toStr(row?.linked_venda_id);
    const linkedReciboId = toStr(row?.linked_recibo_id);
    const source =
      (linkedVendaId ? baseByVendaId.get(linkedVendaId) : null) ||
      (linkedReciboId ? baseByReciboId.get(linkedReciboId) : null) ||
      null;

    if (!source) return row;

    return {
      ...row,
      cliente_id: row?.cliente_id || source?.cliente_id || null,
      clientes: row?.clientes || source?.clientes || null,
      destino_cidade: row?.destino_cidade || source?.destino_cidade || null,
      destinos: row?.destinos || source?.destinos || null,
    } as ReportSalesViewRow;
  });
}

async function hydrateSyntheticRowsFromLinkedVendas(
  client: AdminClient,
  rows: ReportSalesViewRow[],
) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const pending = rows.filter((row) => {
    const linkedVendaId = toStr(row?.linked_venda_id);
    if (!linkedVendaId) return false;
    const hasCliente = Boolean(toStr(row?.clientes?.nome));
    const hasDestino = Boolean(
      toStr(row?.destino_cidade?.nome) ||
      toStr(row?.destino_cidade?.id) ||
      toStr(row?.destinos?.cidade_id),
    );
    return !hasCliente || !hasDestino;
  });
  if (pending.length === 0) return rows;

  const linkedVendaIds = uniqueCleanStrings(pending.map((row) => row?.linked_venda_id));
  if (linkedVendaIds.length === 0) return rows;

  const vendaMap = new Map<
    string,
    {
      cliente_id: string | null;
      clientes: { nome?: string | null } | null;
      destino_cidade: { id?: string | null; nome?: string | null } | null;
      destinos: { id?: string | null; nome?: string | null; cidade_id?: string | null; tipo_produto?: string | null } | null;
    }
  >();

  for (const batch of chunkArray(linkedVendaIds, 200)) {
    const { data, error } = await client
      .from("vendas")
      .select(
        `
          id,
          cliente_id,
          clientes (nome),
          destino_cidade:cidades!destino_cidade_id (id, nome),
          destinos:produtos!destino_id (id, nome, cidade_id, tipo_produto)
        `,
      )
      .in("id", batch);

    if (error) {
      logServerError(
        "[relatorios/vendas] falha ao hidratar linhas sinteticas por venda vinculada",
        error,
      );
      return rows;
    }

    for (const row of data || []) {
      const id = toStr((row as { id?: string | null })?.id);
      if (!id) continue;
      const item = row as {
        cliente_id?: string | null;
        clientes?: { nome?: string | null } | null;
        destino_cidade?: { id?: string | null; nome?: string | null } | null;
        destinos?: { id?: string | null; nome?: string | null; cidade_id?: string | null; tipo_produto?: string | null } | null;
      };
      vendaMap.set(id, {
        cliente_id: toStr(item?.cliente_id) || null,
        clientes: item?.clientes || null,
        destino_cidade: item?.destino_cidade || null,
        destinos: item?.destinos || null,
      });
    }
  }

  return rows.map((row) => {
    const linkedVendaId = toStr(row?.linked_venda_id);
    if (!linkedVendaId) return row;
    const source = vendaMap.get(linkedVendaId);
    if (!source) return row;

    return {
      ...row,
      cliente_id: row?.cliente_id || source.cliente_id || null,
      clientes: row?.clientes || source.clientes || null,
      destino_cidade: row?.destino_cidade || source.destino_cidade || null,
      destinos: row?.destinos || source.destinos || null,
    } as ReportSalesViewRow;
  });
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

function carregarTermosNaoComissionaveis(client: AdminClient) {
  return carregarTermosNaoComissionaveisBase(client, {
    onError: (error) =>
      logServerError(
        "[relatorios/vendas] falha ao carregar termos nao comissionaveis",
        error,
      ),
  });
}

async function fetchNaoComissionadoPorVenda(
  client: AdminClient,
  vendaIds: string[],
) {
  if (vendaIds.length === 0) {
    return {
      porVenda: new Map<string, number>(),
      porVendaSemRecibo: new Map<string, number>(),
      porRecibo: new Map<string, number>(),
    };
  }

  const [pagamentoBatches, termos] = await Promise.all([
    Promise.all(
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
    ),
    carregarTermosNaoComissionaveis(client),
  ]);
  const pagamentos = pagamentoBatches.flat();
  return calcularNaoComissionavelResumo(pagamentos, termos);
}

function getRecibosAtivos(row: ReportSalesRowLike) {
  const recibos = Array.isArray(row?.recibos)
    ? row.recibos
    : Array.isArray(row?.vendas_recibos)
      ? row.vendas_recibos
      : [];
  return recibos.filter(
    (recibo): recibo is ReportReceiptItem =>
      isReportReceiptItem(recibo) && !recibo.cancelado_por_conciliacao_em,
  );
}

function getVendaValorExibicao(row: ReportSalesRowLike) {
  const recibos = getRecibosAtivos(row);
  if (recibos.length === 0) return 0;
  return Number(
    recibos
      .reduce(
        (sum: number, recibo: ReportReceiptRow) =>
          sum + getReciboBrutoExibicao(recibo),
        0,
      )
      .toFixed(2),
  );
}

function getVendaTaxasExibicao(row: ReportSalesRowLike) {
  const recibos = getRecibosAtivos(row);
  if (recibos.length === 0) return 0;
  return Number(
    recibos
      .reduce(
        (sum: number, recibo: ReportReceiptRow) =>
          sum + getReciboTaxasExibicao(recibo),
        0,
      )
      .toFixed(2),
  );
}

function computeReceiptRankingEntries(
  rowsInput: ReportSalesRowLike[],
  naoComissionadoPorVenda: PagamentosNaoComissionaveisResumo,
) {
  const entries: Array<{ date: string; value: number }> = [];

  for (const row of rowsInput || []) {
    const receiptRows = getRecibosAtivos(row);
    if (receiptRows.length === 0) continue;

    const vendaId = toStr(row?.id);
    const somaBrutoRecibos = receiptRows.reduce(
      (sum: number, recibo: ReportReceiptRow) =>
        sum + getReciboBrutoExibicao(recibo),
      0,
    );
    const somaTaxasRecibos = receiptRows.reduce(
      (sum: number, recibo: ReportReceiptRow) =>
        sum + getReciboTaxasExibicao(recibo),
      0,
    );
    const linkedNaoComissionado = toNum(
      naoComissionadoPorVenda.porVenda.get(vendaId) || 0,
    );
    const naoComissionadoSemRecibo = toNum(
      naoComissionadoPorVenda.porVendaSemRecibo.get(vendaId) || 0,
    );
    const usarModoPorRecibo =
      linkedNaoComissionado > 0 && naoComissionadoSemRecibo <= 0;
    const rankingGrupo = calcularRankingComissionavel({
      valorBruto: somaBrutoRecibos,
      valorTaxas: somaTaxasRecibos,
      valorNaoComissionado: usarModoPorRecibo ? 0 : linkedNaoComissionado,
    });

    for (const recibo of receiptRows) {
      const date = toStr(recibo?.data_venda || row?.data_venda);
      if (!date) continue;

      const reciboId = toStr(recibo?.id);
      const reciboJaAjustadoPorConciliacao = hasConciliacaoOverride(recibo);
      const naoComissionadoRecibo =
        usarModoPorRecibo && reciboId && !reciboJaAjustadoPorConciliacao
          ? toNum(naoComissionadoPorVenda.porRecibo.get(reciboId) || 0)
          : 0;
      const rankingRecibo = calcularRankingComissionavel({
        valorBruto: getReciboBrutoExibicao(recibo),
        valorTaxas: getReciboTaxasExibicao(recibo),
        valorNaoComissionado: usarModoPorRecibo ? naoComissionadoRecibo : 0,
      });
      const value = usarModoPorRecibo
        ? rankingRecibo.valorRanking
        : getReciboBrutoExibicao(recibo) * rankingGrupo.fatorValor;

      if (value > 0) entries.push({ date: date.slice(0, 10), value });
    }
  }

  return entries;
}

function sumRankingEntriesBetween(
  entries: Array<{ date: string; value: number }>,
  start: string,
  end: string,
) {
  return entries.reduce((sum, entry) => {
    if (entry.date < start || entry.date > end) return sum;
    return sum + entry.value;
  }, 0);
}

function getLastSixMonthBuckets(referenceIso: string) {
  const reference =
    parseISODateParts(referenceIso) || parseISODateParts(todayISODateLocal());
  if (!reference) return [];
  const referenceMonthStart = `${reference.year}-${String(reference.month).padStart(2, "0")}-01`;

  return Array.from({ length: 6 }, (_, index) => {
    const monthStart = addMonthsISODate(referenceMonthStart, -(5 - index));
    const current = parseISODateParts(monthStart);
    if (!current)
      return {
        key: monthStart.slice(0, 7),
        start: monthStart,
        end: monthStart,
      };
    const range = monthRangeFromYearMonth(current.year, current.month);
    const key = monthStart.slice(0, 7);
    const isReferenceMonth = key === reference.iso.slice(0, 7);
    return {
      key,
      start: range.inicio,
      end: isReferenceMonth ? reference.iso : range.fim,
    };
  });
}

function getCurrentMonthDayBuckets(referenceIso: string) {
  const reference =
    parseISODateParts(referenceIso) || parseISODateParts(todayISODateLocal());
  if (!reference) return [];
  const range = monthRangeFromYearMonth(reference.year, reference.month);
  const daysInMonth = Number(range.fim.slice(8, 10));

  return Array.from({ length: daysInMonth }, (_, index) => {
    const date = `${reference.year}-${String(reference.month).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`;
    return {
      date,
      day: index + 1,
    };
  });
}

export async function handleRelatoriosVendasGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ["relatorios_vendas", "relatorios", "vendas"],
        1,
        "Sem acesso ao relatorio de vendas.",
      );
    }

    const { searchParams } = event.url;
    const defaultRange = getCurrentYearRange();
    const hasDataInicio = Boolean(searchParams.get("data_inicio"));
    const hasDataFim = Boolean(searchParams.get("data_fim"));
    const monthEnd = todayISODateLocal();
    const monthStart = `${monthEnd.slice(0, 7)}-01`;
    const vendedorDefaultRange = scope.isVendedor || scope.usoIndividual;

    const dataInicio = String(
      searchParams.get("data_inicio") ||
        (vendedorDefaultRange ? monthStart : defaultRange.dataInicio),
    ).trim();
    const dataFim = String(
      searchParams.get("data_fim") ||
        (vendedorDefaultRange ? monthEnd : defaultRange.dataFim),
    ).trim();
    const companyIds = resolveScopedCompanyIds(
      scope,
      searchParams.get("empresa_id"),
    );
    const requestedVendedorRaw =
      searchParams.get("vendedor_ids") || searchParams.get("vendedor_id");
    const hasRequestedVendedorFilter = String(requestedVendedorRaw || "")
      .trim()
      .length > 0;
    const scopedVendedorIds = await resolveScopedVendedorIds(
      client,
      scope,
      requestedVendedorRaw,
    );
    const vendedorIds =
      hasRequestedVendedorFilter && scopedVendedorIds.length === 0
        ? [NO_MATCH_COMPANY_ID]
        : scopedVendedorIds;
    const statusFilter = String(searchParams.get("status") || "")
      .trim()
      .toLowerCase();
    const clienteId = String(searchParams.get("cliente_id") || "").trim();
    const destinoFilter = String(searchParams.get("destino") || "")
      .trim()
      .toLowerCase();
    const produtoFilter = String(searchParams.get("produto") || "")
      .trim()
      .toLowerCase();
    const tipoProdutoFilter = String(searchParams.get("tipo_produto") || "")
      .trim()
      .toLowerCase();
    const itemsLimit = clampIntParam(
      searchParams.get("items_limit"),
      DEFAULT_ITEMS_LIMIT,
      0,
      MAX_ITEMS_LIMIT,
    );
    const itemsOffset = clampIntParam(
      searchParams.get("items_offset"),
      0,
      0,
      1_000_000,
    );
    const includeSummary = String(
      searchParams.get("include_summary") ?? searchParams.get("summary") ?? "1",
    ).trim() !== "0";
    const accessibleClientIds =
      !scope.isAdmin &&
      !scope.isMaster &&
      !scope.isFinanceiro &&
      !scope.isGestor &&
      vendedorIds.length === 0
      ? await resolveAccessibleClientIds(client, { companyIds, vendedorIds })
      : [];

    let conciliacaoSobrepoeVendas = false;
    if (companyIds.length > 0) {
      const parametrosBatchRows = await Promise.all(
        chunkArray(companyIds).map(async (companyBatch) => {
          const { data, error: parametrosError } = await client
            .from("parametros_comissao")
            .select("company_id, conciliacao_sobrepoe_vendas")
            .in("company_id", companyBatch)
            .limit(1000);
          if (parametrosError) return [] as ParametrosComissaoRow[];
          return (data || []) as ParametrosComissaoRow[];
        })
      );
      const parametrosRows = parametrosBatchRows.flat();
      conciliacaoSobrepoeVendas = parametrosRows.some((row) =>
        Boolean(row?.conciliacao_sobrepoe_vendas),
      );
    }

    const mergeRowsById = <T extends { id?: string | null }>(
      baseRows: T[],
      extraRows: T[],
    ) => {
      const map = new Map<string, T>();
      for (const row of [...baseRows, ...extraRows]) {
        const id = String(row?.id || "").trim();
        if (!id) continue;
        if (!map.has(id)) map.set(id, row);
      }
      return Array.from(map.values());
    };

    const toRateioShape = <T extends ReportSalesRowLike>(rows: T[]) =>
      rows.map((row) => ({
        ...row,
        vendas_recibos: Array.isArray(row?.recibos)
          ? row.recibos.filter(Boolean)
          : Array.isArray(row?.vendas_recibos)
            ? row.vendas_recibos.filter(Boolean)
            : [],
      })) as unknown as ReportSalesViewRow[];

    const getConciliacaoIds = (item: { conciliacao_ids?: string[] | null; id?: string | null }) => {
      const ids = Array.isArray(item?.conciliacao_ids)
        ? item.conciliacao_ids
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        : [];
      if (ids.length > 0) return ids;
      const id = String(item?.id || "").trim();
      return id ? [id] : [];
    };

    const toRecibosView = (row: ReportSalesViewRow) => {
      if (Array.isArray(row?.vendas_recibos)) return row.vendas_recibos;
      if (Array.isArray(row?.recibos)) return row.recibos;
      return [] as ReportReceiptItem[];
    };

    const loadRowsViewForPeriod = async (
      periodStart: string,
      periodEnd: string,
    ) => {
      const baseRowsPromise = fetchSalesReportRows(client, {
        dataInicio: periodStart,
        dataFim: periodEnd,
        companyIds,
        vendedorIds,
        includeCancelled: true,
      });
      const splitSaleIdsPromise =
        vendedorIds.length > 0
          ? fetchSplitSaleIdsForDestinationVendedores(client, {
              companyId: companyIds[0] || null,
              companyIds,
              vendedorIds,
            }).catch((error) => {
              logServerError(
                "[relatorios/vendas] split sales indisponivel, seguindo sem rateio destino",
                error,
              );
              return [] as string[];
            })
          : Promise.resolve([] as string[]);
      const concReceiptsPromise = fetchEffectiveConciliacaoReceipts({
        client,
        companyId: companyIds[0] || null,
        companyIds,
        inicio: periodStart,
        fim: periodEnd,
        vendedorIds,
        excludeVendedorIds: undefined,
      }).catch((error) => {
        logServerError(
          "[relatorios/vendas] conciliacao indisponivel, seguindo sem overrides",
          error,
        );
        return [] as ConciliacaoReceiptView[];
      });

      const [baseRowsRaw, splitSaleIds, concReceiptsBase] = await Promise.all([
        baseRowsPromise,
        splitSaleIdsPromise,
        concReceiptsPromise,
      ]);
      let rows = toRateioShape(baseRowsRaw);

      if (splitSaleIds.length > 0) {
        const splitRows = toRateioShape(
          await fetchSalesReportRows(client, {
            dataInicio: periodStart,
            dataFim: periodEnd,
            companyIds,
            vendaIds: splitSaleIds,
            includeCancelled: true,
          }),
        );
        rows = mergeRowsById(rows, splitRows);
      }

      const concReceipts: ConciliacaoReceiptView[] = concReceiptsBase;
      let concReceiptsAllCache: ConciliacaoReceiptView[] | null = null;
      const loadConcReceiptsAll = async () => {
        if (concReceiptsAllCache) return concReceiptsAllCache;
        try {
          concReceiptsAllCache = await fetchEffectiveConciliacaoReceipts({
            client,
            companyId: companyIds[0] || null,
            companyIds,
            inicio: periodStart,
            fim: periodEnd,
            vendedorIds: null,
            excludeVendedorIds: undefined,
          });
        } catch (error) {
          logServerError(
            "[relatorios/vendas] conciliation all indisponivel",
            error,
          );
          concReceiptsAllCache = [];
        }
        return concReceiptsAllCache;
      };
      const concReceiptsForOverrides =
        vendedorIds.length > 0 ? await loadConcReceiptsAll() : concReceipts;
      const allowedVendedorSet =
        vendedorIds.length > 0
          ? cleanStringSet(vendedorIds)
          : null;

      if (vendedorIds.length > 0) {
        const splitConcCompanyBatches =
          companyIds.length > 0 ? chunkArray(companyIds) : [null];
        const splitConcVendedorBatches = chunkArray(vendedorIds);
        const splitConcBatchRows = await Promise.all(
          splitConcCompanyBatches.flatMap((companyBatch) =>
            splitConcVendedorBatches.map(async (vendedorBatch) => {
              let splitConcQuery = client
                .from("vendas_recibos_rateio")
                .select("conciliacao_recibo_id")
                .eq("ativo", true)
                .gt("percentual_destino", 0)
                .in("vendedor_destino_id", vendedorBatch)
                .not("conciliacao_recibo_id", "is", null);

              if (companyBatch && companyBatch.length > 0) {
                splitConcQuery = splitConcQuery.in("company_id", companyBatch);
              }

              const { data, error: splitConcErr } = await splitConcQuery;
              if (splitConcErr) {
                logServerError(
                  "[relatorios/vendas] split conciliation indisponivel",
                  splitConcErr,
                );
                return [] as SplitConciliacaoRow[];
              }
              return (data || []) as SplitConciliacaoRow[];
            })
          )
        );
        const splitConcRows = splitConcBatchRows.flat();

        const splitConcIdSet = cleanStringSet(
          (splitConcRows || []).map((row) => row?.conciliacao_recibo_id),
        );

        if (splitConcIdSet.size > 0) {
          const concAll = await loadConcReceiptsAll();
          const seenConcIds = new Set(
            (concReceipts || []).flatMap((item) =>
              getConciliacaoIds(item),
            ),
          );
          for (const item of concAll) {
            const candidateIds = getConciliacaoIds(item);
            if (candidateIds.length === 0) continue;
            if (!candidateIds.some((id: string) => splitConcIdSet.has(id)))
              continue;
            if (candidateIds.some((id: string) => seenConcIds.has(id))) continue;
            for (const id of candidateIds) {
              seenConcIds.add(id);
            }
            concReceipts.push(item);
          }
        }
      }

      const overriddenReceiptIds = new Set(
        uniqueCleanStrings(concReceiptsForOverrides.map((item) => item.linked_recibo_id)),
      );
      let suppressedConcReceipts: Array<{
        documento: string;
        numero_reserva?: string | null;
        linked_recibo_id: string | null;
      }> = [];
      try {
        suppressedConcReceipts = await fetchSuppressedConciliacaoReceipts({
          client,
          companyId: companyIds[0] || null,
          companyIds,
          inicio: periodStart,
          fim: periodEnd,
        });
      } catch (error) {
        logServerError(
          "[relatorios/vendas] conciliacao suprimida indisponivel",
          error,
        );
        suppressedConcReceipts = [];
      }
      const suppressedReceiptIds = new Set(
        suppressedConcReceipts
          .map((item) => toStr(item.linked_recibo_id))
          .filter(Boolean),
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
      const vendedorByConcReceiptId = new Map<string, string>(
        concReceiptsForOverrides
          .map((item) => [
            String(item.linked_recibo_id || "").trim(),
            String(item.vendedor_id || "").trim(),
          ])
          .filter(([reciboId, vendedorId]) =>
            Boolean(reciboId && vendedorId),
          ) as [string, string][],
      );

      const baseRows: ReportSalesViewRow[] = rows
        .map((row) => {
          const recibos = Array.isArray(row?.vendas_recibos)
            ? row.vendas_recibos
            : [];
          const withoutOverridden = conciliacaoSobrepoeVendas
            ? recibos.filter((recibo) => {
                const reciboId = String(recibo?.id || "").trim();
                const reciboNumero = normalizeReceiptNumber(
                  recibo?.numero_recibo,
                );
                return (
                  !overriddenReceiptIds.has(reciboId) &&
                  !suppressedReceiptIds.has(reciboId) &&
                  !(reciboNumero && suppressedReceiptNumbers.has(reciboNumero))
                );
              })
            : recibos;
          const withVendedorEfetivo = withoutOverridden
            .map((recibo) => {
              const vendedorId = vendedorByConcReceiptId.get(
                String(recibo?.id || "").trim(),
              );
              return vendedorId
                ? { ...recibo, vendedor_id: vendedorId }
                : recibo;
            })
            .filter((recibo) => {
              if (!allowedVendedorSet) return true;
              const vendedorId = vendedorByConcReceiptId.get(
                String(recibo?.id || "").trim(),
              );
              return !vendedorId || allowedVendedorSet.has(vendedorId);
            });
          const vendedorAtual = String(
            row?.vendedor?.nome_completo || "",
          ).trim();
          const vendedorEfetivo =
            !vendedorAtual || isEquipeVturNome(vendedorAtual)
              ? withVendedorEfetivo
                  .map((recibo) =>
                    vendedorByConcReceiptId.get(
                      String(recibo?.id || "").trim(),
                    ),
                  )
                  .find(Boolean)
              : null;

          return {
            ...row,
            ...(vendedorEfetivo
              ? { vendedor_id: vendedorEfetivo, vendedor: null }
              : {}),
            vendas_recibos:
              filterRecibosCanceladosMesmoMes(withVendedorEfetivo) as ReportReceiptItem[],
          };
        })
        .filter(
          (row) =>
            Array.isArray(row?.vendas_recibos) && row.vendas_recibos.length > 0,
        );

      const mergedRowsBase: ReportSalesViewRow[] =
        concReceipts.length > 0
          ? [
              ...baseRows,
              ...enrichSyntheticRowsFromBaseRows(
                baseRows,
                buildConciliacaoSyntheticVendas(
                  concReceipts,
                ) as unknown as ReportSalesViewRow[],
              ),
            ]
          : baseRows;
      const mergedRows = await hydrateSyntheticRowsFromLinkedVendas(
        client,
        mergedRowsBase,
      );

      if (mergedRows.length === 0) {
        return [] as ReportSalesViewRow[];
      }

      try {
        const reciboIds = mergedRows
          .flatMap((row) =>
            Array.isArray(row?.vendas_recibos) ? row.vendas_recibos : [],
          )
          .map((recibo) => String(recibo?.id || "").trim())
          .filter(Boolean);
        const rateioMap = await fetchRateioByReciboIds(client, reciboIds);
          rows = applyRateioToSalesForScopedVendedores(
            mergedRows,
            rateioMap,
            vendedorIds,
        ) as ReportSalesViewRow[];
      } catch (error) {
        logServerError(
          "[relatorios/vendas] rateio indisponivel, seguindo sem rateio",
          error,
        );
        rows = mergedRows;
      }

      return rows.map((row) => ({
        ...row,
        recibos: toRecibosView(row),
      }));
    };

    const filterRowsForReport = (
      rowsInput: ReportSalesViewRow[],
      cityNames?: DestinationCityNameMap,
    ) =>
      rowsInput.filter((row) => {
        if (clienteId && String(row.cliente_id || "").trim() !== clienteId) {
          return false;
        }

        const destino = getVendaDestino(row, cityNames).toLowerCase();
        if (destinoFilter && !destino.includes(destinoFilter)) {
          return false;
        }

        if (produtoFilter || tipoProdutoFilter) {
          const recibos =
            Array.isArray(row.recibos) && row.recibos.length > 0
              ? row.recibos
              : [null];
          const matches = recibos.some((recibo: ReportReceiptRow) => {
            const descriptor = getReceiptProductDescriptor(recibo, row);
            const produtoMatches =
              !produtoFilter ||
              descriptor.produto.toLowerCase().includes(produtoFilter);
            const tipoMatches =
              !tipoProdutoFilter ||
              descriptor.tipo.toLowerCase().includes(tipoProdutoFilter);
            return produtoMatches && tipoMatches;
          });

          if (!matches) {
            return false;
          }
        }

        return true;
      });

    const loadConsultaRowsBatch = async (
      periodStart: string,
      periodEnd: string,
      clientIdsFilter?: string[],
    ) => {
      const companyBatches = companyIds.length > 0 ? chunkArray(companyIds) : [null];
      const vendedorBatches =
        vendedorIds.length > 0 ? chunkArray(vendedorIds) : [null];
      const clientBatches =
        clientIdsFilter && clientIdsFilter.length > 0
          ? chunkArray(clientIdsFilter)
          : [null];

      const batchRows = await Promise.all(
        companyBatches.flatMap((companyBatch) =>
          vendedorBatches.flatMap((vendedorBatch) =>
            clientBatches.map(async (clientBatch) => {
              let query = client
                .from("vendas")
                .select(
                  `
          id,
          numero_venda,
          vendedor_id,
          cliente_id,
          company_id,
          data_venda,
          data_embarque,
          data_final,
          valor_total,
          valor_total_bruto,
          valor_nao_comissionado,
          valor_taxas,
          cancelada,
          clientes (nome, whatsapp),
          vendedor:users!vendedor_id (nome_completo),
          destino_cidade:cidades!destino_cidade_id (id, nome),
          destinos:produtos!destino_id (nome, cidade_id),
          recibos:vendas_recibos (
            id,
            numero_recibo,
            numero_reserva,
            destino_cidade:cidades!destino_cidade_id (id, nome),
            tipo_pacote,
            valor_total,
            valor_taxas,
            valor_du,
            valor_rav,
            data_inicio,
            data_fim,
            tipo_produtos (id, nome, tipo),
            produto_resolvido:produtos!produto_resolvido_id (id, nome, cidade_id)
          )
        `,
                )
                .order("data_venda", { ascending: false })
                .limit(5000);

              if (periodStart) query = query.gte("data_venda", periodStart);
              if (periodEnd) query = query.lte("data_venda", periodEnd);
              if (companyBatch) query = query.in("company_id", companyBatch);
              if (vendedorBatch) query = query.in("vendedor_id", vendedorBatch);
              if (clienteId) query = query.eq("cliente_id", clienteId);
              else if (
                !scope.isAdmin &&
                vendedorIds.length === 0 &&
                clientBatch &&
                clientBatch.length > 0
              )
                query = query.in("cliente_id", clientBatch);

              const { data, error } = await query;
              if (error) throw error;
              return (data || []) as ConsultaVendaRow[];
            })
          )
        )
      );
      const rows = batchRows.flat();

      return dedupeRowsById(rows).map((row) => ({
        ...row,
        recibos: Array.isArray(row?.recibos) ? row.recibos : [],
      })) as ConsultaVendaRow[];
    };

    const loadConsultaRowsForPeriod = async (
      periodStart: string,
      periodEnd: string,
    ) => {
      if (
        !clienteId &&
        !scope.isAdmin &&
        vendedorIds.length === 0 &&
        accessibleClientIds.length > QUERY_IN_BATCH_SIZE
      ) {
        const batchRows = await Promise.all(
          chunkArray(accessibleClientIds).map((batch) =>
            loadConsultaRowsBatch(periodStart, periodEnd, batch)
          )
        );
        const rows = batchRows.flat();
        return dedupeRowsById(rows);
      }

      const clientIdsFilter =
        !clienteId &&
        !scope.isAdmin &&
        vendedorIds.length === 0 &&
        accessibleClientIds.length > 0
          ? accessibleClientIds
          : undefined;

      return loadConsultaRowsBatch(periodStart, periodEnd, clientIdsFilter);
    };

    const computeConsultaKpiTotalFromRows = (rowsInput: ConsultaVendaRow[]) => {
      const filtered = filterRowsForReport(rowsInput);
      let total = 0;

      for (const row of filtered) {
        const status = getVendaStatus(row);
        if (statusFilter && status !== statusFilter) {
          continue;
        }

        const recibos = Array.isArray(row?.recibos) ? row.recibos : [];
        if (recibos.length > 0) {
          total += recibos.reduce(
            (sum: number, recibo) =>
              sum + Number(recibo?.valor_total || 0),
            0,
          );
          continue;
        }

        total += Number(row?.valor_total || 0);
      }

      return Number(total.toFixed(2));
    };

    const rowsViewRaw = (await getCachedReadModel({
      key: buildReadModelCacheKey("relatorios:vendas:rows-view", {
        userId: user.id,
        dataInicio,
        dataFim,
        companyIds,
        vendedorIds,
        conciliacaoSobrepoeVendas,
      }),
      tags: [
        READ_MODEL_TAGS.sales,
        READ_MODEL_TAGS.conciliacao,
        READ_MODEL_TAGS.payments,
        READ_MODEL_TAGS.users,
        ...scopeCacheTags({ companyIds, vendedorIds, userId: user.id }),
      ],
      ttlMs: 300_000,
      staleTtlMs: 1_800_000,
      loader: () => loadRowsViewForPeriod(dataInicio, dataFim),
    })) as ReportSalesViewRow[];
    const hydratedRowsView = await hydrateMissingVendedores(client, rowsViewRaw);
    const getReciboRateioScopeVendorId = (
      recibo: ReportReceiptItem | ConsultaReceiptRow,
    ) =>
      "rateio_scope_vendor_id" in recibo
        ? toStr(recibo.rateio_scope_vendor_id)
        : null;
    const getReciboVendedorId = (
      row: ReportSalesViewRow | ConsultaVendaRow,
      recibo: ReportReceiptItem | ConsultaReceiptRow,
    ) =>
      getReciboRateioScopeVendorId(recibo) ||
      toStr(recibo?.vendedor_id) ||
      toStr(row?.vendedor_id) ||
      null;
    const reportVendedorSet =
      vendedorIds.length > 0
        ? cleanStringSet(vendedorIds)
        : null;
    const rowsView = reportVendedorSet
      ? hydratedRowsView
          .map((row) => {
            const recibos = Array.isArray(row?.recibos)
              ? row.recibos.filter(isReportReceiptItem)
              : [];
            const recibosDoVendedor = recibos.filter((recibo) => {
              const vendedorId = getReciboVendedorId(row, recibo);
              return Boolean(vendedorId && reportVendedorSet.has(vendedorId));
            });

            if (recibosDoVendedor.length > 0) {
              return {
                ...row,
                recibos: recibosDoVendedor,
                vendas_recibos: recibosDoVendedor,
              };
            }

            const rowVendedorId = toStr(row?.vendedor_id);
            if (recibos.length === 0 && rowVendedorId && reportVendedorSet.has(rowVendedorId)) {
              return row;
            }

            return null;
          })
          .filter((row): row is ReportSalesViewRow => Boolean(row))
      : hydratedRowsView;
    const destinationCityNames = await fetchDestinationCityNames(
      client,
      collectDestinationCityIds(rowsView),
    );
    const rowIds: string[] = [];
    for (const row of rowsView) {
      const id = toStr(row?.id);
      if (id) rowIds.push(id);
    }

    const filteredRows = filterRowsForReport(rowsView, destinationCityNames);
    const statusFilteredRows = statusFilter
      ? filteredRows.filter((row) => getVendaStatus(row) === statusFilter)
      : filteredRows;

    const detailRows =
      itemsLimit > 0
        ? statusFilteredRows.slice(itemsOffset, itemsOffset + itemsLimit)
        : statusFilteredRows;
    const detailRowIds = uniqueCleanStrings(detailRows.map((row) => row?.id));
    const summaryRows = includeSummary ? statusFilteredRows : detailRows;
    const naoComissionadoVendaIds = includeSummary ? rowIds : detailRowIds;

    const [naoComissionadoPorVenda, receiptCommissionMap] = await Promise.all([
      fetchNaoComissionadoPorVenda(client, naoComissionadoVendaIds),
      resolveGroupedReceiptCommissions(client, {
        companyIds,
        rows: summaryRows,
      }),
    ]);

    const reciboVendedorIds = Array.from(
      new Set(
        detailRows
          .flatMap((row) =>
            (Array.isArray(row?.recibos)
              ? row.recibos.filter(isReportReceiptItem)
              : []).map((recibo) => getReciboVendedorId(row, recibo)),
          )
          .filter(Boolean),
      ),
    ) as string[];
    const [paymentForms, reciboVendedores] = await Promise.all([
      fetchLatestPaymentForms(client, detailRowIds),
      fetchVendedoresByIds(client, reciboVendedorIds),
    ]);
    const getVendedorNomeById = (
      vendedorId: string | null,
      fallback: string,
    ) => {
      if (!vendedorId) return fallback;
      const vendedor = reciboVendedores.get(vendedorId);
      return vendedor ? getVendaVendedorNome({ vendedor }) : fallback;
    };

    let items = detailRows.map((row) => {
      const status = getVendaStatus(row);
      const vendaVendedorNome = getVendaVendedorNome(row);
      const receiptRows = getRecibosAtivos(row);
      const vendaId = toStr(row?.id);
      const somaBrutoRecibos = receiptRows.reduce(
        (sum: number, recibo: ReportReceiptRow) =>
          sum + getReciboBrutoExibicao(recibo),
        0,
      );
      const somaTaxasRecibos = receiptRows.reduce(
        (sum: number, recibo: ReportReceiptRow) =>
          sum + getReciboTaxasExibicao(recibo),
        0,
      );
      const linkedNaoComissionado = toNum(
        naoComissionadoPorVenda.porVenda.get(vendaId) || 0,
      );
      const naoComissionadoSemRecibo = toNum(
        naoComissionadoPorVenda.porVendaSemRecibo.get(vendaId) || 0,
      );
      const usarModoPorRecibo =
        linkedNaoComissionado > 0 && naoComissionadoSemRecibo <= 0;
      const rankingGrupo = calcularRankingComissionavel({
        valorBruto: somaBrutoRecibos,
        valorTaxas: somaTaxasRecibos,
        valorNaoComissionado: usarModoPorRecibo ? 0 : linkedNaoComissionado,
      });

      const recibos = receiptRows.map((recibo: ReportReceiptItem) => {
        const descriptor = getReceiptProductDescriptor(recibo, row);
        const reciboVendedorId = getReciboVendedorId(row, recibo);
        const reciboVendedorNome = getVendedorNomeById(
          reciboVendedorId,
          vendaVendedorNome,
        );
        const brutoBase = getReciboBrutoExibicao(recibo);
        const reciboJaAjustadoPorConciliacao = hasConciliacaoOverride(recibo);
        const naoComissionadoRecibo =
          usarModoPorRecibo &&
          toStr(recibo?.id) &&
          !reciboJaAjustadoPorConciliacao
            ? toNum(
                naoComissionadoPorVenda.porRecibo.get(toStr(recibo.id)) || 0,
              )
            : 0;
        const rankingRecibo = calcularRankingComissionavel({
          valorBruto: brutoBase,
          valorTaxas: getReciboTaxasExibicao(recibo),
          valorNaoComissionado: usarModoPorRecibo ? naoComissionadoRecibo : 0,
        });
        const valorComissionavel = usarModoPorRecibo
          ? rankingRecibo.valorRanking
          : brutoBase * rankingGrupo.fatorValor;
        const valorTaxasRanking = usarModoPorRecibo
          ? rankingRecibo.valorTaxasRanking
          : getReciboTaxasExibicao(recibo) * rankingGrupo.fatorTaxas;
        const commissionByReceipt = toStr(recibo?.id)
          ? receiptCommissionMap.get(toStr(recibo.id))
          : null;

        return {
          id: recibo?.id || null,
          numero_recibo: recibo?.numero_recibo || null,
          recibo_display: recibo?.numero_recibo || null,
          numero_recibo_normalizado: recibo?.numero_recibo_normalizado ?? null,
          recibo_short: String(recibo?.numero_recibo ?? "").slice(0, 8),
          data_venda: recibo?.data_venda || row.data_venda,
          vendedor_id: reciboVendedorId,
          vendedor_nome: reciboVendedorNome,
          produto_id: recibo?.produto_id || null,
          tipo_produto: descriptor.tipo,
          produto_nome: descriptor.produto,
          cidade_nome: getReceiptCidadeNome(recibo, row, destinationCityNames),
          valor_total: brutoBase,
          valor_taxas: getReciboTaxasExibicao(recibo),
          valor_taxas_ranking: valorTaxasRanking,
          valor_du: Number(recibo?.valor_du || 0),
          valor_rav: Number(recibo?.valor_rav || 0),
          percentual_comissao_loja: Number(
            recibo?.percentual_comissao_loja || 0,
          ),
          faixa_comissao: recibo?.faixa_comissao || null,
          valor_comissao_loja: Number(recibo?.valor_comissao_loja || 0),
          valor_bruto_override: recibo?.valor_bruto_override ?? null,
          valor_liquido_override: recibo?.valor_liquido_override ?? null,
          valor_meta_override: recibo?.valor_meta_override ?? null,
          valor_comissionavel: valorComissionavel,
          // Quando o motor de regras não encontra regra aplicável (valor = 0),
          // usa valor_comissao_loja da conciliação como fallback — espelha o
          // comportamento do vtur-app que usa o valor real informado pela operadora.
          valor_comissao_calculada:
            Number(commissionByReceipt?.valorComissao || 0) > 0
              ? Number(commissionByReceipt?.valorComissao || 0)
              : Number(recibo?.valor_comissao_loja || 0),
          // Quando o motor de regras não encontra regra aplicável (percentual = 0),
          // usa percentual_comissao_loja da conciliação como fallback — espelha o
          // comportamento do vtur-app que exibe o percentual real informado pela operadora.
          percentual_comissao_calculado:
            Number(commissionByReceipt?.percentual || 0) > 0
              ? Number(commissionByReceipt?.percentual || 0)
              : Number(recibo?.percentual_comissao_loja || 0),
        };
      });
      const commission = {
        valorComissao: roundToMoney(
          recibos.reduce(
            (
              sum: number,
              recibo: { valor_comissao_calculada?: number | null },
            ) => sum + toNum(recibo.valor_comissao_calculada),
            0,
          ),
        ),
      };

      return {
        id: row.id,
        numero_venda: row.numero_venda,
        codigo: getVendaCodigo(row),
        data_venda: row.data_venda,
        data_embarque: row.data_embarque,
        data_final: row.data_final,
        cliente_id: row.cliente_id,
        cliente_nome: getVendaClienteNome(row),
        cliente_cpf: row.clientes?.cpf || null,
        vendedor_id: row.vendedor_id,
        vendedor_nome: vendaVendedorNome,
        destino_id: row.destinos?.id || null,
        destino_nome: getVendaDestino(row, destinationCityNames),
        destino_cidade_id: row.destino_cidade?.id || null,
        destino_cidade_nome: row.destino_cidade?.nome || null,
        valor_total: Number(
          recibos
            .reduce(
              (sum: number, recibo: { valor_comissionavel?: number | null }) =>
                sum + toNum(recibo.valor_comissionavel),
              0,
            )
            .toFixed(2),
        ),
        valor_taxas: Number(
          recibos
            .reduce(
              (sum: number, recibo: { valor_taxas_ranking?: number | null }) =>
                sum + toNum(recibo.valor_taxas_ranking),
              0,
            )
            .toFixed(2),
        ),
        cancelada: row.cancelada || false,
        status,
        forma_pagamento: paymentForms.get(row.id) || "Nao informado",
        recibos,
        // KPIs por venda
        comissao: commission.valorComissao,
        vendas_recibos: row.recibos,
      };
    });

    if (reportVendedorSet) {
      items = items
        .map((item) => {
          const recibos = (Array.isArray(item.recibos) ? item.recibos : []).filter(
            (recibo: { vendedor_id?: string | null }) => {
              const vendedorId = toStr(recibo?.vendedor_id);
              return Boolean(vendedorId && reportVendedorSet.has(vendedorId));
            },
          );

          if (recibos.length === 0) return null;

          const valorTotal = roundToMoney(
            recibos.reduce(
              (
                sum: number,
                recibo: { valor_comissionavel?: number | null; valor_total?: number | null },
              ) => sum + toNum(recibo.valor_comissionavel ?? recibo.valor_total),
              0,
            ),
          );
          const valorTaxas = roundToMoney(
            recibos.reduce(
              (
                sum: number,
                recibo: { valor_taxas_ranking?: number | null; valor_taxas?: number | null },
              ) => sum + toNum(recibo.valor_taxas_ranking ?? recibo.valor_taxas),
              0,
            ),
          );
          const comissao = roundToMoney(
            recibos.reduce(
              (
                sum: number,
                recibo: { valor_comissao_calculada?: number | null; comissao?: number | null },
              ) => sum + toNum(recibo.valor_comissao_calculada ?? recibo.comissao),
              0,
            ),
          );
          const vendedorId =
            reportVendedorSet.size === 1
              ? Array.from(reportVendedorSet)[0]
              : toStr(recibos[0]?.vendedor_id) || item.vendedor_id;
          const vendedorNome =
            recibos.find((recibo: { vendedor_id?: string | null; vendedor_nome?: string | null }) =>
              toStr(recibo.vendedor_id) === vendedorId && toStr(recibo.vendedor_nome),
            )?.vendedor_nome || item.vendedor_nome;

          return {
            ...item,
            vendedor_id: vendedorId,
            vendedor_nome: vendedorNome,
            valor_total: valorTotal,
            valor_taxas: valorTaxas,
            comissao,
            recibos,
            vendas_recibos: recibos,
          };
        })
        .filter(Boolean) as typeof items;
    }

    const totalItems = statusFilteredRows.length;
    const pagedItems = items;

    if (!includeSummary) {
      return json(
        {
          items: pagedItems,
          total: totalItems,
          periodo: {
            data_inicio: dataInicio,
            data_fim: dataFim,
          },
          pagination: {
            offset: itemsOffset,
            limit: itemsLimit,
            returned: pagedItems.length,
            total: totalItems,
            truncated: itemsOffset + pagedItems.length < totalItems,
          },
        },
        { headers: DYNAMIC_READ_HEADERS },
      );
    }

    const vendedores = Array.from(
      new Map(
        statusFilteredRows
          .filter((row) => row.vendedor_id)
          .map((row) => [row.vendedor_id as string, getVendaVendedorNome(row)]),
      ).entries(),
    )
      .map(([id, nome]) => ({ id, nome }))
      .sort((left, right) => PT_BR_COLLATOR.compare(left.nome, right.nome));

    const historyBuckets = getLastSixMonthBuckets(dataFim);
    const dayBuckets = getCurrentMonthDayBuckets(dataFim);
    const seriesRowsRaw = statusFilteredRows;
    const seriesNaoComissionadoPorVenda = naoComissionadoPorVenda;
    const seriesRankingEntries = computeReceiptRankingEntries(
      seriesRowsRaw,
      seriesNaoComissionadoPorVenda,
    );

    const monthlySeries = historyBuckets.map((bucket) => ({
      key: bucket.key,
      total_valor: sumRankingEntriesBetween(
        seriesRankingEntries,
        bucket.start,
        bucket.end,
      ),
    }));
    const dailySeries = dayBuckets.map((bucket) => ({
      date: bucket.date,
      value:
        bucket.date > dataFim
          ? 0
          : sumRankingEntriesBetween(
              seriesRankingEntries,
              bucket.date,
              bucket.date,
            ),
    }));

    const totalComissao = roundToMoney(
      statusFilteredRows.reduce((sum, row) => {
        const recibos = getRecibosAtivos(row);
        return (
          sum +
          recibos.reduce((receiptSum, recibo) => {
            const commissionByReceipt = toStr(recibo?.id)
              ? receiptCommissionMap.get(toStr(recibo.id))
              : null;
            const valorComissao =
              Number(commissionByReceipt?.valorComissao || 0) > 0
                ? Number(commissionByReceipt?.valorComissao || 0)
                : Number(recibo?.valor_comissao_loja || 0);
            return receiptSum + valorComissao;
          }, 0)
        );
      }, 0),
    );
    const totalRecibosSet = new Set<string>();
    for (const row of statusFilteredRows) {
      for (const recibo of getRecibosAtivos(row)) {
        const key =
          toStr(recibo?.id) ||
          [
            toStr(row?.id),
            toStr(recibo?.numero_recibo),
            toStr(recibo?.data_venda || row?.data_venda),
            toNum(recibo?.valor_total),
          ].join("|");
        if (key.trim()) totalRecibosSet.add(key);
      }
    }

    // KPIs agregados
    const totalVendas = statusFilteredRows.length;
    const vendasConfirmadas = statusFilteredRows.filter(
      (row) => getVendaStatus(row) === "confirmada",
    ).length;
    const vendasCanceladas = statusFilteredRows.filter(
      (row) => getVendaStatus(row) === "cancelada",
    ).length;
    const totalValor = Number(
      sumRankingEntriesBetween(seriesRankingEntries, dataInicio, dataFim).toFixed(2),
    );
    const ticketMedio = totalVendas > 0 ? totalValor / totalVendas : 0;

    return json(
      {
        items: pagedItems,
        total: totalItems,
        vendedores,
        resumo: {
          total_vendas: totalVendas,
          vendas_confirmadas: vendasConfirmadas,
          vendas_canceladas: vendasCanceladas,
          total_valor: totalValor,
          total_comissao: totalComissao,
          ticket_medio: ticketMedio,
          total_recibos: totalRecibosSet.size,
        },
        series: {
          mensal: monthlySeries.map((item) => ({
            key: item.key,
            total_valor: Number(item.total_valor.toFixed(2)),
          })),
          diaria: dailySeries.map((item) => ({
            date: item.date,
            value: Number(item.value.toFixed(2)),
          })),
        },
        periodo: {
          data_inicio: dataInicio,
          data_fim: dataFim,
        },
        pagination: {
          offset: itemsOffset,
          limit: itemsLimit,
          returned: pagedItems.length,
          total: totalItems,
          truncated: itemsOffset + pagedItems.length < totalItems,
        },
      },
      { headers: DYNAMIC_READ_HEADERS },
    );
  } catch (err) {
    return toErrorResponse(err, "Erro ao carregar relatorio de vendas.");
  }
}

function roundToMoney(value: number) {
  return Number(value.toFixed(2));
}