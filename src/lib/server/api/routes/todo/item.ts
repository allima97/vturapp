// Migrado para Hono de src/routes/api/v1/todo/item/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureTodoAccess,
  mapTodoRow,
  normalizeTodoPriority,
  normalizeTodoStatus
} from '$lib/server/agenda';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateTodoReadModels } from '$lib/server/readModelCache';
import {
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';

async function ensureTodoCategoryOwnership(
  client: ReturnType<typeof getAdminClient>,
  userId: string,
  categoriaId: string | null
) {
  if (!categoriaId) return;

  const { data, error } = await client
    .from('todo_categorias')
    .select('id')
    .eq('id', categoriaId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error('Categoria invalida para este usuario.');
  }
}

async function loadTodoOwnership(client: ReturnType<typeof getAdminClient>, id: string) {
  const { data, error } = await client
    .from('agenda_itens')
    .select('id, user_id, tipo')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

const MAX_TODO_ITEM_BODY_BYTES = 32 * 1024;

export async function handleTodoItemPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_TODO_ITEM_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};

    const id = String(body?.id || '').trim();
    const isEdit = Boolean(id);

    ensureTodoAccess(
      scope,
      isEdit ? 3 : 2,
      isEdit ? 'Sem permissao para editar tarefa.' : 'Sem permissao para criar tarefa.'
    );

    const titulo = String(body?.titulo || '').trim();
    if (!titulo) {
      return json({ error: 'titulo obrigatorio.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const categoriaId =
      body?.categoria_id === null ? null : String(body?.categoria_id || '').trim() || null;
    if (categoriaId) {
      if (!isUuid(categoriaId)) {
        return json(
          { error: 'categoria_id invalido.' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      await ensureTodoCategoryOwnership(client, user.id, categoriaId);
    }

    const status = normalizeTodoStatus(body?.status);
    const done =
      typeof body?.done === 'boolean'
        ? body.done
        : status === 'em_andamento' || status === 'concluido';

    const payload = {
      titulo,
      descricao: String(body?.descricao || '').trim() || null,
      categoria_id: categoriaId,
      prioridade: normalizeTodoPriority(body?.prioridade),
      status,
      done
    };

    if (isEdit) {
      if (!isUuid(id)) {
        return json({ error: 'id invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
      }

      const existing = await loadTodoOwnership(client, id);
      if (!existing || existing.tipo !== 'todo') {
        return json(
          { error: 'Tarefa nao encontrada.' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }
      if (!scope.isAdmin && String(existing.user_id || '') !== user.id) {
        return json(
          { error: 'Sem acesso a esta tarefa.' },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }

      const { data, error } = await client
        .from('agenda_itens')
        .update(payload)
        .eq('id', id)
        .select(
          'id, titulo, descricao, done, categoria_id, prioridade, status, arquivo, created_at, updated_at'
        )
        .single();

      if (error) throw error;
      invalidateTodoReadModels({
        companyIds: scope.companyIds,
        userId: user.id
      });
      return json({ ok: true, item: data }, { headers: NO_STORE_HEADERS });
    }

    const companyId = scope.companyId || scope.companyIds[0] || null;
    const { data, error } = await client
      .from('agenda_itens')
      .insert({
        ...payload,
        tipo: 'todo',
        user_id: user.id,
        company_id: companyId
      })
      .select(
        'id, titulo, descricao, done, categoria_id, prioridade, status, arquivo, created_at, updated_at'
      )
      .single();

    if (error) throw error;

    invalidateTodoReadModels({ companyIds: scope.companyIds, userId: user.id });
    return json({ ok: true, item: data }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar tarefa.');
  }
}

export async function handleTodoItemPatch(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_TODO_ITEM_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    ensureTodoAccess(scope, 3, 'Sem permissao para arquivar tarefa.');

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};
    const id = String(body?.id || '').trim();
    const action = String(body?.action || '').trim();

    if (!isUuid(id)) {
      return json({ error: 'id invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    if (action !== 'archive' && action !== 'restore') {
      return json({ error: 'action invalida.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const existing = await loadTodoOwnership(client, id);
    if (!existing || existing.tipo !== 'todo') {
      return json({ error: 'Tarefa nao encontrada.' }, { status: 404, headers: NO_STORE_HEADERS });
    }
    if (!scope.isAdmin && String(existing.user_id || '') !== user.id) {
      return json(
        { error: 'Sem acesso a esta tarefa.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const updatedAt = new Date().toISOString();
    const { data, error } = await client
      .from('agenda_itens')
      .update({
        arquivo: action === 'archive' ? updatedAt : null,
        updated_at: updatedAt
      })
      .eq('id', id)
      .select(
        'id, titulo, descricao, done, categoria_id, prioridade, status, arquivo, created_at, updated_at'
      )
      .single();

    if (error) throw error;

    invalidateTodoReadModels({ companyIds: scope.companyIds, userId: user.id });
    return json({ ok: true, item: mapTodoRow(data) || data }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao arquivar tarefa.');
  }
}

export async function handleTodoItemDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    ensureTodoAccess(scope, 4, 'Sem permissao para excluir tarefa.');

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id)) {
      return json({ error: 'id invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const existing = await loadTodoOwnership(client, id);
    if (!existing || existing.tipo !== 'todo') {
      return json({ error: 'Tarefa nao encontrada.' }, { status: 404, headers: NO_STORE_HEADERS });
    }
    if (!scope.isAdmin && String(existing.user_id || '') !== user.id) {
      return json(
        { error: 'Sem acesso a esta tarefa.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const { error } = await client.from('agenda_itens').delete().eq('id', id);
    if (error) throw error;

    invalidateTodoReadModels({ companyIds: scope.companyIds, userId: user.id });
    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir tarefa.');
  }
}
