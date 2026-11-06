// Migrado para Hono de src/routes/api/v1/preferencias/share-accept/+server.ts — corpo IDÊNTICO ao original
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

const MAX_PREFERENCIAS_SHARE_ACCEPT_BODY_BYTES = 8 * 1024;

export async function handlePreferenciasShareAcceptPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const textResult = await readTextBodyLimited(
      event.request,
      MAX_PREFERENCIAS_SHARE_ACCEPT_BODY_BYTES
    );
    if (!textResult.ok) return textResult.response;

    const { client, user, scope } = await requirePreferenciasScope(event, 1);
    const rawBody = textResult.text;
    if (rawBody.length > MAX_PREFERENCIAS_SHARE_ACCEPT_BODY_BYTES) {
      return buildNoStoreTextResponse('Payload muito grande.', 413);
    }
    const parsedBody = safeJsonParse(rawBody);
    const body =
      parsedBody && typeof parsedBody === 'object' ? (parsedBody as Record<string, unknown>) : {};
    const shareId = String(body?.share_id || '').trim();
    if (!isUuid(shareId)) return buildNoStoreTextResponse('share_id invalido.', 400);

    const { data, error } = await client
      .from('minhas_preferencias_shares')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        revoked_at: null
      })
      .eq('id', shareId)
      .eq('shared_with', user.id)
      .select('id, company_id, shared_by, shared_with, status, accepted_at')
      .maybeSingle();
    if (error) throw error;
    if (!data) return buildNoStoreTextResponse('Convite não encontrado.', 404);

    const companyIds = data.company_id
      ? [String(data.company_id)]
      : scope.companyId
        ? [scope.companyId]
        : [];
    invalidatePreferenceReadModels({ companyIds, userId: user.id });
    invalidatePreferenceReadModels({
      companyIds,
      userId: String(data.shared_by || '')
    });
    return buildNoStoreJsonResponse({ ok: true, share: data });
  } catch (err) {
    logServerError('[preferencias/share-accept] falha ao aceitar compartilhamento', err);
    return buildNoStoreTextResponse('Erro ao aceitar compartilhamento.', 500);
  }
}
