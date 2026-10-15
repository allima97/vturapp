import type { SupabaseClient } from '@supabase/supabase-js';
import { buildConciliacaoMetrics, isConciliacaoEfetivada } from '$lib/conciliacao/business';
import { normalizeReceiptKey } from '$lib/conciliacao/receiptNormalize';
import { findEquipeVturVendedor } from '$lib/conciliacao/baixaRac';
import { fetchRankingVendedoresByCompanyIds, isUuid, logServerError } from '$lib/server/v1';
import {
  addDaysISODate,
  currentMonthRangeISODate,
  diffDaysISODate,
  monthRangeFromKey,
  todayISODateLocal
} from '$lib/date';
import { cleanStringSet, chunkArray, uniqueCleanStrings, uniqueValues } from '$lib/utils/array';

const EPS = 0.01;
const SUPABASE_IN_BATCH_SIZE = 150;

type Actor = 'cron' | 'user';

type ReciboMatchRow = {
  id: string;
  venda_id: string;
  vendedor_id: string | null;
  numero_recibo: string | null;
  numero_reserva?: string | null;
  valor_total: number | null;
  valor_taxas: number | null;
  data_venda: string | null;
};

type VendaReciboCandidateRow = {
  id?: string | null;
  venda_id?: string | null;
  numero_recibo?: string | null;
  numero_reserva?: string | null;
  valor_total?: number | null;
  valor_taxas?: number | null;
  data_venda?: string | null;
};

type VendaCompanySellerRow = {
  id?: string | null;
  company_id?: string | null;
  vendedor_id?: string | null;
};

type ConciliacaoSemMovimentoRow = {
  data?: string | null;
};

type ConciliacaoMovimentoDataRow = {
  movimento_data?: string | null;
};

type ReconcilePendenciaRow = {
  id?: string | null;
  company_id?: string | null;
  documento?: string | null;
  numero_reserva?: string | null;
  movimento_data?: string | null;
  status?: string | null;
  descricao?: string | null;
  valor_lancamentos?: number | null;
  valor_taxas?: number | null;
  valor_descontos?: number | null;
  valor_abatimentos?: number | null;
  valor_nao_comissionavel?: number | null;
  valor_venda_real?: number | null;
  valor_saldo?: number | null;
  valor_calculada_loja?: number | null;
  valor_visao_master?: number | null;
  valor_comissao_loja?: number | null;
  percentual_comissao_loja?: number | null;
  faixa_comissao?: string | null;
  is_seguro_viagem?: boolean | null;
  ranking_vendedor_id?: string | null;
  ranking_assigned_by?: string | null;
  conciliado?: boolean | null;
  venda_recibo_id?: string | null;
  venda_id?: string | null;
};

type RankingVendedorIdRow = {
  id?: string | null;
};

type ConciliacaoListPageRow = {
  venda_recibo_id?: string | null;
};

export type ReconcileResult = {
  checked: number;
  reconciled: number;
  updatedTaxes: number;
  stillPending: number;
  updateErrors: number;
  duplicatesRemoved?: number;
  duplicateGroups?: number;
  recalculated?: number;
  recalculatedChecked?: number;
};

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

function compactNumero(value?: string | null) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function numeroReciboMatches(left?: string | null, right?: string | null) {
  const leftCompact = compactNumero(left);
  const rightCompact = compactNumero(right);
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
  if (!leftSignificantCore || !rightSignificantCore || leftSignificantCore !== rightSignificantCore) return false;

  const leftPrefix = extractReciboPrefix(left);
  const rightPrefix = extractReciboPrefix(right);
  if (leftPrefix && rightPrefix) return leftPrefix === rightPrefix;
  return true;
}

