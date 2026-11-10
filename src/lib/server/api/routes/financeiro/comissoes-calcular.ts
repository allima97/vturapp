// Migrado para Hono de src/routes/api/v1/financeiro/comissoes/calcular/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  logServerError,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveScopedVendedorIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { resolveGroupedReceiptCommissions } from '$lib/server/comissoes';
import {
  applyPersistedComissao,
  buildPersistedReciboComissaoKey,
  fetchPersistedComissoes
} from '$lib/server/comissoes-registro';
import {
  fetchSalesReportRows,
  getVendaClienteNome,
  getVendaVendedorNome
} from '$lib/server/relatorios';
import type { ReportReceiptRow, ReportVendaRow } from '$lib/server/relatorios';
import { monthRangeFromYearMonth, parseISODateParts, todayISODateLocal } from '$lib/date';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { uniqueCleanStrings } from '$lib/utils/array';
import { toFiniteNumber as toNum } from '$lib/utils/values';

const MAX_COMISSOES_CALCULAR_BODY_BYTES = 128 * 1024;

type CommissionReceiptRow = NonNullable<ReportReceiptRow>;
type CommissionReportRow = ReportVendaRow;
type CalcularComissoesBody = {
  venda_ids?: Array<string | number>;
  vendedor_ids?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  mes_referencia?: number | string | null;
  ano_referencia?: number | string | null;
  empresa_id?: string | null;
  company_id?: string | null;
};

type CommissionCalculationDetail =
  | {
      venda_id: string;
      recibo_id: string;
      numero_venda: string | null;
      numero_recibo: string;
      status: 'ignorada';
      motivo: string;
    }
  | {
      id: string;
      venda_id: string;
      recibo_id: string;
      numero_venda: string | null;
      numero_recibo: string;
      produto: string;
      cliente: string;
      vendedor: string;
      valor_venda: number;
      valor_comissionavel: number;
      percentual: number;
      percentual_comissao_geral: number;
      percentual_seguro: number;
      valor_comissao: number;
      valor_comissao_geral: number;
      valor_comissao_seguro: number;
      regra: string;
      status: 'calculada';
      mes_referencia: number | string;
      ano_referencia: number | string;
    };

type CommissionListItem = {
  id: string;
  venda_id: string;
  recibo_id: string;
  numero_venda: string;
  numero_recibo: string;
  produto: string;
  data_venda: string | null;
  cliente: string;
  vendedor_id: string | null;
  vendedor: string;
  valor_venda: number;
  valor_comissionavel: number;
  percentual_aplicado: number;
  valor_comissao: number;
  percentual_comissao_geral: number;
  percentual_seguro: number;
  valor_comissao_geral: number;
  valor_comissao_seguro: number;
  valor_pago: number;
  regra_nome: string;
  status: string;
  mes_referencia: number;
  ano_referencia: number;
  data_pagamento: string | null;
};

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function scaleCommissionPart(part: number, calculatedTotal: number, appliedTotal: number) {
  const total = toNum(calculatedTotal);
  const applied = toNum(appliedTotal);
  if (total <= 0 || applied <= 0) return 0;
  return roundMoney((toNum(part) / total) * applied);
}

function isCommissionReceipt(recibo: ReportReceiptRow): recibo is CommissionReceiptRow {
  return Boolean(recibo);
}

