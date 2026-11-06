// Migrado para Hono de src/routes/api/v1/vendas/merge-candidates/+server.ts — corpo IDÊNTICO ao original
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
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { fetchSaleForScope } from '$lib/server/salesScope';
import { chunkArray, QUERY_IN_BATCH_SIZE, uniqueCleanStrings } from '$lib/utils/array';

type MergeCandidateSaleRow = {
  id?: string | null;
  vendedor_id?: string | null;
  cliente_id?: string | null;
  destino_id?: string | null;
  destino_cidade_id?: string | null;
  company_id?: string | null;
  data_lancamento?: string | null;
  data_venda?: string | null;
  data_embarque?: string | null;
  data_final?: string | null;
  valor_total?: number | string | null;
  clientes?: { nome?: string | null } | null;
  destinos?: { nome?: string | null; cidade_id?: string | null } | null;
  destino_cidade?: { id?: string | null; nome?: string | null } | null;
  vendedor?: { nome_completo?: string | null } | null;
};

type MergeCandidateReceiptRow = {
  venda_id?: string | null;
  numero_recibo?: string | null;
};

export async function handleVendasMergeCandidatesGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster) {
      ensureModuloAccess(scope, ['vendas_consulta', 'vendas'], 1, 'Sem permissao para ver vendas.');
    }

    const vendaId = String(event.url.searchParams.get('venda_id') || '').trim();
    if (!isUuid(vendaId)) {
      return new Response('venda_id invalido.', { status: 400, headers: NO_STORE_HEADERS });
    }

    const companyIds = resolveScopedCompanyIds(
      scope,
      event.url.searchParams.get('company_id') || event.url.searchParams.get('empresa_id')
    );
    const requestedVendedorIds = await resolveScopedVendedorIds(
      client,
      scope,
      event.url.searchParams.get('vendedor_ids') || event.url.searchParams.get('vendedor_id')
    );
    const shouldApplySellerScope = !scope.isGestor && !scope.isMaster && !scope.isFinanceiro;

    const companyScopeSet = new Set(companyIds);

    const currentSale = await fetchSaleForScope({
      client,
      scope,
      saleId: vendaId,
      companyIds,
      vendedorIds: requestedVendedorIds,
      extraSelect: 'cliente_id'
    });
    if (!currentSale) {
      return new Response('Venda nao encontrada.', { status: 404, headers: NO_STORE_HEADERS });
    }
    const currentVendedorId = String(currentSale.vendedor_id || '').trim();
    if (
      scope.isMaster &&
      requestedVendedorIds.length > 0 &&
      !requestedVendedorIds.includes(currentVendedorId)
    ) {
      return json({ items: [] }, { headers: DYNAMIC_READ_HEADERS });
    }

    let query = client
      .from('vendas')
      .select(
        `
        id,
        vendedor_id,
        cliente_id,
        destino_id,
        destino_cidade_id,
        company_id,
        data_lancamento,
        data_venda,
        data_embarque,
        data_final,
        valor_total,
        clientes (nome),
        destinos:produtos!destino_id (nome, cidade_id),
        destino_cidade:cidades!destino_cidade_id (id, nome),
        vendedor:users!vendedor_id (nome_completo)
      `
      )
      .eq('cliente_id', String(currentSale.cliente_id || ''))
      .eq('vendedor_id', currentVendedorId)
      .neq('id', currentSale.id)
      .order('data_venda', { ascending: false });

    if (companyIds.length > 0 && companyIds.length <= QUERY_IN_BATCH_SIZE) {
      query = query.in('company_id', companyIds);
    }

    const { data: salesData, error: salesError } = await query;
    if (salesError) throw salesError;

    const scopedSalesData = ((salesData || []) as MergeCandidateSaleRow[]).filter((row) => {
      if (companyIds.length === 0 || companyIds.length <= QUERY_IN_BATCH_SIZE) return true;
      return companyScopeSet.has(String(row?.company_id || '').trim());
    });

    const saleIds = scopedSalesData.map((row) => String(row?.id || '').trim()).filter(Boolean);

    const receiptsBySale = new Map<string, string[]>();
    if (saleIds.length > 0) {
      const receiptsData: MergeCandidateReceiptRow[] = [];
      for (const batch of chunkArray(saleIds)) {
        const { data, error: receiptsError } = await client
          .from('vendas_recibos')
          .select('venda_id, numero_recibo')
          .in('venda_id', batch)
          .order('numero_recibo', { ascending: true });
        if (receiptsError) throw receiptsError;
        receiptsData.push(...(data || []));
      }

      for (const row of receiptsData) {
        const refSaleId = String(row?.venda_id || '').trim();
        const numeroRecibo = String(row?.numero_recibo || '').trim();
        if (!refSaleId || !numeroRecibo) continue;
        const current = receiptsBySale.get(refSaleId) || [];
        current.push(numeroRecibo);
        receiptsBySale.set(refSaleId, current);
      }
    }

    const items = scopedSalesData.map((row) => {
      const numerosRecibo = uniqueCleanStrings(receiptsBySale.get(String(row?.id || '')) || []);
      const cidadeId = row?.destino_cidade_id || row?.destinos?.cidade_id || '';
      return {
        id: row.id,
        vendedor_id: row.vendedor_id,
        vendedor_nome: row?.vendedor?.nome_completo || '',
        cliente_id: row.cliente_id,
        destino_id: row.destino_id,
        destino_cidade_id: cidadeId,
        company_id: row.company_id,
        data_lancamento: row.data_lancamento,
        data_venda: row.data_venda,
        data_embarque: row.data_embarque,
        data_final: row.data_final,
        valor_total: row.valor_total,
        cliente_nome: row?.clientes?.nome || '',
        destino_nome: row?.destinos?.nome || '',
        destino_cidade_nome: row?.destino_cidade?.nome || '',
        numero_recibo_principal: numerosRecibo[0] || null,
        numeros_recibo: numerosRecibo
      };
    });

    return json({ items }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar vendas para mesclar.');
  }
}
