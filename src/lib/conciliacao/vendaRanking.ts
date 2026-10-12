import type { SupabaseClient } from '@supabase/supabase-js';
import { calcularValorVendaReal, resolveConciliacaoStatus } from '$lib/conciliacao/business';
import { normalizeReceiptKey } from '$lib/conciliacao/receiptNormalize';
import { pickConciliacaoSourceRow } from '$lib/conciliacao/source';
import { uniqueCleanStrings } from '$lib/utils/array';
import { toCleanString as toStr, toFiniteNumber as toNumber } from '$lib/utils/values';

type VendaRankingReciboInput = {
  id: string;
  numero_recibo?: string | null;
  numero_recibo_normalizado?: string | null;
  numero_reserva?: string | null;
  valor_total?: number | null;
  valor_taxas?: number | null;
};

type VendaRankingParams = {
  client: SupabaseClient;
  vendaId: string;
  companyId: string;
  recibos: VendaRankingReciboInput[];
};

type ConciliacaoRankingProduto = {
  id?: string | null;
  nome?: string | null;
};

type ConciliacaoRow = {
  id?: string | null;
  documento?: string | null;
  numero_reserva?: string | null;
  company_id?: string | null;
  status?: string | null;
  descricao?: string | null;
  valor_lancamentos?: number | string | null;
  valor_taxas?: number | string | null;
  valor_descontos?: number | string | null;
  valor_abatimentos?: number | string | null;
  valor_nao_comissionavel?: number | string | null;
  valor_venda_real?: number | string | null;
  movimento_data?: string | null;
  ranking_vendedor_id?: string | null;
  ranking_produto_id?: string | null;
  ranking_produto?: ConciliacaoRankingProduto | null;
  is_seguro_viagem?: boolean | null;
  conciliado?: boolean | null;
  venda_id?: string | null;
  venda_recibo_id?: string | null;
};

type RateioRow = {
  id?: string | null;
  venda_recibo_id?: string | null;
  conciliacao_recibo_id?: string | null;
  vendedor_destino_id?: string | null;
  percentual_origem?: number | string | null;
  percentual_destino?: number | string | null;
  ativo?: boolean | null;
  observacao?: string | null;
  vendedor_destino?: unknown;
};

