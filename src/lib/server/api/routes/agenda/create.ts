// Migrado para Hono de src/routes/api/v1/agenda/create/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { ensureAgendaAccess, isIsoDate } from '$lib/server/agenda';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveScopedCompanyId,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';

function normalizePayload(body: Record<string, unknown>) {
  const titulo = String(body?.titulo || body?.title || '').trim();
  const startDate = String(body?.start_date || body?.data_inicio || '').trim();
  const endDate = String(body?.end_date || body?.data_fim || startDate).trim() || startDate;
  const startAt = String(body?.start_at || '').trim() || null;
  const endAt = String(body?.end_at || '').trim() || null;
  const allDay =
    body?.all_day !== undefined
      ? Boolean(body.all_day)
      : body?.allDay !== undefined
        ? Boolean(body.allDay)
        : !startAt;

  return {
    titulo,
    startDate,
    endDate,
    startAt,
    endAt,
    allDay,
    descricao: String(body?.descricao || '').trim() || null
  };
}

const MAX_AGENDA_CREATE_BODY_BYTES = 32 * 1024;

export async function handleAgendaCreatePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_AGENDA_CREATE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    ensureAgendaAccess(scope, 2, 'Sem permissao para criar eventos.');

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};
    const payload = normalizePayload(body);

    if (!payload.titulo) {
      return json({ error: 'titulo obrigatorio.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    if (!isIsoDate(payload.startDate) || !isIsoDate(payload.endDate)) {
      return json(
        { error: 'start_date e end_date devem estar no formato YYYY-MM-DD.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const requestedCompanyId = String(body?.company_id || body?.empresa_id || '').trim();
    const companyId = scope.isAdmin
      ? isUuid(requestedCompanyId)
        ? requestedCompanyId
        : null
      : resolveScopedCompanyId(scope, requestedCompanyId || null);

    if (!scope.isAdmin && !companyId) {
      return json(
        {
          error: requestedCompanyId
            ? 'Empresa fora do escopo.'
            : 'Empresa não identificada para criar evento.'
        },
        { status: requestedCompanyId ? 403 : 400, headers: NO_STORE_HEADERS }
      );
    }

    const insertData = {
      tipo: 'evento',
      titulo: payload.titulo,
      descricao: payload.descricao,
      start_date: payload.startDate,
      end_date: payload.endDate,
      start_at: payload.startAt,
      end_at: payload.endAt,
      all_day: payload.allDay,
      user_id: user.id,
      company_id: companyId
    };

    const { data, error } = await client
      .from('agenda_itens')
      .insert(insertData)
      .select('id, titulo, descricao, start_date, end_date, start_at, end_at, all_day')
      .single();

    if (error) throw error;

    return json({ ok: true, item: data }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao criar evento.');
  }
}
