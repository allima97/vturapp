import { destinoIdValido } from '$lib/destinoIdentidade';
import { obterDestino } from './destinosBusca';

export class IdentidadeDestinoInvalida extends Error {}

export async function resolverDestinoParaPersistencia(
  db: D1Database,
  geoDb: D1Database,
  id: unknown
): Promise<{ cidade_id: string; cidade: string }> {
  if (!destinoIdValido(id)) throw new IdentidadeDestinoInvalida('ID do destino inválido.');
  const destino = await obterDestino(db, geoDb, id, 'pt');
  if (!destino) throw new IdentidadeDestinoInvalida('Destino não encontrado.');
  return { cidade_id: destino.id.toLowerCase(), cidade: destino.label };
}
