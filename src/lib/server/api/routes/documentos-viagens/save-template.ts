// Migrado para Hono de src/routes/api/v1/documentos-viagens/save-template/+server.ts — corpo IDÊNTICO ao original
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

const MAX_DOCUMENTO_VIAGEM_TEMPLATE_BODY_BYTES = 512 * 1024;

type TemplateField = {
  key: string;
  label: string;
  type: 'text' | 'date' | 'signature';
};

type DocumentoViagemTemplateBody = {
  id?: unknown;
  title?: unknown;
  template_text?: unknown;
  template_fields?: unknown;
};

function clampText(value: unknown, max = 120_000) {
  const s = String(value ?? '');
  return s.length <= max ? s : s.slice(0, max);
}

function normalizeTitle(value: unknown) {
  return clampText(value, 160).trim().replace(/\s+/g, ' ');
}

function readRecordValue(value: unknown, key: string) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
}

function readDocumentoViagemTemplateBody(value: unknown): DocumentoViagemTemplateBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return {
    id: body.id,
    title: body.title,
    template_text: body.template_text,
    template_fields: body.template_fields
  };
}

function normalizeFields(raw: unknown): TemplateField[] {
  if (!Array.isArray(raw)) return [];
  const out: TemplateField[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const key = String(readRecordValue(item, 'key') || '')
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, '')
      .slice(0, 64);
    if (!key || seen.has(key)) continue;
    const typeRaw = String(readRecordValue(item, 'type') || 'text');
    const type: TemplateField['type'] =
      typeRaw === 'date' || typeRaw === 'signature' ? typeRaw : 'text';
    const label = String(readRecordValue(item, 'label') || key)
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 80);
    seen.add(key);
    out.push({ key, label: label || key, type });
  }
  return out.slice(0, 80);
}

export async function handleDocumentosViagensSaveTemplatePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(
      event.request,
      MAX_DOCUMENTO_VIAGEM_TEMPLATE_BODY_BYTES
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

    const body = readDocumentoViagemTemplateBody(bodyResult.data);
    const id = String(body?.id || '').trim();
    if (!isUuid(id))
      return json({ error: 'id invalido.' }, { status: 400, headers: NO_STORE_HEADERS });

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

    const title = normalizeTitle(body?.title);
    const templateText = clampText(body?.template_text, 200_000);
    const templateFields = normalizeFields(body?.template_fields);

    if (!title)
      return json({ error: 'title obrigatorio.' }, { status: 400, headers: NO_STORE_HEADERS });
    if (!templateText.trim())
      return json(
        { error: 'template_text obrigatorio.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );

    const { data, error } = await client
      .from('documentos_viagens')
      .update({
        title,
        template_text: templateText,
        template_fields: templateFields,
        updated_at: new Date().toISOString(),
        updated_by: user.id
      })
      .eq('id', id)
      .select(
        'id, file_name, display_name, title, template_text, template_fields, storage_bucket, storage_path, mime_type, size_bytes, created_at, updated_at'
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
    return toErrorResponse(err, 'Erro ao salvar modelo.');
  }
}
