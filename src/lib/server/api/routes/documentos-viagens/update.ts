// Migrado para Hono de src/routes/api/v1/documentos-viagens/update/+server.ts — corpo IDÊNTICO ao original
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

const MAX_DOCUMENTO_VIAGEM_UPDATE_BODY_BYTES = 64 * 1024;

type DocumentoViagemUpdateBody = {
  id?: unknown;
  display_name?: unknown;
};

function readDocumentoViagemUpdateBody(value: unknown): DocumentoViagemUpdateBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return {
    id: body.id,
    display_name: body.display_name
  };
}

export async function handleDocumentosViagensUpdatePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(
      event.request,
      MAX_DOCUMENTO_VIAGEM_UPDATE_BODY_BYTES
    );
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['operacao_documentos_viagens', 'documentos_viagens', 'operacao'],
        3,
        'Sem permissao para editar documentos.'
      );
    }

    const body = readDocumentoViagemUpdateBody(bodyResult.data);
    const id = String(body?.id || '').trim();
    const displayName = String(body?.display_name || '').trim();
    if (!isUuid(id))
      return json({ error: 'id invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
    if (!displayName)
      return json(
        { error: 'display_name obrigatorio.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );

    const { data: currentDoc, error: currentDocError } = await client
      .from('documentos_viagens')
      .select('id, company_id')
      .eq('id', id)
      .maybeSingle();
    if (currentDocError) throw currentDocError;
    if (!currentDoc)
      return json(
        { error: 'Documento nao encontrado.' },
        { status: 404, headers: NO_STORE_HEADERS }
      );

    if (!scope.isAdmin) {
      const allowedCompanyIds = cleanStringSet([scope.companyId, ...(scope.companyIds || [])]);
      const targetCompanyId = String(
        (currentDoc as { company_id?: string | null })?.company_id || ''
      ).trim();
      if (!targetCompanyId || !allowedCompanyIds.has(targetCompanyId)) {
        return json(
          { error: 'Documento fora do escopo da empresa.' },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }
    }

    const { data, error } = await client
      .from('documentos_viagens')
      .update({
        display_name: displayName,
        updated_at: new Date().toISOString(),
        updated_by: user.id
      })
      .eq('id', id)
      .select(
        'id, file_name, display_name, storage_bucket, storage_path, mime_type, size_bytes, created_at, updated_at'
      )
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return json(
        { error: 'Documento nao encontrado.' },
        { status: 404, headers: NO_STORE_HEADERS }
      );

    return json({ ok: true, doc: data }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao atualizar documento.');
  }
}
