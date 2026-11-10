// Migrado para Hono de src/routes/api/v1/agenda/delete/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { ensureAgendaAccess } from '$lib/server/agenda';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';

export async function handleAgendaDeleteDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    ensureAgendaAccess(scope, 4, 'Sem permissao para excluir agenda.');

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id)) {
      return json({ error: 'Evento inválido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { data: existing, error: existingError } = await client
      .from('agenda_itens')
      .select('id, user_id, tipo')
      .eq('id', id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing || existing.tipo !== 'evento') {
      return json({ error: 'Evento nao encontrado.' }, { status: 404, headers: NO_STORE_HEADERS });
    }

    if (!scope.isAdmin && String(existing.user_id || '') !== user.id) {
      return json(
        { error: 'Sem acesso a este evento.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const { error } = await client.from('agenda_itens').delete().eq('id', id);
    if (error) throw error;

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir evento.');
  }
}
