import { modulosOperacionaisGeograficosAtivos } from '$lib/config/destinosGeograficos';
import { destinoIdValido } from '$lib/destinoIdentidade';
import { obterDestino } from '$lib/server/destinosBusca';

export type DestinoOperacionalResultado =
  | { ok: true; campos: Record<string, string> }
  | { ok: false; status: 400 | 503; error: string };

const INDISPONIVEL = 'Destino geográfico ainda não está disponível.';

export async function complementoDestinoOperacional(
  registro: object | null | undefined,
  db?: D1Database,
  geoDb?: D1Database,
  campoId = 'destino_geografico_id',
  campoTexto: string | null = null
): Promise<DestinoOperacionalResultado> {
  if (!registro) return { ok: true, campos: {} };
  const body = registro as Record<string, unknown>;
  if (!Object.hasOwn(body, campoId) || body[campoId] == null || body[campoId] === '')
    return { ok: true, campos: {} };
  if (!modulosOperacionaisGeograficosAtivos) return { ok: false, status: 400, error: INDISPONIVEL };
  if (!destinoIdValido(body[campoId]))
    return { ok: false, status: 400, error: 'ID do destino inválido.' };
  if (!db || !geoDb)
    return { ok: false, status: 503, error: 'Busca geográfica ainda não está disponível.' };
  const destino = await obterDestino(db, geoDb, body[campoId], 'pt');
  if (!destino) return { ok: false, status: 400, error: 'Destino não encontrado.' };
  const campos: Record<string, string> = { [campoId]: destino.id.toLowerCase() };
  if (campoTexto) campos[campoTexto] = destino.label;
  return { ok: true, campos };
}

export async function complementarListaOperacional<T extends object>(
  itens: readonly T[],
  db?: D1Database,
  geoDb?: D1Database,
  campoTexto: string | null = null
): Promise<{ ok: true; itens: T[] } | { ok: false; status: 400 | 503; error: string }> {
  const preparados: T[] = [];
  for (const item of itens) {
    const resultado = await complementoDestinoOperacional(item, db, geoDb, undefined, campoTexto);
    if (!resultado.ok) return resultado;
    preparados.push({ ...item, ...resultado.campos });
  }
  return { ok: true, itens: preparados };
}
