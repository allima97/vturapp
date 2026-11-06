// Migrado para Hono de src/routes/api/v1/financeiro/comissoes/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  NO_MATCH_COMPANY_ID,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveScopedVendedorIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import {
  fetchSalesReportRows,
  getVendaVendedorNome,
  getVendaClienteNome
} from '$lib/server/relatorios';
import type { ReportReceiptRow, ReportVendaRow } from '$lib/server/relatorios';
import { resolveGroupedReceiptCommissions } from '$lib/server/comissoes';
import {
  applyPersistedComissao,
  buildPersistedReciboComissaoKey,
  fetchPersistedComissoes
} from '$lib/server/comissoes-registro';
import {
  monthRangeFromKey,
  monthRangeFromYearMonth,
  parseISODateParts,
  todayISODateLocal
} from '$lib/date';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { uniqueCleanStrings } from '$lib/utils/array';
import { toFiniteNumber as toNum } from '$lib/utils/values';

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function scaleCommissionPart(part: number, calculatedTotal: number, appliedTotal: number) {
  const total = toNum(calculatedTotal);
  const applied = toNum(appliedTotal);
  if (total <= 0 || applied <= 0) return 0;
  return roundMoney((toNum(part) / total) * applied);
}

type CommissionReceiptRow = NonNullable<ReportReceiptRow>;
type CommissionReportRow = ReportVendaRow;
type CommissionItem = {
  id: string;
  venda_id: string;
  recibo_id: string;
  numero_venda: string | null;
  numero_recibo: string;
  numero_reserva: string | null;
  produto: string;
  cliente: string;
  cliente_id: string | null;
  vendedor: string;
  vendedor_short: string;
  vendedor_label: string;
  vendedor_id: string | null;
  valor_venda: number;
  valor_comissionavel: number;
  percentual_aplicado: number;
  percentual_comissao_geral: number;
  percentual_seguro: number;
  regra_nome: string | null;
  tipo_pacote: string | null;
  valor_comissao: number;
  valor_comissao_geral: number;
  valor_comissao_seguro: number;
  valor_pago: number;
  valor_taxas: number;
  data_venda: string | null;
  data_embarque: string | null;
  status: string;
  status_label: string;
  data_pagamento: string | null;
  observacoes_pagamento: string | null;
};

type CommissionResumo = {
  vendedor_id: string | null;
  vendedor_nome: string;
  total_vendas: number;
  total_comissao: number;
  total_comissao_geral: number;
  total_comissao_seguro: number;
  total_pago: number;
  total_pendente: number;
};

function isActiveReceipt(recibo: ReportReceiptRow): recibo is CommissionReceiptRow {
  return Boolean(recibo && !recibo.cancelado_por_conciliacao_em);
}

function isCommissionItem(item: CommissionItem | null): item is CommissionItem {
  return item !== null;
}

function getReciboValor(recibo: CommissionReceiptRow) {
  return Math.max(0, toNum(recibo?.valor_total) - toNum(recibo?.valor_rav));
}

function getReciboCodigo(recibo: CommissionReceiptRow) {
  return String(recibo?.numero_recibo || recibo?.numero_reserva || '').trim();
}

function getReciboProduto(recibo: CommissionReceiptRow) {
  return String(
    recibo?.tipo_produtos?.nome || recibo?.produto_resolvido?.nome || 'Produto sem nome'
  );
}

function normalizeRowsToReceiptPeriod(rows: CommissionReportRow[]) {
  return (rows || []).map((row) => {
    const recibos = Array.isArray(row?.recibos) ? row.recibos : [];
    const firstReceiptDate = recibos.find((recibo) => recibo?.data_venda)?.data_venda;
    return firstReceiptDate ? { ...row, data_venda: firstReceiptDate } : row;
  });
}

