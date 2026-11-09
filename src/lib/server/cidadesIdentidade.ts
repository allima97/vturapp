import { resolverDestinoParaPersistencia } from './destinoPersistencia';

type CidadeReferenciada = {
  id: string;
  nome: string;
  destino_geografico_id: string;
};

export async function obterOuCriarCidadeGeografica(
  db: D1Database,
  geoDb: D1Database,
  destinoId: unknown
): Promise<CidadeReferenciada> {
  const destino = await resolverDestinoParaPersistencia(db, geoDb, destinoId);
  const result = await db
    .prepare(
      `INSERT INTO legado_cidades (id, nome, destino_geografico_id)
       VALUES (?, ?, ?)
       ON CONFLICT(destino_geografico_id) WHERE destino_geografico_id IS NOT NULL DO NOTHING
       RETURNING id, nome, destino_geografico_id`
    )
    .bind(crypto.randomUUID(), destino.cidade, destino.cidade_id)
    .first<CidadeReferenciada>();
  if (result) return result;
  const existing = await db
    .prepare(
      `SELECT id, nome, destino_geografico_id FROM legado_cidades
       WHERE destino_geografico_id = ?`
    )
    .bind(destino.cidade_id)
    .first<CidadeReferenciada>();
  if (!existing) throw new Error('Não foi possível resolver a cidade vinculada ao destino.');
  return existing;
}
