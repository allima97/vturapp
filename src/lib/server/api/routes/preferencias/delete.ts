// Migrado para Hono de src/routes/api/v1/preferencias/delete/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { isUuid } from '$lib/server/v1';
import { readTextBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  buildNoStoreJsonResponse,
  buildNoStoreTextResponse,
  logServerError,
  requirePreferenciasScope,
  safeJsonParse
} from '../../../../../routes/api/v1/preferencias/_shared';
import { invalidatePreferenceReadModels } from '$lib/server/readModelCache';

const MAX_PREFERENCIAS_DELETE_BODY_BYTES = 8 * 1024;

export async function handlePreferenciasDeletePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const textResult = await readTextBodyLimited(event.request, MAX_PREFERENCIAS_DELETE_BODY_BYTES);
    if (!textResult.ok) return textResult.response;

    const { client, user, scope } = await requirePreferenciasScope(event, 4);
    const rawBody = textResult.text;
    if (rawBody.length > MAX_PREFERENCIAS_DELETE_BODY_BYTES) {
      return buildNoStoreTextResponse('Payload muito grande.', 413);
    }
    const parsedBody = safeJsonParse(rawBody);
    const body =
      parsedBody && typeof parsedBody === 'object' ? (parsedBody as Record<string, unknown>) : {};
    const id = String(body?.id || '').trim();
    if (!isUuid(id)) return buildNoStoreTextResponse('id invalido.', 400);

    let query = client.from('minhas_preferencias').delete().eq('id', id);
    if (!scope.isAdmin) query = query.eq('created_by', user.id);

    const { data, error } = await query.select('id').maybeSingle();
    if (error) throw error;
    if (!data) return buildNoStoreTextResponse('Preferência não encontrada.', 404);

    invalidatePreferenceReadModels({
      companyIds: scope.companyId ? [scope.companyId] : [],
      userId: user.id
    });
    return buildNoStoreJsonResponse({ ok: true });
  } catch (err) {
    logServerError('[preferencias/delete] falha ao excluir preferencia', err);
    return buildNoStoreTextResponse('Erro ao excluir preferência.', 500);
  }
}
