// Migrado para Hono de src/routes/api/v1/documentos-viagens/delete/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { cleanStringSet } from '$lib/utils/array';

const MAX_DOCUMENTO_VIAGEM_DELETE_BODY_BYTES = 32 * 1024;

type DocumentoViagemDeleteBody = {
  id?: unknown;
};

function readDocumentoViagemDeleteBody(value: unknown): DocumentoViagemDeleteBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return { id: body.id };
}

export async function handleDocumentosViagensDeletePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(
      event.request,
      MAX_DOCUMENTO_VIAGEM_DELETE_BODY_BYTES
    );
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['operacao_documentos_viagens', 'documentos_viagens', 'operacao'],
        4,
        'Sem permissao para excluir documentos.'
      );
    }

    const body = readDocumentoViagemDeleteBody(bodyResult.data);
    const id = String(body?.id || '').trim();
    if (!isUuid(id))
      return json({ error: 'id invalido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const { data: doc, error: fetchErr } = await client
      .from('documentos_viagens')
      .select('id, company_id, storage_bucket, storage_path')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!doc)
      return json(
        { error: 'Documento nao encontrado.' },
        { status: 404, headers: NO_STORE_HEADERS }
      );

    if (!scope.isAdmin) {
      const allowedCompanyIds = cleanStringSet([scope.companyId, ...(scope.companyIds || [])]);
      const targetCompanyId = String(
        (doc as { company_id?: string | null })?.company_id || ''
      ).trim();
      if (!targetCompanyId || !allowedCompanyIds.has(targetCompanyId)) {
        return json(
          { error: 'Documento fora do escopo da empresa.' },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }
    }

    if (doc.storage_bucket && doc.storage_path) {
      await client.storage.from(doc.storage_bucket).remove([doc.storage_path]);
    }

    const { error } = await client.from('documentos_viagens').delete().eq('id', id);
    if (error) throw error;

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir documento.');
  }
}
