import type { DataClient } from '$lib/dataClientTypes';
/**
 * Lógica de Rateio de Vendas — vtur-svelte
 *
 * Portabilizado FIELMENTE do vtur-app (src/lib/vendasRateio.ts).
 * NÃO alterar sem sincronizar com o vtur-app.
 *
 * REGRAS CRÍTICAS:
 *  - percentual_origem + percentual_destino = 100
 *  - cloneReciboWithFactor escala todos os campos financeiros por fator
 *  - applyRateioToSalesForScopedVendedores: achata vendas por vendedor com base no rateio
 *  - rateio_source_recibo_id preserva o ID original (sem sufixo ::rateio:)
 */

import {
  cleanStringSet,
  chunkArray,
  QUERY_IN_BATCH_SIZE,
  uniqueCleanStrings
} from '$lib/utils/array';
import { toCleanString as toStr, toFiniteNumber as toNumber } from '$lib/utils/values';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RateioRow = {
  venda_recibo_id?: string | null;
  conciliacao_recibo_id?: string | null;
  vendedor_origem_id?: string | null;
  vendedor_destino_id?: string | null;
  percentual_origem?: number | null;
  percentual_destino?: number | null;
  ativo?: boolean | null;
};

type ReciboLike = Record<string, unknown>;

type SplitRateioLookupRow = {
  venda_recibo_id?: string | null;
  conciliacao_recibo_id?: string | null;
};

type LinkedConciliacaoReciboRow = {
  id?: string | null;
  venda_recibo_id?: string | null;
};

// ---------------------------------------------------------------------------
// HELPERS INTERNOS
// ---------------------------------------------------------------------------

/**
 * Remove o sufixo ::rateio:<vendedorId> de um ID sintético.
 * Usado para lookup na tabela de rateio com o ID real do recibo.
 */
function normalizeReciboLookupId(value?: unknown) {
  const raw = toStr(value);
  if (!raw) return '';
  return raw.replace(/::rateio:[^:]+$/i, '').replace(/:recibo$/i, '');
}

function isAplicavelRateio(
  row: Pick<RateioRow, 'percentual_origem' | 'percentual_destino'> | null | undefined
) {
  return toNumber(row?.percentual_origem) > 0 && toNumber(row?.percentual_destino) > 0;
}

function normalizeCompanyScopeIds(companyId?: string | null, companyIds?: string[] | null) {
  return uniqueCleanStrings([companyId, ...(companyIds || [])]);
}

export function isUuid(value?: string | null) {
  return Boolean(value && UUID_PATTERN.test(String(value)));
}

function scaleNumericField(value: unknown, factor: number) {
  if (value == null) return value;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return Math.round(parsed * factor * 100) / 100;
}

function resolveReciboBruto(recibo: ReciboLike) {
  return Math.max(0, toNumber(recibo?.valor_bruto_override ?? recibo?.valor_total));
}

// ---------------------------------------------------------------------------
// CLONE COM FATOR
// ---------------------------------------------------------------------------

/**
 * Clona um recibo de venda aplicando um fator de escala em todos os valores financeiros.
 * O ID resultante é <id_original>::rateio:<vendedorId> para diferenciar de recibos reais.
 *
 * Portabilizado fielmente do vtur-app cloneReciboWithFactor().
 */
export function cloneReciboWithFactor<T extends ReciboLike>(
  recibo: T,
  fator: number,
  vendedorId: string,
  options?: { forceSyntheticId?: boolean }
): T {
  const rawId = toStr(recibo?.id);
  const nextId =
    options?.forceSyntheticId || rawId
      ? `${rawId || 'recibo'}::rateio:${vendedorId}`
      : rawId;

  return {
    ...recibo,
    id: nextId,
    rateio_source_recibo_id: rawId || null,
    rateio_vendedor_id: vendedorId,
    valor_total: scaleNumericField(recibo?.valor_total, fator),
    valor_taxas: scaleNumericField(recibo?.valor_taxas, fator),
    valor_du: scaleNumericField(recibo?.valor_du, fator),
    valor_rav: scaleNumericField(recibo?.valor_rav, fator),
    valor_bruto_override: scaleNumericField(recibo?.valor_bruto_override, fator),
    valor_meta_override: scaleNumericField(recibo?.valor_meta_override, fator),
    valor_liquido_override: scaleNumericField(recibo?.valor_liquido_override, fator),
    valor_comissao_loja: scaleNumericField(recibo?.valor_comissao_loja, fator),
  } as T;
}

