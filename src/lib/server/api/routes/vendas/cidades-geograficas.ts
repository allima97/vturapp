import { json, type RequestEvent } from '@sveltejs/kit';
import { buscarDestinos, buscarDestinosExatos } from '$lib/server/destinosBusca';
import { normalizeGeoName } from '$lib/server/geonames';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';

type CidadeLegada = {
  id: string;
  nome: string;
  estado: string | null;
  pais_nome: string | null;
  grau_importancia: number | null;
};

export async function handleVendasCidadesGeograficasGet(event: RequestEvent) {
  return buscarCidadesGeograficas(event, ['vendas_consulta', 'vendas', 'vendas_cadastro'], true);
}

export async function handleProdutosCidadesGeograficasGet(event: RequestEvent) {
  return buscarCidadesGeograficas(event, ['Produtos'], false);
}

async function buscarCidadesGeograficas(
  event: RequestEvent,
  modulos: string[],
  permitirMaster: boolean
) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    if (!scope.isAdmin && !(permitirMaster && scope.isMaster))
      ensureModuloAccess(scope, modulos, 1, 'Sem acesso à busca de cidades.');
    const cidadeId = event.url.searchParams.get('id');
    if (cidadeId !== null) {
      if (!isUuid(cidadeId))
        return json(
          { error: 'ID da cidade inválido.' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      const db = event.platform?.env?.DB;
      if (!db) throw new Error('Banco D1 indisponível para consultar a cidade.');
      const cidade = await db
        .prepare(
          `SELECT c.id, c.nome, COALESCE(s.nome, c.estado_nome) AS estado,
                  COALESCE(p.nome, c.pais_nome) AS pais_nome, c.grau_importancia
           FROM legado_cidades c
           LEFT JOIN legado_subdivisoes s ON s.id = c.subdivisao_id
           LEFT JOIN legado_paises p ON p.id = s.pais_id WHERE c.id = ?`
        )
        .bind(cidadeId)
        .first<CidadeLegada>();
      if (!cidade)
        return json(
          { error: 'Cidade não encontrada.' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      return json(
        {
          ...cidade,
          label: [cidade.nome, cidade.estado, cidade.pais_nome].filter(Boolean).join(', ')
        },
        { headers: NO_STORE_HEADERS }
      );
    }
    const termo = (event.url.searchParams.get('q') ?? '').trim();
    if (termo.length > 200 || normalizeGeoName(termo).length > 200)
      return json(
        { error: 'Nome de destino muito longo.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    const offsetRaw = event.url.searchParams.get('offset_legadas') ?? '0';
    const offset = Number(offsetRaw);
    if (!/^(?:0|[1-9]\d{0,4})$/.test(offsetRaw) || offset > 10000)
      return json(
        { error: 'Deslocamento de cidades legadas inválido.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    const buscaExata = event.url.searchParams.get('exata') ?? '0';
    const pais = (event.url.searchParams.get('pais') ?? '').trim();
    const offsetGeoRaw = event.url.searchParams.get('offset_geografico') ?? '0';
    const offsetGeo = Number(offsetGeoRaw);
    if (
      !['0', '1'].includes(buscaExata) ||
      (pais && !/^[a-z]{2}$/i.test(pais)) ||
      !/^(?:0|[1-9]\d{0,4})$/.test(offsetGeoRaw) ||
      offsetGeo > 10000 ||
      (buscaExata !== '1' && (pais || offsetGeo !== 0))
    )
      return json(
        { error: 'Parâmetros de busca geográfica inválidos.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    const db = event.platform?.env?.DB;
    const geoDb = event.platform?.env?.GEO_DB;
    if (!db || !geoDb)
      return json(
        { error: 'Busca geográfica ainda não está disponível.' },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    if (Array.from(termo).length < (buscaExata === '1' ? 1 : 2))
      return json(
        { items: [], podeHaverMais: false, cidades_legadas: [], legadas_pode_haver_mais: false },
        { headers: NO_STORE_HEADERS }
      );

    const termoLegado = termo.replace(/[\\%_]/g, '\\$&');
    const [resultado, legadas] = await Promise.all([
      buscaExata === '1'
        ? buscarDestinosExatos(geoDb, termo, 'pt', pais, offsetGeo)
        : buscarDestinos(db, geoDb, termo, 'pt', 8),
      db
        .prepare(
          `SELECT c.id, c.nome, COALESCE(s.nome, c.estado_nome) AS estado,
                  COALESCE(p.nome, c.pais_nome) AS pais_nome, c.grau_importancia
           FROM legado_cidades c
           LEFT JOIN legado_subdivisoes s ON s.id = c.subdivisao_id
           LEFT JOIN legado_paises p ON p.id = s.pais_id
           WHERE c.destino_geografico_id IS NULL
             AND (c.nome LIKE ? ESCAPE '\\' OR c.nome_ptBR LIKE ? ESCAPE '\\')
           ORDER BY c.grau_importancia IS NULL, c.grau_importancia, c.nome COLLATE NOCASE, c.id
           LIMIT 9 OFFSET ?`
        )
        .bind(`${termoLegado}%`, `${termoLegado}%`, offset)
        .all<CidadeLegada>()
    ]);
    const ids = resultado.items.map((item) => item.id);
    const existentes = ids.length
      ? await db
          .prepare(
            `SELECT id, destino_geografico_id FROM legado_cidades WHERE destino_geografico_id IN (${ids.map(() => '?').join(', ')})`
          )
          .bind(...ids)
          .all<{ id: string; destino_geografico_id: string }>()
      : { results: [] };
    const vinculadas = new Map(
      existentes.results.map((cidade) => [cidade.destino_geografico_id, cidade.id])
    );
    return json(
      {
        items: resultado.items.map((destino) => ({
          ...destino,
          cidade_interna_id: vinculadas.get(destino.id) ?? null
        })),
        podeHaverMais: resultado.podeHaverMais,
        cidades_legadas: legadas.results.slice(0, 8).map((cidade) => ({
          ...cidade,
          label: [cidade.nome, cidade.estado, cidade.pais_nome].filter(Boolean).join(', ')
        })),
        legadas_pode_haver_mais: legadas.results.length > 8
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    logServerError('[cidades] falha ao buscar destinos geográficos', err);
    return toErrorResponse(err, 'Erro ao buscar destinos.');
  }
}
