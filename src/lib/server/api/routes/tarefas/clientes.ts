// Migrado para Hono de src/routes/api/v1/tarefas/clientes/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  logServerError,
  sanitizePostgrestSearchTerm,
  toErrorResponse
} from '$lib/server/v1';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import { chunkArray, QUERY_IN_BATCH_SIZE } from '$lib/utils/array';

type TarefaClienteRow = {
  id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  company_id: string | null;
};

const PT_BR_COLLATOR = new Intl.Collator('pt-BR');

function dedupeClientes(rows: TarefaClienteRow[]) {
  const map = new Map<string, TarefaClienteRow>();
  for (const row of rows) {
    const id = String(row?.id || '').trim();
    if (id && !map.has(id)) map.set(id, row);
  }
  return Array.from(map.values()).sort((left, right) =>
    PT_BR_COLLATOR.compare(String(left.nome || ''), String(right.nome || ''))
  );
}

export async function handleTarefasClientesGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['operacao_todo', 'tarefas', 'operacao', 'clientes'],
        1,
        'Sem acesso a Tarefas.'
      );
    }

    const rawSearch = sanitizePostgrestSearchTerm(
      event.url.searchParams.get('search')
    ).toLowerCase();
    const search = rawSearch.length >= 2 ? rawSearch : '';
    const companyIds = resolveScopedCompanyIds(scope, event.url.searchParams.get('empresa_id'));

    if (!scope.isAdmin && companyIds.length === 0) {
      return json({ items: [], total: 0 }, { headers: DYNAMIC_READ_HEADERS });
    }

    const payload = await getCachedReadModel({
      key: buildReadModelCacheKey('tarefas:clientes', {
        search,
        companyIds,
        userId: user.id,
        isAdmin: scope.isAdmin
      }),
      tags: [READ_MODEL_TAGS.clients, ...scopeCacheTags({ companyIds, userId: user.id })],
      ttlMs: search ? 60_000 : 300_000,
      staleTtlMs: search ? 300_000 : 1_800_000,
      loader: async () => {
        const buildQuery = (companyIdsFilter = companyIds) => {
          let query = client
            .from('clientes')
            .select('id, nome, email, telefone, company_id')
            .order('nome', { ascending: true })
            .limit(search ? 50 : 300);

          if (companyIdsFilter.length > 0) {
            query = query.in('company_id', companyIdsFilter);
          }

          if (search) {
            query = query.or(`nome.ilike.%${search}%,email.ilike.%${search}%`);
          }

          return query;
        };

        const fetchRows = async () => {
          if (companyIds.length <= QUERY_IN_BATCH_SIZE) {
            return buildQuery();
          }

          const rows: TarefaClienteRow[] = [];
          for (const batch of chunkArray(companyIds)) {
            const result = await buildQuery(batch);
            if (result.error) {
              return { data: null, error: result.error } as typeof result;
            }
            rows.push(...((result.data || []) as unknown as TarefaClienteRow[]));
            if (dedupeClientes(rows).length >= (search ? 50 : 300)) break;
          }

          return { data: dedupeClientes(rows).slice(0, search ? 50 : 300), error: null };
        };

        const { data, error } = await fetchRows();

        if (error) {
          throw error;
        }

        const items = ((data || []) as TarefaClienteRow[]).map((row) => ({
          id: row.id,
          nome: row.nome,
          email: row.email,
          telefone: row.telefone
        }));

        return { items, total: items.length };
      }
    });

    return json(payload, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    logServerError('[tarefas/clientes] falha ao carregar clientes', err);
    return toErrorResponse(err, 'Erro ao carregar clientes.');
  }
}