// ---------------------------------------------------------------------------
// FETCH RATEIO (server-side only)
// ---------------------------------------------------------------------------

/**
 * Busca os registros de rateio para uma lista de IDs de recibos.
 * Retorna um Map<id_recibo, RateioRow>.
 *
 * Portabilizado fielmente do vtur-app fetchRateioByReciboIds().
 */
export async function fetchRateioByReciboIds(
  client: DataClient,
  reciboIds: string[]
): Promise<Map<string, RateioRow>> {
  const ids = uniqueCleanStrings((reciboIds || []).map((id) => normalizeReciboLookupId(id)));
  if (ids.length === 0) return new Map<string, RateioRow>();

  const map = new Map<string, RateioRow>();

  const byConcReciboRows: RateioRow[] = [];

  for (const chunk of chunkArray(ids, QUERY_IN_BATCH_SIZE)) {
    const { data: byVendaRecibo, error: byVendaErr } = await client
      .from('vendas_recibos_rateio')
      .select(
        'venda_recibo_id, conciliacao_recibo_id, vendedor_origem_id, vendedor_destino_id, percentual_origem, percentual_destino, ativo'
      )
      .eq('ativo', true)
      .in('venda_recibo_id', chunk);
    if (byVendaErr) throw byVendaErr;
    for (const row of byVendaRecibo || []) {
      if (!isAplicavelRateio(row)) continue;
      const key = toStr(row?.venda_recibo_id);
      if (key) map.set(key, row as RateioRow);
    }

    const { data: byConcRecibo, error: byConcErr } = await client
      .from('vendas_recibos_rateio')
      .select(
        'venda_recibo_id, conciliacao_recibo_id, vendedor_origem_id, vendedor_destino_id, percentual_origem, percentual_destino, ativo'
      )
      .eq('ativo', true)
      .in('conciliacao_recibo_id', chunk);
    if (byConcErr) throw byConcErr;
    for (const row of byConcRecibo || []) {
      if (!isAplicavelRateio(row)) continue;
      const key = toStr(row?.conciliacao_recibo_id);
      if (key) map.set(key, row as RateioRow);
      byConcReciboRows.push(row);
    }
  }

  // Cross-reference: conciliacao_recibo_id -> venda_recibo_id
  const concIds = uniqueCleanStrings(byConcReciboRows.map((row) => row?.conciliacao_recibo_id)).filter(isUuid);
  if (concIds.length > 0) {
    for (const chunk of chunkArray(concIds, QUERY_IN_BATCH_SIZE)) {
      const { data: concRows, error: concErr } = await client
        .from('conciliacao_recibos')
        .select('id, venda_recibo_id')
        .in('id', chunk);
      if (concErr) throw concErr;
      for (const row of (concRows || []) as LinkedConciliacaoReciboRow[]) {
        const concId = toStr(row?.id);
        const linkedVendaReciboId = toStr(row?.venda_recibo_id);
        if (!concId || !linkedVendaReciboId) continue;
        const rateio = map.get(concId);
        if (rateio) map.set(linkedVendaReciboId, rateio);
      }
    }
  }

  return map;
}

/**
 * Retorna os venda_ids das vendas em que o vendedor é destino de um rateio.
 * Usado para incluir vendas de outros vendedores no ranking do destino.
 *
 * Portabilizado fielmente do vtur-app fetchSplitSaleIdsForDestinationVendedores().
 */
