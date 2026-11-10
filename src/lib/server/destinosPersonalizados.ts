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
export class DestinoPersonalizadoEmUso extends Error {}

const REFERENCIAS_TEXTO = [
  ['legado_cidades', 'destino_geografico_id'],
  ['legado_roteiro_dia', 'cidade_id'],
  ['legado_roteiro_hotel', 'cidade_id'],
  ['legado_roteiro_passeio', 'cidade_id'],
  ['catalogo_opcionais', 'cidade_id'],
  ['legado_quote_item', 'destino_geografico_id'],
  ['legado_consultorias_online', 'destino_geografico_id'],
  ['legado_viagens', 'destino_geografico_id'],
  ['legado_viagens', 'origem_geografica_id'],
  ['legado_voucher_dias', 'destino_geografico_id'],
  ['legado_voucher_hoteis', 'destino_geografico_id'],
  ['legado_minhas_preferencias', 'destino_geografico_id'],
  ['legado_fornecedores', 'cidade_geografica_id']
] as const;

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

async function nomeDaReferenciaOcupado(
  db: D1Database,
  nomeNormalizado: string,
  referenciaGeoNamesId: number,
  ignorarId?: string
) {
  const existente = await db
    .prepare(
      `SELECT id FROM destinos_personalizados
       WHERE nome_normalizado = ? AND referencia_geonames_id = ? AND id <> ?`
    )
    .bind(nomeNormalizado, referenciaGeoNamesId, ignorarId ?? '')
    .first<{ id: string }>();
  return Boolean(existente);
}

export async function atualizarDestinoPersonalizado(
  db: D1Database,
  geoDb: D1Database,
  id: string,
  nome: string,
  referenciaGeoNamesId: number
): Promise<DestinoPersonalizado> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    throw new DestinoPersonalizadoInvalido('ID do destino personalizado inválido.');
  const nomeLimpo = nome.trim().replace(/\s+/g, ' ');
  const nomeNormalizado = normalizeGeoName(nomeLimpo);
  if (!nomeNormalizado || nomeLimpo.length > 200)
    throw new DestinoPersonalizadoInvalido(
      'Informe um nome de destino válido com até 200 caracteres.'
    );
  const referencia = await getGeoNamesPlace(geoDb, referenciaGeoNamesId);
  if (!referencia)
    throw new DestinoPersonalizadoInvalido('Localidade de referência não encontrada no GeoNames.');
  if (await nomeDaReferenciaOcupado(db, nomeNormalizado, referencia.id, id.toLowerCase()))
    throw new DestinoPersonalizadoDuplicado('Destino já cadastrado nesta localidade.');
  const result = await db
    .prepare(
      `UPDATE destinos_personalizados
       SET nome = ?, nome_normalizado = ?, referencia_geonames_id = ?
       WHERE id = ?
       RETURNING id, nome, referencia_geonames_id`
    )
    .bind(nomeLimpo, nomeNormalizado, referencia.id, id.toLowerCase())
    .first<DestinoRow>();
  if (!result) throw new DestinoPersonalizadoInvalido('Destino personalizado não encontrado.');
  return toDestino(result);
}

export async function excluirDestinoPersonalizado(db: D1Database, id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    throw new DestinoPersonalizadoInvalido('ID do destino personalizado inválido.');
  const destinoId = id.toLowerCase();
  const chave = `personalizado:${destinoId}`;
  for (const [tabela, coluna] of REFERENCIAS_TEXTO) {
    const usado = await db
      .prepare(`SELECT 1 AS usado FROM ${tabela} WHERE ${coluna} = ? LIMIT 1`)
      .bind(chave)
      .first();
    if (usado)
      throw new DestinoPersonalizadoEmUso(
        'Este destino personalizado está em uso e não pode ser excluído.'
      );
  }
  const revisao = await db
    .prepare(
      `SELECT 1 AS usado FROM destinos_revisao_geonames WHERE destino_personalizado_id = ? LIMIT 1`
    )
    .bind(destinoId)
    .first();
  if (revisao)
    throw new DestinoPersonalizadoEmUso(
      'Este destino personalizado está em uso e não pode ser excluído.'
    );
  const removido = await db
    .prepare(`DELETE FROM destinos_personalizados WHERE id = ? RETURNING id`)
    .bind(destinoId)
    .first<{ id: string }>();
  if (!removido) throw new DestinoPersonalizadoInvalido('Destino personalizado não encontrado.');
}

export function rotuloReferenciaIndisponivel(nome: string) {
  return `${nome} (referência geográfica indisponível)`;
}

export async function rotuloDestinoPersonalizado(
  geoDb: D1Database,
  destino: DestinoPersonalizado,
  locale: string
): Promise<string> {
  const referencia = await getGeoNamesPlace(geoDb, destino.referenciaGeoNamesId);
  if (!referencia) return rotuloReferenciaIndisponivel(destino.nome);
  const rotulo = await labelGeoNamesPlace(geoDb, referencia, locale);
  return [destino.nome, rotulo.label].join(', ');
}
