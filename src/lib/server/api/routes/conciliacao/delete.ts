// Migrado para Hono de src/routes/api/v1/conciliacao/delete/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler e caminhos de import relativos mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { rejectCrossOriginRequest, rejectLargePayload } from '$lib/server/requestGuards';
import { invalidateSalesReadModels } from '$lib/server/readModelCache';

const MAX_CONCILIACAO_DELETE_BODY_BYTES = 4 * 1024;

export async function handleConciliacaoDeleteDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const payloadError = rejectLargePayload(event.request, MAX_CONCILIACAO_DELETE_BODY_BYTES);
    if (payloadError) return payloadError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster && !scope.isFinanceiro && !scope.isGestor) {
      ensureModuloAccess(scope, ['operacao_conciliacao', 'conciliacao'], 4, 'Sem permissão para excluir registros de conciliação.');
    }

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id)) return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const companyIds = resolveScopedCompanyIds(scope, null);
    // Verifica escopo
    const { data: registro } = await client
      .from('conciliacao_recibos')
      .select('id, company_id')
      .eq('id', id)
      .maybeSingle();

    if (!registro) return json({ error: 'Registro não encontrado.' }, { status: 404, headers: NO_STORE_HEADERS });
    if (!scope.isAdmin && (!registro.company_id || companyIds.length === 0 || !companyIds.includes(registro.company_id))) {
      return json({ error: 'Registro fora do escopo.' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const { error: deleteError } = await client.from('conciliacao_recibos').delete().eq('id', id);
    if (deleteError) throw deleteError;

    invalidateSalesReadModels({ companyIds: [registro.company_id], userId: user.id });
    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir registro de conciliação.');
  }
}
