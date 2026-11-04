// Migrado para Hono de src/routes/api/v1/vendas/recibo-principal/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler mudou). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
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
import { fetchSaleForScope } from '$lib/server/salesScope';
import { safeJsonParse } from '$lib/utils/json';

const MAX_RECIBO_PRINCIPAL_BODY_BYTES = 16 * 1024;

export async function handleVendasReciboPrincipalPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const textResult = await readTextBodyLimited(event.request, MAX_RECIBO_PRINCIPAL_BODY_BYTES);
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
    const body = safeJsonParse(rawBody) as { venda_id?: string; recibo_id?: string } | null;
    const vendaId = String(body?.venda_id || '').trim();
    const reciboId = String(body?.recibo_id || '').trim();
    if (!isUuid(vendaId) || !isUuid(reciboId)) {
      return new Response('venda_id ou recibo_id invalido.', {
        status: 400,
        headers: NO_STORE_HEADERS
      });
    }

    const companyIds = resolveScopedCompanyIds(
      scope,
      event.url.searchParams.get('company_id') || event.url.searchParams.get('empresa_id')
    );
    const vendedorIds = await resolveScopedVendedorIds(
      client,
      scope,
      event.url.searchParams.get('vendedor_ids') || event.url.searchParams.get('vendedor_id')
    );
    const sale = await fetchSaleForScope({
      client,
      scope,
      saleId: vendaId,
      companyIds,
      vendedorIds
    });
    if (!sale) {
      return new Response('Venda nao encontrada.', { status: 404, headers: NO_STORE_HEADERS });
    }
    const saleCompanyId = String(sale.company_id || '').trim();

    const { data: receipt, error: receiptError } = await client
      .from('vendas_recibos')
      .select('id, venda_id, produto_resolvido_id')
      .eq('id', reciboId)
      .eq('venda_id', vendaId)
      .maybeSingle();
    if (receiptError) throw receiptError;
    if (!receipt) {
      return new Response('Recibo nao encontrado.', { status: 404, headers: NO_STORE_HEADERS });
    }

    const produtoResolvidoId = String(
      (receipt as { produto_resolvido_id?: string | null })?.produto_resolvido_id || ''
    ).trim();
    if (!isUuid(produtoResolvidoId)) {
      return new Response('Recibo sem produto valido para definir como principal.', {
        status: 400,
        headers: NO_STORE_HEADERS
      });
    }

    const updateQuery = client
      .from('vendas')
      .update({ destino_id: produtoResolvidoId })
      .eq('id', vendaId)
      .eq('company_id', saleCompanyId);

    const { data: updated, error: updateError } = await updateQuery
      .select('id, destino_id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated?.id) {
      return new Response('Nao foi possivel atualizar o recibo principal.', {
        status: 403,
        headers: NO_STORE_HEADERS
      });
    }

    invalidateSalesReadModels();
    registrarLog(event, {
      userId: user.id,
      modulo: 'Vendas',
      acao: 'recibo_principal_atualizado',
      detalhes: { venda_id: vendaId, recibo_id: reciboId, produto_resolvido_id: produtoResolvidoId }
    });
    return json(
      {
        ok: true,
        venda_id: vendaId,
        recibo_id: reciboId,
        destino_id: produtoResolvidoId
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao atualizar recibo principal.');
  }
}
