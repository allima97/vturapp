import { json, type RequestEvent } from '@sveltejs/kit';
import { destinoIdValido } from '$lib/destinoIdentidade';
import {
  IdentidadeDestinoInvalida,
  resolverDestinoParaPersistencia
} from '$lib/server/destinoPersistencia';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import {
  ensureModuloAccess,
  getAdminClient,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';

type CidadeCadastro = {
  nome: string;
  estado_nome: string | null;
  pais_nome: string | null;
};

const CIDADES_SELECT = `SELECT c.nome,
  COALESCE(s.nome, c.estado_nome) AS estado_nome,
  COALESCE(p.nome, c.pais_nome) AS pais_nome
  FROM legado_cidades c
  LEFT JOIN legado_subdivisoes s ON s.id = c.subdivisao_id
  LEFT JOIN legado_paises p ON p.id = s.pais_id`;

const CAMPOS_CIDADE_ROTEIRO = [
  { key: 'dias', titulo: 'Itinerário' },
  { key: 'hoteis', titulo: 'Hotéis' },
  { key: 'passeios', titulo: 'Passeios' },
  { key: 'opcionais', titulo: 'Opcionais' }
] as const;

export function validarIdentidadesExplicitas(body: Record<string, unknown>) {
  for (const { key, titulo } of CAMPOS_CIDADE_ROTEIRO) {
    const registros = body[key];
    if (!Array.isArray(registros)) continue;
    for (const [indice, registro] of registros.entries()) {
      if (
        !registro ||
        typeof registro !== 'object' ||
        Array.isArray(registro) ||
        !Object.hasOwn(registro, 'cidade_id')
      )
        return `Identidade da cidade ausente em ${titulo}, item ${indice + 1}. Recarregue o roteiro antes de salvar.`;
    }
  }
  return null;
}

function labelCidade(cidade: CidadeCadastro) {
  return [cidade.nome, cidade.estado_nome, cidade.pais_nome]
    .map((parte) => parte?.trim())
    .filter(Boolean)
    .join(', ');
}

export async function buscarCidadesCadastro(db: D1Database, texto: string, limite: number) {
  const termo = texto.trim().replace(/[\\%_]/g, '\\$&');
  const resultado = await db
    .prepare(
      `${CIDADES_SELECT}
       WHERE c.nome LIKE ? ESCAPE '\\' OR c.nome_ptBR LIKE ? ESCAPE '\\'
       ORDER BY c.nome, estado_nome, pais_nome LIMIT ?`
    )
    .bind(`${termo}%`, `${termo}%`, limite)
    .all<CidadeCadastro>();
  return [...new Set(resultado.results.map(labelCidade).filter(Boolean))];
}

export async function cidadeCadastrada(db: D1Database, label: string) {
  const nome = label.split(',')[0].trim();
  if (!nome) return false;
  const resultado = await db
    .prepare(`${CIDADES_SELECT} WHERE c.nome = ? COLLATE NOCASE`)
    .bind(nome)
    .all<CidadeCadastro>();
  return resultado.results.some((cidade) => labelCidade(cidade) === label);
}

export async function validarCidadesRoteiro(db: D1Database, body: Record<string, unknown>) {
  const resultado = await prepararCidadesRoteiro(db, undefined, body, false);
  return resultado.ok ? null : resultado.error;
}

export async function prepararCidadesGeograficasRoteiro(
  db: D1Database,
  geoDb: D1Database | undefined,
  body: Record<string, unknown>
): Promise<
  { ok: true; body: Record<string, unknown> } | { ok: false; status: 400 | 503; error: string }
> {
  return prepararCidadesRoteiro(db, geoDb, body, true);
}

async function prepararCidadesRoteiro(
  db: D1Database,
  geoDb: D1Database | undefined,
  body: Record<string, unknown>,
  permitirIdentidades: boolean
): Promise<
  { ok: true; body: Record<string, unknown> } | { ok: false; status: 400 | 503; error: string }
> {
  const preparado = { ...body };
  const destinos = new Map<string, { cidade_id: string; cidade: string }>();
  const cidadesLegadas = new Map<string, boolean>();
  for (const { key, titulo } of CAMPOS_CIDADE_ROTEIRO) {
    const registros = body[key];
    if (!Array.isArray(registros)) continue;
    const copia: unknown[] = [];
    for (const [indice, registro] of registros.entries()) {
      if (!registro || typeof registro !== 'object' || Array.isArray(registro)) {
        copia.push(registro);
        continue;
      }
      const entrada = registro as Record<string, unknown>;
      if (entrada.cidade_id != null) {
        if (!permitirIdentidades)
          return {
            ok: false,
            status: 400,
            error: `Identificação geográfica em ${titulo}, item ${indice + 1}, ainda não está disponível para salvar.`
          };
        if (!destinoIdValido(entrada.cidade_id))
          return {
            ok: false,
            status: 400,
            error: `Identificação geográfica inválida em ${titulo}, item ${indice + 1}.`
          };
        if (!geoDb)
          return { ok: false, status: 503, error: 'Busca geográfica ainda não está disponível.' };
        const id = entrada.cidade_id.toLowerCase();
        let destino = destinos.get(id);
        if (!destino) {
          try {
            destino = await resolverDestinoParaPersistencia(db, geoDb, id);
          } catch (err) {
            if (err instanceof IdentidadeDestinoInvalida)
              return {
                ok: false,
                status: 400,
                error: `${err.message} ${titulo}, item ${indice + 1}.`
              };
            throw err;
          }
          if (!destino.cidade || destino.cidade.length > 200)
            return {
              ok: false,
              status: 400,
              error: `Nome do destino em ${titulo}, item ${indice + 1}, excede o limite permitido.`
            };
          destinos.set(id, destino);
        }
        copia.push({ ...entrada, ...destino });
        continue;
      }
      const cidade = entrada.cidade;
      if (cidade != null && cidade !== '') {
        if (typeof cidade !== 'string')
          return {
            ok: false,
            status: 400,
            error: `Cidade inválida em ${titulo}, item ${indice + 1}. Selecione uma cidade do cadastro.`
          };
        if (!cidadesLegadas.has(cidade))
          cidadesLegadas.set(cidade, await cidadeCadastrada(db, cidade));
        if (!cidadesLegadas.get(cidade))
          return {
            ok: false,
            status: 400,
            error: `Cidade "${cidade}" em ${titulo}, item ${indice + 1}, não corresponde ao cadastro. Selecione a cidade novamente.`
          };
      }
      copia.push({ ...entrada });
    }
    preparado[key] = copia;
  }
  return { ok: true, body: preparado };
}

export async function handleRoteirosCidadesBuscaGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    ensureModuloAccess(scope, ['Orcamentos'], 1, 'Sem acesso a Roteiros.');
    const termo = (event.url.searchParams.get('q') ?? '').trim();
    if (termo.length < 2) return json([], { headers: NO_STORE_HEADERS });
    if (termo.length > 200)
      return json({ error: 'Cidade inválida.' }, { status: 400, headers: NO_STORE_HEADERS });
    const db = event.platform?.env?.DB;
    if (!db) throw new Error('Banco D1 indisponível nesta requisição.');
    const cidades = await buscarCidadesCadastro(db, termo, 50);
    return json(
      cidades.slice(0, 8).map((nome) => ({ nome })),
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    logServerError('[roteiros] falha ao buscar cidades cadastradas', err);
    return toErrorResponse(err, 'Erro ao buscar cidades cadastradas.');
  }
}
