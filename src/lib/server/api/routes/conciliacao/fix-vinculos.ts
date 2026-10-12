// Migrado para Hono de src/routes/api/v1/conciliacao/fix-vinculos/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler e caminhos de import relativos mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
/**
 * POST /api/v1/conciliacao/fix-vinculos
 *
 * Auditoria de vinculos entre conciliacao_recibos e vendas_recibos.
 *
 * O modo padrao e dryRun=true: verifica numero do recibo, empresa, venda,
 * vendedor da venda versus vendedor da conciliacao/ranking, valores, taxas,
 * data e candidatos duplicados sem alterar dados.
 *
 * Quando dryRun=false, a correcao e conservadora: apenas limpa vinculos
 * inseguros (recibo inexistente, empresa/venda divergente ou numero que nao
 * confere). Divergencias de valor, taxa, data e vendedor ficam como alerta para
 * revisao manual: o erro pode estar na venda, na conciliacao ou em um rateio.
 */
import { json } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildConciliacaoMetrics } from '$lib/conciliacao/business';
import { normalizeReceiptKey } from '$lib/conciliacao/receiptNormalize';
import {
  ensureModuloAccess,
  getAdminClient,
  logServerError,
  requireAuthenticatedUser,
  resolveScopedCompanyId,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { addDaysISODate, monthRangeFromKey } from '$lib/date';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { invalidateSalesReadModels } from '$lib/server/readModelCache';
import { uniqueCleanStrings } from '$lib/utils/array';
import { toCleanString as toStr, toFiniteNumber as toNumber } from '$lib/utils/values';

const MONEY_TOLERANCE = 0.01;
const MAX_FIX_VINCULOS_BODY_BYTES = 64 * 1024;
const AUTO_FIX_CODES = new Set([
  'RECIBO_INEXISTENTE',
  'RECIBO_NUMERO_DIVERGENTE',
  'EMPRESA_DIVERGENTE',
  'VENDA_DIVERGENTE',
  'VENDA_INEXISTENTE'
]);

type AuditSeverity = 'info' | 'warning' | 'critical';

type AuditIssue = {
  code: string;
  severity: AuditSeverity;
  title: string;
  message: string;
  expected?: string | number | null;
  actual?: string | number | null;
};

type ConciliacaoAuditRow = {
  documento?: string | null;
  numero_reserva?: string | null;
};

type ReceiptAuditRow = {
  id?: string | null;
  numero_recibo?: string | null;
  numero_recibo_normalizado?: string | null;
  numero_reserva?: string | null;
};

type UserLookupRow = {
  id?: string | null;
  nome_completo?: string | null;
  email?: string | null;
};

type FixVinculosBody = {
  companyId?: string | null;
  dryRun?: boolean | null;
  limit?: number | string | null;
  month?: string | null;
  conciliacaoReciboId?: string | null;
  conciliacaoId?: string | null;
};

function readFixVinculosBody(value: unknown): FixVinculosBody {
  if (!value || typeof value !== 'object') return {};

  const body = value as Record<string, unknown>;
  const parsed: FixVinculosBody = {};

  if (typeof body.companyId === 'string') parsed.companyId = body.companyId;
  if (typeof body.dryRun === 'boolean') parsed.dryRun = body.dryRun;
  if (typeof body.limit === 'number' || typeof body.limit === 'string') parsed.limit = body.limit;
  if (typeof body.month === 'string') parsed.month = body.month;
  if (typeof body.conciliacaoReciboId === 'string') parsed.conciliacaoReciboId = body.conciliacaoReciboId;
  if (typeof body.conciliacaoId === 'string') parsed.conciliacaoId = body.conciliacaoId;

  return parsed;
}

type ConciliacaoRow = ConciliacaoAuditRow & {
  id?: string | null;
  movimento_data?: string | null;
  status?: string | null;
  descricao?: string | null;
  valor_lancamentos?: number | null;
  valor_taxas?: number | null;
  valor_descontos?: number | null;
  valor_abatimentos?: number | null;
  valor_nao_comissionavel?: number | null;
  valor_calculada_loja?: number | null;
  valor_visao_master?: number | null;
  valor_opfax?: number | null;
  valor_saldo?: number | null;
  valor_comissao_loja?: number | null;
  percentual_comissao_loja?: number | null;
  venda_recibo_id?: string | null;
  venda_id?: string | null;
  ranking_vendedor_id?: string | null;
};

type ReceiptJoinedVendaRow = {
  id?: string | null;
  company_id?: string | null;
  vendedor_id?: string | null;
  cliente_id?: string | null;
  data_venda?: string | null;
  data_lancamento?: string | null;
  valor_total?: number | null;
  valor_taxas?: number | null;
  cancelada?: boolean | null;
};

type ReceiptRow = ReceiptAuditRow & {
  venda_id?: string | null;
  data_venda?: string | null;
  valor_total?: number | null;
  valor_taxas?: number | null;
  valor_rav?: number | null;
  tipo_pacote?: string | null;
  produto_id?: string | null;
  tipo_produtos?:
    | {
        id?: string | null;
        nome?: string | null;
        tipo?: string | null;
      }
    | Array<{
        id?: string | null;
        nome?: string | null;
        tipo?: string | null;
      }>
    | null;
  venda?: ReceiptJoinedVendaRow | ReceiptJoinedVendaRow[] | null;
};

type RateioRow = {
  id?: string | null;
  venda_recibo_id?: string | null;
  vendedor_origem_id?: string | null;
  vendedor_destino_id?: string | null;
  percentual_origem?: number | null;
  percentual_destino?: number | null;
  ativo?: boolean | null;
  observacao?: string | null;
};

type AuditCandidate = {
  venda_recibo_id: string | null;
  venda_id: string | null;
  numero_recibo: string;
  vendedor_nome: string | null;
  data_venda: string | null;
  valor_total: number;
  valor_taxas: number;
};

type AuditDetail = {
  id: string;
  documento: string;
  movimento_data: string | null;
  status: string | null;
  severity: 'ok' | AuditSeverity;
  fixable: boolean;
  fixAction: 'clear_link' | null;
  issues: AuditIssue[];
  conciliacao: {
    venda_id: string | null;
    venda_recibo_id: string | null;
    ranking_vendedor_id: string | null;
    ranking_vendedor_nome: string | null;
    valor_venda_real: number;
    valor_taxas: number;
  };
  sistema:
    | {
        venda_id: string | null;
        venda_recibo_id: string | null;
        numero_recibo: string;
        vendedor_id: string | null;
        vendedor_nome: string | null;
        data_venda: string | null;
        data_lancamento: string | null;
        valor_total: number;
        valor_rav: number;
        valor_ranking: number;
        valor_taxas: number;
        cancelada: boolean;
        produto: string | null;
        rateio:
          | {
              vendedor_origem_id: string | null;
              vendedor_origem_nome: string | null;
              vendedor_destino_id: string | null;
              vendedor_destino_nome: string | null;
              percentual_origem: number;
              percentual_destino: number;
            }
          | null;
      }
    | null;
  candidatos: AuditCandidate[];
};

type AuditSummary = {
  critical: number;
  warnings: number;
  infos: number;
  rowsWithIssues: number;
  corrigiveis: number;
  fixableIds: string[];
};

function firstJoinedVenda(value?: ReceiptJoinedVendaRow | ReceiptJoinedVendaRow[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function firstTipoProduto(
  value?:
    | {
        id?: string | null;
        nome?: string | null;
        tipo?: string | null;
      }
    | Array<{
        id?: string | null;
        nome?: string | null;
        tipo?: string | null;
      }>
    | null,
) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function monthKey(value?: string | null) {
  const raw = toStr(value);
  return /^\d{4}-\d{2}/.test(raw) ? raw.slice(0, 7) : '';
}

function addDays(date: string, days: number) {
  return addDaysISODate(date, days);
}

function compactNumero(value?: string | null) {
  return normalizeReceiptKey(value);
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

function isNumericReceiptLike(value?: string | null) {
  const digits = onlyDigits(value);
  const prefix = extractReciboPrefix(value);
  return prefix === '5630' || digits.length >= 10;
}

function isManualRepeatingDoc(value?: string | null) {
  const normalized = normalizeReceiptKey(value);
  return normalized.includes('REXTUR') || /[A-Z]/.test(normalized);
}

function isRexturDocumento(value?: string | null) {
  return normalizeReceiptKey(value) === 'REXTUR';
}

function normalizeRexturLocalizador(value?: string | null) {
  return toStr(value).replace(/^REXTUR[\s-]*/i, '').toUpperCase();
}

function moneyMatches(left: number, right: number) {
  return Math.abs(left - right) <= MONEY_TOLERANCE;
}

function maxSeverity(issues: AuditIssue[]) {
  if (issues.some((issue) => issue.severity === 'critical')) return 'critical';
  if (issues.some((issue) => issue.severity === 'warning')) return 'warning';
  if (issues.some((issue) => issue.severity === 'info')) return 'info';
  return 'ok';
}

function issue(code: string, severity: AuditSeverity, title: string, message: string, expected?: string | number | null, actual?: string | number | null): AuditIssue {
  return { code, severity, title, message, expected, actual };
}

function hasAutoFixIssue(issues: AuditIssue[]) {
  return issues.some((item) => AUTO_FIX_CODES.has(item.code));
}

function receiptMatchesDocument(row: ConciliacaoAuditRow, recibo: ReceiptAuditRow) {
  if (isRexturDocumento(row?.documento)) {
    const rowReserva = normalizeRexturLocalizador(row?.numero_reserva);
    const reciboReserva = normalizeRexturLocalizador(recibo?.numero_reserva);
    return isRexturDocumento(recibo?.numero_recibo) && (!rowReserva || rowReserva === reciboReserva);
  }

  return (
    numeroReciboMatches(row?.documento, recibo?.numero_recibo) ||
    numeroReciboMatches(row?.documento, recibo?.numero_recibo_normalizado)
  );
}

function receiptLabel(recibo: ReceiptAuditRow) {
  const numero = toStr(recibo?.numero_recibo) || toStr(recibo?.numero_recibo_normalizado) || '-';
  const reserva = toStr(recibo?.numero_reserva);
  return reserva ? `${numero} / ${reserva}` : numero;
}

async function fetchUsersMap(client: SupabaseClient, ids: string[]) {
  const uniqueIds = uniqueCleanStrings(ids);
  const map = new Map<string, string>();
  for (let index = 0; index < uniqueIds.length; index += 200) {
    const batch = uniqueIds.slice(index, index + 200);
    const { data, error } = await client
      .from('users')
      .select('id, nome_completo, email')
      .in('id', batch);
    if (error) throw error;
    for (const row of (data || []) as UserLookupRow[]) {
      const id = toStr(row?.id);
      if (!id) continue;
      map.set(id, toStr(row?.nome_completo) || toStr(row?.email) || id);
    }
  }
  return map;
}

const CONCILIACAO_SELECT = `
  id,
  company_id,
  documento,
  numero_reserva,
  movimento_data,
  status,
  descricao,
  valor_lancamentos,
  valor_taxas,
  valor_descontos,
  valor_abatimentos,
  valor_nao_comissionavel,
  valor_saldo,
  valor_opfax,
  valor_calculada_loja,
  valor_visao_master,
  valor_venda_real,
  valor_comissao_loja,
  percentual_comissao_loja,
  faixa_comissao,
  is_seguro_viagem,
  conciliado,
  venda_id,
  venda_recibo_id,
  ranking_vendedor_id,
  ranking_produto_id,
  sistema_valor_total,
  sistema_valor_taxas,
  match_total,
  match_taxas,
  diff_total,
  diff_taxas,
  last_checked_at,
  conciliado_em
`;

const RECIBO_SELECT = `
  id,
  venda_id,
  numero_recibo,
  numero_recibo_normalizado,
  numero_reserva,
  data_venda,
  valor_total,
  valor_taxas,
  valor_rav,
  tipo_pacote,
  produto_id,
  tipo_produtos(id, nome, tipo),
  venda:vendas!inner(
    id,
    company_id,
    vendedor_id,
    cliente_id,
    data_venda,
    data_lancamento,
    valor_total,
    valor_taxas,
    cancelada
  )
`;

export async function handleConciliacaoFixVinculosPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_FIX_VINCULOS_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster && !scope.isFinanceiro && !scope.isGestor) {
      ensureModuloAccess(scope, ['operacao_conciliacao', 'conciliacao'], 3, 'Sem permissao para auditar vinculos.');
    }

    const body = readFixVinculosBody(bodyResult.data);
    const companyId = resolveScopedCompanyId(scope, body?.companyId);
    if (!companyId) return json({ error: 'Selecione uma empresa para auditar vínculos.' }, { status: 400, headers: NO_STORE_HEADERS });

    const dryRun = Boolean(body?.dryRun ?? true);
    const limit = Math.min(5000, Math.max(1, Number(body?.limit || 500)));
    const month = toStr(body?.month);
    const conciliacaoReciboId = toStr(body?.conciliacaoReciboId || body?.conciliacaoId);

    let query = client
      .from('conciliacao_recibos')
      .select(CONCILIACAO_SELECT)
      .eq('company_id', companyId)
      .order('movimento_data', { ascending: false })
      .limit(limit);

    if (conciliacaoReciboId) {
      query = query.eq('id', conciliacaoReciboId);
    } else if (/^\d{4}-\d{2}$/.test(month)) {
      const range = monthRangeFromKey(month);
      if (range) query = query.gte('movimento_data', range.inicio).lte('movimento_data', range.fim);
    }

    const { data: rowsData, error: rowsErr } = await query;
    if (rowsErr) throw rowsErr;

    const rows: ConciliacaoRow[] = Array.isArray(rowsData) ? (rowsData as ConciliacaoRow[]) : [];
    if (rows.length === 0) {
      return json({
        ok: true,
        checked: 0,
        critical: 0,
        warnings: 0,
        infos: 0,
        issues: 0,
        corrigiveis: 0,
        corrigidos: 0,
        dryRun,
        detalhes: []
      });
    }

    const linkedReciboIds = uniqueCleanStrings(rows.map((row) => row?.venda_recibo_id));
    const receiptById = new Map<string, ReceiptRow>();

    for (let index = 0; index < linkedReciboIds.length; index += 200) {
      const batch = linkedReciboIds.slice(index, index + 200);
      const { data, error } = await client
        .from('vendas_recibos')
        .select(RECIBO_SELECT)
        .in('id', batch);
      if (error) throw error;
      for (const recibo of (data || []) as ReceiptRow[]) {
        const id = toStr(recibo?.id);
        if (id) receiptById.set(id, recibo);
      }
    }

    const movementDates: string[] = [];
    for (const row of rows) {
      const date = toStr(row?.movimento_data);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) movementDates.push(date);
    }
    let candidateStart = '';
    let candidateEnd = '';
    if (movementDates.length > 0) {
      const sorted = [...movementDates].sort();
      candidateStart = addDays(sorted[0], -60);
      candidateEnd = addDays(sorted[sorted.length - 1], 60);
    }

    let candidateQuery = client
      .from('vendas_recibos')
      .select(RECIBO_SELECT)
      .eq('venda.company_id', companyId)
      .limit(10000);

    if (candidateStart && candidateEnd) {
      candidateQuery = candidateQuery.gte('data_venda', candidateStart).lte('data_venda', candidateEnd);
    }

    const { data: candidateData, error: candidateErr } = await candidateQuery;
    if (candidateErr) throw candidateErr;
    for (const recibo of (candidateData || []) as ReceiptRow[]) {
      const id = toStr(recibo?.id);
      if (id) receiptById.set(id, recibo);
    }

    const allReceipts = Array.from(receiptById.values());
    const allReceiptIds: string[] = [];
    for (const recibo of allReceipts) {
      const id = toStr(recibo?.id);
      if (id) allReceiptIds.push(id);
    }
    const rateioByReciboId = new Map<string, RateioRow>();

    for (let index = 0; index < allReceiptIds.length; index += 200) {
      const batch = allReceiptIds.slice(index, index + 200);
      const { data, error } = await client
        .from('vendas_recibos_rateio')
        .select('id, venda_recibo_id, vendedor_origem_id, vendedor_destino_id, percentual_origem, percentual_destino, ativo, observacao')
        .eq('ativo', true)
        .in('venda_recibo_id', batch);
      if (error) throw error;
      for (const rateio of (data || []) as RateioRow[]) {
        const reciboId = toStr(rateio?.venda_recibo_id);
        if (reciboId) rateioByReciboId.set(reciboId, rateio);
      }
    }

    const userIds = new Set<string>();
    for (const row of rows) {
      const rankingId = toStr(row?.ranking_vendedor_id);
      if (rankingId) userIds.add(rankingId);
    }
    for (const recibo of allReceipts) {
      const vendedorId = toStr(firstJoinedVenda(recibo?.venda)?.vendedor_id);
      if (vendedorId) userIds.add(vendedorId);
    }
    for (const rateio of rateioByReciboId.values()) {
      const origem = toStr(rateio?.vendedor_origem_id);
      const destino = toStr(rateio?.vendedor_destino_id);
      if (origem) userIds.add(origem);
      if (destino) userIds.add(destino);
    }
    const userNameById = await fetchUsersMap(client, Array.from(userIds));

    const detalhes: AuditDetail[] = rows.map((row) => {
      const issues: AuditIssue[] = [];
      const rowId = toStr(row?.id);
      const documento = toStr(row?.documento);
      const linkedReciboId = toStr(row?.venda_recibo_id);
      const linkedVendaId = toStr(row?.venda_id);
      const rankingVendedorId = toStr(row?.ranking_vendedor_id);
      const linkedRecibo = linkedReciboId ? receiptById.get(linkedReciboId) : null;
      const candidates = allReceipts.filter((recibo) => receiptMatchesDocument(row, recibo));
      const uniqueCandidates = Array.from(
        new Map(candidates.map((recibo) => [toStr(recibo?.id), recibo])).values()
      );

      const metrics = buildConciliacaoMetrics({
        descricao: row?.descricao,
        valorLancamentos: toNumber(row?.valor_lancamentos),
        valorTaxas: toNumber(row?.valor_taxas),
        valorDescontos: toNumber(row?.valor_descontos),
        valorAbatimentos: toNumber(row?.valor_abatimentos),
        valorNaoComissionavel: toNumber(row?.valor_nao_comissionavel),
        valorCalculadaLoja: toNumber(row?.valor_calculada_loja),
        valorVisaoMaster: toNumber(row?.valor_visao_master),
        valorOpfax: toNumber(row?.valor_opfax),
        valorSaldo: toNumber(row?.valor_saldo),
        valorComissaoLoja: toNumber(row?.valor_comissao_loja),
        percentualComissaoLoja: toNumber(row?.percentual_comissao_loja)
      });

      if (linkedReciboId && !linkedRecibo) {
        issues.push(issue(
          'RECIBO_INEXISTENTE',
          'critical',
          'Recibo vinculado nao existe',
          'A conciliacao guarda um venda_recibo_id que nao foi encontrado em vendas_recibos.',
          linkedReciboId,
          null
        ));
      }

      if (!linkedReciboId) {
        if (uniqueCandidates.length === 1) {
          issues.push(issue(
            'SEM_VINCULO_COM_CANDIDATO',
            'warning',
            'Sem vinculo, mas ha candidato',
            `Existe um recibo de venda com o mesmo documento: ${receiptLabel(uniqueCandidates[0])}. Rode a conciliacao pendente ou audite manualmente antes de atribuir ranking.`,
            receiptLabel(uniqueCandidates[0]),
            null
          ));
        } else if (uniqueCandidates.length > 1 && !isManualRepeatingDoc(documento)) {
          issues.push(issue(
            'MULTIPLOS_CANDIDATOS',
            'warning',
            'Mais de um candidato para o documento',
            `Foram encontrados ${uniqueCandidates.length} recibos de venda parecidos com este documento.`,
            uniqueCandidates.length,
            null
          ));
        } else if (isNumericReceiptLike(documento)) {
          issues.push(issue(
            'SEM_VINCULO_RECIBO',
            'warning',
            'Recibo sem vínculo de venda',
            'O documento parece ser um recibo numérico, mas nao esta ligado a vendas_recibos.',
            documento,
            null
          ));
        }
      }

      if (linkedRecibo) {
        const venda = firstJoinedVenda(linkedRecibo.venda);
        const rateio = rateioByReciboId.get(toStr(linkedRecibo.id)) || null;
        const reciboNumero = receiptLabel(linkedRecibo);

        if (!receiptMatchesDocument(row, linkedRecibo)) {
          issues.push(issue(
            'RECIBO_NUMERO_DIVERGENTE',
            'critical',
            'Documento nao confere com o recibo vinculado',
            'O numero da conciliacao nao bate com o numero do recibo de venda vinculado.',
            documento,
            reciboNumero
          ));
        }

        if (!venda) {
          issues.push(issue(
            'VENDA_INEXISTENTE',
            'critical',
            'Venda do recibo nao encontrada',
            'O recibo vinculado nao retornou uma venda correspondente.',
            linkedRecibo.venda_id,
            null
          ));
        } else {
          const vendaCompanyId = toStr(venda?.company_id);
          const reciboVendaId = toStr(linkedRecibo?.venda_id);
          const vendedorVendaId = toStr(venda?.vendedor_id);

          if (vendaCompanyId !== companyId) {
            issues.push(issue(
              'EMPRESA_DIVERGENTE',
              'critical',
              'Empresa divergente',
              'O recibo vinculado pertence a outra empresa.',
              companyId,
              vendaCompanyId
            ));
          }

          if (linkedVendaId && reciboVendaId && linkedVendaId !== reciboVendaId) {
            issues.push(issue(
              'VENDA_DIVERGENTE',
              'critical',
              'Venda divergente',
              'conciliacao_recibos.venda_id nao e a venda dona do venda_recibo_id vinculado.',
              reciboVendaId,
              linkedVendaId
            ));
          }

          if (Boolean(venda?.cancelada)) {
            issues.push(issue(
              'VENDA_CANCELADA',
              'warning',
              'Venda vinculada esta cancelada',
              'A conciliacao esta ligada a uma venda marcada como cancelada.',
              'venda ativa',
              'cancelada'
            ));
          }

          if (rankingVendedorId && vendedorVendaId && rankingVendedorId !== vendedorVendaId) {
            issues.push(issue(
              'VENDEDOR_RANKING_DIVERGENTE',
              'warning',
              'Vendedor da venda difere da conciliacao',
              'A venda vinculada esta em um vendedor diferente do vendedor atribuido na conciliacao/ranking. Se a conciliacao estiver correta, ajuste a venda; se a venda estiver correta, ajuste o ranking. Rateios devem ficar em ajustes de vendas.',
              userNameById.get(rankingVendedorId) || rankingVendedorId,
              userNameById.get(vendedorVendaId) || vendedorVendaId
            ));
          }

          if (!rankingVendedorId && vendedorVendaId) {
            issues.push(issue(
              'VENDEDOR_RANKING_VAZIO',
              'warning',
              'Vendedor de ranking vazio',
              'A venda vinculada tem vendedor, mas a conciliacao ainda nao refletiu esse vendedor no ranking.',
              userNameById.get(vendedorVendaId) || vendedorVendaId,
              null
            ));
          }

          if (monthKey(venda?.data_lancamento) && monthKey(linkedRecibo?.data_venda) && monthKey(venda?.data_lancamento) !== monthKey(linkedRecibo?.data_venda)) {
            issues.push(issue(
              'DATA_LANCAMENTO_DIVERGENTE',
              'warning',
              'Data de lancamento em outro mes',
              'A venda pode aparecer em telas que usam data_lancamento/created_at, mesmo com recibo em outro mes.',
              linkedRecibo.data_venda,
              venda.data_lancamento
            ));
          }

          if (rateio) {
            issues.push(issue(
              'RATEIO_ATIVO',
              'info',
              'Recibo tem divisao ativa',
              `Rateio ${toNumber(rateio.percentual_origem).toFixed(2)}% / ${toNumber(rateio.percentual_destino).toFixed(2)}%.`,
              userNameById.get(toStr(rateio.vendedor_origem_id)) || toStr(rateio.vendedor_origem_id),
              userNameById.get(toStr(rateio.vendedor_destino_id)) || toStr(rateio.vendedor_destino_id)
            ));
          }
        }

        const valorRav = Math.max(0, toNumber(linkedRecibo.valor_rav));
        const sistemaValorRanking = roundMoney(Math.max(0, toNumber(linkedRecibo.valor_total) - valorRav));
        const sistemaTaxas = roundMoney(toNumber(linkedRecibo.valor_taxas));
        const conciliacaoValorReal = roundMoney(toNumber(metrics.valorVendaReal));
        const conciliacaoTaxas = roundMoney(toNumber(row?.valor_taxas));

        if (!moneyMatches(conciliacaoValorReal, sistemaValorRanking)) {
          issues.push(issue(
            'VALOR_DIVERGENTE',
            'warning',
            'Valor da conciliacao difere da venda',
            'A base da conciliacao nao bate com o valor do recibo de venda para ranking.',
            sistemaValorRanking,
            conciliacaoValorReal
          ));
        }

        if (!moneyMatches(conciliacaoTaxas, sistemaTaxas)) {
          issues.push(issue(
            'TAXAS_DIVERGENTES',
            'warning',
            'Taxas divergentes',
            'As taxas importadas na conciliacao nao batem com as taxas do recibo de venda.',
            sistemaTaxas,
            conciliacaoTaxas
          ));
        }

        if (valorRav > 0) {
          issues.push(issue(
            'RAV_ABATIDO',
            'info',
            'Recibo possui RAV',
            'O RAV nao deve subir para ranking/comissao; a auditoria compara o valor da venda ja abatendo o RAV.',
            valorRav,
            null
          ));
        }

        if (uniqueCandidates.length > 1 && !isManualRepeatingDoc(documento)) {
          issues.push(issue(
            'DUPLICIDADE_CANDIDATOS',
            'warning',
            'Documento com mais de um candidato',
            `Foram encontrados ${uniqueCandidates.length} recibos de venda que podem casar com este documento.`,
            uniqueCandidates.length,
            reciboNumero
          ));
        }
      }

      const severity = maxSeverity(issues);
      const fixable = hasAutoFixIssue(issues);
      const linkedVenda = firstJoinedVenda(linkedRecibo?.venda);
      const linkedTipoProduto = firstTipoProduto(linkedRecibo?.tipo_produtos);
      const rateio = linkedRecibo ? rateioByReciboId.get(toStr(linkedRecibo.id)) : null;

      return {
        id: rowId,
        documento,
        movimento_data: row?.movimento_data || null,
        status: row?.status || null,
        severity,
        fixable,
        fixAction: fixable ? 'clear_link' : null,
        issues,
        conciliacao: {
          venda_id: linkedVendaId || null,
          venda_recibo_id: linkedReciboId || null,
          ranking_vendedor_id: rankingVendedorId || null,
          ranking_vendedor_nome: rankingVendedorId ? userNameById.get(rankingVendedorId) || rankingVendedorId : null,
          valor_venda_real: roundMoney(toNumber(metrics.valorVendaReal)),
          valor_taxas: roundMoney(toNumber(row?.valor_taxas))
        },
        sistema: linkedRecibo
          ? {
              venda_id: toStr(linkedRecibo?.venda_id) || null,
              venda_recibo_id: toStr(linkedRecibo?.id) || null,
              numero_recibo: receiptLabel(linkedRecibo),
              vendedor_id: toStr(linkedVenda?.vendedor_id) || null,
              vendedor_nome: toStr(linkedVenda?.vendedor_id) ? userNameById.get(toStr(linkedVenda?.vendedor_id)) || toStr(linkedVenda?.vendedor_id) : null,
              data_venda: linkedRecibo?.data_venda || linkedVenda?.data_venda || null,
              data_lancamento: linkedVenda?.data_lancamento || null,
              valor_total: roundMoney(toNumber(linkedRecibo?.valor_total)),
              valor_rav: roundMoney(toNumber(linkedRecibo?.valor_rav)),
              valor_ranking: roundMoney(Math.max(0, toNumber(linkedRecibo?.valor_total) - Math.max(0, toNumber(linkedRecibo?.valor_rav)))),
              valor_taxas: roundMoney(toNumber(linkedRecibo?.valor_taxas)),
              cancelada: Boolean(linkedVenda?.cancelada),
              produto: linkedTipoProduto?.nome || linkedRecibo?.tipo_pacote || null,
              rateio: rateio
                ? {
                    vendedor_origem_id: toStr(rateio?.vendedor_origem_id) || null,
                    vendedor_origem_nome: userNameById.get(toStr(rateio?.vendedor_origem_id)) || null,
                    vendedor_destino_id: toStr(rateio?.vendedor_destino_id) || null,
                    vendedor_destino_nome: userNameById.get(toStr(rateio?.vendedor_destino_id)) || null,
                    percentual_origem: toNumber(rateio?.percentual_origem),
                    percentual_destino: toNumber(rateio?.percentual_destino)
                  }
                : null
            }
          : null,
        candidatos: uniqueCandidates.slice(0, 5).map((recibo) => ({
          venda_recibo_id: toStr(recibo?.id),
          venda_id: toStr(recibo?.venda_id),
          numero_recibo: receiptLabel(recibo),
          vendedor_nome:
            userNameById.get(toStr(firstJoinedVenda(recibo?.venda)?.vendedor_id)) ||
            toStr(firstJoinedVenda(recibo?.venda)?.vendedor_id) ||
            null,
          data_venda: recibo?.data_venda || firstJoinedVenda(recibo?.venda)?.data_venda || null,
          valor_total: roundMoney(toNumber(recibo?.valor_total)),
          valor_taxas: roundMoney(toNumber(recibo?.valor_taxas))
        }))
      };
    });

    const diagnostico = detalhes.reduce(
      (summary: AuditSummary, item: AuditDetail) => {
        if (item.severity === 'critical') summary.critical += 1;
        if (item.severity === 'warning') summary.warnings += 1;
        if (item.severity === 'info') summary.infos += 1;
        if (item.issues.length > 0) summary.rowsWithIssues += 1;
        if (item.fixable) {
          summary.corrigiveis += 1;
          if (item.id) summary.fixableIds.push(item.id);
        }
        return summary;
      },
      { critical: 0, warnings: 0, infos: 0, rowsWithIssues: 0, corrigiveis: 0, fixableIds: [] as string[] }
    );

    const { critical, warnings, infos, rowsWithIssues, corrigiveis, fixableIds } = diagnostico;

    let corrigidos = 0;
    if (!dryRun && corrigiveis > 0) {
      for (let index = 0; index < fixableIds.length; index += 50) {
        const batch = fixableIds.slice(index, index + 50);
        const { error: fixErr } = await client
          .from('conciliacao_recibos')
          .update({
            venda_recibo_id: null,
            venda_id: null,
            ranking_vendedor_id: null,
            ranking_assigned_by: null,
            ranking_assigned_at: null,
            conciliado: false,
            conciliado_em: null,
            last_checked_at: null
          })
          .in('id', batch)
          .eq('company_id', companyId);

        if (fixErr) {
          logServerError('[fix-vinculos] erro ao corrigir lote', fixErr, { batch_size: batch.length });
        } else {
          corrigidos += batch.length;
        }
      }
    }

    const remainingCorrigiveis = dryRun ? corrigiveis : Math.max(0, corrigiveis - corrigidos);

    if (corrigidos > 0) {
      invalidateSalesReadModels({ companyIds: [companyId], userId: user.id });
    }

    return json({
      ok: true,
      checked: rows.length,
      critical,
      warnings,
      infos,
      issues: rowsWithIssues,
      incorretos: critical,
      corrigiveis: remainingCorrigiveis,
      corrigidos,
      dryRun,
      detalhes: detalhes
        .filter((item) => item.issues.length > 0)
        .slice(0, 200)
    }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao auditar vinculos de conciliacao.');
  }
}