function isCommissionListItem(item: CommissionListItem | null): item is CommissionListItem {
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

function canViewTeamCommissions(scope: Awaited<ReturnType<typeof resolveUserScope>>) {
  return scope.isAdmin || scope.isMaster || scope.isFinanceiro || scope.isGestor;
}

export async function handleFinanceiroComissoesCalcularPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_COMISSOES_CALCULAR_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const podeVerEquipe = canViewTeamCommissions(scope);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['Comissionamento', 'financeiro'],
        2,
        'Sem permissão para calcular comissões.'
      );
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as CalcularComissoesBody)
        : {};
    const { venda_ids, vendedor_ids, data_inicio, data_fim, mes_referencia, ano_referencia } = body;

    const hoje = parseISODateParts(todayISODateLocal());
    const mesRef = mes_referencia || hoje?.month || new Date().getMonth() + 1;
    const anoRef = ano_referencia || hoje?.year || new Date().getFullYear();

    const companyIds = resolveScopedCompanyIds(scope, body?.empresa_id || body?.company_id);
    const vendedorIds = await resolveScopedVendedorIds(client, scope, vendedor_ids);
    const vendasPeriodo = await fetchSalesReportRows(client, {
      dataInicio: data_inicio,
      dataFim: data_fim,
      companyIds,
      vendedorIds,
      filterByReceiptDate: Boolean(data_inicio || data_fim)
    });
    let vendas = normalizeRowsToReceiptPeriod(vendasPeriodo);
    if (!podeVerEquipe) {
      vendas = vendas.filter((venda) => String(venda?.vendedor_id || '').trim() === scope.userId);
    }

    if (Array.isArray(venda_ids) && venda_ids.length > 0) {
      const allowedIds = new Set<string>();
      for (const id of venda_ids) {
        allowedIds.add(String(id));
      }
      vendas = vendas.filter((venda) => allowedIds.has(String(venda.id)));
    }

    if (!vendas || vendas.length === 0) {
      return json(
        {
          success: true,
          message: 'Nenhum recibo encontrado',
          processadas: 0,
          erro: 0,
          detalhes: []
        },
        { headers: NO_STORE_HEADERS }
      );
    }
    const resolvedByReceiptId = await resolveGroupedReceiptCommissions(client, {
      companyIds,
      rows: normalizeRowsToReceiptPeriod(vendasPeriodo)
    });

    const resultados: CommissionCalculationDetail[] = [];
    let processadas = 0;

    for (const venda of vendas) {
      for (const recibo of (Array.isArray(venda.recibos) ? venda.recibos : []).filter(
        isCommissionReceipt
      )) {
        const reciboId = String(recibo?.id || '').trim();
        const resolved = reciboId ? resolvedByReceiptId.get(reciboId) : undefined;
        if (!resolved) {
          resultados.push({
            venda_id: venda.id,
            recibo_id: reciboId,
            numero_venda: venda.numero_venda,
            numero_recibo: getReciboCodigo(recibo),
            status: 'ignorada',
            motivo: 'Comissão não resolvida para o recibo'
          });
          continue;
        }

        if (resolved.valorComissionavel <= 0) {
          resultados.push({
            venda_id: venda.id,
            recibo_id: reciboId,
            numero_venda: venda.numero_venda,
            numero_recibo: getReciboCodigo(recibo),
            status: 'ignorada',
            motivo: 'Valor comissionável é zero'
          });
          continue;
        }

        resultados.push({
          id: reciboId,
          venda_id: venda.id,
          recibo_id: reciboId,
          numero_venda: venda.numero_venda,
          numero_recibo: getReciboCodigo(recibo),
          produto: getReciboProduto(recibo),
          cliente: getVendaClienteNome(venda),
          vendedor: getVendaVendedorNome(venda),
          valor_venda: getReciboValor(recibo),
          valor_comissionavel: resolved.valorComissionavel,
          percentual: resolved.percentual,
          percentual_comissao_geral: resolved.percentualComissaoGeral,
          percentual_seguro: resolved.percentualSeguro,
          valor_comissao: resolved.valorComissao,
          valor_comissao_geral: resolved.valorComissaoGeral,
          valor_comissao_seguro: resolved.valorComissaoSeguro,
          regra: resolved.regraNome,
          status: 'calculada',
          mes_referencia: mesRef,
          ano_referencia: anoRef
        });
        processadas++;
      }
    }

    return json(
      {
        success: true,
        message: `${processadas} comissões calculadas`,
        processadas,
        erro: 0,
        total_recibos: processadas,
        detalhes: resultados
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    logServerError('[financeiro/comissoes/calcular] falha ao calcular comissoes', err);
    return toErrorResponse(err, 'Erro ao calcular comissões.');
  }
}

export async function handleFinanceiroComissoesCalcularGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const podeVerEquipe = canViewTeamCommissions(scope);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Comissionamento', 'financeiro'], 1, 'Sem acesso.');
    }

    const { searchParams } = event.url;
    const vendedorId = searchParams.get('vendedor_id');
    const statusParam = String(searchParams.get('status') || '')
      .trim()
      .toLowerCase();
    const companyIds = resolveScopedCompanyIds(
      scope,
      searchParams.get('empresa_id') || searchParams.get('company_id')
    );
    const mes = searchParams.get('mes');
    const ano = searchParams.get('ano');
    const vendedorIds = await resolveScopedVendedorIds(client, scope, vendedorId);

    const hojeParts = parseISODateParts(todayISODateLocal());
    const mesNum = mes ? parseInt(mes) : hojeParts?.month || new Date().getMonth() + 1;
    const anoNum = ano ? parseInt(ano) : hojeParts?.year || new Date().getFullYear();
    const range = monthRangeFromYearMonth(anoNum, mesNum);
    const dataInicio = range.inicio;
    const dataFim = range.fim;

    const payload = await getCachedReadModel({
      key: buildReadModelCacheKey('financeiro:comissoes:calcular:get', {
        companyIds,
        vendedorIds,
        dataInicio,
        dataFim,
        status: statusParam || null,
        podeVerEquipe,
        userId: scope.userId
      }),
      tags: [
        READ_MODEL_TAGS.comissoes,
        READ_MODEL_TAGS.sales,
        READ_MODEL_TAGS.finance,
        READ_MODEL_TAGS.users,
        READ_MODEL_TAGS.metas,
        ...scopeCacheTags({ companyIds, vendedorIds, userId: scope.userId })
      ],
      ttlMs: 120_000,
      staleTtlMs: 600_000,
      loader: async () => {
        const vendas = await fetchSalesReportRows(client, {
          dataInicio,
          dataFim,
          companyIds,
          vendedorIds,
          filterByReceiptDate: true
        });
        const vendasForComissao = normalizeRowsToReceiptPeriod(vendas);
        const resolvedByReceiptId = await resolveGroupedReceiptCommissions(client, {
          companyIds,
          rows: vendasForComissao
        });
        const reciboIds = uniqueCleanStrings(
          vendasForComissao
            .flatMap((v) => (Array.isArray(v?.recibos) ? v.recibos : []))
            .map((recibo) => recibo?.id)
        );
        const persistedVendedorIds: string[] = [];
        for (const row of vendas || []) {
          const vendedorId = String(row.vendedor_id || '');
          if (vendedorId) persistedVendedorIds.push(vendedorId);
        }
        const persistedSnapshot = await fetchPersistedComissoes(client, {
          companyIds,
          vendaIds: (vendas || []).map((row) => row.id),
          reciboIds,
          vendedorIds: persistedVendedorIds
        });
        const persistedByKey = new Map(
          persistedSnapshot.rows.map(
            (row) =>
              [
                buildPersistedReciboComissaoKey(row.recibo_id, row.vendedor_id, row.venda_id),
                row
              ] as const
          )
        );

        let items = (vendasForComissao || [])
          .flatMap(
            (v): Array<CommissionListItem | null> =>
              (Array.isArray(v?.recibos) ? v.recibos : [])
                .filter(isCommissionReceipt)
                .map((recibo) => {
                  const reciboId = String(recibo?.id || '').trim();
                  const resolved = reciboId ? resolvedByReceiptId.get(reciboId) : undefined;
                  if (!resolved) return null;
                  const persisted = persistedByKey.get(
                    buildPersistedReciboComissaoKey(reciboId, v.vendedor_id, v.id)
                  );
                  const persistedApplied = applyPersistedComissao(
                    {
                      valor_venda: getReciboValor(recibo),
                      valor_comissionavel: resolved.valorComissionavel,
                      percentual_aplicado: resolved.percentual,
                      valor_comissao: resolved.valorComissao,
                      valor_pago: 0,
                      status: 'pendente'
                    },
                    persisted
                  );
                  const valorComissaoSeguro = scaleCommissionPart(
                    resolved.valorComissaoSeguro,
                    resolved.valorComissao,
                    persistedApplied.valor_comissao
                  );
                  const valorComissaoGeral = roundMoney(
                    Math.max(0, persistedApplied.valor_comissao - valorComissaoSeguro)
                  );
                  return {
                    id: reciboId,
                    venda_id: v.id,
                    recibo_id: reciboId,
                    numero_venda: v.numero_venda || `VD-${v.id.slice(0, 8)}`,
                    numero_recibo: getReciboCodigo(recibo) || `REC-${reciboId.slice(0, 8)}`,
                    produto: getReciboProduto(recibo),
                    data_venda: recibo?.data_venda || v.data_venda,
                    cliente: getVendaClienteNome(v),
                    vendedor_id: v.vendedor_id,
                    vendedor: getVendaVendedorNome(v),
                    valor_venda: persistedApplied.valor_venda,
                    valor_comissionavel: persistedApplied.valor_comissionavel,
                    percentual_aplicado: persistedApplied.percentual_aplicado,
                    valor_comissao: persistedApplied.valor_comissao,
                    percentual_comissao_geral: resolved.percentualComissaoGeral,
                    percentual_seguro: resolved.percentualSeguro,
                    valor_comissao_geral: valorComissaoGeral,
                    valor_comissao_seguro: valorComissaoSeguro,
                    valor_pago: persistedApplied.valor_pago,
                    regra_nome: resolved.regraNome,
                    status: persistedApplied.status.toUpperCase(),
                    mes_referencia: mesNum,
                    ano_referencia: anoNum,
                    data_pagamento: persisted?.data_pagamento || null
                  };
                })
          )
          .filter(isCommissionListItem);

        if (!podeVerEquipe) {
          items = items.filter((item) => String(item.vendedor_id || '').trim() === scope.userId);
        }

        if (statusParam && statusParam !== 'todas') {
          items = items.filter((item) => String(item.status || '').toLowerCase() === statusParam);
        }

        const totalPendente = items
          .filter((item) => String(item.status || '').toLowerCase() !== 'paga')
          .reduce((acc, i) => acc + Number(i.valor_comissao || 0), 0);
        const totalPago = items
          .filter((item) => String(item.status || '').toLowerCase() === 'paga')
          .reduce((acc, i) => acc + Number(i.valor_pago || i.valor_comissao || 0), 0);

        return {
          items,
          total: items.length,
          resumo: {
            total_pendente: totalPendente,
            total_pago: totalPago,
            total_geral: totalPendente + totalPago
          },
          persistencia_disponivel: persistedSnapshot.available
        };
      }
    });

    return json(payload, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    logServerError('[financeiro/comissoes/calcular] falha ao carregar comissoes', err);
    return toErrorResponse(err, 'Erro ao carregar comissões.');
  }
}
