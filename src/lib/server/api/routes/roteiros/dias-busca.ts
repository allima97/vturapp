// Migrado para Hono de src/routes/api/v1/roteiros/dias-busca/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  ensureModuloAccess,
  sanitizePostgrestSearchTerm,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import { destinoIdValido } from '$lib/destinoIdentidade';
import { cidadeCadastrada } from './cidades-busca';
import {
  IdentidadeDestinoInvalida,
  resolverDestinoParaPersistencia
} from '$lib/server/destinoPersistencia';

type ScopeLike = { isAdmin?: boolean; isGestor?: boolean; isMaster?: boolean };

type SearchDayRow = {
  id: string;
  percurso?: string | null;
  cidade?: string | null;
  cidade_id?: string | null;
  descricao?: string | null;
  data?: string | null;
  roteiro_id?: string | null;
};

function shouldScopeByOwner(scope: ScopeLike) {
  return !scope.isAdmin && !scope.isGestor && !scope.isMaster;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMissingPercursoColumn(error: unknown) {
  const code = isRecord(error) ? String(error.code || '') : '';
  const msg = isRecord(error) ? String(error.message || '') : '';
  return (
    code === '42703' ||
    (/percurso/i.test(msg) &&
      /does not exist|nao existe|não existe|unknown column|column/i.test(msg))
  );
}

export async function handleRoteirosDiasBuscaGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    ensureModuloAccess(scope, ['Orcamentos'], 1, 'Sem acesso a Roteiros.');

    const cidadeExata = event.url.searchParams.get('cidade_exata')?.trim() || '';
    const cidadeId = event.url.searchParams.get('cidade_id')?.trim() || '';
    if (cidadeExata || cidadeId) {
      const db = event.platform?.env?.DB;
      if (!db) throw new Error('Banco D1 indisponível nesta requisição.');
      if (cidadeId && !destinoIdValido(cidadeId))
        return json({ error: 'Identidade da cidade inválida.' }, { status: 400 });
      let label = cidadeExata;
      if (cidadeId) {
        const geoDb = event.platform?.env?.GEO_DB;
        if (!geoDb) return json({ error: 'Busca geográfica indisponível.' }, { status: 503 });
        try {
          label = (await resolverDestinoParaPersistencia(db, geoDb, cidadeId)).cidade;
        } catch (error) {
          if (error instanceof IdentidadeDestinoInvalida)
            return json({ error: error.message }, { status: 400 });
          throw error;
        }
      } else if (label.length > 200 || !(await cidadeCadastrada(db, label))) {
        return json({ error: 'Selecione uma cidade cadastrada.' }, { status: 400 });
      }

      const offsetText = event.url.searchParams.get('offset') || '0';
      if (!/^\d{1,6}$/.test(offsetText))
        return json({ error: 'Página inválida.' }, { status: 400 });
      const offset = Number(offsetText);
      const termo = sanitizePostgrestSearchTerm(event.url.searchParams.get('q'));
      const filtros = [
        cidadeId
          ? '(cidade_id = ? OR (cidade_id IS NULL AND cidade = ?))'
          : '(cidade_id IS NULL AND cidade = ?)',
        "descricao IS NOT NULL AND TRIM(descricao) <> ''"
      ];
      const valores: (string | number)[] = cidadeId ? [cidadeId.toLowerCase(), label] : [label];
      if (!shouldScopeByOwner(scope) && scope.companyId && !scope.isAdmin && !scope.isMaster) {
        filtros.push('company_id = ?');
        valores.push(scope.companyId);
      } else if (shouldScopeByOwner(scope)) {
        filtros.push('created_by = ?');
        valores.push(user.id);
      }
      if (termo.length >= 2) {
        filtros.push("(descricao LIKE ? ESCAPE '\\' OR percurso LIKE ? ESCAPE '\\')");
        const busca = `%${termo.replace(/[\\%_]/g, '\\$&')}%`;
        valores.push(busca, busca);
      }
      const resultado = await db
        .prepare(
          `SELECT id, percurso, cidade, cidade_id, descricao, data, roteiro_id
           FROM legado_roteiro_dia WHERE ${filtros.join(' AND ')}
           ORDER BY created_at DESC, id DESC LIMIT 21 OFFSET ?`
        )
        .bind(...valores, offset)
        .all<SearchDayRow>();
      return json(
        { dias: resultado.results.slice(0, 20), temMais: resultado.results.length > 20 },
        { headers: DYNAMIC_READ_HEADERS }
      );
    }

    const rawQ = sanitizePostgrestSearchTerm(event.url.searchParams.get('q'));
    const rawCidade = sanitizePostgrestSearchTerm(event.url.searchParams.get('cidade'));
    const q = rawQ.length >= 2 ? rawQ : '';
    const cidade = rawCidade.length >= 2 ? rawCidade : '';
    const companyId = scope.companyId;

    const runQuery = async (withPercurso: boolean) => {
      let query = client
        .from('roteiro_dia')
        .select(
          withPercurso
            ? 'id, percurso, cidade, cidade_id, descricao, data, roteiro_id'
            : 'id, cidade, cidade_id, descricao, data, roteiro_id'
        )
        .order('created_at', { ascending: false })
        .limit(20);

      if (!shouldScopeByOwner(scope) && companyId && !scope.isAdmin && !scope.isMaster) {
        query = query.eq('company_id', companyId);
      } else {
        if (shouldScopeByOwner(scope)) {
          query = query.eq('created_by', user.id);
        }
      }

      if (cidade) {
        query = query.ilike('cidade', `%${cidade}%`);
      }

      if (q) {
        if (withPercurso) {
          query = query.or(`descricao.ilike.%${q}%,percurso.ilike.%${q}%`);
        } else {
          query = query.ilike('descricao', `%${q}%`);
        }
      }

      return await query;
    };

    let data: SearchDayRow[] | null = null;
    let fetchError: unknown = null;

    const res1 = await runQuery(true);
    data = res1.data as SearchDayRow[] | null;
    fetchError = res1.error;

    if (fetchError && isMissingPercursoColumn(fetchError)) {
      const res2 = await runQuery(false);
      data = res2.data as SearchDayRow[] | null;
      fetchError = res2.error;
    }

    if (fetchError) throw fetchError;

    return json({ dias: data || [] }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao buscar dias.');
  }
}
