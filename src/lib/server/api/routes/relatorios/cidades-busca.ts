// Busca cidades via geocoding automático (Nominatim) — sem dependência de catálogo interno.
// Mesmo princípio do astrologiapessoal.
import { json, type RequestEvent } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope
} from '$lib/server/v1';
import { buscarCidadesGeo } from '$lib/server/geocoding';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';

function parseLimit(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const intVal = Math.trunc(parsed);
  if (intVal <= 0) return fallback;
  return Math.min(20, intVal);
}

export async function handleRelatoriosCidadesBuscaGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['relatorios_vendas', 'relatorios_destinos', 'relatorios_produtos', 'relatorios', 'vendas'],
        1,
        'Sem acesso a Relatorios.'
      );
    }

    const query = String(event.url.searchParams.get('q') || '').trim();
    const limite = parseLimit(event.url.searchParams.get('limite'), 8);

    if (query.length < 2) {
      return json([], { headers: DYNAMIC_READ_HEADERS });
    }

    const results = await buscarCidadesGeo(query, limite);
    const items = results.map((r) => ({ nome: r.label || r.nome }));

    return json(items, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    logServerError('[relatorios/cidades-busca] falha ao buscar cidades', err);
    return new Response('Erro ao buscar cidades.', { status: 500, headers: NO_STORE_HEADERS });
  }
}
