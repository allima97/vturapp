// Migrado para Hono de src/routes/api/v1/todo/board/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { ensureTodoAccess, mapTodoRow } from '$lib/server/agenda';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';

export async function handleTodoBoardGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    ensureTodoAccess(scope, 1, 'Sem acesso a Tarefas.');

    const result = await getCachedReadModel({
      key: buildReadModelCacheKey('todo:board', {
        userId: user.id,
        companyIds: scope.companyIds
      }),
      tags: [
        READ_MODEL_TAGS.todo,
        READ_MODEL_TAGS.users,
        ...scopeCacheTags({ userId: user.id, companyIds: scope.companyIds })
      ],
      ttlMs: 60_000,
      staleTtlMs: 300_000,
      loader: async () => {
        const [categoriasResp, itensResp] = await Promise.all([
          client
            .from('todo_categorias')
            .select('id, nome, cor')
            .eq('user_id', user.id)
            .order('nome', { ascending: true }),
          client
            .from('agenda_itens')
            .select(
              'id, titulo, descricao, done, categoria_id, prioridade, status, arquivo, created_at, updated_at'
            )
            .eq('tipo', 'todo')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
        ]);

        if (categoriasResp.error) throw categoriasResp.error;
        if (itensResp.error) throw itensResp.error;

        const itens = [];
        for (const row of itensResp.data || []) {
          const item = mapTodoRow(row);
          if (item) itens.push(item);
        }

        return {
          categorias: (categoriasResp.data || []).map((row: any) => ({
            id: String(row.id),
            nome: String(row.nome || ''),
            cor: row.cor ? String(row.cor) : null
          })),
          itens
        };
      }
    });

    return json(result, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar tarefas.');
  }
}
