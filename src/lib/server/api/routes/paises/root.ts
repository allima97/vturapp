// Migrado para Hono de src/routes/api/v1/paises/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
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
          const qLower = q
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
          items = items.filter(
            (item: any) =>
              String(item.nome || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .includes(qLower) ||
              String(item.codigo_iso || '')
                .toLowerCase()
                .includes(qLower)
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

function recusarEscritaPaises() {
  return json(
    { error: 'O cadastro de países foi desativado. A consulta continua disponível.' },
    { status: 410, headers: NO_STORE_HEADERS }
  );
}

export function handlePaisesPost(_event: RequestEvent) {
  return recusarEscritaPaises();
}

export function handlePaisesDelete(_event: RequestEvent) {
  return recusarEscritaPaises();
}
