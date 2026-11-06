// Migrado para Hono de src/routes/api/v1/subdivisoes/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  parseIntSafe,
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
import {
  CATALOG_READ_HEADERS,
  DYNAMIC_READ_HEADERS,
  NO_STORE_HEADERS
} from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_SUBDIVISOES_BODY_BYTES = 64 * 1024;

type SubdivisaoRow = {
  id: string;
  nome: string | null;
  pais_id: string | null;
  codigo_admin1: string | null;
  tipo: string | null;
  created_at: string | null;
  pais?:
    | {
        id: string;
        nome: string | null;
      }[]
    | null;
};

export async function handleSubdivisoesGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Subdivisoes'], 1, 'Sem acesso a Estados/Subdivisões.');
    }

    const { searchParams } = event.url;
    const id = String(searchParams.get('id') || '').trim();
    const rawQ = sanitizePostgrestSearchTerm(searchParams.get('q'), 80);
    const q = rawQ.length >= 2 ? rawQ : '';
    const paisId = String(searchParams.get('pais_id') || '').trim();
    const page = Math.max(1, parseIntSafe(searchParams.get('page'), 1));
    const pageSize = Math.min(5000, Math.max(1, parseIntSafe(searchParams.get('pageSize'), 100)));

    if (id) {
      if (!isUuid(id)) {
        return json({ error: 'id inválido.' }, { status: 400, headers: NO_STORE_HEADERS });
      }

      const item = await getCachedReadModel<SubdivisaoRow | null>({
        key: buildReadModelCacheKey('subdivisoes:get', { id }),
        tags: [READ_MODEL_TAGS.catalog],
        ttlMs: 300_000,
        staleTtlMs: 1_800_000,
        loader: async () => {
          const { data, error: queryError } = await client
            .from('subdivisoes')
            .select(
              'id, nome, pais_id, codigo_admin1, tipo, created_at, pais:paises!pais_id(id, nome)'
            )
            .eq('id', id)
            .maybeSingle();

          if (queryError) throw queryError;
          return data || null;
        }
      });

      if (!item) {
        return json(
          { error: 'Estado/Subdivisão não encontrado.' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      return json(item, { headers: CATALOG_READ_HEADERS });
    }

    if (paisId && !isUuid(paisId)) {
      return json({ error: 'pais_id inválido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { items, total } = await getCachedReadModel<{ items: SubdivisaoRow[]; total: number }>({
      key: buildReadModelCacheKey('subdivisoes:list', { q, paisId, page, pageSize }),
      tags: [READ_MODEL_TAGS.catalog],
      ttlMs: CATALOG_TTL_MS,
      staleTtlMs: CATALOG_STALE_TTL_MS,
      loader: async () => {
        // Sem join de pais na listagem — evita query lenta com join desnecessário
        let query = client
          .from('subdivisoes')
          .select('id, nome, pais_id, codigo_admin1, tipo, created_at')
          .order('nome')
          .range((page - 1) * pageSize, page * pageSize - 1);

        if (paisId) query = query.eq('pais_id', paisId);
        if (q) query = query.ilike('nome', `%${q}%`);

        const { data, error: queryError } = await query;
        if (queryError) throw queryError;

        const rows = data || [];
        return {
          items: rows,
          total: rows.length
        };
      }
    });

    return json({ items, total, page, pageSize }, { headers: CATALOG_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar estados/subdivisões.');
  }
}

export async function handleSubdivisoesPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_SUBDIVISOES_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Subdivisoes'], 2, 'Sem permissão para salvar estados.');
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};
    const { nome, codigo_admin1, tipo } = body;
    const id = String(body.id || '').trim();
    const paisId = String(body.pais_id || '').trim();

    if (!String(nome || '').trim())
      return json({ error: 'Nome obrigatório.' }, { status: 400, headers: NO_STORE_HEADERS });
    if (!paisId || !isUuid(paisId))
      return json({ error: 'País obrigatório.' }, { status: 400, headers: NO_STORE_HEADERS });

    const payload = {
      nome: String(nome).trim(),
      pais_id: paisId,
      codigo_admin1: String(codigo_admin1 || '').trim() || null,
      tipo: String(tipo || '').trim() || null
    };

    let result;
    if (id && isUuid(id)) {
      const { data, error: updateError } = await client
        .from('subdivisoes')
        .update(payload)
        .eq('id', id)
        .select('id')
        .single();
      if (updateError) throw updateError;
      result = data;
    } else {
      const { data, error: insertError } = await client
        .from('subdivisoes')
        .insert(payload)
        .select('id')
        .single();
      if (insertError) throw insertError;
      result = data;
    }

    invalidateCatalogReadModels({ userId: user.id });
    return json({ ok: true, id: result?.id }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar estado.');
  }
}

export async function handleSubdivisoesDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Subdivisoes'], 4, 'Sem permissão para excluir estados.');
    }

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const { error: deleteError } = await client.from('subdivisoes').delete().eq('id', id);
    if (deleteError) throw deleteError;

    invalidateCatalogReadModels({ userId: user.id });
    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir estado.');
  }
}
