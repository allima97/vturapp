import { json, type RequestEvent } from '@sveltejs/kit';
import { buscarCidadesGeo } from '$lib/server/geocoding';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { logServerError, toErrorResponse } from '$lib/server/v1';
import { requireOpcionaisScope } from './root';

export async function handleOpcionaisCidadesGet(event: RequestEvent) {
  try {
    await requireOpcionaisScope(event, 1, true);
    const q = String(event.url.searchParams.get('q') || '').trim();
    if (q.length < 3) return json([], { headers: NO_STORE_HEADERS });
    if (q.length > 200)
      return json({ error: 'Cidade inválida.' }, { status: 400, headers: NO_STORE_HEADERS });
    const items = await buscarCidadesGeo(q, 8, { throwOnError: true });
    return json(
      items.map((item) => ({ nome: item.label || item.nome })),
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    logServerError('[opcionais] falha ao buscar cidades', err);
    return toErrorResponse(err, 'Erro ao buscar cidades.');
  }
}
