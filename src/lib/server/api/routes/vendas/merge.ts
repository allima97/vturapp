// Migrado para Hono de src/routes/api/v1/vendas/merge/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler mudou). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveScopedVendedorIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { registrarLog } from '$lib/server/auditLog';
import { readTextBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { invalidateSalesReadModels } from '$lib/server/readModelCache';
import { isSaleInScope } from '$lib/server/salesScope';
import { safeJsonParse } from '$lib/utils/json';
import { chunkArray } from '$lib/utils/array';
import { isFormaNaoComissionavelOuPadrao } from '$lib/naoComissionavel';
import { carregarTermosNaoComissionaveis } from '$lib/server/naoComissionavelTermos';

const MAX_VENDA_MERGE_BODY_BYTES = 64 * 1024;

type PagamentoParcelaRow = {
  valor?: number | string | null;
  vencimento?: string | null;
};

type PagamentoMergeRow = {
  id?: string | null;
  venda_id?: string | null;
  forma_pagamento_id?: string | null;
  forma_nome?: string | null;
  valor_total?: number | string | null;
  valor_bruto?: number | string | null;
  desconto_valor?: number | string | null;
  parcelas?: PagamentoParcelaRow[] | null;
  parcelas_qtd?: number | null;
  paga_comissao?: boolean | null;
};

type ReciboMergeRow = {
  id?: string | null;
  venda_id?: string | null;
  valor_total?: number | string | null;
  valor_taxas?: number | string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
};

type SaleMergeRow = {
  id?: string | null;
  vendedor_id?: string | null;
  desconto_comercial_aplicado?: boolean | null;
  desconto_comercial_valor?: number | string | null;
  data_embarque?: string | null;
  data_final?: string | null;
  company_id?: string | null;
};

function normalizeMoneyKey(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return '0.00';
  return parsed.toFixed(2);
}

function buildPagamentoKey(pagamento: PagamentoMergeRow) {
  const forma = String(pagamento?.forma_nome || pagamento?.forma_pagamento_id || '')
    .toLowerCase()
    .trim();
  const totalKey = normalizeMoneyKey(
    pagamento?.valor_total != null ? pagamento.valor_total : pagamento?.valor_bruto
  );
  const parcelas = Array.isArray(pagamento?.parcelas) ? pagamento.parcelas : [];
  const parcelasKey = parcelas
    .map((parcela: PagamentoParcelaRow) => {
      const valor = normalizeMoneyKey(parcela?.valor);
      const vencimento = String(parcela?.vencimento || '').trim();
      return `${valor}|${vencimento}`;
    })
    .join(',');
  const parcelasQtd = pagamento?.parcelas_qtd ?? parcelas.length ?? 0;
  const pagaComissaoKey =
    pagamento?.paga_comissao === null || pagamento?.paga_comissao === undefined
      ? 'na'
      : pagamento.paga_comissao
        ? '1'
        : '0';

  return [forma, totalKey, parcelasKey, String(parcelasQtd), pagaComissaoKey].join('|');
}

function dedupePagamentos(pagamentos: PagamentoMergeRow[], preferVendaId?: string) {
  const map = new Map<string, PagamentoMergeRow>();
  const duplicateIds: string[] = [];

  for (const pagamento of pagamentos) {
    const key = buildPagamentoKey(pagamento);
    const current = map.get(key);

    if (!current) {
      map.set(key, pagamento);
      continue;
    }

    if (
      preferVendaId &&
      pagamento?.venda_id === preferVendaId &&
      current?.venda_id !== preferVendaId
    ) {
      if (current?.id) duplicateIds.push(current.id);
      map.set(key, pagamento);
      continue;
    }

    if (pagamento?.id) duplicateIds.push(pagamento.id);
  }

  return {
    deduped: Array.from(map.values()),
    duplicateIds
  };
}

function calcularValorPagamento(pagamento: PagamentoMergeRow) {
  const valorTotal = Number(pagamento?.valor_total || 0);
  if (valorTotal > 0) return valorTotal;

  const valorBruto = Number(pagamento?.valor_bruto || 0);
  const desconto = Number(pagamento?.desconto_valor || 0);
  if (valorBruto > 0) return Math.max(0, valorBruto - desconto);

  return 0;
}

function calcularTotalPagamentos(pagamentos: PagamentoMergeRow[]) {
  return pagamentos.reduce((acc, pagamento) => acc + calcularValorPagamento(pagamento), 0);
}

function parseBodyIds(value: unknown) {
  const ids: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      const id = String(item || '').trim();
      if (isUuid(id)) ids.push(id);
    }
    return ids;
  }
  for (const item of String(value || '').split(',')) {
    const id = item.trim();
    if (isUuid(id)) ids.push(id);
  }
  return ids;
}

