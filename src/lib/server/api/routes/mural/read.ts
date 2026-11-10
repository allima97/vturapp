// Migrado para Hono de src/routes/api/v1/mural/read/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { isUuid, logServerError } from '$lib/server/v1';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  assertCompanyAccess,
  noStoreJsonResponse,
  noStoreTextResponse,
  requireMuralScope
} from '../../../../../routes/api/v1/mural/_shared';
import { invalidateMuralReadModels } from '$lib/server/readModelCache';

const MAX_MURAL_READ_BODY_BYTES = 8 * 1024;

type MuralReadBody = {
  id?: string;
};

function readMuralReadBody(value: unknown): MuralReadBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return typeof body.id === 'string' ? { id: body.id } : {};
}

export async function handleMuralReadPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_MURAL_READ_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const { client, user, scope } = await requireMuralScope(event);
    const body = readMuralReadBody(bodyResult.data);
    const id = String(body?.id || '').trim();
    if (!isUuid(id)) return noStoreTextResponse('ID inválido.', 400);

    const { data: recado, error: recadoError } = await client
      .from('mural_recados')
      .select('id, company_id, receiver_id')
      .eq('id', id)
      .maybeSingle();
    if (recadoError) throw recadoError;
    if (!recado) return noStoreTextResponse('Recado não encontrado.', 404);

    const denied = await assertCompanyAccess(client, scope, String(recado.company_id || '').trim());
    if (denied) return denied;

    if (recado.receiver_id && recado.receiver_id !== user.id) {
      return noStoreTextResponse('Sem permissão para marcar este recado.', 403);
    }

    const { error } = await client.from('mural_recados_leituras').upsert(
      {
        company_id: recado.company_id,
        recado_id: id,
        user_id: user.id,
        read_at: new Date().toISOString()
      },
      { onConflict: 'recado_id,user_id' }
    );
    if (error) throw error;

    invalidateMuralReadModels({
      companyIds: [String(recado.company_id || '')],
      userId: user.id
    });
    return noStoreJsonResponse({ ok: true });
  } catch (e: unknown) {
    logServerError('[mural/read] falha ao marcar recado como lido', e);
    return noStoreTextResponse('Erro ao marcar recado como lido.', 500);
  }
}
