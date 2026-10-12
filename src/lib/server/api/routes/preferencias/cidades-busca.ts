// Busca cidades via geocoding automático (Nominatim) — sem dependência de catálogo interno.
// Mesmo princípio do astrologiapessoal.
import type { RequestEvent } from '@sveltejs/kit';
import {
  buildJsonResponse,
  buildNoStoreJsonResponse,
  buildNoStoreTextResponse,
  logServerError,
  requirePreferenciasScope,
} from '../../../../../routes/api/v1/preferencias/_shared';
import { buscarCidadesGeo } from '$lib/server/geocoding';

function parseLimit(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const intVal = Math.trunc(parsed);
  if (intVal <= 0) return fallback;
  return Math.min(20, intVal);
}

export async function handlePreferenciasCidadesBuscaGet(event: RequestEvent) {
  try {
    await requirePreferenciasScope(event, 1);

    const query = String(event.url.searchParams.get('q') || '').trim();
    const limite = parseLimit(event.url.searchParams.get('limite'), 8);

    if (query.length < 2) {
      return buildNoStoreJsonResponse([]);
    }

    const results = await buscarCidadesGeo(query, limite);
    const items = results.map((r) => ({ nome: r.label || r.nome }));

    return buildJsonResponse(items);
  } catch (err) {
    logServerError('[preferencias/cidades-busca] falha ao buscar cidades', err);
    return buildNoStoreTextResponse('Erro ao buscar cidades.', 500);
  }
}