export async function handleVendasMergePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const textResult = await readTextBodyLimited(event.request, MAX_VENDA_MERGE_BODY_BYTES);
    if (!textResult.ok) return textResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster) {
      ensureModuloAccess(
        scope,
        ['vendas_consulta', 'vendas'],
        3,
        'Sem permissao para editar vendas.'
      );
    }

    const rawBody = textResult.text;
    const body = safeJsonParse(rawBody) as {
      venda_id?: string;
      merge_ids?: unknown;
      company_id?: string;
      empresa_id?: string;
      vendedor_ids?: unknown;
    } | null;

    const vendaId = String(body?.venda_id || '').trim();
    const mergeIds = parseBodyIds(body?.merge_ids).filter((id) => id !== vendaId);

    if (!isUuid(vendaId)) {
      return new Response('venda_id invalido.', { status: 400, headers: NO_STORE_HEADERS });
    }
    if (mergeIds.length === 0) {
      return new Response('merge_ids vazio.', { status: 400, headers: NO_STORE_HEADERS });
    }

    const companyIds = resolveScopedCompanyIds(
      scope,
      body?.company_id || body?.empresa_id || event.url.searchParams.get('empresa_id')
    );

    let vendedorIds = await resolveScopedVendedorIds(
      client,
      scope,
      event.url.searchParams.get('vendedor_ids') || event.url.searchParams.get('vendedor_id')
    );

    const bodyVendedorIds = parseBodyIds(body?.vendedor_ids);
    if (scope.isMaster && bodyVendedorIds.length > 0) {
      vendedorIds = bodyVendedorIds;
    }

    const saleIds = [vendaId, ...mergeIds];

    const salesData: SaleMergeRow[] = [];
    for (const batch of chunkArray(saleIds)) {
      const { data, error: salesError } = await client
        .from('vendas')
        .select(
          'id, vendedor_id, desconto_comercial_aplicado, desconto_comercial_valor, data_embarque, data_final, company_id'
        )
        .in('id', batch);
      if (salesError) throw salesError;
      salesData.push(...((data || []) as SaleMergeRow[]));
    }

    const sales = salesData.filter((item) =>
      isSaleInScope(item, { scope, companyIds, vendedorIds })
    );
    const foundIds = new Set<string>();
    for (const item of sales) {
      foundIds.add(String(item?.id || ''));
    }
    if (saleIds.some((id) => !foundIds.has(id))) {
      return new Response('Vendas invalidas para mescla.', {
        status: 404,
        headers: NO_STORE_HEADERS
      });
    }

    const receiptsData: ReciboMergeRow[] = [];
    const paymentsData: PagamentoMergeRow[] = [];
    for (const batch of chunkArray(saleIds)) {
      const [receiptsResult, paymentsResult] = await Promise.all([
        client
          .from('vendas_recibos')
          .select('id, venda_id, valor_total, valor_taxas, data_inicio, data_fim')
          .in('venda_id', batch),
        client
          .from('vendas_pagamentos')
          .select(
            'id, venda_id, forma_pagamento_id, forma_nome, valor_total, valor_bruto, desconto_valor, parcelas, parcelas_qtd, parcelas_valor, paga_comissao, operacao, plano'
          )
          .in('venda_id', batch)
      ]);
      if (receiptsResult.error) throw receiptsResult.error;
      if (paymentsResult.error) throw paymentsResult.error;
      receiptsData.push(...((receiptsResult.data || []) as ReciboMergeRow[]));
      paymentsData.push(...((paymentsResult.data || []) as PagamentoMergeRow[]));
    }

    const pagamentos = Array.isArray(paymentsData) ? paymentsData : [];
    const { deduped, duplicateIds } = dedupePagamentos(pagamentos, vendaId);

    if (duplicateIds.length > 0) {
      for (const batch of chunkArray(duplicateIds)) {
        const { error: deleteDuplicatePaymentsError } = await client
          .from('vendas_pagamentos')
          .delete()
          .in('id', batch);
        if (deleteDuplicatePaymentsError) throw deleteDuplicatePaymentsError;
      }
    }

    if (mergeIds.length > 0) {
      for (const batch of chunkArray(mergeIds)) {
        const { error: updatePaymentsError } = await client
          .from('vendas_pagamentos')
          .update({ venda_id: vendaId })
          .in('venda_id', batch);
        if (updatePaymentsError) throw updatePaymentsError;

        const { error: updateReceiptNotesError } = await client
          .from('vendas_recibos_notas')
          .update({ venda_id: vendaId })
          .in('venda_id', batch);
        if (updateReceiptNotesError && String(updateReceiptNotesError.code || '') !== '42P01') {
          throw updateReceiptNotesError;
        }

        const { error: updateReceiptsError } = await client
          .from('vendas_recibos')
          .update({ venda_id: vendaId })
          .in('venda_id', batch);
        if (updateReceiptsError) throw updateReceiptsError;

        const { error: updateTripsError } = await client
          .from('viagens')
          .update({ venda_id: vendaId })
          .in('venda_id', batch);
        if (updateTripsError && String(updateTripsError.code || '') !== '42P01') {
          throw updateTripsError;
        }

        const { error: deleteMergedSalesError } = await client
          .from('vendas')
          .delete()
          .in('id', batch);
        if (deleteMergedSalesError) throw deleteMergedSalesError;
      }
    }

    const receipts = Array.isArray(receiptsData) ? receiptsData : [];
    const totalBrutoRecibos = receipts.reduce(
      (acc: number, item) => acc + Number(item?.valor_total || 0),
      0
    );
    const totalTaxasRecibos = receipts.reduce(
      (acc: number, item) => acc + Number(item?.valor_taxas || 0),
      0
    );
    const totalPago = calcularTotalPagamentos(deduped);
    const totalPagoFinal = totalPago > 0 ? totalPago : totalBrutoRecibos;
    const termosNaoComissionaveis = await carregarTermosNaoComissionaveis(client);
    const valorNaoComissionado = deduped.reduce((acc: number, pagamento) => {
      const naoComissiona =
        pagamento?.paga_comissao === false ||
        isFormaNaoComissionavelOuPadrao(pagamento?.forma_nome, termosNaoComissionaveis);
      return naoComissiona ? acc + calcularValorPagamento(pagamento) : acc;
    }, 0);
    const valorComissionavel =
      totalPagoFinal > 0 ? Math.max(0, totalPagoFinal - valorNaoComissionado) : 0;

    const descontoTotal = sales.reduce(
      (acc: number, item) => acc + Number(item?.desconto_comercial_valor || 0),
      0
    );
    const principalSale = sales.find((item) => item?.id === vendaId);
    const dataEmbarque =
      receipts
        .map((item) => String(item?.data_inicio || '').trim())
        .filter(Boolean)
        .sort()[0] ||
      principalSale?.data_embarque ||
      null;
    const datasFim = receipts
      .map((item) => String(item?.data_fim || '').trim())
      .filter(Boolean)
      .sort();
    const dataFinal =
      datasFim.length > 0 ? datasFim[datasFim.length - 1] : principalSale?.data_final || null;

    const updateSaleQuery = client
      .from('vendas')
      .update({
        valor_total_bruto: totalBrutoRecibos || null,
        valor_total_pago: totalPagoFinal || null,
        valor_taxas: totalTaxasRecibos || null,
        valor_nao_comissionado: valorNaoComissionado || null,
        valor_total: valorComissionavel || null,
        desconto_comercial_aplicado: descontoTotal > 0,
        desconto_comercial_valor: descontoTotal || null,
        data_embarque: dataEmbarque,
        data_final: dataFinal
      })
      .eq('id', vendaId);

    const { error: updateSaleError } = await updateSaleQuery;
    if (updateSaleError) throw updateSaleError;

    invalidateSalesReadModels();
    registrarLog(event, {
      userId: user.id,
      modulo: 'Vendas',
      acao: 'vendas_mescladas',
      detalhes: {
        venda_principal_id: vendaId,
        vendas_mescladas: mergeIds,
        pagamentos_duplicados_removidos: duplicateIds.length
      }
    });
    return json(
      {
        ok: true,
        removed_pagamentos: duplicateIds.length,
        total_bruto: totalBrutoRecibos,
        total_taxas: totalTaxasRecibos
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao mesclar vendas.');
  }
}
