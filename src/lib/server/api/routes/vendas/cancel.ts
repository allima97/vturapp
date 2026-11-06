// Migrado para Hono de src/routes/api/v1/vendas/cancel/+server.ts — corpo IDÊNTICO ao original
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
import { getPlatformExecutionContext, triggerRebuildAsync } from '$lib/server/readModelRebuild';
import { publishKvInvalidationAsync } from '$lib/server/kvInvalidation';
import { fetchSaleForScope } from '$lib/server/salesScope';
import { safeJsonParse } from '$lib/utils/json';

const MAX_VENDA_CANCEL_BODY_BYTES = 8 * 1024;

export async function handleVendasCancelPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const textResult = await readTextBodyLimited(event.request, MAX_VENDA_CANCEL_BODY_BYTES);
    if (!textResult.ok) return textResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster) {
      ensureModuloAccess(
        scope,
        ['vendas_consulta', 'vendas'],
        4,
        'Sem permissao para cancelar vendas.'
      );
    }

    const rawBody = textResult.text;
    const body = safeJsonParse(rawBody) as { venda_id?: string } | null;
    const vendaId = String(body?.venda_id || '').trim();

    if (!isUuid(vendaId)) {
      return new Response('venda_id invalido.', { status: 400, headers: NO_STORE_HEADERS });
    }

    const companyIds = resolveScopedCompanyIds(
      scope,
      event.url.searchParams.get('empresa_id') || event.url.searchParams.get('company_id')
    );
    const vendedorIds = await resolveScopedVendedorIds(
      client,
      scope,
      event.url.searchParams.get('vendedor_id') || event.url.searchParams.get('vendedor_ids')
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

    // Exclui os recibos da venda antes de cancelar, liberando os números
    // para que possam ser reimportados sem conflito de duplicidade.
    const { error: recibosDeleteError } = await client
      .from('vendas_recibos')
      .delete()
      .eq('venda_id', vendaId);
    if (recibosDeleteError) throw recibosDeleteError;

    // Soft-delete: vendas.cancelada boolean NOT NULL DEFAULT false
    const cancelQuery = client
      .from('vendas')
      .update({ cancelada: true })
      .eq('id', vendaId)
      .eq('company_id', saleCompanyId);

    const { error: cancelError } = await cancelQuery;
    if (cancelError) throw cancelError;

    invalidateSalesReadModels();

    const saleCompanyIds = isUuid(saleCompanyId) ? [saleCompanyId] : [];

    // Reconstruir read model de ranking de forma assíncrona (fire-and-forget)
    triggerRebuildAsync({
      companyIds: saleCompanyIds,
      executionContext: getPlatformExecutionContext(event.platform)
    });

    // Publicar invalidação no KV para propagar para outras instâncias Workers (fire-and-forget)
    publishKvInvalidationAsync({ companyIds: saleCompanyIds });

    registrarLog(event, {
      userId: user.id,
      modulo: 'Vendas',
      acao: 'venda_cancelada',
      detalhes: { id: vendaId }
    });

    return json({ ok: true, cancelled: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao cancelar venda.');
  }
}
