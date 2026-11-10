// Migrado para Hono de src/routes/api/v1/todo/category/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { ensureTodoAccess } from '$lib/server/agenda';
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

const MAX_TODO_CATEGORY_BODY_BYTES = 16 * 1024;

type TodoCategoryBody = {
  id?: unknown;
  nome?: unknown;
  cor?: unknown;
};

function readTodoCategoryBody(value: unknown): TodoCategoryBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return {
    id: body.id,
    nome: body.nome,
    cor: body.cor
  };
}

export async function handleTodoCategoryPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_TODO_CATEGORY_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const body = readTodoCategoryBody(bodyResult.data);

    const id = String(body?.id || '').trim();
    const isEdit = Boolean(id);

    ensureTodoAccess(
      scope,
      isEdit ? 3 : 2,
      isEdit ? 'Sem permissao para editar categoria.' : 'Sem permissao para criar categoria.'
    );

    const nome = String(body?.nome || '').trim();
    if (!nome) {
      return json({ error: 'nome obrigatorio.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const cor = String(body?.cor || '').trim() || null;

    if (isEdit) {
      if (!isUuid(id)) {
        return json({ error: 'id invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
      }

      const { data: existing, error: existingError } = await client
        .from('todo_categorias')
        .select('id, user_id')
        .eq('id', id)
        .maybeSingle();

      if (existingError) throw existingError;
      if (!existing) {
        return json(
          { error: 'Categoria nao encontrada.' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }
      if (!scope.isAdmin && String(existing.user_id || '') !== user.id) {
        return json(
          { error: 'Sem acesso a esta categoria.' },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }

      const { data, error } = await client
        .from('todo_categorias')
        .update({ nome, cor })
        .eq('id', id)
        .select('id, nome, cor')
        .single();

      if (error) throw error;
      invalidateTodoReadModels({
        companyIds: scope.companyIds,
        userId: user.id
      });
      return json({ ok: true, item: data }, { headers: NO_STORE_HEADERS });
    }

    const { data, error } = await client
      .from('todo_categorias')
      .insert({
        nome,
        cor,
        user_id: user.id
      })
      .select('id, nome, cor')
      .single();

    if (error) throw error;

    invalidateTodoReadModels({ companyIds: scope.companyIds, userId: user.id });
    return json({ ok: true, item: data }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar categoria.');
  }
}

export async function handleTodoCategoryDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    ensureTodoAccess(scope, 4, 'Sem permissao para excluir categoria.');

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id)) {
      return json({ error: 'id invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { data: existing, error: existingError } = await client
      .from('todo_categorias')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) {
      return json(
        { error: 'Categoria nao encontrada.' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    if (!scope.isAdmin && String(existing.user_id || '') !== user.id) {
      return json(
        { error: 'Sem acesso a esta categoria.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const { count, error: linkError } = await client
      .from('agenda_itens')
      .select('id', { count: 'exact', head: true })
      .eq('tipo', 'todo')
      .eq('categoria_id', id);

    if (linkError) throw linkError;
    if (Number(count || 0) > 0) {
      return json(
        { error: 'Nao e possivel excluir categoria com tarefa vinculada.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { error } = await client.from('todo_categorias').delete().eq('id', id);
    if (error) throw error;

    invalidateTodoReadModels({ companyIds: scope.companyIds, userId: user.id });
    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir categoria.');
  }
}
