// Migrado para Hono de src/routes/api/v1/documentacao/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import {
  getAdminClient,
  isUuid,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope
} from '$lib/server/v1';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { toUserMessage } from '$lib/utils/errors';

const MAX_DOCUMENTACAO_BODY_BYTES = 512 * 1024;

const VALID_ROLES = new Set(['all', 'vendedor', 'gestor', 'master', 'admin']);
const VALID_TONES = new Set(['default', 'info', 'config', 'teal', 'green']);

type DocumentacaoBody = {
  id?: string;
  slug?: string;
  role_scope?: string;
  module_key?: string;
  route_pattern?: string;
  title?: string;
  summary?: string;
  content_markdown?: string;
  tone?: string;
  sort_order?: number | string;
  is_active?: boolean;
};

function normalizeSlug(value: unknown) {
  return (
    String(value || 'vtur')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'vtur'
  );
}

function normalizeModuleKey(value: unknown) {
  return (
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'geral'
  );
}

function readDocumentacaoBody(value: unknown): DocumentacaoBody {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  const body: DocumentacaoBody = {};

  if (typeof record.id === 'string') body.id = record.id;
  if (typeof record.slug === 'string') body.slug = record.slug;
  if (typeof record.role_scope === 'string') body.role_scope = record.role_scope;
  if (typeof record.module_key === 'string') body.module_key = record.module_key;
  if (typeof record.route_pattern === 'string') body.route_pattern = record.route_pattern;
  if (typeof record.title === 'string') body.title = record.title;
  if (typeof record.summary === 'string') body.summary = record.summary;
  if (typeof record.content_markdown === 'string') body.content_markdown = record.content_markdown;
  if (typeof record.tone === 'string') body.tone = record.tone;
  if (typeof record.sort_order === 'number' || typeof record.sort_order === 'string') {
    body.sort_order = record.sort_order;
  }
  if (typeof record.is_active === 'boolean') body.is_active = record.is_active;

  return body;
}

async function requireAdmin(event: Parameters<RequestHandler>[0]) {
  const client = getAdminClient();
  const user = await requireAuthenticatedUser(event);
  const scope = await resolveUserScope(client, user.id);
  if (!scope.isAdmin) {
    return {
      ok: false as const,
      response: json({ error: 'Somente administradores podem editar a documentação.' }, { status: 403, headers: NO_STORE_HEADERS })
    };
  }
  return { ok: true as const, client, user };
}

export const handleDocumentacaoGet = async (event: RequestEvent) => {
  try {
    await requireAuthenticatedUser(event);
    const client = getAdminClient();

    try {
      const { data: sectionsData, error: sectionsError } = await client
        .from("system_documentation_sections")
        .select("id, slug, role_scope, module_key, route_pattern, title, summary, content_markdown, tone, sort_order, is_active, updated_at")
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true });

      if (!sectionsError && sectionsData && sectionsData.length > 0) {
        return json(
          {
            sections: sectionsData,
            source: "sections"
          },
          {
            headers: NO_STORE_HEADERS,
          }
        );
      }
    } catch (err) {
      logServerError("[documentacao] falha ao ler system_documentation_sections", err);
    }

    try {
      const { data, error } = await client
        .from("system_documentation")
        .select("id, slug, markdown, updated_at")
        .order("updated_at", { ascending: false })
        .limit(10);

      if (!error && data && data.length > 0) {
        return json(
          {
            sections: data.map((doc: any) => ({
              id: doc.id,
              slug: doc.slug,
              role_scope: 'all',
              module_key: doc.slug,
              route_pattern: null,
              title: doc.slug,
              summary: null,
              content_markdown: doc.markdown,
              tone: 'info',
              sort_order: 0,
              is_active: true,
              updated_at: doc.updated_at
            })),
            source: "legacy"
          },
          {
            headers: NO_STORE_HEADERS,
          }
        );
      }
    } catch (err) {
      logServerError("[documentacao] falha ao ler system_documentation", err);
    }

    return json({ error: "Documentacao nao encontrada." }, { status: 404, headers: NO_STORE_HEADERS });
  } catch (error) {
    logServerError("[documentacao] falha ao carregar documentação", error);
    return json({ error: "Erro interno ao carregar documentação." }, { status: 500, headers: NO_STORE_HEADERS });
  }
};

export const handleDocumentacaoPost = async (event: RequestEvent) => {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const bodyResult = await readJsonBodyLimited(event.request, MAX_DOCUMENTACAO_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const admin = await requireAdmin(event);
    if (!admin.ok) return admin.response;

    const body = readDocumentacaoBody(bodyResult.data);
    const id = String(body.id || '').trim();
    const role_scope = VALID_ROLES.has(String(body.role_scope || 'all')) ? String(body.role_scope || 'all') : 'all';
    const tone = VALID_TONES.has(String(body.tone || 'info')) ? String(body.tone || 'info') : 'info';
    const title = String(body.title || '').trim();
    const content_markdown = String(body.content_markdown || '').trim();

    if (!title) return json({ error: 'Título obrigatório.' }, { status: 400, headers: NO_STORE_HEADERS });
    if (!content_markdown) return json({ error: 'Conteúdo obrigatório.' }, { status: 400, headers: NO_STORE_HEADERS });

    const payload = {
      slug: normalizeSlug(body.slug),
      role_scope,
      module_key: normalizeModuleKey(body.module_key),
      route_pattern: String(body.route_pattern || '').trim() || null,
      title,
      summary: String(body.summary || '').trim() || null,
      content_markdown,
      tone,
      sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
      is_active: body.is_active !== false,
      updated_by: admin.user.id,
      updated_at: new Date().toISOString()
    };

    if (id && isUuid(id)) {
      const { error } = await admin.client.from('system_documentation_sections').update(payload).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await admin.client.from('system_documentation_sections').insert({
        ...payload,
        created_by: admin.user.id
      });
      if (error) throw error;
    }

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logServerError("[documentacao] falha ao salvar documentação", error);
    return json({ error: toUserMessage(error, "Erro interno ao salvar documentação.") }, { status: 500, headers: NO_STORE_HEADERS });
  }
};

export const handleDocumentacaoDelete = async (event: RequestEvent) => {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const admin = await requireAdmin(event);
    if (!admin.ok) return admin.response;

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id)) return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const { error } = await admin.client.from('system_documentation_sections').delete().eq('id', id);
    if (error) throw error;

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logServerError("[documentacao] falha ao excluir documentação", error);
    return json({ error: toUserMessage(error, "Erro interno ao excluir documentação.") }, { status: 500, headers: NO_STORE_HEADERS });
  }
};
