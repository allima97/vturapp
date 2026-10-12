// Busca cidades via geocoding automático (Nominatim) — sem dependência de catálogo interno.
// Mesmo princípio do astrologiapessoal.
// Para vendas: as cidades encontradas são auto-inseridas na tabela `cidades`
// (com subdivisao_id = null) para preservar a referência por UUID que o módulo usa.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { buscarCidadesGeo, type CidadeGeoResult } from '$lib/server/geocoding';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';

function parseLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 10;
  const intVal = Math.trunc(parsed);
  if (intVal <= 0) return 10;
  return Math.min(50, intVal);
}

type CidadeRow = {
  id: string;
  nome: string;
  estado_nome?: string | null;
  pais_nome?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  grau_importancia?: number | null;
};

function toResponseItem(row: CidadeRow) {
  const estado = row.estado_nome ?? null;
  const label = estado ? `${row.nome} (${estado})` : row.nome;
  return {
    id: row.id,
    nome: row.nome,
    estado,
    subdivisao_nome: estado,
    pais_nome: row.pais_nome ?? null,
    grau_importancia: row.grau_importancia ?? null,
    label,
  };
}

/**
 * Encontra ou cria uma cidade no banco a partir de um resultado de geocoding.
 * Busca primeiro por coordenadas próximas + nome; se não encontrar, insere.
 */
async function findOrCreateCidade(
  client: ReturnType<typeof getAdminClient>,
  result: CidadeGeoResult
): Promise<CidadeRow | null> {
  try {
    // 1. Tentar encontrar por coords próximas + nome
    const { data: existing } = await client
      .from('cidades')
      .select('id, nome, estado_nome, pais_nome, latitude, longitude, grau_importancia')
      .gte('latitude', result.lat - 0.15)
      .lte('latitude', result.lat + 0.15)
      .gte('longitude', result.lng - 0.15)
      .lte('longitude', result.lng + 0.15)
      .ilike('nome', result.nome)
      .limit(1)
      .maybeSingle();

    if (existing) return existing as CidadeRow;

    // 2. Não encontrou — inserir. Usar INSERT ... ON CONFLICT DO NOTHING
    //    e depois re-selecionar se houver conflito (condição de corrida).
    const { data: inserted, error } = await client
      .from('cidades')
      .insert({
        nome: result.nome,
        estado_nome: result.estado ?? null,
        pais_nome: result.pais ?? null,
        latitude: result.lat,
        longitude: result.lng,
        // subdivisao_id omitido → null (agora nullable após migração)
      })
      .select('id, nome, estado_nome, pais_nome, latitude, longitude, grau_importancia')
      .maybeSingle();

    if (!error && inserted) return inserted as CidadeRow;

    // 3. Conflito de unicidade (outra instância inseriu ao mesmo tempo): busca novamente
    if (error?.code === '23505') {
      const { data: retry } = await client
        .from('cidades')
        .select('id, nome, estado_nome, pais_nome, latitude, longitude, grau_importancia')
        .gte('latitude', result.lat - 0.15)
        .lte('latitude', result.lat + 0.15)
        .gte('longitude', result.lng - 0.15)
        .lte('longitude', result.lng + 0.15)
        .ilike('nome', result.nome)
        .limit(1)
        .maybeSingle();
      if (retry) return retry as CidadeRow;
    }

    return null;
  } catch (err) {
    console.warn('[vendas/cidades-busca] falha ao find-or-create cidade:', result.nome, err);
    return null;
  }
}

export async function handleVendasCidadesBuscaGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster) {
      ensureModuloAccess(
        scope,
        ['vendas_consulta', 'vendas', 'vendas_cadastro'],
        1,
        'Sem acesso a Vendas.'
      );
    }

    const cidadeId = String(event.url.searchParams.get('id') || '').trim();
    const query = String(event.url.searchParams.get('q') || event.url.searchParams.get('search') || '').trim();
    const limite = parseLimit(event.url.searchParams.get('limite'));

    // Busca por ID (para pré-carregar cidade já selecionada)
    if (cidadeId) {
      if (!isUuid(cidadeId)) {
        return json({ error: 'id inválido.' }, { status: 400, headers: NO_STORE_HEADERS });
      }

      const { data, error } = await client
        .from('cidades')
        .select('id, nome, estado_nome, pais_nome, latitude, longitude, grau_importancia')
        .eq('id', cidadeId)
        .maybeSingle();

      if (error) throw error;
      return json(data ? toResponseItem(data as CidadeRow) : null, { headers: DYNAMIC_READ_HEADERS });
    }

    if (query.length < 2) {
      return json([], { headers: NO_STORE_HEADERS });
    }

    // Busca via geocoding externo (Nominatim)
    const geoResults = await buscarCidadesGeo(query, limite);
    if (!geoResults.length) {
      return json([], { headers: DYNAMIC_READ_HEADERS });
    }

    // Find-or-create no DB para preservar UUIDs (FK de vendas)
    const rows = (
      await Promise.all(geoResults.map((r) => findOrCreateCidade(client, r)))
    ).filter((r): r is CidadeRow => r !== null);

    return json(rows.map(toResponseItem), { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao buscar cidades.');
  }
}
