// Busca cidades via geocoding automático (Nominatim) — sem dependência de catálogo interno.
// Mesmo princípio do astrologiapessoal.
import { json, type RequestEvent } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { getAdminClient } from '$lib/server/v1';
import { buscarCidadesGeo } from '$lib/server/geocoding';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';

function parseLimit(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(50, Math.max(1, Math.trunc(parsed)));
}

export async function handleViagensCidadesBuscaGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['operacao_viagens', 'viagens', 'operacao'], 1, 'Sem acesso a Viagens.');
    }

    const query = String(event.url.searchParams.get('q') || '').trim();
    const limite = parseLimit(event.url.searchParams.get('limite'), 10);

    if (!query || query.length < 2) {
      return json([], { headers: NO_STORE_HEADERS });
    }

    const results = await buscarCidadesGeo(query, limite);
    const items = results.map((r) => ({ nome: r.label || r.nome }));

    return json(items, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar cidades.');
  }
}