export async function fetchSplitSaleIdsForDestinationVendedores(
  client: DataClient,
  options: {
    companyId?: string | null;
    companyIds?: string[] | null;
    vendedorIds?: string[] | null;
  }
): Promise<string[]> {
  const scopedCompanyIds = normalizeCompanyScopeIds(options.companyId, options.companyIds);
  const scopedVendedorIds = uniqueCleanStrings(options.vendedorIds || []).filter(isUuid);
  if (scopedVendedorIds.length === 0) return [];

  const splitRows: SplitRateioLookupRow[] = [];
  const companyBatches =
    scopedCompanyIds.length > 0 ? chunkArray(scopedCompanyIds, QUERY_IN_BATCH_SIZE) : [null];
  for (const companyBatch of companyBatches) {
    for (const vendedorBatch of chunkArray(scopedVendedorIds, QUERY_IN_BATCH_SIZE)) {
      let splitQuery = client
        .from('vendas_recibos_rateio')
        .select('venda_recibo_id, conciliacao_recibo_id')
        .eq('ativo', true)
        .in('vendedor_destino_id', vendedorBatch);
      if (companyBatch && companyBatch.length === 1) {
        splitQuery = splitQuery.eq('company_id', companyBatch[0]);
      } else if (companyBatch && companyBatch.length > 1) {
        splitQuery = splitQuery.in('company_id', companyBatch);
      }

      const { data, error: splitErr } = await splitQuery;
      if (splitErr) throw splitErr;
      splitRows.push(...(data || []));
    }
  }

  const vendaReciboIds = uniqueCleanStrings(splitRows.map((row) => row?.venda_recibo_id)).filter(isUuid);
  const concReciboIds = uniqueCleanStrings(splitRows.map((row) => row?.conciliacao_recibo_id)).filter(isUuid);

  const vendaIds = new Set<string>();

  if (vendaReciboIds.length > 0) {
    for (const batch of chunkArray(vendaReciboIds, QUERY_IN_BATCH_SIZE)) {
      const { data: recibosRows, error: recibosErr } = await client
        .from('vendas_recibos')
        .select('id, venda_id')
        .in('id', batch);
      if (recibosErr) throw recibosErr;
      for (const row of recibosRows || []) {
        const vendaId = toStr(row?.venda_id);
        if (isUuid(vendaId)) vendaIds.add(vendaId);
      }
    }
  }

  if (concReciboIds.length > 0) {
    for (const batch of chunkArray(concReciboIds, QUERY_IN_BATCH_SIZE)) {
      const { data: concRows, error: concErr } = await client
        .from('conciliacao_recibos')
        .select('id, venda_id')
        .in('id', batch);
      if (concErr) throw concErr;
      for (const row of concRows || []) {
        const vendaId = toStr(row?.venda_id);
        if (isUuid(vendaId)) vendaIds.add(vendaId);
      }
    }
  }

  return Array.from(vendaIds);
}

// ---------------------------------------------------------------------------
// APLICAR RATEIO EM LISTA DE VENDAS
// ---------------------------------------------------------------------------

/**
 * Achata a lista de vendas expandindo cada venda em entradas por vendedor,
 * aplicando os fatores de rateio aos valores financeiros de cada recibo.
 *
 * Comportamento:
 * - Se não há rateio para o recibo: mantém o recibo com vendedor_id original
 * - Se há rateio ativo: cria dois registros — um para origem (pct_origem/100), outro para destino
 * - Se scopedVendedorIds fornecido: filtra apenas os vendedores no escopo
 *
 * Portabilizado FIELMENTE do vtur-app applyRateioToSalesForScopedVendedores().
 */
export function applyRateioToSalesForScopedVendedores<
  T extends {
    id?: string | null;
    vendedor_id?: string | null;
    vendas_recibos?: Array<ReciboLike> | null;
  }
