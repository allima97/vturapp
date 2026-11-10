// Migrado para Hono de src/routes/api/v1/vendas/recibo-delete/+server.ts — corpo IDÊNTICO ao original
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
import { getPlatformExecutionContext, triggerRebuildAsync } from '$lib/server/readModelRebuild';
import { publishKvInvalidationAsync } from '$lib/server/kvInvalidation';
import { fetchSaleForScope } from '$lib/server/salesScope';
import { safeJsonParse } from '$lib/utils/json';

const MAX_RECIBO_DELETE_BODY_BYTES = 16 * 1024;

export async function handleVendasReciboDeletePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const textResult = await readTextBodyLimited(event.request, MAX_RECIBO_DELETE_BODY_BYTES);
    if (!textResult.ok) return textResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster) {
      ensureModuloAccess(
        scope,
        ['vendas_consulta', 'vendas'],
        4,
        'Sem permissao para excluir recibos.'
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

    const { error } = await client
      .from('vendas_recibos')
      .delete()
      .eq('id', reciboId)
      .eq('venda_id', vendaId);
    if (error) throw error;

    invalidateSalesReadModels();

    const scopedCompanyIds = companyIds.filter(Boolean) as string[];

    // Reconstruir read model de ranking de forma assíncrona (fire-and-forget)
    triggerRebuildAsync({
      companyIds: scopedCompanyIds,
      executionContext: getPlatformExecutionContext(event.platform)
    });

    // Publicar invalidação no KV para propagar para outras instâncias Workers (fire-and-forget)
    publishKvInvalidationAsync({ companyIds: scopedCompanyIds });

    registrarLog(event, {
      userId: user.id,
      modulo: 'Vendas',
      acao: 'recibo_excluido',
      detalhes: { venda_id: vendaId, recibo_id: reciboId }
    });

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir recibo.');
  }
}
