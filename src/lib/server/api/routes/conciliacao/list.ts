// Migrado para Hono de src/routes/api/v1/conciliacao/list/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler e caminhos de import relativos mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse,
} from '$lib/server/v1';
import {
  dedupeConciliacaoRows,
  isFormaNaoComissionavel,
  isRankingEligibleStatus,
  normalizeComputedFields,
} from '../../../../../routes/api/v1/conciliacao/_legacy';
import { monthRangeFromKey } from '$lib/date';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags,
} from '$lib/server/readModelCache';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import { chunkArray } from '$lib/utils/array';
import { carregarTermosNaoComissionaveis } from '$lib/server/naoComissionavelTermos';


const SUPABASE_IN_BATCH_SIZE = 150;

type ConciliacaoListRow = {
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
  valor_calculada_loja?: number | null;
  valor_visao_master?: number | null;
  valor_opfax?: number | null;
  valor_saldo?: number | null;
  valor_venda_real?: number | null;
  valor_nao_comissionavel?: number | null;
  valor_comissao_loja?: number | null;
  percentual_comissao_loja?: number | null;
  faixa_comissao?: string | null;
  is_seguro_viagem?: boolean | null;
  origem?: string | null;
  conciliado?: boolean | null;
  match_total?: boolean | null;
  match_taxas?: boolean | null;
  sistema_valor_total?: number | null;
  sistema_valor_taxas?: number | null;
  diff_total?: number | null;
  diff_taxas?: number | null;
  venda_id?: string | null;
  venda_recibo_id?: string | null;
  ranking_vendedor_id?: string | null;
  ranking_produto_id?: string | null;
  ranking_assigned_at?: string | null;
  is_baixa_rac?: boolean | null;
  last_checked_at?: string | null;
  conciliado_em?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type NormalizedConciliacaoListRow = ConciliacaoListRow &
  ReturnType<typeof normalizeComputedFields>;

type PagamentoLookupRow = {
  venda_id?: string | null;
  forma_nome?: string | null;
  paga_comissao?: boolean | null;
};

type ReciboAuditRow = {
  id?: string | null;
  valor_total?: number | null;
  valor_taxas?: number | null;
};

type VendaLinkedRow = {
  id?: string | null;
  numero_venda?: string | null;
  cliente_id?: string | null;
  vendedor_id?: string | null;
};

type ClienteLinkedRow = {
  id?: string | null;
  nome?: string | null;
};

type VendedorLinkedRow = {
  id?: string | null;
  nome_completo?: string | null;
};

type ReciboLinkedRow = {
  id?: string | null;
  venda_id?: string | null;
  numero_recibo?: string | null;
  numero_reserva?: string | null;
};

type AuditUpdate = {
  sistema_valor_total?: number;
  sistema_valor_taxas?: number;
  match_total?: boolean;
  match_taxas?: boolean;
  diff_total?: number;
  diff_taxas?: number;
};

type EnrichedConciliacaoListRow = NormalizedConciliacaoListRow & {
  is_nao_comissionavel?: boolean;
  venda_numero?: string | null;
  venda_cliente_nome?: string | null;
  venda_vendedor_nome?: string | null;
  recibo_numero?: string | null;
};

async function fetchBatched<T>(
  values: string[],
  loader: (
    batch: string[],
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const batchResults = await Promise.all(
    chunkArray(values, SUPABASE_IN_BATCH_SIZE).map(async (batch) => {
      const { data, error } = await loader(batch);
      if (error) throw error;
      return data || [];
    })
  );
  return batchResults.flat();
}

export async function handleConciliacaoListGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (
      !scope.isAdmin &&
      !scope.isMaster &&
      !scope.isFinanceiro &&
      !scope.isGestor
    ) {
      ensureModuloAccess(
        scope,
        ['operacao_conciliacao', 'conciliacao'],
        1,
        'Sem acesso à Conciliação.',
      );
    }

    const { searchParams } = event.url;
    const companyIds = resolveScopedCompanyIds(
      scope,
      searchParams.get('company_id'),
    );
    const companyId = companyIds[0] || null;
    if (!companyId) return json([], { headers: DYNAMIC_READ_HEADERS });

    const somentePendentes = searchParams.get('pending') === '1';
    const somenteConciliados = searchParams.get('conciliado') === '1';
    const rankingPending = searchParams.get('ranking_pending') === '1';
    const month = String(searchParams.get('month') || '').trim();
    const day = String(searchParams.get('day') || '').trim();
    const rankingStatus = String(
      searchParams.get('ranking_status') || 'all',
    ).trim();
    const baixaRac = searchParams.get('baixa_rac') === '1';

    const rows = await getCachedReadModel<ConciliacaoListRow[]>({
      key: buildReadModelCacheKey('conciliacao:list:legacy', {
        companyId,
        somentePendentes,
        somenteConciliados,
        rankingPending,
        month,
        day,
        rankingStatus,
        baixaRac,
      }),
      tags: [
        READ_MODEL_TAGS.conciliacao,
        READ_MODEL_TAGS.sales,
        READ_MODEL_TAGS.finance,
        READ_MODEL_TAGS.ranking,
        READ_MODEL_TAGS.users,
        READ_MODEL_TAGS.clients,
        ...scopeCacheTags({ companyIds: [companyId], userId: user.id }),
      ],
      ttlMs: 120_000,
      staleTtlMs: 600_000,
      loader: async () => {
        let query = client
          .from('conciliacao_recibos')
          .select(
            `id, company_id, documento, numero_reserva, movimento_data, status, descricao, valor_lancamentos, valor_taxas, valor_descontos, valor_abatimentos, valor_calculada_loja, valor_visao_master, valor_opfax, valor_saldo, valor_venda_real, valor_nao_comissionavel, valor_comissao_loja, percentual_comissao_loja, faixa_comissao, is_seguro_viagem, origem, conciliado, match_total, match_taxas, sistema_valor_total, sistema_valor_taxas, diff_total, diff_taxas, venda_id, venda_recibo_id, ranking_vendedor_id, ranking_produto_id, ranking_assigned_at, is_baixa_rac, ranking_vendedor:users!ranking_vendedor_id(id, nome_completo), ranking_produto:tipo_produtos!ranking_produto_id(id, nome), last_checked_at, conciliado_em, created_at, updated_at`,
          )
          .eq('company_id', companyId)
          .order('movimento_data', { ascending: false })
          .order('documento', { ascending: true })
          .limit(500);

        if (somentePendentes) query = query.eq('conciliado', false);
        if (somenteConciliados) query = query.eq('conciliado', true);
        if (/^\d{4}-\d{2}$/.test(month)) {
          const range = monthRangeFromKey(month);
          if (range)
            query = query
              .gte('movimento_data', range.inicio)
              .lte('movimento_data', range.fim);
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
          query = query.eq('movimento_data', day);
        }

        const { data, error } = await query;
        if (error) throw error;

        let rows: NormalizedConciliacaoListRow[] = dedupeConciliacaoRows(
          Array.isArray(data) ? (data as ConciliacaoListRow[]) : [],
        ).map((row) => normalizeComputedFields(row) as NormalizedConciliacaoListRow);

        if (rankingPending) {
          rows = rows.filter((row) => {
            const status = String(row?.status || '')
              .trim()
              .toUpperCase();
            const isEligivel = status === 'BAIXA' || status === 'OPFAX';
            const semVenda = !String(row?.venda_id || '').trim();
            const semRanking = !String(row?.ranking_vendedor_id || '').trim();
            const isBaixaRac =
              Boolean(row?.is_baixa_rac) ||
              String(row?.ranking_vendedor_id || '').trim() === 'BAIXA_RAC';
            return isEligivel && semVenda && semRanking && !isBaixaRac;
          });
        }

        if (somentePendentes) {
          rows = rows.filter((row) => {
            const isBaixaRac =
              Boolean(row?.is_baixa_rac) ||
              String(row?.ranking_vendedor_id || '').trim() === 'BAIXA_RAC';
            return !isBaixaRac;
          });
        }

        if (baixaRac) {
          rows = rows.filter((row) => {
            const isBaixaRac =
              Boolean(row?.is_baixa_rac) ||
              String(row?.ranking_vendedor_id || '').trim() === 'BAIXA_RAC';
            return isBaixaRac;
          });
        }

        if (rankingStatus === 'pending') {
          rows = rows.filter((row) => {
            const vendaId = String(row?.venda_id || '').trim();
            const rankingVendedorId = String(
              row?.ranking_vendedor_id || '',
            ).trim();
            return (
              isRankingEligibleStatus(row) && !vendaId && !rankingVendedorId
            );
          });
        } else if (rankingStatus === 'assigned') {
          rows = rows.filter((row) => {
            if (!isRankingEligibleStatus(row)) return false;
            const vendaId = String(row?.venda_id || '').trim();
            const rankingVendedorId = String(
              row?.ranking_vendedor_id || '',
            ).trim();
            const isBaixaRac = Boolean(row?.is_baixa_rac);
            if (isBaixaRac) return false;
            return !vendaId && Boolean(rankingVendedorId);
          });
        } else if (rankingStatus === 'system') {
          rows = rows.filter(
            (row) =>
              isRankingEligibleStatus(row) &&
              Boolean(String(row?.venda_id || '').trim()),
          );
        }

        const vendaIds = Array.from(
          new Set(
            rows
              .map((row) => String(row?.venda_id || '').trim())
              .filter(Boolean),
          ),
        );
        const flaggedVendas = new Set<string>();

        if (vendaIds.length > 0) {
          // Termos ativos da tabela; sem termos/erro → lista padrão (Fase 2.3).
          const termosNaoComissionaveis = await carregarTermosNaoComissionaveis(client);

          const pagamentos = await fetchBatched<PagamentoLookupRow>(
            vendaIds,
            (batch) =>
            client
              .from('vendas_pagamentos')
              .select('venda_id, forma_nome, paga_comissao')
              .eq('company_id', companyId)
              .in('venda_id', batch),
          );

          for (const pagamento of pagamentos) {
            const vendaId = String(pagamento?.venda_id || '').trim();
            if (!vendaId) continue;
            const naoComissiona =
              pagamento?.paga_comissao === false ||
              isFormaNaoComissionavel(
                pagamento?.forma_nome,
                termosNaoComissionaveis,
              );
            if (naoComissiona) flaggedVendas.add(vendaId);
          }
        }

        const recibosByIdForAudit = new Map<
          string,
          { valor_total: number | null; valor_taxas: number | null }
        >();
        const reciboIdsForAudit = Array.from(
          new Set(
            rows
              .map((row) => String(row?.venda_recibo_id || '').trim())
              .filter(Boolean),
          ),
        );

        if (reciboIdsForAudit.length > 0) {
          const recibosAudit = await fetchBatched<ReciboAuditRow>(
            reciboIdsForAudit,
            (batch) =>
              client
                .from('vendas_recibos')
                .select('id, valor_total, valor_taxas')
                .in('id', batch),
          );

          for (const recibo of recibosAudit) {
            const reciboId = String(recibo?.id || '').trim();
            if (!reciboId) continue;
            recibosByIdForAudit.set(reciboId, {
              valor_total: Number(recibo?.valor_total || 0),
              valor_taxas: Number(recibo?.valor_taxas || 0),
            });
          }
        }

        let enrichedRows: EnrichedConciliacaoListRow[] = rows.map((row) => {
          const vendaId = String(row?.venda_id || '').trim();
          const reciboId = String(row?.venda_recibo_id || '').trim();
          const reciboData = reciboId
            ? recibosByIdForAudit.get(reciboId)
            : null;

          let auditUpdate: AuditUpdate = {};
          if (reciboData) {
            const sistemaTotal = reciboData.valor_total ?? 0;
            const sistemaTaxas = reciboData.valor_taxas ?? 0;
            const valorVendaReal = Number(row?.valor_venda_real || 0);
            const valorTaxas = Number(row?.valor_taxas || 0);
            const matches = (a: number, b: number) => Math.abs(a - b) <= 0.01;
            const diff = (a: number, b: number) =>
              Math.round((a - b) * 100) / 100;

            auditUpdate = {
              sistema_valor_total: sistemaTotal,
              sistema_valor_taxas: sistemaTaxas,
              match_total: matches(valorVendaReal, sistemaTotal),
              match_taxas: matches(valorTaxas, sistemaTaxas),
              diff_total: diff(valorVendaReal, sistemaTotal),
              diff_taxas: diff(valorTaxas, sistemaTaxas),
            };
          }

          return {
            ...row,
            ...auditUpdate,
            is_nao_comissionavel:
              (vendaId ? flaggedVendas.has(vendaId) : false) ||
              Number(row?.valor_nao_comissionavel || 0) > 0,
          };
        });

        const vendaIdsLinked = Array.from(
          new Set(
            enrichedRows
              .map((row) => String(row?.venda_id || '').trim())
              .filter(Boolean),
          ),
        );
        const reciboIdsLinked = Array.from(
          new Set(
            enrichedRows
              .map((row) => String(row?.venda_recibo_id || '').trim())
              .filter(Boolean),
          ),
        );

        const vendasById = new Map<string, VendaLinkedRow>();
        const clientesById = new Map<string, string>();
        const vendedoresById = new Map<string, string>();
        const recibosById = new Map<string, ReciboLinkedRow>();

        if (vendaIdsLinked.length > 0) {
          const vendasData = await fetchBatched<VendaLinkedRow>(
            vendaIdsLinked,
            (batch) =>
              client
                .from('vendas')
                .select('id, numero_venda, cliente_id, vendedor_id')
                .eq('company_id', companyId)
                .in('id', batch),
          );

          for (const item of vendasData) {
            const id = String(item?.id || '').trim();
            if (id) vendasById.set(id, item);
          }

          const clienteIds = Array.from(
            new Set(
              vendasData
                .map((item) => String(item?.cliente_id || '').trim())
                .filter(Boolean),
            ),
          );
          const vendedorIds = Array.from(
            new Set(
              vendasData
                .map((item) => String(item?.vendedor_id || '').trim())
                .filter(Boolean),
            ),
          );

          if (clienteIds.length > 0) {
            const clientesData = await fetchBatched<ClienteLinkedRow>(
              clienteIds,
              (batch) =>
                client.from('clientes').select('id, nome').in('id', batch),
            );
            for (const cliente of clientesData) {
              const id = String(cliente?.id || '').trim();
              const nome = String(cliente?.nome || '').trim();
              if (id) clientesById.set(id, nome || '-');
            }
          }

          if (vendedorIds.length > 0) {
            const vendedoresData = await fetchBatched<VendedorLinkedRow>(
              vendedorIds,
              (batch) =>
                client
                  .from('users')
                  .select('id, nome_completo')
                  .in('id', batch),
            );
            for (const vendedor of vendedoresData) {
              const id = String(vendedor?.id || '').trim();
              const nome = String(vendedor?.nome_completo || '').trim();
              if (id) vendedoresById.set(id, nome || '-');
            }
          }
        }

        if (reciboIdsLinked.length > 0) {
          const recibosData = await fetchBatched<ReciboLinkedRow>(
            reciboIdsLinked,
            (batch) =>
              client
                .from('vendas_recibos')
                .select('id, venda_id, numero_recibo, numero_reserva')
                .in('id', batch),
          );
          for (const item of recibosData) {
            const id = String(item?.id || '').trim();
            if (id) recibosById.set(id, item);
          }
        }

        enrichedRows = enrichedRows.map((row) => {
          const vendaId = String(row?.venda_id || '').trim();
          const reciboId = String(row?.venda_recibo_id || '').trim();
          const venda = vendaId ? vendasById.get(vendaId) : null;
          const recibo = reciboId ? recibosById.get(reciboId) : null;

          const clienteNome = venda?.cliente_id
            ? clientesById.get(String(venda.cliente_id)) || null
            : null;
          const vendedorNome = venda?.vendedor_id
            ? vendedoresById.get(String(venda.vendedor_id)) || null
            : null;
          const numeroVenda = venda?.numero_venda
            ? String(venda.numero_venda).trim()
            : null;
          const numeroRecibo = recibo?.numero_recibo
            ? String(recibo.numero_recibo).trim()
            : recibo?.numero_reserva
              ? String(recibo.numero_reserva).trim()
              : null;

          return {
            ...row,
            venda_numero: numeroVenda,
            venda_cliente_nome: clienteNome,
            venda_vendedor_nome: vendedorNome,
            recibo_numero: numeroRecibo,
          };
        });

        return enrichedRows;
      },
    });

    return json(rows, {
      headers: {
        'Cache-Control': 'private, max-age=5',
        Vary: 'Cookie',
      },
    });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao listar conciliacao.');
  }
}
