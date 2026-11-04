// Migrado para Hono de src/routes/api/v1/paises/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  sanitizePostgrestSearchTerm,
  toErrorResponse
} from '$lib/server/v1';
import {
  buildReadModelCacheKey,
  CATALOG_STALE_TTL_MS,
  CATALOG_TTL_MS,
  getCachedReadModel,
  invalidateCatalogReadModels,
  READ_MODEL_TAGS
} from '$lib/server/readModelCache';
import { CATALOG_READ_HEADERS, DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_PAISES_BODY_BYTES = 64 * 1024;

type PaisBody = {
  id?: unknown;
  nome?: unknown;
  codigo_iso?: unknown;
  continente?: unknown;
};

function readPaisBody(value: unknown): PaisBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const body = value as Record<string, unknown>;
  return {
    id: body.id,
    nome: body.nome,
    codigo_iso: body.codigo_iso,
    continente: body.continente
  };
}

type PaisRow = {
  id: string;
  nome: string | null;
  codigo_iso: string | null;
  continente: string | null;
  created_at: string | null;
};

export async function handlePaisesGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Paises'], 1, 'Sem acesso a Países.');
    }

    const { searchParams } = event.url;
    const q = sanitizePostgrestSearchTerm(searchParams.get('q'), 80);

    const items = await getCachedReadModel<PaisRow[]>({
      key: buildReadModelCacheKey('paises:list', { q }),
      tags: [READ_MODEL_TAGS.catalog],
      ttlMs: CATALOG_TTL_MS,
      staleTtlMs: CATALOG_STALE_TTL_MS,
      loader: async () => {
        const { data, error: queryError } = await client
          .from('paises')
          .select('id, nome, codigo_iso, continente, created_at')
          .order('nome')
          .limit(300);

        if (queryError) throw queryError;

        let items = data || [];
        if (q) {
          const qLower = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          items = items.filter((item: any) =>
            String(item.nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(qLower) ||
            String(item.codigo_iso || '').toLowerCase().includes(qLower)
          );
        }
        return items;
      }
    });

    return json({ items }, { headers: CATALOG_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar países.');
  }
}

export async function handlePaisesPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_PAISES_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Paises'], 2, 'Sem permissão para salvar países.');
    }

    const body = readPaisBody(bodyResult.data);
    const { nome, codigo_iso, continente } = body;
    const id = String(body.id || '').trim();

    if (!String(nome || '').trim()) return json({ error: 'Nome obrigatório.' }, { status: 400, headers: NO_STORE_HEADERS });

    const payload = {
      nome: String(nome).trim(),
      codigo_iso: String(codigo_iso || '').trim().toUpperCase() || null,
      continente: String(continente || '').trim() || null
    };

    let result;
    if (id && isUuid(id)) {
      const { data, error: updateError } = await client.from('paises').update(payload).eq('id', id).select('id').single();
      if (updateError) throw updateError;
      result = data;
    } else {
      const { data, error: insertError } = await client.from('paises').insert(payload).select('id').single();
      if (insertError) throw insertError;
      result = data;
    }

    invalidateCatalogReadModels({ userId: user.id });
    return json({ ok: true, id: result?.id }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar país.');
  }
}

export async function handlePaisesDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Paises'], 4, 'Sem permissão para excluir países.');
    }

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id)) return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const { error: deleteError } = await client.from('paises').delete().eq('id', id);
    if (deleteError) throw deleteError;

    invalidateCatalogReadModels({ userId: user.id });
    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir país.');
  }
}
