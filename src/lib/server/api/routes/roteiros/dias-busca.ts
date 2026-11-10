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
