// Migrado para Hono de src/routes/api/v1/financeiro/comissoes/pagamento/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { resolveGroupedReceiptCommissions, type ResolvedReceiptCommission } from '$lib/server/comissoes';
import {
  buildPersistedReciboComissaoKey,
  fetchPersistedComissoes,
  persistPaidReceiptComissoes,
  type PersistReceiptPaymentRow
} from '$lib/server/comissoes-registro';
import { fetchSalesReportRows } from '$lib/server/relatorios';
import type { ReportReceiptRow, ReportVendaRow } from '$lib/server/relatorios';
import { todayISODateLocal } from '$lib/date';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateCommissionReadModels } from '$lib/server/readModelCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { chunkArray, uniqueCleanStrings as uniqueIds } from '$lib/utils/array';
import { toFiniteNumber as toNum } from '$lib/utils/values';

const MAX_COMISSOES_PAYMENT_BODY_BYTES = 64 * 1024;

const QUERY_IN_BATCH_SIZE = 150;

type CommissionPaymentBody = {
  comissao_ids?: Array<string | number>;
  data_pagamento?: string;
  observacoes?: string | null;
  empresa_id?: string | null;
  company_id?: string | null;
};

type CommissionReceiptRow = NonNullable<ReportReceiptRow>;
type CommissionReportRow = ReportVendaRow;
type ReciboBaseRow = {
  id?: string | null;
  venda_id?: string | null;
};
type MutationIdRow = {
  id?: string | null;
};

