// Migrado para Hono de src/routes/api/v1/roteiros/delete/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import { rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  ensureModuloAccess,
  toErrorResponse,
  isUuid
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';

export async function handleRoteirosDeleteDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    ensureModuloAccess(scope, ['Orcamentos'], 4, 'Sem acesso para excluir Roteiros.');

    const id = event.url.searchParams.get('id') || '';
    if (!id || !isUuid(id))
      return json({ error: 'ID invalido.' }, { status: 400, headers: NO_STORE_HEADERS });

    // Verifica ownership
    let roteiroQuery = client.from('roteiro_personalizado').select('id').eq('id', id);
    if (!scope.isAdmin && !scope.isGestor && !scope.isMaster) {
      roteiroQuery = roteiroQuery.eq('created_by', scope.userId);
    } else if (scope.companyId && !scope.isAdmin && !scope.isMaster) {
      roteiroQuery = roteiroQuery.eq('company_id', scope.companyId);
    }

    const { data: roteiro, error: findErr } = await roteiroQuery.maybeSingle();

    if (findErr) throw findErr;
    if (!roteiro)
      return json({ error: 'Roteiro nao encontrado.' }, { status: 404, headers: NO_STORE_HEADERS });

    const { error } = await client.from('roteiro_personalizado').delete().eq('id', id);

    if (error) throw error;

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir roteiro.');
  }
}
