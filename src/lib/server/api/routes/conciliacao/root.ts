// Migrado para Hono de src/routes/api/v1/conciliacao/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler e caminhos de import relativos mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { chunkArray } from '$lib/utils/array';

type ConciliacaoListRow = {
  id: string;
  company_id: string | null;
  documento: string | null;
  numero_reserva: string | null;
  movimento_data: string | null;
  status: string | null;
  descricao: string | null;
  valor_lancamentos: number | null;
  valor_taxas: number | null;
  valor_descontos: number | null;
  valor_abatimentos: number | null;
  valor_nao_comissionavel: number | null;
  valor_calculada_loja: number | null;
  valor_visao_master: number | null;
  valor_opfax: number | null;
  valor_saldo: number | null;
  valor_venda_real: number | null;
  valor_comissao_loja: number | null;
  percentual_comissao_loja: number | null;
  faixa_comissao: string | null;
  is_seguro_viagem: boolean | null;
  origem: string | null;
  conciliado: boolean | null;
  match_total: boolean | null;
  match_taxas: boolean | null;
  sistema_valor_total: number | null;
  sistema_valor_taxas: number | null;
  diff_total: number | null;
  diff_taxas: number | null;
  venda_id: string | null;
  venda_recibo_id: string | null;
  ranking_vendedor_id: string | null;
  ranking_produto_id: string | null;
  ranking_assigned_at: string | null;
  is_baixa_rac: boolean | null;
  last_checked_at: string | null;
  ranking_vendedor?: { id: string; nome_completo: string | null }[] | null;
  ranking_produto?: { id: string; nome: string | null }[] | null;
};

type ConciliacaoListItem = ConciliacaoListRow & {
  status_display: string;
  status_label: string;
  status_text: string;
};

// ── Helpers de negócio (espelha vtur-app/src/lib/conciliacao/business.ts) ──

function normalizeText(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizeConciliacaoStatus(value?: string | null): 'BAIXA' | 'OPFAX' | 'ESTORNO' | 'OUTRO' {
  const raw = normalizeText(value);
  if (!raw) return 'OUTRO';
  if (raw.includes('ESTORNO')) return 'ESTORNO';
  if (raw.includes('BAIXA')) return 'BAIXA';
  if (raw.includes('OPFAX')) return 'OPFAX';
  return 'OUTRO';
}

function resolveConciliacaoStatus(params: { status?: string | null; descricao?: string | null }) {
  const descricaoStatus = normalizeConciliacaoStatus(params.descricao);
  if (descricaoStatus !== 'OUTRO') return descricaoStatus;
  return normalizeConciliacaoStatus(params.status);
}

function isConciliacaoEfetivada(params: { status?: string | null; descricao?: string | null }) {
  return resolveConciliacaoStatus(params) === 'BAIXA';
}

// ── GET — lista registros de conciliação ──
export async function handleConciliacaoGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster && !scope.isFinanceiro && !scope.isGestor) {
      ensureModuloAccess(scope, ['operacao_conciliacao', 'conciliacao'], 1, 'Sem acesso à Conciliação.');
    }

    const { searchParams } = event.url;
    const inicio = String(searchParams.get('inicio') || '').trim();
    const fim = String(searchParams.get('fim') || '').trim();
    const status = String(searchParams.get('status') || '').trim();
    const conciliado = searchParams.get('conciliado');
    const q = String(searchParams.get('q') || '').trim();
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const pageSize = Math.min(200, Math.max(10, Number(searchParams.get('pageSize') || 50)));
    const companyIds = resolveScopedCompanyIds(scope, searchParams.get('company_id'));

    if (!scope.isAdmin && companyIds.length === 0) {
      return json({ error: 'Empresa não identificada.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const rows = await getCachedReadModel<ConciliacaoListRow[]>({
      key: buildReadModelCacheKey('conciliacao:list:rows', {
        companyIds,
        inicio,
        fim,
        status,
        conciliado
      }),
      tags: [
        READ_MODEL_TAGS.conciliacao,
        READ_MODEL_TAGS.sales,
        READ_MODEL_TAGS.finance,
        READ_MODEL_TAGS.ranking,
        ...scopeCacheTags({ companyIds, userId: user.id })
      ],
      ttlMs: 120_000,
      staleTtlMs: 600_000,
      loader: async () => {
        const dataRows: ConciliacaoListRow[] = [];
        const companyBatches = companyIds.length > 0 ? chunkArray(companyIds) : [null];
        for (const companyBatch of companyBatches) {
          let query = client
            .from('conciliacao_recibos')
            .select(`
              id, company_id, documento, numero_reserva, movimento_data, status, descricao,
              valor_lancamentos, valor_taxas, valor_descontos, valor_abatimentos,
              valor_nao_comissionavel, valor_calculada_loja, valor_visao_master,
              valor_opfax, valor_saldo, valor_venda_real, valor_comissao_loja,
              percentual_comissao_loja, faixa_comissao, is_seguro_viagem, origem,
              conciliado, match_total, match_taxas, sistema_valor_total, sistema_valor_taxas,
              diff_total, diff_taxas, venda_id, venda_recibo_id,
              ranking_vendedor_id, ranking_produto_id, ranking_assigned_at,
              is_baixa_rac, last_checked_at,
              ranking_vendedor:users!ranking_vendedor_id(id, nome_completo),
              ranking_produto:tipo_produtos!ranking_produto_id(id, nome)
            `)
            .order('movimento_data', { ascending: false })
            .limit(5000);

          if (companyBatch) query = query.in('company_id', companyBatch);
          if (inicio) query = query.gte('movimento_data', inicio);
          if (fim) query = query.lte('movimento_data', fim);
          if (status) query = query.eq('status', status);
          if (conciliado === 'true') query = query.eq('conciliado', true);
          if (conciliado === 'false') query = query.eq('conciliado', false);

          const { data, error: queryError } = await query;
          if (queryError) throw queryError;
          dataRows.push(...(data || []));
        }
        return dataRows;
      }
    });

    // Add parity-friendly display field for status
    const formatStatusLabel = (s?: string | null) => {
      const st = (s ?? '') as string;
      switch (st) {
        case 'BAIXA': return 'Baixa';
        case 'OPFAX': return 'Operação';
        case 'ESTORNO': return 'Estorno';
        default: return st;
      }
    };
    // Parity: add readable status label and mirror status as status_label for templates
    let items: ConciliacaoListItem[] = rows.map((row) => ({
      ...row,
      status_display: formatStatusLabel(row.status),
      status_label: formatStatusLabel(row.status),
      status_text: formatStatusLabel(row.status)
    }));

    if (q) {
      const qLower = q.toLowerCase();
      items = items.filter((row) =>
        [row.documento, row.numero_reserva, row.descricao, row.status].join(' ').toLowerCase().includes(qLower)
      );
    }

    const total = items.length;
    const paginatedItems = items.slice((page - 1) * pageSize, page * pageSize);

    // KPIs
    const efetivados = items.filter((row) => isConciliacaoEfetivada({ status: row.status, descricao: row.descricao }));
    const pendentes = efetivados.filter((row) => !row.conciliado);
    const semRanking = efetivados.filter((row) => !row.venda_id && !row.ranking_vendedor_id);

    return json(
      {
        items: paginatedItems,
        total,
        page,
        pageSize,
        kpis: {
          total: items.length,
          efetivados: efetivados.length,
          pendentes: pendentes.length,
          semRanking: semRanking.length,
          totalValor: efetivados.reduce((acc, row) => acc + Number(row.valor_calculada_loja || row.valor_lancamentos || 0), 0)
        }
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar conciliação.');
  }
}
