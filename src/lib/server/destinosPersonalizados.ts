import { getGeoNamesPlace, labelGeoNamesPlace, normalizeGeoName } from './geonames';

export type DestinoPersonalizado = {
  id: string;
  nome: string;
  referenciaGeoNamesId: number;
};

type DestinoRow = {
  id: string;
  nome: string;
  referencia_geonames_id: number;
};

export class DestinoPersonalizadoInvalido extends Error {}
export class DestinoPersonalizadoDuplicado extends Error {}

function toDestino(row: DestinoRow): DestinoPersonalizado {
  return {
    id: row.id,
    nome: row.nome,
    referenciaGeoNamesId: row.referencia_geonames_id
  };
}

export async function criarDestinoPersonalizado(
  db: D1Database,
  geoDb: D1Database,
  nome: string,
  referenciaGeoNamesId: number
): Promise<DestinoPersonalizado> {
  const nomeLimpo = nome.trim().replace(/\s+/g, ' ');
  const nomeNormalizado = normalizeGeoName(nomeLimpo);
  if (!nomeNormalizado || nomeLimpo.length > 200)
    throw new DestinoPersonalizadoInvalido(
      'Informe um nome de destino válido com até 200 caracteres.'
    );

  const referencia = await getGeoNamesPlace(geoDb, referenciaGeoNamesId);
  if (!referencia)
    throw new DestinoPersonalizadoInvalido('Localidade de referência não encontrada no GeoNames.');

  const result = await db
    .prepare(
      `INSERT INTO destinos_personalizados (id, nome, nome_normalizado, referencia_geonames_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(nome_normalizado, referencia_geonames_id) DO NOTHING
       RETURNING id, nome, referencia_geonames_id`
    )
    .bind(crypto.randomUUID(), nomeLimpo, nomeNormalizado, referencia.id)
    .first<DestinoRow>();
  if (!result) throw new DestinoPersonalizadoDuplicado('Destino já cadastrado nesta localidade.');
  return toDestino(result);
}

export async function buscarDestinosPersonalizados(
  db: D1Database,
  texto: string,
  limite = 8
): Promise<DestinoPersonalizado[]> {
  const termo = normalizeGeoName(texto);
  if (!Number.isInteger(limite) || limite < 1 || limite > 50)
    throw new Error('Limite de busca inválido.');
  if (termo.length > 200) throw new Error('Nome de destino muito longo.');
  if (Array.from(termo).length < 2) return [];
  const result = await db
    .prepare(
      `SELECT id, nome, referencia_geonames_id FROM destinos_personalizados
       WHERE nome_normalizado >= ? AND nome_normalizado < ?
       ORDER BY nome_normalizado, id LIMIT ?`
    )
    .bind(termo, `${termo}\u{10ffff}`, limite)
    .all<DestinoRow>();
  return result.results.map(toDestino);
}

export async function obterDestinoPersonalizado(
  db: D1Database,
  id: string
): Promise<DestinoPersonalizado | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    throw new Error('ID do destino personalizado inválido.');
  const result = await db
    .prepare(`SELECT id, nome, referencia_geonames_id FROM destinos_personalizados WHERE id = ?`)
    .bind(id.toLowerCase())
    .first<DestinoRow>();
  return result ? toDestino(result) : null;
}

export async function rotuloDestinoPersonalizado(
  geoDb: D1Database,
  destino: DestinoPersonalizado,
  locale: string
): Promise<string> {
  const referencia = await getGeoNamesPlace(geoDb, destino.referenciaGeoNamesId);
  if (!referencia)
    throw new Error('Localidade de referência do destino não está disponível no GeoNames.');
  const rotulo = await labelGeoNamesPlace(geoDb, referencia, locale);
  return [destino.nome, rotulo.label].join(', ');
}
