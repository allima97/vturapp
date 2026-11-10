// Migrado para Hono de src/routes/api/v1/roteiros/sugestoes-remover/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';

const MAX_ROTEIRO_SUGESTAO_REMOVE_BODY_BYTES = 16 * 1024;

type RoteiroSugestaoRemoveBody = {
  tipo?: unknown;
  valor?: unknown;
};

function readRoteiroSugestaoRemoveBody(value: unknown): RoteiroSugestaoRemoveBody | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  return {
    tipo: body.tipo,
    valor: body.valor
  };
}

export async function handleRoteirosSugestoesRemoverPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(
      event.request,
      MAX_ROTEIRO_SUGESTAO_REMOVE_BODY_BYTES
    );
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    const body = readRoteiroSugestaoRemoveBody(bodyResult.data);
    if (!body || !body.tipo || !body.valor) {
      return new Response('Dados invalidos.', { status: 400, headers: NO_STORE_HEADERS });
    }

    const tipo = String(body.tipo).trim().slice(0, 60);
    const valor = String(body.valor).trim().slice(0, 160);
    if (!tipo || !valor)
      return new Response('Dados invalidos.', { status: 400, headers: NO_STORE_HEADERS });

    const companyId = scope.companyId;

    let query = client.from('roteiro_sugestoes').delete().eq('tipo', tipo).eq('valor', valor);

    if (companyId) {
      query = query.eq('company_id', companyId);
    } else {
      query = query.is('company_id', null);
    }

    const { error } = await query;
    if (error) throw error;

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao remover sugestao.');
  }
}
