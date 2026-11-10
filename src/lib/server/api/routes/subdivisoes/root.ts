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
  READ_MODEL_TAGS
} from '$lib/server/readModelCache';
import {
  CATALOG_READ_HEADERS,
  DYNAMIC_READ_HEADERS,
  NO_STORE_HEADERS
} from '$lib/server/httpCache';

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

function recusarEscritaSubdivisoes() {
  return json(
    { error: 'O cadastro de estados foi desativado. A consulta continua disponível.' },
    { status: 410, headers: NO_STORE_HEADERS }
  );
}

export function handleSubdivisoesPost(_event: RequestEvent) {
  return recusarEscritaSubdivisoes();
}

export function handleSubdivisoesDelete(_event: RequestEvent) {
  return recusarEscritaSubdivisoes();
}
