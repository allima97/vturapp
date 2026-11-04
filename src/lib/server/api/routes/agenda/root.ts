// Migrado para Hono de src/routes/api/v1/agenda/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  buildAgendaRangeParams,
  buildAgendaOverlapFilter,
  ensureAgendaAccess,
  isIsoDate,
  mapAgendaRowToEvent
} from '$lib/server/agenda';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';

export async function handleAgendaGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    ensureAgendaAccess(scope, 1, 'Sem acesso a Agenda.');

    const { inicio, fim } = buildAgendaRangeParams(event.url.searchParams);
    if ((inicio || fim) && (!isIsoDate(inicio) || !isIsoDate(fim))) {
      return json(
        { error: 'inicio e fim devem estar no formato YYYY-MM-DD.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    let query = client
      .from('agenda_itens')
      .select('id, titulo, descricao, start_date, end_date, start_at, end_at, all_day')
      .eq('tipo', 'evento')
      .eq('user_id', user.id)
      .order('start_date', { ascending: true });

    if (inicio && fim) {
      query = query.or(buildAgendaOverlapFilter(inicio, fim));
    }

    const { data, error } = await query;
    if (error) throw error;

    const items = [];
    for (const row of data || []) {
      const item = mapAgendaRowToEvent(row);
      if (item) items.push(item);
    }

    return json(
      {
        items
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar agenda.');
  }
}
