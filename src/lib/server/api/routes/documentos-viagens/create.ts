// Migrado para Hono de src/routes/api/v1/documentos-viagens/create/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_DOCUMENTO_VIAGEM_CREATE_BODY_BYTES = 64 * 1024;

type DocumentoViagemCreateBody = {
  file_name?: string;
  display_name?: string;
  mime_type?: string;
  size_bytes?: number | string;
};

function sanitizeFileName(name: string) {
  const base = String(name || '').trim();
  if (!base) return 'arquivo';
  return base
    .replace(/\s+/g, ' ')
    .replace(/[\\/]+/g, '-')
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .slice(0, 120)
    .trim();
}

function readDocumentoViagemCreateBody(value: unknown): DocumentoViagemCreateBody {
  if (!value || typeof value !== 'object') return {};

  const body = value as Record<string, unknown>;
  const parsed: DocumentoViagemCreateBody = {};

  if (typeof body.file_name === 'string') parsed.file_name = body.file_name;
  if (typeof body.display_name === 'string') parsed.display_name = body.display_name;
  if (typeof body.mime_type === 'string') parsed.mime_type = body.mime_type;
  if (typeof body.size_bytes === 'number' || typeof body.size_bytes === 'string') {
    parsed.size_bytes = body.size_bytes;
  }

  return parsed;
}

export async function handleDocumentosViagensCreatePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(
      event.request,
      MAX_DOCUMENTO_VIAGEM_CREATE_BODY_BYTES
    );
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['operacao_documentos_viagens', 'documentos_viagens', 'operacao'],
        2,
        'Sem permissao para enviar documentos.'
      );
    }

    const body = readDocumentoViagemCreateBody(bodyResult.data);
    const rawFileName = String(body?.file_name || '').trim();
    if (!rawFileName)
      return json({ error: 'file_name obrigatorio.' }, { status: 400, headers: NO_STORE_HEADERS });

    const fileName = sanitizeFileName(rawFileName);
    const displayName = String(body?.display_name || '').trim() || fileName;
    const mimeType = String(body?.mime_type || '').trim() || null;
    const sizeBytesRaw = Number(body?.size_bytes);
    const sizeBytes = Number.isFinite(sizeBytesRaw) ? Math.max(0, Math.trunc(sizeBytesRaw)) : null;
    const storageBucket = 'viagens-documentos';
    const storagePath = `${scope.companyId}/${crypto.randomUUID()}-${fileName}`;

    const { data, error } = await client
      .from('documentos_viagens')
      .insert({
        company_id: scope.companyId,
        uploaded_by: user.id,
        file_name: fileName,
        display_name: displayName,
        storage_bucket: storageBucket,
        storage_path: storagePath,
        mime_type: mimeType,
        size_bytes: sizeBytes
      })
      .select(
        'id, company_id, uploaded_by, file_name, display_name, storage_bucket, storage_path, mime_type, size_bytes, created_at'
      )
      .single();
    if (error) throw error;

    return json({ ok: true, doc: data }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao preparar upload.');
  }
}