type ErrorLike = {
  code?: string | null;
  message?: string | null;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function onlyDigits(value?: string | null) {
  return String(value ?? '').replace(/\D+/g, '');
}

function reciboCoreDigits(value?: string | null) {
  const digits = onlyDigits(value);
  if (!digits) return '';
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function stripLeadingZeros(value?: string | null) {
  const raw = String(value ?? '').replace(/^0+/, '');
  return raw || '0';
}

function extractReciboPrefix(value?: string | null) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const prefixMatch = raw.match(/^(\d{4})\D+/);
  if (prefixMatch?.[1]) return prefixMatch[1];
  const digits = onlyDigits(raw);
  return digits.length >= 14 ? digits.slice(0, 4) : '';
}

function numeroReciboMatches(left?: string | null, right?: string | null) {
  const leftCompact = normalizeReceiptKey(left);
  const rightCompact = normalizeReceiptKey(right);
  if (leftCompact && rightCompact && leftCompact === rightCompact) return true;

  const leftDigits = onlyDigits(left);
  const rightDigits = onlyDigits(right);
  if (!leftDigits || !rightDigits) return false;
  if (leftDigits === rightDigits) return true;

  const leftCore = reciboCoreDigits(leftDigits);
  const rightCore = reciboCoreDigits(rightDigits);
  if (leftCore && rightCore && leftCore === rightCore) return true;

  const leftSignificantCore = stripLeadingZeros(leftCore);
  const rightSignificantCore = stripLeadingZeros(rightCore);
  if (!leftSignificantCore || !rightSignificantCore || leftSignificantCore !== rightSignificantCore) {
    return false;
  }

  const leftPrefix = extractReciboPrefix(left);
  const rightPrefix = extractReciboPrefix(right);
  if (leftPrefix && rightPrefix) return leftPrefix === rightPrefix;
  return true;
}

function reciboDocumentVariants(recibo: VendaRankingReciboInput) {
  const values = [
    recibo.numero_recibo,
    recibo.numero_recibo_normalizado,
    normalizeReceiptKey(recibo.numero_recibo),
    normalizeReceiptKey(recibo.numero_recibo_normalizado)
  ];
  return uniqueCleanStrings(values);
}

function normalizeConsolidadoraReserva(value?: string | null) {
  return toStr(value).replace(/^REXTUR[\s-]*/i, '').toUpperCase();
}

function isConsolidadoraRecibo(recibo: VendaRankingReciboInput) {
  return normalizeReceiptKey(recibo.numero_recibo) === 'REXTUR' ||
    normalizeReceiptKey(recibo.numero_recibo_normalizado) === 'REXTUR';
}

function matchesRecibo(row: ConciliacaoRow, recibo: VendaRankingReciboInput) {
  const linkedReciboId = toStr(row?.venda_recibo_id);
  if (linkedReciboId && linkedReciboId === toStr(recibo.id)) return true;
  if (isConsolidadoraRecibo(recibo)) {
    return normalizeReceiptKey(row?.documento) === 'REXTUR' &&
      Boolean(normalizeConsolidadoraReserva(row?.numero_reserva)) &&
      normalizeConsolidadoraReserva(row?.numero_reserva) === normalizeConsolidadoraReserva(recibo.numero_reserva);
  }
  return numeroReciboMatches(row?.documento, recibo.numero_recibo) ||
    numeroReciboMatches(row?.documento, recibo.numero_recibo_normalizado);
}

function concSelect() {
  return 'id, documento, numero_reserva, company_id, status, descricao, valor_lancamentos, valor_taxas, valor_descontos, valor_abatimentos, valor_nao_comissionavel, valor_venda_real, movimento_data, ranking_vendedor_id, ranking_produto_id, is_seguro_viagem, conciliado, venda_id, venda_recibo_id, ranking_produto:tipo_produtos!ranking_produto_id(id, nome)';
}

function addRows(target: Map<string, ConciliacaoRow>, rows?: ConciliacaoRow[] | null) {
  for (const row of rows || []) {
    const id = toStr(row?.id);
    if (id) target.set(id, row);
  }
}

function collectIds<T>(rows: T[], getId: (row: T) => unknown) {
  const ids: string[] = [];
  for (const row of rows) {
    const id = toStr(getId(row));
    if (id) ids.push(id);
  }
  return ids;
}

async function fetchConciliacaoRows(params: VendaRankingParams) {
  const { client, companyId, vendaId, recibos } = params;
  const byId = new Map<string, ConciliacaoRow>();
  const reciboIds = collectIds(recibos, (recibo) => recibo.id);
  const documentoVariants = uniqueCleanStrings(recibos.flatMap(reciboDocumentVariants));

  const { data: byVenda, error: byVendaError } = await client
    .from('conciliacao_recibos')
    .select(concSelect())
    .eq('company_id', companyId)
    .eq('venda_id', vendaId);
  if (byVendaError) throw byVendaError;
  addRows(byId, byVenda as ConciliacaoRow[] | null);

  for (let index = 0; index < reciboIds.length; index += 200) {
    const batch = reciboIds.slice(index, index + 200);
    const { data, error } = await client
      .from('conciliacao_recibos')
      .select(concSelect())
      .eq('company_id', companyId)
      .in('venda_recibo_id', batch);
    if (error) throw error;
    addRows(byId, data as ConciliacaoRow[] | null);
  }

  for (let index = 0; index < documentoVariants.length; index += 200) {
    const batch = documentoVariants.slice(index, index + 200);
    const { data, error } = await client
      .from('conciliacao_recibos')
      .select(concSelect())
      .eq('company_id', companyId)
      .in('documento', batch);
    if (error) throw error;
    addRows(byId, data as ConciliacaoRow[] | null);
  }

  const fuzzyTokens = Array.from(
    new Set(
      recibos
        .map((recibo) => stripLeadingZeros(reciboCoreDigits(recibo.numero_recibo || recibo.numero_recibo_normalizado)))
        .filter((token) => token.length >= 5)
    )
  );

  for (const token of fuzzyTokens) {
    const { data, error } = await client
      .from('conciliacao_recibos')
      .select(concSelect())
      .eq('company_id', companyId)
      .ilike('documento', `%${token}%`)
      .limit(50);
    if (error) throw error;
    addRows(byId, data as ConciliacaoRow[] | null);
  }

  return Array.from(byId.values());
}

function pickDisplaySourceRow(rows: ConciliacaoRow[]) {
  const picked = pickConciliacaoSourceRow(rows);
  if (picked.sourceRow) {
    return {
      sourceRow: picked.sourceRow,
      confirmed: true
    };
  }

  const sortedRows = [...(rows || [])].sort((a, b) =>
    toStr(a?.movimento_data).localeCompare(toStr(b?.movimento_data))
  );
  const opfax = sortedRows.find((row) => resolveConciliacaoStatus({ status: row?.status, descricao: row?.descricao }) === 'OPFAX');
  return {
    sourceRow: opfax || sortedRows[0] || null,
    confirmed: false
  };
}

function resolveConciliacaoRankingValue(sourceRow: ConciliacaoRow) {
  const lancamentos = toNumber(sourceRow?.valor_lancamentos);
  const descontos = toNumber(sourceRow?.valor_descontos);
  const abatimentos = toNumber(sourceRow?.valor_abatimentos);
  const naoComissionavel = toNumber(sourceRow?.valor_nao_comissionavel);
  const valorCalculado = calcularValorVendaReal({
    valorLancamentos: lancamentos,
    valorTaxas: toNumber(sourceRow?.valor_taxas),
    valorDescontos: descontos,
    valorAbatimentos: abatimentos
  });
  const valorBanco = toNumber(sourceRow?.valor_venda_real);
  const base = valorCalculado > 0 ? valorCalculado : valorBanco;

  return {
    valorRanking: roundMoney(Math.max(0, base - naoComissionavel)),
    meta: {
      valor_lancamentos: lancamentos,
      valor_descontos: descontos,
      valor_abatimentos: abatimentos,
      valor_nao_comissionavel: naoComissionavel,
      valor_bruto_base: base
    }
  };
}

function isTableMissingError(error: unknown) {
  const errorLike = error as ErrorLike;
  const code = String(errorLike?.code || '').toLowerCase();
  const message = String(errorLike?.message || '').toLowerCase();
  return code === '42p01' || message.includes('does not exist') || message.includes('relation');
}

async function fetchRateioMaps(client: SupabaseClient, reciboIds: string[], concIds: string[]) {
  const byVendaRecibo = new Map<string, RateioRow>();
  const byConciliacao = new Map<string, RateioRow>();

  for (let index = 0; index < reciboIds.length; index += 200) {
    const batch = reciboIds.slice(index, index + 200);
    const { data, error } = await client
      .from('vendas_recibos_rateio')
      .select('id, venda_recibo_id, conciliacao_recibo_id, vendedor_destino_id, percentual_origem, percentual_destino, ativo, observacao, vendedor_destino:users!vendedor_destino_id(id, nome_completo)')
      .eq('ativo', true)
      .in('venda_recibo_id', batch);
    // Tabela pode não existir ainda — retorna mapa vazio sem lançar
    if (error) {
      if (isTableMissingError(error)) return { byVendaRecibo, byConciliacao };
      throw error;
    }
    for (const row of (data || []) as RateioRow[]) {
      const id = toStr(row?.venda_recibo_id);
      if (toNumber(row?.percentual_origem) <= 0 || toNumber(row?.percentual_destino) <= 0) continue;
      if (id) byVendaRecibo.set(id, row);
    }
  }

  for (let index = 0; index < concIds.length; index += 200) {
    const batch = concIds.slice(index, index + 200);
    const { data, error } = await client
      .from('vendas_recibos_rateio')
      .select('id, venda_recibo_id, conciliacao_recibo_id, vendedor_destino_id, percentual_origem, percentual_destino, ativo, observacao, vendedor_destino:users!vendedor_destino_id(id, nome_completo)')
      .eq('ativo', true)
      .in('conciliacao_recibo_id', batch);
    if (error) {
      if (isTableMissingError(error)) return { byVendaRecibo, byConciliacao };
      throw error;
    }
    for (const row of (data || []) as RateioRow[]) {
      const id = toStr(row?.conciliacao_recibo_id);
      if (toNumber(row?.percentual_origem) <= 0 || toNumber(row?.percentual_destino) <= 0) continue;
      if (id) byConciliacao.set(id, row);
    }
  }

  return { byVendaRecibo, byConciliacao };
}

export async function buildVendaRankingConciliacaoSnapshot(params: VendaRankingParams) {
  const { client, recibos } = params;
  const concRows = await fetchConciliacaoRows(params);
  const reciboIds = collectIds(recibos, (recibo) => recibo.id);
  const concIds = collectIds(concRows, (row) => row?.id);
  const rateios = await fetchRateioMaps(client, reciboIds, concIds);

  const result = recibos.map((recibo) => {
    const concGrupo = concRows.filter((row) => matchesRecibo(row, recibo));
    const { sourceRow, confirmed } = concGrupo.length > 0
      ? pickDisplaySourceRow(concGrupo)
      : { sourceRow: null, confirmed: false };
    const hasConciliacao = Boolean(sourceRow);
    const concIdsForRecibo = collectIds(concGrupo, (row) => row?.id);

    const vendaValorTotal = toNumber(recibo.valor_total);
    const vendaValorTaxas = toNumber(recibo.valor_taxas);
    const vendaValorRanking = vendaValorTotal;

    let concValorRanking: number | null = null;
    let concValorTaxas: number | null = null;
    let concStatus: string | null = null;
    let concMeta: ReturnType<typeof resolveConciliacaoRankingValue>['meta'] | null = null;
    let rankingProdutoId: string | null = null;
    let rankingProdutoNome: string | null = null;
    let isSeguroViagem = false;

    if (sourceRow) {
      const resolved = resolveConciliacaoRankingValue(sourceRow);
      concValorRanking = resolved.valorRanking;
      concValorTaxas = toNumber(sourceRow.valor_taxas);
      concStatus = confirmed
        ? 'confirmada'
        : resolveConciliacaoStatus({ status: sourceRow.status, descricao: sourceRow.descricao });
      concMeta = resolved.meta;
      rankingProdutoId = toStr(sourceRow?.ranking_produto_id) || null;
      rankingProdutoNome = toStr(sourceRow?.ranking_produto?.nome) || null;
      isSeguroViagem = Boolean(sourceRow?.is_seguro_viagem);
    }

    const valorRankingEfetivo = confirmed && concValorRanking !== null ? concValorRanking : vendaValorRanking;
    const valorTaxasEfetivo = confirmed && concValorTaxas !== null ? concValorTaxas : vendaValorTaxas;
    const divergenciaValor = hasConciliacao && concValorRanking !== null
      ? roundMoney(concValorRanking - vendaValorTotal)
      : null;
    const divergenciaTaxas = hasConciliacao && concValorTaxas !== null
      ? roundMoney(concValorTaxas - vendaValorTaxas)
      : null;

    const rateioConc = concIdsForRecibo.reduce<RateioRow | null>(
      (found, id) => found || rateios.byConciliacao.get(id) || null,
      null
    );
    const rateioVenda = rateios.byVendaRecibo.get(toStr(recibo.id)) || null;
    const rateio = rateioConc || rateioVenda;

    return {
      recibo_id: toStr(recibo.id),
      numero_recibo: toStr(recibo.numero_recibo),
      tem_conciliacao: hasConciliacao,
      conciliacao_confirmada: confirmed,
      provisorio: !confirmed,
      conciliacao_status: concStatus,
      conciliacao_ids: concIdsForRecibo,
      venda_valor_total: vendaValorTotal,
      venda_valor_taxas: vendaValorTaxas,
      venda_valor_ranking: vendaValorRanking,
      conc_valor_ranking: concValorRanking,
      conc_valor_taxas: concValorTaxas,
      conc_meta: concMeta,
      valor_ranking_efetivo: valorRankingEfetivo,
      valor_taxas_efetivo: valorTaxasEfetivo,
      diverge: divergenciaValor !== null && Math.abs(divergenciaValor) > 0.5,
      diverge_taxas: divergenciaTaxas !== null && Math.abs(divergenciaTaxas) > 0.5,
      divergencia_valor: divergenciaValor,
      divergencia_taxas: divergenciaTaxas,
      ranking_produto_id: rankingProdutoId,
      ranking_produto_nome: rankingProdutoNome,
      is_seguro_viagem: isSeguroViagem,
      rateio: rateio ? {
        id: toStr(rateio.id),
        ativo: Boolean(rateio.ativo),
        vendedor_destino_id: toStr(rateio.vendedor_destino_id),
        vendedor_destino: rateio.vendedor_destino || null,
        percentual_origem: toNumber(rateio.percentual_origem),
        percentual_destino: toNumber(rateio.percentual_destino),
        observacao: rateio.observacao || null
      } : null
    };
  });

  const totalRankingEfetivo = result.reduce((sum, row) => sum + row.valor_ranking_efetivo, 0);
  const totalVendaRanking = result.reduce((sum, row) => sum + row.venda_valor_ranking, 0);
  const totalDivergencia = result.reduce((sum, row) => sum + (row.divergencia_valor || 0), 0);
  const totalDivergenciaTaxas = result.reduce((sum, row) => sum + (row.divergencia_taxas || 0), 0);

  return {
    recibos: result,
    totais: {
      valor_ranking_efetivo: roundMoney(totalRankingEfetivo),
      valor_venda_ranking: roundMoney(totalVendaRanking),
      divergencia_total: roundMoney(totalDivergencia),
      divergencia_taxas_total: roundMoney(totalDivergenciaTaxas),
      algum_provisorio: result.some((row) => row.provisorio),
      algum_diverge: result.some((row) => row.diverge || row.diverge_taxas),
      algum_diverge_valor: result.some((row) => row.diverge),
      algum_diverge_taxas: result.some((row) => row.diverge_taxas)
    }
  };
}
