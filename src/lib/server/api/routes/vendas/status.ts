// Migrado de src/routes/api/v1/vendas/status/+server.ts — corpo IDÊNTICO ao original.
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
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { invalidateSalesReadModels } from '$lib/server/readModelCache';
import { fetchSaleForScope } from '$lib/server/salesScope';

const MAX_VENDA_STATUS_BODY_BYTES = 8 * 1024;

type JsonObject = Record<string, unknown>;

export async function handleVendasStatusPatch(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_VENDA_STATUS_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

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

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!id || !isUuid(id)) {
      return json(
        { success: false, error: 'ID invalido.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object' ? (bodyResult.data as JsonObject) : {};
    const newStatus = String(body?.status || '').trim();
    if (!newStatus) {
      return json(
        { success: false, error: 'Status obrigatorio.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const companyIds = resolveScopedCompanyIds(scope, event.url.searchParams.get('empresa_id'));
    const vendedorIds = await resolveScopedVendedorIds(
      client,
      scope,
      event.url.searchParams.get('vendedor_id')
    );
    // ✅ Confirma ownership antes de atualizar
    const sale = await fetchSaleForScope({ client, scope, saleId: id, companyIds, vendedorIds });
    if (!sale) {
      return json(
        { success: false, error: 'Venda nao encontrada.' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    const saleCompanyId = String(sale.company_id || '').trim();

    const updateQuery = client
      .from('vendas')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', saleCompanyId);

    const { data, error } = await updateQuery.select('id, status, updated_at').single();
    if (error) throw error;

    invalidateSalesReadModels();
    return json({ success: true, item: data }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao atualizar status da venda.');
  }
}
