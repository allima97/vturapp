// Migrado para Hono de src/routes/api/v1/preferencias/share/+server.ts — corpo IDÊNTICO ao original
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

const MAX_PREFERENCIAS_SHARE_BODY_BYTES = 16 * 1024;

export async function handlePreferenciasSharePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const textResult = await readTextBodyLimited(event.request, MAX_PREFERENCIAS_SHARE_BODY_BYTES);
    if (!textResult.ok) return textResult.response;

    const { client, user, scope } = await requirePreferenciasScope(event, 3);
    const companyId = scope.companyId;
    if (!companyId) return buildNoStoreTextResponse('Empresa inválida.', 400);

    const rawBody = textResult.text;
    if (rawBody.length > MAX_PREFERENCIAS_SHARE_BODY_BYTES) {
      return buildNoStoreTextResponse('Payload muito grande.', 413);
    }
    const parsedBody = safeJsonParse(rawBody);
    const body =
      parsedBody && typeof parsedBody === 'object' ? (parsedBody as Record<string, unknown>) : {};
    const preferenciaId = String(body?.preferencia_id || '').trim();
    const sharedWith = String(body?.shared_with || '').trim();

    if (!isUuid(preferenciaId)) return buildNoStoreTextResponse('preferencia_id invalido.', 400);
    if (!isUuid(sharedWith)) return buildNoStoreTextResponse('shared_with invalido.', 400);
    if (sharedWith === user.id)
      return buildNoStoreTextResponse('Não é possível compartilhar com você mesmo.', 400);

    let preferenciaQuery = client
      .from('minhas_preferencias')
      .select('id, company_id, created_by')
      .eq('id', preferenciaId)
      .eq('company_id', companyId);
    if (!scope.isAdmin) preferenciaQuery = preferenciaQuery.eq('created_by', user.id);

    const { data: preferencia, error: prefError } = await preferenciaQuery.maybeSingle();
    if (prefError) throw prefError;
    if (!preferencia) return buildNoStoreTextResponse('Preferência não encontrada.', 404);

    const { data: targetUser, error: targetError } = await client
      .from('users')
      .select('id, company_id, active')
      .eq('id', sharedWith)
      .eq('company_id', companyId)
      .eq('active', true)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!targetUser) return buildNoStoreTextResponse('Usuário fora do escopo da empresa.', 403);

    const payload = {
      company_id: companyId,
      preferencia_id: preferenciaId,
      shared_by: user.id,
      shared_with: sharedWith,
      status: 'pending',
      accepted_at: null,
      revoked_at: null
    };

    const { data, error } = await client
      .from('minhas_preferencias_shares')
      .upsert(payload, { onConflict: 'preferencia_id,shared_with' })
      .select(
        'id, preferencia_id, shared_by, shared_with, status, created_at, accepted_at, revoked_at'
      )
      .single();
    if (error) throw error;

    invalidatePreferenceReadModels({
      companyIds: [companyId],
      userId: user.id
    });
    invalidatePreferenceReadModels({
      companyIds: [companyId],
      userId: sharedWith
    });
    return buildNoStoreJsonResponse({ ok: true, share: data });
  } catch (err) {
    logServerError('[preferencias/share] falha ao compartilhar preferencia', err);
    return buildNoStoreTextResponse('Erro ao compartilhar preferência.', 500);
  }
}