>(
  items: T[],
  rateioMap: Map<string, RateioRow>,
  scopedVendedorIds?: string[] | null
): Array<T & {
  rateio_source_venda_id: string | null;
  rateio_scope_bruto_total: number;
  rateio_source_bruto_total: number;
  rateio_scope_factor: number;
}> {
  const scopedSet = cleanStringSet(scopedVendedorIds || []);
  const hasScope = scopedSet.size > 0;

  return (items || []).flatMap((item) => {
    const origemId = toStr(item?.vendedor_id);
    const recibos = Array.isArray(item?.vendas_recibos) ? item.vendas_recibos : [];
    if (recibos.length === 0) return [];
    const sourceBrutoTotal = recibos.reduce((sum, recibo) => sum + resolveReciboBruto(recibo), 0);

    const recibosPorVendedor = new Map<string, Array<ReciboLike>>();

    for (const [reciboIndex, recibo] of recibos.entries()) {
      const rawReciboId = toStr(recibo?.id);
      const primaryReciboId = normalizeReciboLookupId(rawReciboId);
      const rateio =
        rateioMap.get(rawReciboId) ||
        rateioMap.get(primaryReciboId) ||
        null;

      const baseAllocations =
        rateio &&
        rateio.ativo &&
        isUuid(rateio.vendedor_origem_id) &&
        isUuid(rateio.vendedor_destino_id) &&
        toNumber(rateio.percentual_origem) > 0 &&
        toNumber(rateio.percentual_destino) > 0
          ? [
              {
                vendedorId: toStr(rateio.vendedor_origem_id),
                fator: Math.max(0, Math.min(1, toNumber(rateio.percentual_origem) / 100)),
              },
              {
                vendedorId: toStr(rateio.vendedor_destino_id),
                fator: Math.max(0, Math.min(1, toNumber(rateio.percentual_destino) / 100)),
              },
            ]
          : origemId
            ? [{ vendedorId: origemId, fator: 1 }]
            : [];

      const allocations = hasScope
        ? baseAllocations.filter((allocation) => scopedSet.has(allocation.vendedorId))
        : baseAllocations;

      for (const allocation of allocations) {
        if (!allocation.vendedorId) continue;
        const bucket = recibosPorVendedor.get(allocation.vendedorId) || [];
        const forceSyntheticId =
          Boolean(rateio?.ativo) ||
          allocation.vendedorId !== origemId ||
          allocation.fator !== 1 ||
          allocations.length > 1;
        const nextRecibo =
          forceSyntheticId || allocation.fator !== 1
            ? cloneReciboWithFactor(recibo, allocation.fator, allocation.vendedorId, {
                forceSyntheticId,
              })
            : recibo;

        bucket.push({
          ...nextRecibo,
          rateio_scope_vendor_id: allocation.vendedorId,
          rateio_scope_index: reciboIndex,
        });
        recibosPorVendedor.set(allocation.vendedorId, bucket);
      }
    }

    return Array.from(recibosPorVendedor.entries())
      .map(([vendedorId, vendedorRecibos]) => {
        const scopeBrutoTotal = vendedorRecibos.reduce(
          (sum, recibo) => sum + resolveReciboBruto(recibo),
          0
        );
        const scopeFactor =
          sourceBrutoTotal > 0
            ? Math.max(0, Math.min(1, scopeBrutoTotal / sourceBrutoTotal))
            : 1;

        return {
          ...item,
          vendedor_id: vendedorId,
          vendas_recibos: vendedorRecibos,
          rateio_source_venda_id: toStr(item?.id) || null,
          rateio_scope_bruto_total: scopeBrutoTotal,
          rateio_source_bruto_total: sourceBrutoTotal,
          rateio_scope_factor: scopeFactor,
        };
      })
      .filter(
        (nextItem) =>
          Array.isArray(nextItem.vendas_recibos) && nextItem.vendas_recibos.length > 0
      ) as Array<T & {
        rateio_source_venda_id: string | null;
        rateio_scope_bruto_total: number;
        rateio_source_bruto_total: number;
        rateio_scope_factor: number;
      }>;
  });
}