async function fetchBatched<T>(
  values: string[],
  loader: (batch: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>
) {
  const batchResults = await Promise.all(
    chunkArray(values, QUERY_IN_BATCH_SIZE).map(async (batch) => {
      const { data, error } = await loader(batch);
      if (error) throw error;
      return data || [];
    })
  );
  return batchResults.flat();
}

function isMissingComissoesSchema(error: unknown) {
  const code = String((error as { code?: string })?.code || '');
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  return code === '42P01' || code === '42703' || message.includes('does not exist');
}

function isCommissionReceipt(recibo: ReportReceiptRow): recibo is CommissionReceiptRow {
  return Boolean(recibo);
}

function getReciboValor(recibo: CommissionReceiptRow) {
  return Math.max(0, toNum(recibo?.valor_total) - toNum(recibo?.valor_rav));
}

function filterRowsToReceiptIds(rows: CommissionReportRow[], receiptIds: Set<string>) {
  return (rows || [])
    .map((row) => ({
      ...row,
      recibos: (Array.isArray(row?.recibos) ? row.recibos : []).filter((recibo) =>
        receiptIds.has(String(recibo?.id || '').trim())
      )
    }))
    .filter((row) => Array.isArray(row.recibos) && row.recibos.length > 0);
}

function normalizeRowsToReceiptPeriod(rows: CommissionReportRow[]) {
  return (rows || []).map((row) => {
    const recibos = Array.isArray(row?.recibos) ? row.recibos : [];
    const firstReceiptDate = recibos.find((recibo) => recibo?.data_venda)?.data_venda;
    return firstReceiptDate ? { ...row, data_venda: firstReceiptDate } : row;
  });
}

function canManageCommissionPayments(scope: Awaited<ReturnType<typeof resolveUserScope>>) {
  return scope.isFinanceiro;
}

export async function handleFinanceiroComissoesPagamentoPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_COMISSOES_PAYMENT_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Comissionamento', 'financeiro'], 3, 'Sem permissão para registrar pagamentos.');
    }
    if (!canManageCommissionPayments(scope)) {
      return json(
        { error: 'Somente usuários financeiros podem registrar pagamentos de comissões.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as CommissionPaymentBody)
        : {};
    const { comissao_ids, data_pagamento = todayISODateLocal(), observacoes = '' } = body;

    if (!comissao_ids || !Array.isArray(comissao_ids) || comissao_ids.length === 0) {
      return json(
        { error: 'IDs das comissões são obrigatórios.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const companyIds = resolveScopedCompanyIds(scope, body?.empresa_id || body?.company_id);
    const reciboIds = uniqueIds(comissao_ids);
    const reciboIdSet = new Set(reciboIds);

    const recibosBase = await fetchBatched<ReciboBaseRow>(reciboIds, (batch) =>
      client
        .from('vendas_recibos')
        .select('id, venda_id')
        .in('id', batch)
    );

    const vendaIds = uniqueIds(recibosBase.map((row) => row?.venda_id));

    const fetchedRows = await fetchSalesReportRows(client, {
      companyIds,
      vendaIds
    });
    const rows = filterRowsToReceiptIds(fetchedRows, reciboIdSet);

    if (rows.length === 0) {
      return json(
        { error: 'Nenhum recibo elegível encontrado para registrar comissão.' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const vendedoresSelecionados = uniqueIds(rows.map((row) => row.vendedor_id));
    const periodos = rows
      .flatMap((row) => (Array.isArray(row.recibos) ? row.recibos : []))
      .map((recibo) => String(recibo?.data_venda || '').trim())
      .filter((data) => /^\d{4}-\d{2}/.test(data))
      .map((data) => data.slice(0, 7))
      .sort();
    const dataInicioContexto = periodos.length > 0 ? `${periodos[0]}-01` : undefined;
    const dataFimContexto =
      periodos.length > 0
        ? new Date(Number(periodos[periodos.length - 1].slice(0, 4)), Number(periodos[periodos.length - 1].slice(5, 7)), 0)
            .toISOString()
            .slice(0, 10)
        : undefined;
    const contextRows =
      dataInicioContexto && dataFimContexto
        ? await fetchSalesReportRows(client, {
            companyIds,
            vendedorIds: vendedoresSelecionados,
            dataInicio: dataInicioContexto,
            dataFim: dataFimContexto,
            filterByReceiptDate: true
          })
        : rows;
    const contextRowsForComissao = normalizeRowsToReceiptPeriod(contextRows);
    const selectedRowsForComissao = normalizeRowsToReceiptPeriod(rows);
    const resolvedByReceiptId = await resolveGroupedReceiptCommissions(client, {
      companyIds,
      rows: contextRowsForComissao
    });

    const paymentRows: PersistReceiptPaymentRow[] = selectedRowsForComissao.flatMap((row) =>
      (Array.isArray(row?.recibos) ? row.recibos : []).filter(isCommissionReceipt).map((recibo) => ({
        venda_id: row.id,
        recibo_id: String(recibo?.id || '').trim(),
        vendedor_id: row.vendedor_id,
        company_id: row.company_id,
        data_venda: recibo?.data_venda || row.data_venda,
        valor_recibo: getReciboValor(recibo)
      }))
    ).filter((row) => row.recibo_id);

    const resolvedByKey = new Map(
      paymentRows
        .map((row) => {
          const resolved = resolvedByReceiptId.get(row.recibo_id);
          return resolved
            ? ([buildPersistedReciboComissaoKey(row.recibo_id, row.vendedor_id, row.venda_id), resolved] as const)
            : null;
        })
        .filter((entry): entry is readonly [string, ResolvedReceiptCommission] => Boolean(entry))
    );
    const vendedorIds: string[] = [];
    for (const row of paymentRows) {
      const vendedorId = String(row.vendedor_id || '');
      if (vendedorId) vendedorIds.push(vendedorId);
    }

    const existingSnapshot = await fetchPersistedComissoes(client, {
      companyIds,
      vendaIds,
      reciboIds,
      vendedorIds
    });

    if (!existingSnapshot.available) {
      return json({
        success: false,
        fallback: true,
        pagas: 0,
        data_pagamento,
        message: 'Persistência de comissão indisponível neste ambiente. Nenhuma baixa foi salva.'
      }, { headers: NO_STORE_HEADERS });
    }

    const existingByKey = new Map(
      existingSnapshot.rows.map((row) => [
        buildPersistedReciboComissaoKey(row.recibo_id, row.vendedor_id, row.venda_id),
        row
      ] as const)
    );

    const result = await persistPaidReceiptComissoes({
      client,
      userId: user.id,
      rows: paymentRows,
      resolvedByKey,
      existingByKey,
      dataPagamento: data_pagamento,
      observacoesPagamento: observacoes
    });

    if ((result as { fallback?: boolean }).fallback) {
      return json({
        success: false,
        fallback: true,
        pagas: 0,
        data_pagamento,
        message: 'Persistência de comissão indisponível neste ambiente. Nenhuma baixa foi salva.'
      }, { headers: NO_STORE_HEADERS });
    }

    if (result.pagas > 0) {
      const companyIdsForInvalidation =
        companyIds.length > 0
          ? companyIds
          : uniqueIds(paymentRows.map((row) => row.company_id));
      invalidateCommissionReadModels({
        companyIds: companyIdsForInvalidation,
        vendedorIds: vendedoresSelecionados,
        userId: user.id
      });
    }
    return json({
      success: true,
      message: `${result.pagas} comissão(ões) marcada(s) como paga(s)`,
      pagas: result.pagas,
      data_pagamento,
      fallback: false
    }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao registrar pagamento.');
  }
}

export async function handleFinanceiroComissoesPagamentoPut(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_COMISSOES_PAYMENT_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Comissionamento', 'financeiro'], 3, 'Sem permissão para atualizar pagamentos.');
    }
    if (!canManageCommissionPayments(scope)) {
      return json(
        { error: 'Somente usuários financeiros podem atualizar pagamentos de comissões.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as CommissionPaymentBody)
        : {};
    const { comissao_ids, data_pagamento = null, observacoes = '' } = body;

    if (!Array.isArray(comissao_ids) || comissao_ids.length === 0) {
      return json(
        { error: 'IDs das comissões são obrigatórios.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const companyIds = resolveScopedCompanyIds(scope, body?.empresa_id || body?.company_id);
    const reciboIds = uniqueIds(comissao_ids);
    const updatedRows: MutationIdRow[] = [];
    const companyBatches =
      companyIds.length > QUERY_IN_BATCH_SIZE
        ? chunkArray(companyIds, QUERY_IN_BATCH_SIZE)
        : [companyIds];

    for (const batch of chunkArray(reciboIds, QUERY_IN_BATCH_SIZE)) {
      for (const companyBatch of companyBatches) {
        let query = client
          .from('comissoes')
          .update({
            data_pagamento,
            observacoes_pagamento: observacoes || null
          })
          .in('recibo_id', batch)
          .eq('status', 'PAGA')
          .select('id');

        if (companyBatch.length > 0) {
          query = query.in('company_id', companyBatch);
        }

        const { data, error } = await query;
        if (error) {
          if (isMissingComissoesSchema(error)) {
            return json({ success: true, message: 'Persistência de comissão não disponível neste ambiente.', fallback: true }, { headers: NO_STORE_HEADERS });
          }
          throw error;
        }
        updatedRows.push(...(data || []));
      }
    }

    if (updatedRows.length > 0) {
      invalidateCommissionReadModels({ companyIds, userId: user.id });
    }
    return json({
      success: true,
      message: `${updatedRows.length} comissão(ões) atualizada(s).`,
      atualizadas: updatedRows.length
    }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao atualizar pagamento.');
  }
}

export async function handleFinanceiroComissoesPagamentoDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_COMISSOES_PAYMENT_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Comissionamento', 'financeiro'], 4, 'Sem permissão para cancelar comissão.');
    }
    if (!canManageCommissionPayments(scope)) {
      return json(
        { error: 'Somente usuários financeiros podem cancelar comissões.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as CommissionPaymentBody)
        : {};
    const { comissao_ids, observacoes = '' } = body;

    if (!Array.isArray(comissao_ids) || comissao_ids.length === 0) {
      return json(
        { error: 'IDs das comissões são obrigatórios.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const companyIds = resolveScopedCompanyIds(scope, body?.empresa_id || body?.company_id);
    const reciboIds = uniqueIds(comissao_ids);
    const cancelledRows: MutationIdRow[] = [];
    const companyBatches =
      companyIds.length > QUERY_IN_BATCH_SIZE
        ? chunkArray(companyIds, QUERY_IN_BATCH_SIZE)
        : [companyIds];

    for (const batch of chunkArray(reciboIds, QUERY_IN_BATCH_SIZE)) {
      for (const companyBatch of companyBatches) {
        let query = client
          .from('comissoes')
          .update({
            status: 'CANCELADA',
            data_pagamento: null,
            observacoes_pagamento: observacoes || null,
            pago_por: user.id
          })
          .in('recibo_id', batch)
          .select('id');

        if (companyBatch.length > 0) {
          query = query.in('company_id', companyBatch);
        }

        const { data, error } = await query;
        if (error) {
          if (isMissingComissoesSchema(error)) {
            return json({ success: true, message: 'Persistência de comissão não disponível neste ambiente.', fallback: true }, { headers: NO_STORE_HEADERS });
          }
          throw error;
        }
        cancelledRows.push(...(data || []));
      }
    }

    if (cancelledRows.length > 0) {
      invalidateCommissionReadModels({ companyIds, userId: user.id });
    }
    return json({
      success: true,
      message: `${cancelledRows.length} comissão(ões) cancelada(s).`,
      canceladas: cancelledRows.length
    }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao cancelar comissão.');
  }
}
