import { json, type RequestEvent } from '@sveltejs/kit';
import { destinoIdValido } from '$lib/destinoIdentidade';
import { agruparDescricoes, filtrarDescricoes } from '$lib/descricoesDia';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import {
  ensureModuloAccess,
  getAdminClient,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse,
  type UserScope
} from '$lib/server/v1';

const LIMITE_BRUTO = 300;

type Linha = { descricao: string; created_at: string | null };

function filtroEmpresa(scope: UserScope) {
  if (scope.isAdmin) return { sql: '1 = 1', params: [] as string[] };
  if (scope.companyIds.length) {
    const marcas = scope.companyIds.map(() => '?').join(', ');
    return {
      sql: `(company_id IN (${marcas}) OR (company_id IS NULL AND created_by = ?))`,
      params: [...scope.companyIds, scope.userId]
    };
  }
  return { sql: 'created_by = ?', params: [scope.userId] };
}

export async function consultarDescricoesDia(
  db: D1Database,
  scope: UserScope,
  cidadeId: string,
  consulta: string,
  pagina: number,
  limite: number
) {
  const empresa = filtroEmpresa(scope);
  const roteiros = await db
    .prepare(
      `SELECT descricao, created_at
       FROM legado_roteiro_dia
       WHERE length(trim(descricao)) > 0
         AND cidade_id = ?
         AND ${empresa.sql}
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .bind(cidadeId, ...empresa.params, LIMITE_BRUTO)
    .all<Linha>();
  const circuitos = await db
    .prepare(
      `SELECT d.descricao, d.created_at
       FROM legado_circuito_dias d
       JOIN legado_circuito_dias_cidades dc ON dc.circuito_dia_id = d.id
       JOIN legado_cidades c ON c.id = dc.cidade_id
       WHERE length(trim(d.descricao)) > 0
         AND c.destino_geografico_id = ?
       ORDER BY d.created_at DESC
       LIMIT ?`
    )
    .bind(cidadeId, LIMITE_BRUTO)
    .all<Linha>();
  const agrupadas = agruparDescricoes([...roteiros.results, ...circuitos.results]);
  const filtradas = filtrarDescricoes(agrupadas, consulta);
  const inicio = (pagina - 1) * limite;
  return {
    total: agrupadas.length,
    filtrados: filtradas.length,
    pagina,
    paginas: Math.max(1, Math.ceil(filtradas.length / limite)),
    limite,
    limitado: roteiros.results.length === LIMITE_BRUTO || circuitos.results.length === LIMITE_BRUTO,
    itens: filtradas.slice(inicio, inicio + limite).map(({ texto, usos }) => ({ texto, usos }))
  };
}

export async function handleRoteirosDescricoesDiaGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    ensureModuloAccess(scope, ['Orcamentos'], 1, 'Sem acesso a Roteiros.');
    const cidadeId = (event.url.searchParams.get('cidade_id') ?? '').trim();
    if (!destinoIdValido(cidadeId))
      return json(
        { error: 'Informe a cidade para buscar descrições.' },
        { status: 400, headers: DYNAMIC_READ_HEADERS }
      );
    const consulta = (event.url.searchParams.get('q') ?? '').trim();
    if (consulta.length > 80)
      return json(
        { error: 'A busca da descrição é longa demais.' },
        { status: 400, headers: DYNAMIC_READ_HEADERS }
      );
    const pagina = Number(event.url.searchParams.get('pagina') ?? '1');
    const limite = Number(event.url.searchParams.get('limite') ?? '8');
    if (!Number.isInteger(pagina) || pagina < 1 || pagina > 100)
      return json({ error: 'Página inválida.' }, { status: 400, headers: DYNAMIC_READ_HEADERS });
    if (!Number.isInteger(limite) || limite < 1 || limite > 20)
      return json({ error: 'Limite inválido.' }, { status: 400, headers: DYNAMIC_READ_HEADERS });
    const db = event.platform?.env?.DB;
    if (!db) throw new Error('Banco D1 indisponível nesta requisição.');
    return json(await consultarDescricoesDia(db, scope, cidadeId, consulta, pagina, limite), {
      headers: DYNAMIC_READ_HEADERS
    });
  } catch (err) {
    logServerError('[roteiros] falha ao listar descrições do dia', err);
    return toErrorResponse(err, 'Erro ao listar descrições do dia.');
  }
}