function buildReciboSearchPatterns(value?: string | null) {
  const digits = onlyDigits(value);
  const core = reciboCoreDigits(value);
  const significantCore = core ? stripLeadingZeros(core) : '';
  const prefix = extractReciboPrefix(value);
  const patterns = new Set<string>();

  // Bug 3 fix: use %…% wildcards so ilike searches actually find partial matches.
  // Without them, e.g. core="0000084046" would only match the exact string "0000084046"
  // instead of "5630-0000084046" or similar vendor receipt numbers.
  if (core) patterns.add(`%${core}%`);
  if (significantCore && significantCore !== core) patterns.add(`%${significantCore}%`);
  if (prefix && core) patterns.add(`${prefix}%${core}`);
  if (prefix && significantCore) patterns.add(`${prefix}%${significantCore}`);
  if (digits && digits !== core && digits !== significantCore) patterns.add(`%${digits}%`);

  const validPatterns: string[] = [];
  for (const item of patterns) {
    if (item.replace(/%/g, '').length >= 5) validPatterns.push(item);
  }
  return validPatterns;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function matches(a: number, b: number) {
  return Math.abs(a - b) <= EPS;
}

function diff(a: number, b: number) {
  return round2(a - b);
}

function normalizeConciliacaoStatus(value?: string | null) {
  return String(value || '').trim().toUpperCase() || 'OUTRO';
}

function normalizeRexturLocalizador(value?: string | null) {
  return String(value || '')
    .trim()
    .replace(/^REXTUR[\s-]*/i, '')
    .toUpperCase();
}

function isRexturDocumento(value?: string | null) {
  return String(value || '').trim().toUpperCase() === 'REXTUR';
}

function rexturReservaMatches(left?: string | null, right?: string | null) {
  const leftNorm = normalizeRexturLocalizador(left);
  const rightNorm = normalizeRexturLocalizador(right);
  return Boolean(leftNorm && rightNorm && leftNorm === rightNorm);
}

type ConciliacaoDuplicateRow = {
  id?: string | null;
  company_id?: string | null;
  movimento_data?: string | null;
  documento?: string | null;
  numero_reserva?: string | null;
  status?: string | null;
  is_baixa_rac?: boolean | null;
  descricao?: string | null;
  valor_lancamentos?: number | null;
  valor_taxas?: number | null;
  valor_descontos?: number | null;
  valor_abatimentos?: number | null;
  valor_nao_comissionavel?: number | null;
  valor_saldo?: number | null;
  valor_opfax?: number | null;
  valor_calculada_loja?: number | null;
  valor_visao_master?: number | null;
  valor_comissao_loja?: number | null;
  percentual_comissao_loja?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
  conciliado?: boolean | null;
  venda_id?: string | null;
  venda_recibo_id?: string | null;
  ranking_vendedor_id?: string | null;
  ranking_produto_id?: string | null;
  ranking_assigned_by?: string | null;
  ranking_assigned_at?: string | null;
  conciliado_em?: string | null;
  last_checked_at?: string | null;
};

const duplicatePatchFields: Array<keyof ConciliacaoDuplicateRow> = [
  'ranking_vendedor_id',
  'ranking_produto_id',
  'venda_id',
  'venda_recibo_id',
  'ranking_assigned_by',
  'ranking_assigned_at',
  'conciliado_em'
];

function duplicateGroupKey(row: ConciliacaoDuplicateRow) {
  return [
    String(row?.company_id || '').trim(),
    String(row?.movimento_data || '').trim(),
    String(row?.documento || '').trim(),
    normalizeRexturLocalizador(row?.numero_reserva),
    normalizeConciliacaoStatus(row?.status),
    Boolean(row?.is_baixa_rac) ? 'BAIXA_RAC' : 'NORMAL'
  ].join('::');
}

function rankDuplicateRow(row: ConciliacaoDuplicateRow) {
  const metrics = buildConciliacaoMetrics({
    descricao: row?.descricao,
    valorLancamentos: row?.valor_lancamentos,
    valorTaxas: row?.valor_taxas,
    valorDescontos: row?.valor_descontos,
    valorAbatimentos: row?.valor_abatimentos,
    valorNaoComissionavel: row?.valor_nao_comissionavel,
    valorSaldo: row?.valor_saldo,
    valorOpfax: row?.valor_opfax,
    valorCalculadaLoja: row?.valor_calculada_loja,
    valorVisaoMaster: row?.valor_visao_master,
    valorComissaoLoja: row?.valor_comissao_loja,
    percentualComissaoLoja: row?.percentual_comissao_loja
  });
  const percentual = Number(metrics.percentualComissaoLoja ?? 0);
  const comissao = Number(metrics.valorComissaoLoja ?? 0);
  const updatedAt = Date.parse(String(row?.updated_at || row?.created_at || ''));

  let score = 0;
  if (Number.isFinite(percentual) && percentual > 0) score += 4;
  if (Number.isFinite(comissao) && Math.abs(comissao) > 0.009) score += 3;
  if (row?.conciliado) score += 2;
  if (row?.venda_id || row?.venda_recibo_id) score += 1;

  return {
    score,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0
  };
}

function pickDuplicateWinner(rows: ConciliacaoDuplicateRow[]) {
  return [...rows].sort((left, right) => {
    const leftRank = rankDuplicateRow(left);
    const rightRank = rankDuplicateRow(right);
    if (rightRank.score !== leftRank.score) return rightRank.score - leftRank.score;
    return rightRank.updatedAt - leftRank.updatedAt;
  })[0];
}

function firstPresent(rows: ConciliacaoDuplicateRow[], field: keyof ConciliacaoDuplicateRow) {
  for (const row of rows) {
    const value = row?.[field];
    if (value !== null && value !== undefined && String(value).trim() !== '') return value;
  }
  return undefined;
}

function buildDuplicateWinnerPatch(winner: ConciliacaoDuplicateRow, losers: ConciliacaoDuplicateRow[]) {
  const payload: Partial<ConciliacaoDuplicateRow> = {};
  const payloadRecord = payload as Record<string, unknown>;
  for (const field of duplicatePatchFields) {
    const winnerValue = winner?.[field];
    if (winnerValue !== null && winnerValue !== undefined && String(winnerValue).trim() !== '') continue;
    const loserValue = firstPresent(losers, field);
    if (loserValue !== undefined) payloadRecord[field] = loserValue;
  }

  if (!Boolean(winner?.conciliado) && losers.some((row) => Boolean(row?.conciliado))) {
    payload.conciliado = true;
  }

  if (Object.keys(payload).length > 0) payload.last_checked_at = new Date().toISOString();
  return payload;
}

function resolveMonthDateRange(month?: string | null) {
  const range = monthRangeFromKey(month);
  if (!range) return null;
  return {
    start: range.inicio,
    endExclusive: addDaysISODate(range.fim, 1)
  };
}

function getCurrentMonthRange() {
  const range = currentMonthRangeISODate();
  return { start: range.inicio, end: range.fim };
}

async function insertConciliacaoNumericAudit(params: {
  client: SupabaseClient;
  companyId: string;
  conciliacaoReciboId: string;
  vendaId?: string | null;
  vendaReciboId?: string | null;
  numeroRecibo?: string | null;
  field: string;
  oldValue?: number | null;
  newValue?: number | null;
  actor: Actor;
  actorUserId?: string | null;
}) {
  const oldValue = Number(params.oldValue || 0);
  const newValue = Number(params.newValue || 0);
  if (matches(oldValue, newValue)) return;

  try {
    await params.client.from('conciliacao_recibo_changes').insert({
      company_id: params.companyId,
      conciliacao_recibo_id: params.conciliacaoReciboId,
      venda_id: params.vendaId || null,
      venda_recibo_id: params.vendaReciboId || null,
      numero_recibo: params.numeroRecibo || null,
      field: params.field,
      old_value: oldValue,
      new_value: newValue,
      actor: params.actor,
      changed_by: params.actorUserId || null
    });
  } catch (error) {
    logServerError('CONCILIACAO_NUMERIC_AUDIT_ERROR', error, {
      field: params.field,
      conciliacao_recibo_id: params.conciliacaoReciboId,
      venda_recibo_id: params.vendaReciboId || null
    });
  }
}

async function persistExecutionLog(params: {
  client: SupabaseClient;
  companyId: string;
  actor: Actor;
  actorUserId?: string | null;
  status?: 'ok' | 'error';
  errorMessage?: string | null;
  result: ReconcileResult;
}) {
  try {
    await params.client.from('conciliacao_execucoes').insert({
      company_id: params.companyId,
      actor: params.actor,
      actor_user_id: params.actorUserId || null,
      checked: params.result.checked,
      reconciled: params.result.reconciled,
      updated_taxes: params.result.updatedTaxes,
      still_pending: params.result.stillPending,
      status: params.status || 'ok',
      error_message: params.errorMessage || null
    });
  } catch (error) {
    logServerError('CONCILIACAO_EXECUCAO_LOG_ERROR', error, {
      company_id: params.companyId
    });
  }
}

async function moveDuplicateRateioToWinner(params: {
  client: SupabaseClient;
  winnerId: string;
  loserIds: string[];
}) {
  if (params.loserIds.length === 0) return;

  try {
    type DuplicateRateioRow = {
      id?: string | null;
      conciliacao_recibo_id?: string | null;
    };

    const rateios: DuplicateRateioRow[] = [];
    const loserIdSet = cleanStringSet(params.loserIds);
    const idsToLookup = uniqueCleanStrings([params.winnerId, ...params.loserIds]);
    for (const batch of chunkArray(idsToLookup, SUPABASE_IN_BATCH_SIZE)) {
      const { data, error } = await params.client
        .from('vendas_recibos_rateio')
        .select('id, conciliacao_recibo_id')
        .in('conciliacao_recibo_id', batch);
      if (error) throw error;
      rateios.push(...(data || []));
    }

    const rows = Array.isArray(rateios) ? rateios : [];
    const winnerHasRateio = rows.some((row) => String(row?.conciliacao_recibo_id || '') === params.winnerId);
    const loserRateios = rows.filter((row) => loserIdSet.has(String(row?.conciliacao_recibo_id || '')));
    const [firstLoserRateio, ...extraLoserRateios] = loserRateios;

    if (!winnerHasRateio && firstLoserRateio?.id) {
      await params.client
        .from('vendas_recibos_rateio')
        .update({ conciliacao_recibo_id: params.winnerId })
        .eq('id', firstLoserRateio.id);
    }

    const rateiosToDelete = winnerHasRateio ? loserRateios : extraLoserRateios;
    const idsToDelete = uniqueCleanStrings(rateiosToDelete.map((row) => row?.id));
    if (idsToDelete.length > 0) {
      for (const batch of chunkArray(idsToDelete, SUPABASE_IN_BATCH_SIZE)) {
        const { error: deleteError } = await params.client.from('vendas_recibos_rateio').delete().in('id', batch);
        if (deleteError) throw deleteError;
      }
    }
  } catch (error) {
    const errorRecord = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
    const code = String(errorRecord?.code || '').trim();
    const message = String(errorRecord?.message || error || '').toLowerCase();
    if (code === '42P01' || message.includes('vendas_recibos_rateio')) return;
    throw error;
  }
}

async function cleanupDuplicateConciliacaoRowsCompany(params: {
  client: SupabaseClient;
  companyId: string;
  onlyCurrentMonth?: boolean;
  month?: string | null;
  conciliacaoReciboId?: string | null;
}): Promise<{ removed: number; groups: number }> {
  const client = params.client;
  let query = client
    .from('conciliacao_recibos')
    .select(
      'id, company_id, documento, numero_reserva, movimento_data, status, descricao, valor_lancamentos, valor_taxas, valor_descontos, valor_abatimentos, valor_nao_comissionavel, valor_saldo, valor_opfax, valor_calculada_loja, valor_visao_master, valor_comissao_loja, percentual_comissao_loja, ranking_vendedor_id, ranking_produto_id, ranking_assigned_by, ranking_assigned_at, conciliado, conciliado_em, venda_id, venda_recibo_id, is_baixa_rac, created_at, updated_at'
    )
    .eq('company_id', params.companyId)
    .order('movimento_data', { ascending: false, nullsFirst: false });

  if (params.conciliacaoReciboId) {
    const { data: target, error } = await client
      .from('conciliacao_recibos')
      .select('documento, numero_reserva, movimento_data, status')
      .eq('company_id', params.companyId)
      .eq('id', params.conciliacaoReciboId)
      .maybeSingle();
    if (error) throw error;
    if (!target?.documento) return { removed: 0, groups: 0 };
    query = query.eq('documento', String(target.documento || '').trim()).eq('status', target.status || '');
    query =
      target.movimento_data == null
        ? query.is('movimento_data', null)
        : query.eq('movimento_data', target.movimento_data);
  } else {
    const monthRange = resolveMonthDateRange(params.month);
    if (monthRange) {
      query = query.gte('movimento_data', monthRange.start).lt('movimento_data', monthRange.endExclusive);
    } else if (params.onlyCurrentMonth) {
      const { start, end } = getCurrentMonthRange();
      query = query.gte('movimento_data', start).lte('movimento_data', end);
    }
  }

  const { data, error } = await query.limit(5000);
  if (error) throw error;

  const grouped = new Map<string, ConciliacaoDuplicateRow[]>();
  for (const row of data || []) {
    const key = duplicateGroupKey(row);
    const bucket = grouped.get(key) || [];
    bucket.push(row);
    grouped.set(key, bucket);
  }

  let removed = 0;
  let groups = 0;

  for (const bucket of grouped.values()) {
    if (bucket.length <= 1) continue;
    groups += 1;
    const winner = pickDuplicateWinner(bucket);
    if (!winner?.id) continue;
    const losers = bucket.filter((row) => String(row?.id || '') !== String(winner.id || ''));
    const loserIds = uniqueCleanStrings(losers.map((row) => row?.id));
    if (loserIds.length === 0) continue;

    const winnerPatch = buildDuplicateWinnerPatch(winner, losers);
    if (Object.keys(winnerPatch).length > 0) {
      const { error: patchError } = await client.from('conciliacao_recibos').update(winnerPatch).eq('id', winner.id);
      if (patchError) throw patchError;
    }

    await moveDuplicateRateioToWinner({ client, winnerId: String(winner.id), loserIds });

    for (const batch of chunkArray(loserIds, SUPABASE_IN_BATCH_SIZE)) {
      const { error: changesError } = await client
        .from('conciliacao_recibo_changes')
        .update({ conciliacao_recibo_id: winner.id })
        .in('conciliacao_recibo_id', batch);
      if (changesError) throw changesError;
    }

    for (const batch of chunkArray(loserIds, SUPABASE_IN_BATCH_SIZE)) {
      const { error: deleteError } = await client.from('conciliacao_recibos').delete().in('id', batch);
      if (deleteError) throw deleteError;
    }
    removed += loserIds.length;
  }

  return { removed, groups };
}

async function fetchReciboCandidates(params: {
  client: SupabaseClient;
  numero: string;
  companyId: string;
}): Promise<ReciboMatchRow[]> {
  const { client, numero, companyId } = params;
  const normalizedKey = normalizeReceiptKey(numero);
  const candidatesById = new Map<string, ReciboMatchRow>();

  const collect = (rows: VendaReciboCandidateRow[]) => {
    for (const row of rows || []) {
      const id = String(row?.id || '').trim();
      const vendaId = String(row?.venda_id || '').trim();
      if (!id || !vendaId || !numeroReciboMatches(numero, row?.numero_recibo)) continue;
      candidatesById.set(id, {
        id,
        venda_id: vendaId,
        vendedor_id: null,
        numero_recibo: row?.numero_recibo ?? null,
        numero_reserva: row?.numero_reserva ?? null,
        valor_total: row?.valor_total ?? null,
        valor_taxas: row?.valor_taxas ?? null,
        data_venda: row?.data_venda ?? null
      });
    }
  };

  if (normalizedKey) {
    const { data, error } = await client
      .from('vendas_recibos')
      .select('id, venda_id, numero_recibo, numero_reserva, valor_total, valor_taxas, data_venda')
      .eq('numero_recibo_normalizado', normalizedKey)
      .limit(30);
    if (error) throw error;
    collect(data || []);
  }

  if (numero) {
    const { data, error } = await client
      .from('vendas_recibos')
      .select('id, venda_id, numero_recibo, numero_reserva, valor_total, valor_taxas, data_venda')
      .eq('numero_recibo', numero)
      .limit(30);
    if (error) throw error;
    collect(data || []);
  }

  // Busca fuzzy via ilike — apenas como último recurso, com limite menor para
  // reduzir risco de match errado entre recibos de vendedores diferentes.
  // O selectBestReciboMatch exige discriminação por valor para confirmar o match.
  if (candidatesById.size === 0) {
    for (const token of buildReciboSearchPatterns(numero).slice(0, 2)) {
      const { data, error } = await client
        .from('vendas_recibos')
        .select('id, venda_id, numero_recibo, numero_reserva, valor_total, valor_taxas, data_venda')
        .ilike('numero_recibo', token)
        .limit(20);
      if (error) throw error;
      collect(data || []);
      // Se o fuzzy já encontrou candidatos, não tenta mais tokens para limitar falsos positivos
      if (candidatesById.size > 0) break;
    }
  }

  const candidates = Array.from(candidatesById.values()).filter((row) => row.venda_id);
  if (candidates.length === 0) return [];

  const vendaIds = uniqueCleanStrings(candidates.map((row) => row.venda_id));
  const vendas: VendaCompanySellerRow[] = [];
  for (const batch of chunkArray(vendaIds, SUPABASE_IN_BATCH_SIZE)) {
    const { data, error } = await client
      .from('vendas')
      .select('id, company_id, vendedor_id')
      .in('id', batch);
    if (error) throw error;
    vendas.push(...(data || []));
  }

  const vendasMap = new Map<string, { company_id: string | null; vendedor_id: string | null }>();
  for (const row of vendas || []) {
    const id = String(row?.id || '').trim();
    if (!id) continue;
    vendasMap.set(id, {
      company_id: String(row?.company_id || '').trim() || null,
      vendedor_id: String(row?.vendedor_id || '').trim() || null
    });
  }

  return candidates
    .filter((row) => vendasMap.get(row.venda_id)?.company_id === companyId)
    .map((row) => ({
      ...row,
      vendedor_id: vendasMap.get(row.venda_id)?.vendedor_id || null
    }));
}

async function fetchRexturReciboCandidatesByReserva(params: {
  client: SupabaseClient;
  reserva: string;
  companyId: string;
}): Promise<ReciboMatchRow[]> {
  const { client, companyId } = params;
  const localizador = normalizeRexturLocalizador(params.reserva);
  if (!localizador) return [];

  const candidatesById = new Map<string, ReciboMatchRow>();
  const collect = (rows: VendaReciboCandidateRow[]) => {
    for (const row of rows || []) {
      const id = String(row?.id || '').trim();
      const vendaId = String(row?.venda_id || '').trim();
      if (!id || !vendaId || !isRexturDocumento(row?.numero_recibo)) continue;
      if (!rexturReservaMatches(localizador, row?.numero_reserva)) continue;
      candidatesById.set(id, {
        id,
        venda_id: vendaId,
        vendedor_id: null,
        numero_recibo: row?.numero_recibo ?? null,
        numero_reserva: row?.numero_reserva ?? null,
        valor_total: row?.valor_total ?? null,
        valor_taxas: row?.valor_taxas ?? null,
        data_venda: row?.data_venda ?? null
      });
    }
  };

  const { data: exactRows, error: exactError } = await client
    .from('vendas_recibos')
    .select('id, venda_id, numero_recibo, numero_reserva, valor_total, valor_taxas, data_venda')
    .eq('numero_recibo', 'REXTUR')
    .in('numero_reserva', [localizador, `REXTUR-${localizador}`])
    .limit(30);
  if (exactError) throw exactError;
  collect(exactRows || []);

  if (candidatesById.size === 0) {
    const { data: fuzzyRows, error: fuzzyError } = await client
      .from('vendas_recibos')
      .select('id, venda_id, numero_recibo, numero_reserva, valor_total, valor_taxas, data_venda')
      .eq('numero_recibo', 'REXTUR')
      .ilike('numero_reserva', `%${localizador}%`)
      .limit(30);
    if (fuzzyError) throw fuzzyError;
    collect(fuzzyRows || []);
  }

  const candidates = Array.from(candidatesById.values()).filter((row) => row.venda_id);
  if (candidates.length === 0) return [];

  const vendaIds = uniqueCleanStrings(candidates.map((row) => row.venda_id));
  const vendas: VendaCompanySellerRow[] = [];
  for (const batch of chunkArray(vendaIds, SUPABASE_IN_BATCH_SIZE)) {
    const { data, error } = await client
      .from('vendas')
      .select('id, company_id, vendedor_id')
      .in('id', batch);
    if (error) throw error;
    vendas.push(...(data || []));
  }

  const vendasMap = new Map<string, { company_id: string | null; vendedor_id: string | null }>();
  for (const row of vendas || []) {
    const id = String(row?.id || '').trim();
    if (!id) continue;
    vendasMap.set(id, {
      company_id: String(row?.company_id || '').trim() || null,
      vendedor_id: String(row?.vendedor_id || '').trim() || null
    });
  }

  return candidates
    .filter((row) => vendasMap.get(row.venda_id)?.company_id === companyId)
    .map((row) => ({
      ...row,
      vendedor_id: vendasMap.get(row.venda_id)?.vendedor_id || null
    }));
}

function selectBestReciboMatch(params: {
  numero: string;
  candidates: ReciboMatchRow[];
  valorLancamento?: number | null;
  valorTaxas?: number | null;
}) {
  const { numero, candidates, valorLancamento = null, valorTaxas = null } = params;
  if (candidates.length === 0) return null;

  // Match exato de string primeiro — mais seguro
  const reciboExato = candidates.find((item) => String(item.numero_recibo || '').trim() === numero);
  if (reciboExato) return reciboExato;

  const compativeis = candidates.filter((item) => numeroReciboMatches(numero, item.numero_recibo));
  if (compativeis.length === 0) return null;

  // Filtra por valor quando disponível — reduz ambiguidade
  const porValor = valorLancamento != null
    ? compativeis.filter((item) => matches(Number(item.valor_total || 0), Number(valorLancamento || 0)))
    : compativeis;

  const porTaxa = valorTaxas != null
    ? porValor.filter((item) => matches(Number(item.valor_taxas || 0), Number(valorTaxas || 0)))
    : porValor;

  // Só retorna quando há exatamente 1 candidato — nunca escolhe arbitrariamente entre múltiplos.
  // Com múltiplos candidatos ambíguos, é mais seguro não linkar do que linkar ao vendedor errado.
  if (porTaxa.length === 1) return porTaxa[0];
  if (porValor.length === 1) return porValor[0];
  if (compativeis.length === 1) return compativeis[0];

  // Múltiplos candidatos e sem discriminador — não faz match para evitar atribuição errada.
  logServerError(
    '[conciliacaoReconcile] selectBestReciboMatch: múltiplos candidatos ambíguos — nenhum selecionado',
    new Error('ambiguous_receipt_match'),
    { candidatos: compativeis.length }
  );
  return null;
}

async function findReciboByNumero(params: {
  client: SupabaseClient;
  numero: string;
  companyId: string;
  valorLancamento?: number | null;
  valorTaxas?: number | null;
}) {
  const candidates = await fetchReciboCandidates({
    client: params.client,
    numero: params.numero,
    companyId: params.companyId
  });
  return selectBestReciboMatch({
    numero: params.numero,
    candidates,
    valorLancamento: params.valorLancamento ?? null,
    valorTaxas: params.valorTaxas ?? null
  });
}

async function findRexturReciboByReserva(params: {
  client: SupabaseClient;
  reserva: string;
  companyId: string;
  valorLancamento?: number | null;
  valorTaxas?: number | null;
}) {
  const candidates = await fetchRexturReciboCandidatesByReserva({
    client: params.client,
    reserva: params.reserva,
    companyId: params.companyId
  });
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const valorLancamento = params.valorLancamento ?? null;
  const valorTaxas = params.valorTaxas ?? null;
  const porValor =
    valorLancamento != null
      ? candidates.filter((item) => matches(Number(item.valor_total || 0), Number(valorLancamento || 0)))
      : candidates;
  const porTaxa =
    valorTaxas != null
      ? porValor.filter((item) => matches(Number(item.valor_taxas || 0), Number(valorTaxas || 0)))
      : porValor;

  if (porTaxa.length === 1) return porTaxa[0];
  if (porValor.length === 1) return porValor[0];

  logServerError(
    '[conciliacaoReconcile] REXTUR com localizador ambíguo — nenhum recibo selecionado',
    new Error('ambiguous_rextur_locator_match'),
    { candidatos: candidates.length }
  );
  return null;
}

export type DiagnosticoCronologico = {
  /** Último dia que forma uma sequência contínua sem lacunas. null = nenhum registro. */
  fronteira: string | null;
  /** Dias faltantes entre a fronteira e o dia máximo importado. */
  diasFaltantes: string[];
  /** Todos os dias importados (distintos). */
  diasImportados: string[];
  /** Dias importados após a fronteira que estão bloqueados para conciliação. */
  diasBloqueados: string[];
  /** Dias marcados explicitamente como "sem movimento". */
  diasSemMovimento: string[];
  /** Quantidade de registros pendentes de conciliação que estão bloqueados (além da fronteira). */
  registrosBloqueados: number;
};

/**
 * Determina a "fronteira cronológica" de conciliação para uma empresa e
 * diagnostica quais dias estão faltando / bloqueados.
 *
 * Regra: a conciliação só pode avançar de forma contínua. Dado o conjunto de
 * datas já importadas (distintas, ordenadas), encontra a maior data D tal que
 * TODOS os dias de D_min até D existam no banco (sem lacunas). Qualquer dia
 * posterior a essa fronteira fica bloqueado para conciliação até que os dias
 * intermediários sejam importados ou marcados como "sem movimento".
 */
export async function diagnosticarLacunasCronologicas(params: {
  client: SupabaseClient;
  companyId: string;
}): Promise<DiagnosticoCronologico> {
  const { client, companyId } = params;

  // Janela de análise: últimos 60 dias até hoje.
  const hoje = todayISODateLocal();
  const inicio60dStr = addDaysISODate(hoje, -60);

  // Busca os movimento_data distintos da empresa nos últimos 60 dias
  const { data, error } = await client
    .from('conciliacao_recibos')
    .select('movimento_data')
    .eq('company_id', companyId)
    .gte('movimento_data', inicio60dStr)
    .order('movimento_data', { ascending: true });

  if (error) throw error;

  // Busca dias marcados como sem movimento no mesmo período
  const { data: semMovimentoRows, error: semMovimentoErr } = await client
    .from('conciliacao_dias_sem_movimento')
    .select('data')
    .eq('company_id', companyId)
    .gte('data', inicio60dStr);

  if (semMovimentoErr) {
    const msg = String(semMovimentoErr.message || semMovimentoErr || '').toLowerCase();
    const code = String((semMovimentoErr as { code?: string } | null)?.code || '').trim();
    const isMissing = code === '42P01' || msg.includes('does not exist') || msg.includes('could not find') || msg.includes('conciliacao_dias_sem_movimento');
    if (!isMissing) throw semMovimentoErr;
  }

  const diasSemMovimento = uniqueCleanStrings(((semMovimentoRows || []) as ConciliacaoSemMovimentoRow[]).map((r) => r?.data)).sort();

  const diasImportados = uniqueCleanStrings(((data || []) as ConciliacaoMovimentoDataRow[]).map((r) => r?.movimento_data)).sort();

  if (diasImportados.length === 0) {
    return { fronteira: null, diasFaltantes: [], diasImportados: [], diasBloqueados: [], diasSemMovimento, registrosBloqueados: 0 };
  }

  // Une importados + sem movimento para verificar sequência contínua
  const diasPreenchidos = uniqueValues([...diasImportados, ...diasSemMovimento]).sort();

  // Percorre a sequência e para onde houver um salto > 1 dia
  let frontier = diasPreenchidos[0];
  let gapIndex = -1;
  for (let i = 1; i < diasPreenchidos.length; i++) {
    const diffDays = diffDaysISODate(diasPreenchidos[i - 1], diasPreenchidos[i]) ?? 0;
    if (diffDays > 1) {
      gapIndex = i;
      break;
    }
    frontier = diasPreenchidos[i];
  }

  // Se não há lacuna, tudo está ok
  if (gapIndex === -1) {
    return { fronteira: frontier, diasFaltantes: [], diasImportados, diasBloqueados: [], diasSemMovimento, registrosBloqueados: 0 };
  }

  // Calcula os dias faltantes entre a fronteira e o próximo dia preenchido
  const diasFaltantes: string[] = [];
  let cursor = addDaysISODate(frontier, 1);
  const nextFilled = diasPreenchidos[gapIndex];
  while (cursor && cursor < nextFilled) {
    diasFaltantes.push(cursor);
    cursor = addDaysISODate(cursor, 1);
  }

  // Dias bloqueados = dias IMPORTADOS após a fronteira (sem movimento não bloqueia)
  const diasBloqueados = diasImportados.filter((d) => d > frontier);

  // Conta registros pendentes de conciliação nesses dias bloqueados
  let registrosBloqueados = 0;
  if (diasBloqueados.length > 0) {
    const { count } = await client
      .from('conciliacao_recibos')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('conciliado', false)
      .gt('movimento_data', frontier);
    registrosBloqueados = Number(count || 0);
  }

  return { fronteira: frontier, diasFaltantes, diasImportados, diasBloqueados, diasSemMovimento, registrosBloqueados };
}

/** Versão interna sem diagnóstico completo — usada no filtro da query de reconciliação. */
async function resolverFronteiraCronologica(params: {
  client: SupabaseClient;
  companyId: string;
}): Promise<string | null> {
  const result = await diagnosticarLacunasCronologicas(params);
  return result.fronteira;
}

async function reconcilePendentesCompany(params: {
  limit?: number;
  companyId: string;
  conciliacaoReciboId?: string | null;
  onlyCurrentMonth?: boolean;
  actor?: Actor;
  actorUserId?: string | null;
  client: SupabaseClient;
}): Promise<ReconcileResult> {
  const limit = Math.max(1, Math.min(500, Number(params.limit || 200)));
  const actor = params.actor || 'user';
  const actorUserId = params.actorUserId || null;
  const client = params.client;

  // Determina a fronteira cronológica para a empresa.
  // Ao reconciliar por lote (sem ID específico), só processa registros cujo
  // movimento_data não ultrapasse a fronteira — garantindo que a conciliação
  // avance de forma contínua e sem lacunas de dias.
  let fronteiraCronologica: string | null = null;
  if (!params.conciliacaoReciboId) {
    fronteiraCronologica = await resolverFronteiraCronologica({
      client,
      companyId: params.companyId
    });
  }

  let query = client
    .from('conciliacao_recibos')
    .select(
      'id, company_id, documento, numero_reserva, movimento_data, status, descricao, valor_lancamentos, valor_taxas, valor_descontos, valor_abatimentos, valor_nao_comissionavel, valor_venda_real, valor_saldo, valor_calculada_loja, valor_visao_master, valor_comissao_loja, percentual_comissao_loja, faixa_comissao, is_seguro_viagem, ranking_vendedor_id, ranking_assigned_by, conciliado, venda_recibo_id, venda_id'
    )
    .eq('company_id', params.companyId)
    // Ordem cronológica: processa do dia mais antigo para o mais recente,
    // garantindo que a conciliação avance sequencialmente no tempo.
    .order('movimento_data', { ascending: true });

  if (params.conciliacaoReciboId) {
    query = query.eq('id', params.conciliacaoReciboId);
  } else {
    query = query.eq('conciliado', false).limit(limit);
    // Aplica a fronteira cronológica APENAS para registros sem vendedor atribuído.
    // Registros com ranking_vendedor_id preenchido (vendedores que só lançam via
    // conciliação, sem venda no sistema) devem ser conciliados independente de lacunas —
    // sua conciliação é puramente por atribuição manual e não depende de sequência.
    // A fronteira bloqueia apenas registros sem vendedor que aguardam matching automático.
    // Como não dá para filtrar "sem vendedor E além da fronteira" em uma única query
    // Supabase de forma limpa, buscamos todos os pendentes e aplicamos a fronteira
    // no loop (ver filtro abaixo após o fetch).
  }

  if (params.onlyCurrentMonth && !params.conciliacaoReciboId) {
    const { start, end } = getCurrentMonthRange();
    query = query.gte('movimento_data', start).lte('movimento_data', end);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = ((data || []) as ReconcilePendenciaRow[]).filter((item) => {
    if (!isConciliacaoEfetivada({ status: item?.status, descricao: item?.descricao })) return false;

    // Aplica fronteira cronológica somente para registros sem ranking_vendedor_id:
    // quem já tem vendedor atribuído está "conciliado manualmente" e não depende
    // da sequência de dias — processa sempre.
    const temVendedorAtribuido = Boolean(String(item?.ranking_vendedor_id || '').trim());
    if (temVendedorAtribuido) return true;

    // Sem vendedor atribuído: respeita a fronteira — só processa até o último dia contíguo
    if (fronteiraCronologica) {
      const movData = String(item?.movimento_data || '').trim();
      if (movData && movData > fronteiraCronologica) return false;
    }

    return true;
  });

  // Carrega o ID do vendedor "Equipe vtur" para proteger atribuição automática
  const equipeVturVendedor = await findEquipeVturVendedor(client, params.companyId);
  const equipeVturId = equipeVturVendedor?.id ?? null;
  const rankingVendedorPermitidos = new Set(
    (await fetchRankingVendedoresByCompanyIds(client, [params.companyId]))
      .map((row: RankingVendedorIdRow) => String(row?.id || '').trim())
      .filter(Boolean)
  );
  const sanitizeRankingVendedorId = (value?: unknown) => {
    const id = String(value || '').trim() || null;
    if (!id) return null;
    if (equipeVturId && id === equipeVturId) return null;
    return rankingVendedorPermitidos.has(id) ? id : null;
  };

  let checked = 0;
  let reconciled = 0;
  let updatedTaxes = 0;
  let updateErrors = 0;

  for (const row of rows) {
    checked += 1;
    const id = String(row.id);
    const documento = String(row.documento || '').trim();
    const numeroReserva = normalizeRexturLocalizador(row.numero_reserva) || null;
    const documentoIsRextur = isRexturDocumento(documento);
    const movimentoData = String(row.movimento_data || '').trim() || null;
    const valorTaxas = Number(row.valor_taxas || 0);
    const metrics = buildConciliacaoMetrics({
      descricao: row.descricao,
      valorLancamentos: Number(row.valor_lancamentos || 0),
      valorTaxas,
      valorDescontos: Number(row.valor_descontos || 0),
      valorAbatimentos: Number(row.valor_abatimentos || 0),
      valorNaoComissionavel: Number(row.valor_nao_comissionavel || 0),
      valorSaldo: Number(row.valor_saldo || 0),
      valorCalculadaLoja: Number(row.valor_calculada_loja || 0),
      valorVisaoMaster: Number(row.valor_visao_master || 0),
      valorComissaoLoja: Number(row.valor_comissao_loja || 0),
      percentualComissaoLoja: Number(row.percentual_comissao_loja || 0)
    });
    const valorComparacao = Number(metrics.valorVendaReal || 0);

    if (!documento) {
      await client.from('conciliacao_recibos').update({ last_checked_at: new Date().toISOString() }).eq('id', id);
      continue;
    }

    let recibo: ReciboMatchRow | null = null;
    const existingReciboId = String(row.venda_recibo_id || '').trim();

    if (existingReciboId) {
      const { data: reciboRow } = await client
        .from('vendas_recibos')
        .select('id, venda_id, numero_recibo, numero_reserva, valor_total, valor_taxas, data_venda')
        .eq('id', existingReciboId)
        .maybeSingle();

      if (reciboRow) {
        // Valida que o número do recibo gravado realmente bate com o documento.
        // Se não bater, o vínculo foi feito por match errado — ignora e refaz a busca.
        const numeroConfere = documentoIsRextur
          ? isRexturDocumento(reciboRow.numero_recibo) && (!numeroReserva || rexturReservaMatches(numeroReserva, reciboRow.numero_reserva))
          : numeroReciboMatches(documento, reciboRow.numero_recibo);
        if (!numeroConfere) {
          logServerError(
            '[conciliacaoReconcile] venda_recibo_id gravado não confere com documento — descartando vínculo.',
            new Error('invalid_stored_receipt_link')
          );
          // Limpa o vínculo incorreto para que o reconcile refaça o match corretamente
          await client
            .from('conciliacao_recibos')
            .update({ venda_recibo_id: null, venda_id: null, ranking_vendedor_id: null, conciliado: false, conciliado_em: null })
            .eq('id', id);
        } else {
          const { data: vendaRow } = await client
            .from('vendas')
            .select('id, company_id, vendedor_id')
            .eq('id', String(reciboRow.venda_id || ''))
            .maybeSingle();

          if (String(vendaRow?.company_id || '') === params.companyId) {
            recibo = {
              id: String(reciboRow.id),
              venda_id: String(reciboRow.venda_id || ''),
              vendedor_id: String(vendaRow?.vendedor_id || '').trim() || null,
              numero_recibo: reciboRow.numero_recibo ?? null,
              numero_reserva: reciboRow.numero_reserva ?? null,
              valor_total: reciboRow.valor_total ?? null,
              valor_taxas: reciboRow.valor_taxas ?? null,
              data_venda: reciboRow.data_venda ?? null
            };
          }
        }
      }
    }

    if (!recibo) {
      recibo =
        documentoIsRextur && numeroReserva
          ? await findRexturReciboByReserva({
              client,
              reserva: numeroReserva,
              companyId: params.companyId,
              valorLancamento: valorComparacao,
              valorTaxas
            })
          : documentoIsRextur
            ? null
            : await findReciboByNumero({
                client,
                numero: documento,
                companyId: params.companyId,
                valorLancamento: valorComparacao,
                valorTaxas
              });
    }

    if (!recibo) {
      // Registros sem correspondência em vendas_recibos mas com ranking_vendedor_id
      // já atribuído manualmente devem ser marcados como conciliados — eles são
      // dos vendedores que só lançam via conciliação (sem venda no sistema).
      // Sem isso, ficam presos em conciliado=false para sempre e nunca saem do lote.
      const rankingVendedorManualRaw = String(row.ranking_vendedor_id || '').trim() || null;
      const rankingVendedorManual = sanitizeRankingVendedorId(rankingVendedorManualRaw);
      if (rankingVendedorManual) {
        await client.from('conciliacao_recibos').update({
          conciliado: true,
          conciliado_em: new Date().toISOString(),
          last_checked_at: new Date().toISOString(),
          valor_venda_real: metrics.valorVendaReal,
          valor_comissao_loja: metrics.valorComissaoLoja,
          percentual_comissao_loja: metrics.percentualComissaoLoja,
          faixa_comissao: metrics.faixaComissao,
          is_seguro_viagem: metrics.isSeguroViagem
        }).eq('id', id);
        reconciled += 1;
      } else {
        await client.from('conciliacao_recibos').update({ last_checked_at: new Date().toISOString() }).eq('id', id);
      }
      continue;
    }

    // Registra as diferenças informativamente — NÃO altera vendas_recibos.
    // Os valores originais do recibo são preservados; o ranking lê de conciliacao_recibos.
    const sistemaTotal = Number(recibo.valor_total || 0);
    const sistemaTaxas = Number(recibo.valor_taxas || 0);
    const matchTotal = matches(valorComparacao, sistemaTotal);
    const matchTaxas = matches(valorTaxas, sistemaTaxas);

    const rankingVendedorAtualRaw = String(row.ranking_vendedor_id || '').trim() || null;
    const rankingVendedorAtual = sanitizeRankingVendedorId(rankingVendedorAtualRaw);
    const vendedorIdDaVenda = String(recibo.vendedor_id || '').trim() || null;
    // Nunca atribuir "Equipe vtur" como vendedor de um recibo de conciliação
    const vendedorIdDaVendaValido = sanitizeRankingVendedorId(vendedorIdDaVenda);
    const temRankingManual =
      Boolean(rankingVendedorAtual) && isUuid(String(row.ranking_assigned_by || '').trim());
    // Quando há correção/atribuição manual registrada por usuário, ela prevalece
    // também em recibos vinculados. Sem isso, uma reconciliação posterior desfaz
    // a correção administrativa e volta para o vendedor da venda.
    const rankingVendedorResolvido =
      temRankingManual ? rankingVendedorAtual : vendedorIdDaVendaValido || rankingVendedorAtual || null;
    const updatePayload: Record<string, unknown> = {
      venda_id: recibo.venda_id,
      venda_recibo_id: recibo.id,
      valor_venda_real: metrics.valorVendaReal,
      valor_comissao_loja: metrics.valorComissaoLoja,
      percentual_comissao_loja: metrics.percentualComissaoLoja,
      faixa_comissao: metrics.faixaComissao,
      is_seguro_viagem: metrics.isSeguroViagem,
      sistema_valor_total: sistemaTotal,
      sistema_valor_taxas: sistemaTaxas,
      match_total: matchTotal,
      match_taxas: matchTaxas,
      diff_total: diff(valorComparacao, sistemaTotal),
      diff_taxas: diff(valorTaxas, sistemaTaxas),
      ranking_vendedor_id: rankingVendedorResolvido,
      conciliado: true,
      conciliado_em: new Date().toISOString(),
      last_checked_at: new Date().toISOString()
    };
    if (!rankingVendedorAtual && rankingVendedorResolvido) updatePayload.ranking_assigned_at = new Date().toISOString();

    const { error: conciliadoErr } = await client.from('conciliacao_recibos').update(updatePayload).eq('id', id);
    if (conciliadoErr) {
      updateErrors += 1;
      continue;
    }

    await Promise.all([
      insertConciliacaoNumericAudit({
        client,
        companyId: params.companyId,
        conciliacaoReciboId: id,
        vendaId: recibo.venda_id,
        vendaReciboId: recibo.id,
        numeroRecibo: documento,
        field: 'valor_venda_real',
        oldValue: Number(row.valor_venda_real || 0),
        newValue: Number(updatePayload.valor_venda_real || 0),
        actor,
        actorUserId
      }),
      insertConciliacaoNumericAudit({
        client,
        companyId: params.companyId,
        conciliacaoReciboId: id,
        vendaId: recibo.venda_id,
        vendaReciboId: recibo.id,
        numeroRecibo: documento,
        field: 'valor_comissao_loja',
        oldValue: Number(row.valor_comissao_loja || 0),
        newValue: Number(updatePayload.valor_comissao_loja || 0),
        actor,
        actorUserId
      }),
      insertConciliacaoNumericAudit({
        client,
        companyId: params.companyId,
        conciliacaoReciboId: id,
        vendaId: recibo.venda_id,
        vendaReciboId: recibo.id,
        numeroRecibo: documento,
        field: 'percentual_comissao_loja',
        oldValue: Number(row.percentual_comissao_loja || 0),
        newValue: Number(updatePayload.percentual_comissao_loja || 0),
        actor,
        actorUserId
      })
    ]);

    reconciled += 1;
  }

  return {
    checked,
    reconciled,
    updatedTaxes,
    stillPending: Math.max(0, (data || []).length - reconciled),
    updateErrors
  };
}

async function recalculateConciliacaoMetricsCompany(params: {
  month?: string | null;
  onlyConciliados?: boolean;
  batchSize?: number;
  companyId: string;
  actor?: Actor;
  actorUserId?: string | null;
  client: SupabaseClient;
}): Promise<{ scanned: number; recalculated: number; updateErrors: number }> {
  const batchSize = Math.max(50, Math.min(2000, Number(params.batchSize || 500)));
  const monthRange = resolveMonthDateRange(params.month);
  const client = params.client;
  const actor = params.actor || 'user';
  const actorUserId = params.actorUserId || null;
  const reciboCache = new Map<string, { valor_total: number | null; valor_taxas: number | null }>();
  let scanned = 0;
  let recalculated = 0;
  let updateErrors = 0;
  let offset = 0;

  while (true) {
    let query = client
      .from('conciliacao_recibos')
      .select(
        'id, documento, numero_reserva, descricao, valor_lancamentos, valor_taxas, valor_descontos, valor_abatimentos, valor_nao_comissionavel, valor_saldo, valor_calculada_loja, valor_visao_master, valor_comissao_loja, percentual_comissao_loja, faixa_comissao, is_seguro_viagem, valor_venda_real, venda_id, venda_recibo_id, sistema_valor_total, sistema_valor_taxas, match_total, match_taxas, diff_total, diff_taxas, conciliado, movimento_data'
      )
      .eq('company_id', params.companyId)
      .order('movimento_data', { ascending: false, nullsFirst: false })
      .range(offset, offset + batchSize - 1);

    if (params.onlyConciliados) query = query.eq('conciliado', true);
    if (monthRange) query = query.gte('movimento_data', monthRange.start).lt('movimento_data', monthRange.endExclusive);

    const { data, error } = await query;
    if (error) throw error;
    const page = data || [];
    if (!page.length) break;

    const reciboIdsToFetch = (page as ConciliacaoListPageRow[])
      .map((row) => String(row.venda_recibo_id || '').trim())
      .filter((id: string) => id && !reciboCache.has(id));

    const uniqueReciboIdsToFetch = uniqueCleanStrings(reciboIdsToFetch);
    if (uniqueReciboIdsToFetch.length > 0) {
      for (const batch of chunkArray(uniqueReciboIdsToFetch, SUPABASE_IN_BATCH_SIZE)) {
        const { data: recibos } = await client
          .from('vendas_recibos')
          .select('id, valor_total, valor_taxas')
          .in('id', batch);
        for (const recibo of recibos || []) {
          const id = String(recibo.id || '').trim();
          if (!id) continue;
          reciboCache.set(id, {
            valor_total: Number(recibo.valor_total || 0),
            valor_taxas: Number(recibo.valor_taxas || 0)
          });
        }
      }
    }

    for (const row of page) {
      scanned += 1;
      const temValorDireto =
        Number(row.valor_saldo || 0) > 0.009 ||
        Number(row.valor_calculada_loja || 0) > 0.009 ||
        Number(row.valor_visao_master || 0) > 0.009;

      const metrics = buildConciliacaoMetrics({
        descricao: row.descricao,
        valorLancamentos: Number(row.valor_lancamentos || 0),
        valorTaxas: Number(row.valor_taxas || 0),
        valorDescontos: Number(row.valor_descontos || 0),
        valorAbatimentos: Number(row.valor_abatimentos || 0),
        valorNaoComissionavel: Number(row.valor_nao_comissionavel || 0),
        valorSaldo: Number(row.valor_saldo || 0),
        valorCalculadaLoja: Number(row.valor_calculada_loja || 0),
        valorVisaoMaster: Number(row.valor_visao_master || 0),
        valorComissaoLoja: temValorDireto ? null : Number(row.valor_comissao_loja || 0),
        percentualComissaoLoja: null
      });

      const reciboId = String(row.venda_recibo_id || '').trim();
      const reciboData = reciboId ? reciboCache.get(reciboId) : null;
      const sistemaTotal = reciboData?.valor_total ?? Number(row.sistema_valor_total || 0);
      const sistemaTaxas = reciboData?.valor_taxas ?? Number(row.sistema_valor_taxas || 0);
      const newValorVendaReal = Number(metrics.valorVendaReal || 0);
      const newComissao = Number(metrics.valorComissaoLoja || 0);
      const newPercentual = Number(metrics.percentualComissaoLoja || 0);
      const newMatchTotal = matches(newValorVendaReal, sistemaTotal);
      const newMatchTaxas = matches(Number(row.valor_taxas || 0), sistemaTaxas);
      const newDiffTotal = diff(newValorVendaReal, sistemaTotal);
      const newDiffTaxas = diff(Number(row.valor_taxas || 0), sistemaTaxas);

      const needsUpdate =
        Math.abs(Number(row.valor_venda_real || 0) - newValorVendaReal) > EPS ||
        Math.abs(Number(row.valor_comissao_loja || 0) - newComissao) > EPS ||
        Math.abs(Number(row.percentual_comissao_loja || 0) - newPercentual) > EPS ||
        String(row.faixa_comissao ?? '') !== String(metrics.faixaComissao ?? '') ||
        Boolean(row.is_seguro_viagem) !== Boolean(metrics.isSeguroViagem) ||
        Boolean(row.match_total) !== newMatchTotal ||
        Boolean(row.match_taxas) !== newMatchTaxas ||
        Math.abs(Number(row.diff_total || 0) - newDiffTotal) > EPS ||
        Math.abs(Number(row.diff_taxas || 0) - newDiffTaxas) > EPS;

      if (!needsUpdate) continue;

      const { error: upErr } = await client
        .from('conciliacao_recibos')
        .update({
          valor_venda_real: metrics.valorVendaReal,
          valor_comissao_loja: metrics.valorComissaoLoja,
          percentual_comissao_loja: metrics.percentualComissaoLoja,
          faixa_comissao: metrics.faixaComissao,
          is_seguro_viagem: metrics.isSeguroViagem,
          sistema_valor_total: sistemaTotal,
          sistema_valor_taxas: sistemaTaxas,
          match_total: newMatchTotal,
          match_taxas: newMatchTaxas,
          diff_total: newDiffTotal,
          diff_taxas: newDiffTaxas,
          last_checked_at: new Date().toISOString()
        })
        .eq('id', String(row.id));

      if (upErr) {
        updateErrors += 1;
        continue;
      }

      await Promise.all([
        insertConciliacaoNumericAudit({
          client,
          companyId: params.companyId,
          conciliacaoReciboId: String(row.id || ''),
          vendaId: String(row.venda_id || '').trim() || null,
          vendaReciboId: reciboId || null,
          numeroRecibo: String(row.documento || '').trim() || null,
          field: 'valor_venda_real',
          oldValue: Number(row.valor_venda_real || 0),
          newValue: newValorVendaReal,
          actor,
          actorUserId
        }),
        insertConciliacaoNumericAudit({
          client,
          companyId: params.companyId,
          conciliacaoReciboId: String(row.id || ''),
          vendaId: String(row.venda_id || '').trim() || null,
          vendaReciboId: reciboId || null,
          numeroRecibo: String(row.documento || '').trim() || null,
          field: 'valor_comissao_loja',
          oldValue: Number(row.valor_comissao_loja || 0),
          newValue: newComissao,
          actor,
          actorUserId
        }),
        insertConciliacaoNumericAudit({
          client,
          companyId: params.companyId,
          conciliacaoReciboId: String(row.id || ''),
          vendaId: String(row.venda_id || '').trim() || null,
          vendaReciboId: reciboId || null,
          numeroRecibo: String(row.documento || '').trim() || null,
          field: 'percentual_comissao_loja',
          oldValue: Number(row.percentual_comissao_loja || 0),
          newValue: newPercentual,
          actor,
          actorUserId
        })
      ]);

      recalculated += 1;
    }

    if (page.length < batchSize) break;
    offset += page.length;
  }

  return { scanned, recalculated, updateErrors };
}

async function recalculateConciliadosCompany(params: {
  month?: string | null;
  companyId: string;
  actor?: Actor;
  actorUserId?: string | null;
  client: SupabaseClient;
}) {
  const result = await recalculateConciliacaoMetricsCompany({
    month: params.month,
    onlyConciliados: true,
    batchSize: 500,
    companyId: params.companyId,
    actor: params.actor,
    actorUserId: params.actorUserId,
    client: params.client
  });
  return result.recalculated;
}

export async function reconcilePendentes(params: {
  limit?: number;
  companyId: string;
  conciliacaoReciboId?: string | null;
  onlyCurrentMonth?: boolean;
  recalculateMonth?: string | null;
  recalculateAllMonth?: boolean;
  cleanupDuplicatesOnly?: boolean;
  actor?: Actor;
  actorUserId?: string | null;
  client: SupabaseClient;
}): Promise<ReconcileResult> {
  const actor = params.actor || 'user';
  const actorUserId = params.actorUserId || null;

  try {
    if (params.cleanupDuplicatesOnly) {
      const duplicateCleanup = await cleanupDuplicateConciliacaoRowsCompany({
        client: params.client,
        companyId: params.companyId,
        onlyCurrentMonth: params.onlyCurrentMonth,
        month: params.recalculateMonth,
        conciliacaoReciboId: params.conciliacaoReciboId
      });
      return {
        checked: 0,
        reconciled: 0,
        updatedTaxes: 0,
        stillPending: 0,
        updateErrors: 0,
        duplicatesRemoved: duplicateCleanup.removed,
        duplicateGroups: duplicateCleanup.groups,
        recalculated: 0,
        recalculatedChecked: 0
      };
    }

    if (params.recalculateAllMonth) {
      const duplicateCleanup = await cleanupDuplicateConciliacaoRowsCompany({
        client: params.client,
        companyId: params.companyId,
        month: params.recalculateMonth
      });
      const mass = await recalculateConciliacaoMetricsCompany({
        month: params.recalculateMonth,
        onlyConciliados: false,
        batchSize: 500,
        companyId: params.companyId,
        actor,
        actorUserId,
        client: params.client
      });
      return {
        checked: 0,
        reconciled: 0,
        updatedTaxes: 0,
        stillPending: 0,
        updateErrors: mass.updateErrors,
        duplicatesRemoved: duplicateCleanup.removed,
        duplicateGroups: duplicateCleanup.groups,
        recalculated: mass.recalculated,
        recalculatedChecked: mass.scanned
      };
    }

    const duplicateCleanup = await cleanupDuplicateConciliacaoRowsCompany({
      client: params.client,
      companyId: params.companyId,
      onlyCurrentMonth: params.onlyCurrentMonth,
      month: params.recalculateMonth,
      conciliacaoReciboId: params.conciliacaoReciboId
    });

    const result = await reconcilePendentesCompany({
      companyId: params.companyId,
      limit: params.limit,
      conciliacaoReciboId: params.conciliacaoReciboId,
      onlyCurrentMonth: params.onlyCurrentMonth,
      actor,
      actorUserId,
      client: params.client
    });

    result.duplicatesRemoved = duplicateCleanup.removed;
    result.duplicateGroups = duplicateCleanup.groups;
    result.recalculated = params.conciliacaoReciboId
      ? 0
      : await recalculateConciliadosCompany({
          month: params.recalculateMonth,
          companyId: params.companyId,
          actor,
          actorUserId,
          client: params.client
        });

    if (result.checked > 0) {
      await persistExecutionLog({
        client: params.client,
        companyId: params.companyId,
        actor,
        actorUserId,
        status: 'ok',
        result
      });
    }

    return result;
  } catch (error) {
    const errorMessage =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : '';
    await persistExecutionLog({
      client: params.client,
      companyId: params.companyId,
      actor,
      actorUserId,
      status: 'error',
      errorMessage: errorMessage || String(error),
      result: { checked: 0, reconciled: 0, updatedTaxes: 0, stillPending: 0, updateErrors: 0 }
    });
    throw error;
  }
}
