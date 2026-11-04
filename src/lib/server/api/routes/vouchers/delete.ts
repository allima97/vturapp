// Migrado para Hono de src/routes/api/v1/vouchers/delete/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';

export async function handleVouchersDeleteDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    // Verifica escopo
    const { data: voucher } = await client
      .from('vouchers')
      .select('id, company_id')
      .eq('id', id)
      .maybeSingle();
    if (!voucher)
      return json({ error: 'Voucher não encontrado.' }, { status: 404, headers: NO_STORE_HEADERS });
    if (!scope.isAdmin && voucher.company_id !== scope.companyId) {
      return json({ error: 'Voucher fora do escopo.' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const { error: deleteError } = await client.from('vouchers').delete().eq('id', id);
    if (deleteError) throw deleteError;

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir voucher.');
  }
}
