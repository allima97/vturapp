import { json, type RequestEvent } from '@sveltejs/kit';
import { destinoIdValido } from '$lib/destinoIdentidade';
import { obterOuCriarCidadeGeografica } from '$lib/server/cidadesIdentidade';
import { IdentidadeDestinoInvalida } from '$lib/server/destinoPersistencia';
import {
  buscarDestinos,
  buscarDestinosExatos,
  obterDestino,
  referenciaAdministrativa
} from '$lib/server/destinosBusca';
import {
  criarDestinoPersonalizado,
  DestinoPersonalizadoDuplicado,
  DestinoPersonalizadoInvalido
} from '$lib/server/destinosPersonalizados';
import { getGeoNamesPlace, labelGeoNamesPlace, normalizeGeoName } from '$lib/server/geonames';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  ensureModuloAccess,
  getAdminClient,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';

function erro(message: string, status = 400) {
  return json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

function idioma(event: RequestEvent) {
  const value = event.url.searchParams.get('idioma') ?? 'pt';
  return /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i.test(value) && value.length <= 35 ? value : null;
}

const MODULOS_DESTINO = [
  'Cidades',
  'Cadastros',
  'Orcamentos',
  'Produtos',
  'Fornecedores',
  'consultoria_online',
  'consultoria',
  'operacao_viagens',
  'operacao_vouchers',
  'operacao_preferencias',
  'vendas',
  'vendas_cadastro'
];
const MODULOS_CONSULTA = [
  ...MODULOS_DESTINO,
  'vendas_consulta',
  'relatorios_vendas',
  'relatorios_destinos',
  'relatorios_produtos',
  'relatorios'
];

async function bancos(event: RequestEvent, acao: 'ler' | 'vincular' | 'cadastrar') {
  const client = getAdminClient();
  const user = await requireAuthenticatedUser(event);
  const scope = await resolveUserScope(client, user.id);
  ensureModuloAccess(
    scope,
    acao === 'cadastrar'
      ? ['Cidades', 'Cadastros']
      : acao === 'ler'
        ? MODULOS_CONSULTA
        : MODULOS_DESTINO,
    acao === 'ler' ? 1 : 2,
    'Sem permissão para acessar destinos.'
  );
  const db = event.platform?.env?.DB;
  const geoDb = event.platform?.env?.GEO_DB;
  if (!db || !geoDb) return null;
  return { db, geoDb };
}

export async function handleDestinosBuscaGet(event: RequestEvent) {
  try {
    const data = await bancos(event, 'ler');
    if (!data) return erro('Busca geográfica ainda não está disponível.', 503);
    const text = event.url.searchParams.get('q')?.trim() ?? '';
    const locale = idioma(event);
    const limiteRaw = event.url.searchParams.get('limite') ?? '8';
    const limite = Number(limiteRaw);
    if (text.length > 200 || normalizeGeoName(text).length > 200)
      return erro('Nome de destino muito longo.');
    if (!locale) return erro('Idioma inválido.');
    if (!/^[1-8]$/.test(limiteRaw)) return erro('Limite de busca inválido.');
    const result = await buscarDestinos(data.db, data.geoDb, text, locale, limite);
    return json(result, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logServerError('[destinos] falha ao buscar', err);
    return toErrorResponse(err, 'Erro ao buscar destinos.');
  }
}

export async function handleDestinoGet(event: RequestEvent) {
  try {
    const data = await bancos(event, 'ler');
    if (!data) return erro('Busca geográfica ainda não está disponível.', 503);
    const id = event.url.searchParams.get('id') ?? '';
    const locale = idioma(event);
    if (!destinoIdValido(id)) return erro('ID do destino inválido.');
    if (!locale) return erro('Idioma inválido.');
    const destino = await obterDestino(data.db, data.geoDb, id, locale);
    return destino
      ? json({ item: destino }, { headers: NO_STORE_HEADERS })
      : erro('Destino não encontrado.', 404);
  } catch (err) {
    logServerError('[destinos] falha ao consultar', err);
    return toErrorResponse(err, 'Erro ao consultar destino.');
  }
}

export async function handleDestinosExatosGet(event: RequestEvent) {
  try {
    const data = await bancos(event, 'ler');
    if (!data) return erro('Busca geográfica ainda não está disponível.', 503);
    const nome = event.url.searchParams.get('q')?.trim() ?? '';
    const locale = idioma(event);
    const pais = event.url.searchParams.get('pais') ?? '';
    const offsetRaw = event.url.searchParams.get('offset') ?? '0';
    const offset = Number(offsetRaw);
    if (!nome || nome.length > 200 || normalizeGeoName(nome).length > 200)
      return erro('Nome de destino inválido.');
    if (!locale) return erro('Idioma inválido.');
    if (pais && !/^[a-z]{2}$/i.test(pais)) return erro('Código de país inválido.');
    if (!/^(?:0|[1-9]\d{0,4})$/.test(offsetRaw) || offset > 10000)
      return erro('Deslocamento de busca inválido.');
    const resultado = await buscarDestinosExatos(data.geoDb, nome, locale, pais, offset);
    return json(resultado, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logServerError('[destinos] falha na busca exata', err);
    return toErrorResponse(err, 'Erro ao buscar destinos.');
  }
}

export async function handleDestinoPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const data = await bancos(event, 'cadastrar');
    if (!data) return erro('Cadastro geográfico ainda não está disponível.', 503);
    const body = await readJsonBodyLimited(event.request, 16 * 1024);
    if (!body.ok) return body.response;
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data))
      return erro('Dados inválidos.');
    const { nome, referenciaGeoNamesId } = body.data as Record<string, unknown>;
    const locale = idioma(event);
    if (!locale) return erro('Idioma inválido.');
    if (
      typeof nome !== 'string' ||
      typeof referenciaGeoNamesId !== 'number' ||
      !Number.isSafeInteger(referenciaGeoNamesId) ||
      referenciaGeoNamesId < 1
    )
      return erro('Nome ou localidade de referência inválidos.');
    const referencia = await getGeoNamesPlace(data.geoDb, referenciaGeoNamesId);
    if (!referencia) return erro('Localidade de referência não encontrada no GeoNames.');
    const referenciaLabel = await labelGeoNamesPlace(data.geoDb, referencia, locale);
    const destino = await criarDestinoPersonalizado(
      data.db,
      data.geoDb,
      nome,
      referenciaGeoNamesId
    );
    const label = [destino.nome, referenciaLabel.label].join(', ');
    return json(
      {
        item: {
          id: `personalizado:${destino.id}`,
          nome: destino.nome,
          label,
          origem: 'personalizado',
          referencia: referenciaAdministrativa(referenciaLabel)
        }
      },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    if (err instanceof DestinoPersonalizadoInvalido) return erro(err.message);
    if (err instanceof DestinoPersonalizadoDuplicado) return erro(err.message, 409);
    logServerError('[destinos] falha ao cadastrar', err);
    return toErrorResponse(err, 'Erro ao cadastrar destino.');
  }
}

export async function handleDestinoReferenciaPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const data = await bancos(event, 'vincular');
    if (!data) return erro('Cadastro geográfico ainda não está disponível.', 503);
    const body = await readJsonBodyLimited(event.request, 4096);
    if (!body.ok) return body.response;
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data))
      return erro('Dados inválidos.');
    const id = 'id' in body.data ? body.data.id : undefined;
    const cidade = await obterOuCriarCidadeGeografica(data.db, data.geoDb, id);
    return json(
      {
        item: {
          id: cidade.id,
          nome: cidade.nome,
          destino_geografico_id: cidade.destino_geografico_id
        }
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    if (err instanceof IdentidadeDestinoInvalida) return erro(err.message);
    logServerError('[destinos] falha ao vincular cidade', err);
    return toErrorResponse(err, 'Erro ao vincular cidade.');
  }
}
