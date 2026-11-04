// Migrado para Hono de src/routes/api/v1/todo/item/[id]/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { ensureTodoAccess, mapTodoRow } from '$lib/server/agenda';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import {
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';

export async function handleTodoItemIdGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    ensureTodoAccess(scope, 1, 'Sem acesso a Tarefas.');

    const id = String(event.params.id || '').trim();
    if (!isUuid(id)) {
      return json({ error: 'id invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const result = await getCachedReadModel({
      key: buildReadModelCacheKey('todo:item', {
        id,
        userId: user.id,
        companyIds: scope.companyIds
      }),
      tags: [
        READ_MODEL_TAGS.todo,
        ...scopeCacheTags({ userId: user.id, companyIds: scope.companyIds })
      ],
      ttlMs: 60_000,
      staleTtlMs: 300_000,
      loader: async () => {
        const { data, error } = await client
          .from('agenda_itens')
          .select(
            'id, titulo, descricao, done, categoria_id, prioridade, status, arquivo, created_at, updated_at, user_id, tipo'
          )
          .eq('id', id)
          .maybeSingle();

        if (error) throw error;
        if (!data || data.tipo !== 'todo') {
          return { error: 'Tarefa nao encontrada.', status: 404 };
        }
        if (!scope.isAdmin && String(data.user_id || '') !== user.id) {
          return { error: 'Sem acesso a esta tarefa.', status: 403 };
        }

        let categoria = null;
        if (data.categoria_id) {
          const { data: categoriaData } = await client
            .from('todo_categorias')
            .select('id, nome, cor')
            .eq('id', data.categoria_id)
            .maybeSingle();

          if (categoriaData) {
            categoria = {
              id: String(categoriaData.id),
              nome: String(categoriaData.nome || ''),
              cor: categoriaData.cor ? String(categoriaData.cor) : null
            };
          }
        }

        return {
          item: mapTodoRow(data),
          categoria
        };
      }
    });

    if ('error' in result) {
      return json({ error: result.error }, { status: result.status, headers: NO_STORE_HEADERS });
    }

    return json(result, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar tarefa.');
  }
}
