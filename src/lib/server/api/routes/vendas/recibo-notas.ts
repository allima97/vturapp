// Migrado para Hono de src/routes/api/v1/vendas/recibo-notas/+server.ts — corpo IDÊNTICO ao original
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
import { fetchSaleForScope } from '$lib/server/salesScope';

export async function handleVendasReciboNotasGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster) {
      ensureModuloAccess(scope, ['vendas_consulta', 'vendas'], 1, 'Sem acesso a Vendas.');
    }

    const vendaId = String(event.url.searchParams.get('venda_id') || '').trim();
    if (!isUuid(vendaId)) {
      return new Response('venda_id invalido.', { status: 400, headers: NO_STORE_HEADERS });
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

    const { data, error } = await client
      .from('vendas_recibos_notas')
      .select('recibo_id, notas')
      .eq('venda_id', vendaId);
    if (error && String(error.code || '') !== '42P01') throw error;

    return json({ items: data || [] }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar notas de recibo.');
  }
}
