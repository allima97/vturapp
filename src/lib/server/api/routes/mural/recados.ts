// Migrado para Hono de src/routes/api/v1/mural/recados/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import {
  assertCompanyAccess,
  fetchRecados,
  noStoreJsonResponse,
  noStoreTextResponse,
  privateJsonResponse,
  requireMuralScope
} from '../../../../../routes/api/v1/mural/_shared';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { isUuid, logServerError } from '$lib/server/v1';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  invalidateMuralReadModels,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';

const MAX_MURAL_RECADO_BODY_BYTES = 64 * 1024;

type MuralRecadoBody = {
  company_id?: unknown;
  receiver_id?: unknown;
  conteudo?: unknown;
  assunto?: unknown;
};

function readMuralRecadoBody(value: unknown): MuralRecadoBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const body = value as Record<string, unknown>;
  return {
    company_id: body.company_id,
    receiver_id: body.receiver_id,
    conteudo: body.conteudo,
    assunto: body.assunto
  };
}

export async function handleMuralRecadosGet(event: RequestEvent) {
  try {
    const companyId = String(event.url.searchParams.get('company_id') || '').trim();
    if (!companyId) return noStoreTextResponse('company_id obrigatorio.', 400);

    const { client, user, scope } = await requireMuralScope(event);
    const denied = await assertCompanyAccess(client, scope, companyId);
    if (denied) return denied;

    const payload = await getCachedReadModel({
      key: buildReadModelCacheKey('mural:recados', {
        userId: user.id,
        companyId
      }),
      tags: [
        READ_MODEL_TAGS.mural,
        ...scopeCacheTags({ userId: user.id, companyIds: [companyId] })
      ],
      ttlMs: 30_000,
      staleTtlMs: 120_000,
      loader: async () => {
        const recadosResp = await fetchRecados(client, companyId);
        return {
          recados: recadosResp.recados,
          supportsAttachments: recadosResp.supportsAttachments
        };
      }
    });

    return privateJsonResponse(payload);
  } catch (e: unknown) {
    logServerError('[mural/recados] falha ao carregar recados', e);
    return noStoreTextResponse('Erro ao carregar recados.', 500);
  }
}

export async function handleMuralRecadosPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_MURAL_RECADO_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const { client, scope } = await requireMuralScope(event, 2);
    const body = readMuralRecadoBody(bodyResult.data);

    const rawCompanyId = String(body?.company_id || '').trim();
    const companyId = rawCompanyId || String(scope.companyId || '').trim();
    if (!companyId) return noStoreTextResponse('company_id obrigatorio.', 400);

    const denied = await assertCompanyAccess(client, scope, companyId);
    if (denied) return denied;

    const receiverId = String(body?.receiver_id || '').trim();
    const conteudo = String(body?.conteudo || '')
      .trim()
      .slice(0, 4000);
    const assunto = String(body?.assunto || '')
      .trim()
      .slice(0, 160);

    if (!conteudo) return noStoreTextResponse('Conteúdo obrigatório.', 400);
    if (receiverId && !isUuid(receiverId))
      return noStoreTextResponse('Destinatário inválido.', 400);

    if (receiverId) {
      const { data: receiver, error: receiverError } = await client
        .from('users')
        .select('id, company_id, active')
        .eq('id', receiverId)
        .eq('company_id', companyId)
        .eq('active', true)
        .maybeSingle();
      if (receiverError) throw receiverError;
      if (!receiver) return noStoreTextResponse('Destinatário fora do escopo da empresa.', 403);
    }

    const payload = {
      company_id: companyId,
      sender_id: scope.userId,
      receiver_id: receiverId || null,
      assunto: assunto || null,
      conteudo,
      sender_deleted: false,
      receiver_deleted: false
    };

    const { data, error } = await client
      .from('mural_recados')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw error;

    invalidateMuralReadModels({
      companyIds: [companyId],
      userId: scope.userId
    });
    if (receiverId)
      invalidateMuralReadModels({
        companyIds: [companyId],
        userId: receiverId
      });
    return noStoreJsonResponse({ ok: true, id: data?.id || null });
  } catch (e: unknown) {
    logServerError('[mural/recados] falha ao enviar recado', e);
    return noStoreTextResponse('Erro ao enviar recado.', 500);
  }
}

export async function handleMuralRecadosDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id)) return noStoreTextResponse('ID inválido.', 400);

    const { client, scope } = await requireMuralScope(event, 2);
    const { data: recado, error } = await client
      .from('mural_recados')
      .select('id, company_id, sender_id, receiver_id')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!recado) return noStoreTextResponse('Recado não encontrado.', 404);

    const denied = await assertCompanyAccess(client, scope, String(recado.company_id || '').trim());
    if (denied) return denied;

    const isSender = recado.sender_id === scope.userId;
    const isReceiver = recado.receiver_id === scope.userId;

    if (!isSender && !isReceiver && !scope.isAdmin) {
      return noStoreTextResponse('Sem permissão para excluir este recado.', 403);
    }

    if (scope.isAdmin && !isSender && !isReceiver) {
      const { error: deleteError } = await client.from('mural_recados').delete().eq('id', id);
      if (deleteError) throw deleteError;
    } else {
      const update = isSender ? { sender_deleted: true } : { receiver_deleted: true };
      const { error: updateError } = await client.from('mural_recados').update(update).eq('id', id);
      if (updateError) throw updateError;
    }

    const companyId = String(recado.company_id || '').trim();
    invalidateMuralReadModels({
      companyIds: companyId ? [companyId] : [],
      userId: String(recado.sender_id || '')
    });
    invalidateMuralReadModels({
      companyIds: companyId ? [companyId] : [],
      userId: String(recado.receiver_id || '')
    });
    return noStoreJsonResponse({ ok: true });
  } catch (e: unknown) {
    logServerError('[mural/recados] falha ao excluir recado', e);
    return noStoreTextResponse('Erro ao excluir recado.', 500);
  }
}