function resolvePeriodoComissoes(searchParams: URLSearchParams) {
  const dataInicio = String(
    searchParams.get('data_inicio') || searchParams.get('inicio') || ''
  ).trim();
  const dataFim = String(searchParams.get('data_fim') || searchParams.get('fim') || '').trim();
  if (dataInicio || dataFim) {
    return {
      dataInicio: dataInicio || null,
      dataFim: dataFim || null
    };
  }

  const mesParam = String(searchParams.get('mes') || '').trim();
  const anoParam = String(searchParams.get('ano') || '').trim();
  const matchMesAno = mesParam.match(/^(\d{4})-(\d{2})$/);

  if (matchMesAno) {
    const range = monthRangeFromKey(mesParam);
    if (range) return { dataInicio: range.inicio, dataFim: range.fim };
  }

  if (mesParam || anoParam) {
    const today = parseISODateParts(todayISODateLocal());
    const month = Number(mesParam || today?.month || new Date().getMonth() + 1);
    const year = Number(anoParam || today?.year || new Date().getFullYear());
    if (Number.isFinite(month) && Number.isFinite(year) && month >= 1 && month <= 12) {
      const range = monthRangeFromYearMonth(year, month);
      return {
        dataInicio: range.inicio,
        dataFim: range.fim
      };
    }
  }

  return {
    dataInicio: null,
    dataFim: null
  };
}

function canViewTeamCommissions(scope: Awaited<ReturnType<typeof resolveUserScope>>) {
  return scope.isAdmin || scope.isMaster || scope.isFinanceiro || scope.isGestor;
}

export async function handleFinanceiroComissoesGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const podeVerEquipe = canViewTeamCommissions(scope);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Comissionamento', 'financeiro'], 1, 'Sem acesso a Comissões.');
    }

    const { searchParams } = event.url;
    const status = searchParams.get('status');
    const vendedorIdParam = searchParams.get('vendedor_id');
    const requestedVendedorRaw = vendedorIdParam || searchParams.get('vendedor_ids');
    const hasRequestedVendedorFilter = String(requestedVendedorRaw || '').trim().length > 0;
    const periodo = resolvePeriodoComissoes(searchParams);
    const companyIds = resolveScopedCompanyIds(scope, searchParams.get('empresa_id'));
    const vendedorIds = await resolveScopedVendedorIds(client, scope, requestedVendedorRaw);
    const effectiveVendedorIds =
      hasRequestedVendedorFilter && vendedorIds.length === 0 ? [NO_MATCH_COMPANY_ID] : vendedorIds;

    const payload = await getCachedReadModel({
      key: buildReadModelCacheKey('financeiro:comissoes:list', {
        companyIds,
        vendedorIds: effectiveVendedorIds,
        dataInicio: periodo.dataInicio,
        dataFim: periodo.dataFim,
        status: status || null,
        podeVerEquipe,
        userId: scope.userId
      }),
      tags: [
        READ_MODEL_TAGS.comissoes,
        READ_MODEL_TAGS.sales,
        READ_MODEL_TAGS.finance,
        READ_MODEL_TAGS.users,
        READ_MODEL_TAGS.metas,
        ...scopeCacheTags({ companyIds, vendedorIds: effectiveVendedorIds, userId: scope.userId })
      ],
      ttlMs: 120_000,
      staleTtlMs: 600_000,
      loader: async () => {
        const rows = await fetchSalesReportRows(client, {
          dataInicio: periodo.dataInicio,
          dataFim: periodo.dataFim,
          companyIds,
          vendedorIds: effectiveVendedorIds,
          filterByReceiptDate: Boolean(periodo.dataInicio || periodo.dataFim)
        });
        const rowsForComissao = normalizeRowsToReceiptPeriod(rows);
        const reciboIds = uniqueCleanStrings(
          rowsForComissao
            .flatMap((row) => (Array.isArray(row?.recibos) ? row.recibos : []))
            .map((recibo) => recibo?.id)
        );
        const [resolvedByReceiptId, persistedSnapshot] = await Promise.all([
          resolveGroupedReceiptCommissions(client, { companyIds, rows: rowsForComissao }),
          fetchPersistedComissoes(client, {
            companyIds,
            vendaIds: rows.map((row) => row.id),
            reciboIds,
            vendedorIds: uniqueCleanStrings(rows.map((row) => row.vendedor_id))
          })
        ]);
        const persistedByKey = new Map(
          persistedSnapshot.rows.map(
            (row) =>
              [
                buildPersistedReciboComissaoKey(row.recibo_id, row.vendedor_id, row.venda_id),
                row
              ] as const
          )
        );

        let items = rowsForComissao
          .flatMap((row): Array<CommissionItem | null> => {
            const recibos = (Array.isArray(row?.recibos) ? row.recibos : []).filter(
              isActiveReceipt
            );

            return recibos.map((recibo) => {
              const reciboId = String(recibo?.id || '').trim();
              const commission = reciboId ? resolvedByReceiptId.get(reciboId) : undefined;
              if (!reciboId || !commission) return null;

              const persisted = persistedByKey.get(
                buildPersistedReciboComissaoKey(reciboId, row.vendedor_id, row.id)
              );
              const persistedApplied = applyPersistedComissao(
                {
                  valor_venda: getReciboValor(recibo),
                  valor_comissionavel: commission.valorComissionavel,
                  percentual_aplicado: commission.percentual,
                  valor_comissao: commission.valorComissao,
                  valor_pago: 0,
                  status: 'pendente'
                },
                persisted
              );
              const valorComissaoSeguro = scaleCommissionPart(
                commission.valorComissaoSeguro,
                commission.valorComissao,
                persistedApplied.valor_comissao
              );
              const valorComissaoGeral = roundMoney(
                Math.max(0, persistedApplied.valor_comissao - valorComissaoSeguro)
              );

              const numeroRecibo = getReciboCodigo(recibo);

              return {
                id: reciboId,
                venda_id: row.id,
                recibo_id: reciboId,
                numero_venda: row.numero_venda,
                numero_recibo: numeroRecibo || `REC-${reciboId.slice(0, 8).toUpperCase()}`,
                numero_reserva: recibo?.numero_reserva || null,
                produto: getReciboProduto(recibo),
                cliente: getVendaClienteNome(row),
                cliente_id: row.cliente_id,
                vendedor: getVendaVendedorNome(row),
                vendedor_short: (getVendaVendedorNome(row) || '').slice(0, 20),
                vendedor_label: getVendaVendedorNome(row) || '',
                vendedor_id: row.vendedor_id,
                valor_venda: persistedApplied.valor_venda,
                valor_comissionavel: persistedApplied.valor_comissionavel,
                percentual_aplicado: persistedApplied.percentual_aplicado,
                percentual_comissao_geral: commission.percentualComissaoGeral,
                percentual_seguro: commission.percentualSeguro,
                regra_nome: commission.regraNome,
                tipo_pacote: recibo?.tipo_pacote || null,
                valor_comissao: persistedApplied.valor_comissao,
                valor_comissao_geral: valorComissaoGeral,
                valor_comissao_seguro: valorComissaoSeguro,
                valor_pago: persistedApplied.valor_pago,
                valor_taxas: Number(recibo?.valor_taxas || 0),
                data_venda: recibo?.data_venda || row.data_venda,
                data_embarque: row.data_embarque,
                status: persistedApplied.status,
                status_label: persistedApplied.status,
                data_pagamento: persisted?.data_pagamento || null,
                observacoes_pagamento: persisted?.observacoes_pagamento || null
              };
            });
          })
          .filter(isCommissionItem);

        if (!podeVerEquipe) {
          items = items.filter((item) => String(item.vendedor_id || '').trim() === scope.userId);
        }

        if (status && status !== 'todas') {
          items = items.filter((c) => c.status === status);
        }

        const resumoMap = new Map<string, CommissionResumo>();
        for (const c of items) {
          const vendedorKey = String(c.vendedor_id || '').trim() || 'sem-vendedor';
          const atual = resumoMap.get(vendedorKey) || {
            vendedor_id: c.vendedor_id,
            vendedor_nome: c.vendedor,
            total_vendas: 0,
            total_comissao: 0,
            total_comissao_geral: 0,
            total_comissao_seguro: 0,
            total_pago: 0,
            total_pendente: 0
          };
          atual.total_vendas += 1;
          atual.total_comissao += c.valor_comissao;
          atual.total_comissao_geral += c.valor_comissao_geral || 0;
          atual.total_comissao_seguro += c.valor_comissao_seguro || 0;
          if (c.status === 'pago') {
            atual.total_pago += c.valor_pago || c.valor_comissao;
          } else if (c.status !== 'cancelada') {
            atual.total_pendente += c.valor_comissao;
          }
          resumoMap.set(vendedorKey, atual);
        }

        return {
          items,
          total: items.length,
          resumo: Array.from(resumoMap.values()),
          persistencia_disponivel: persistedSnapshot.available
        };
      }
    });

    return json(payload, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar comissoes.');
  }
}
