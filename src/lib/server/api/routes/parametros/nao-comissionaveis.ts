// Migrado para Hono de src/routes/api/v1/parametros/nao-comissionaveis/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateSalesReadModels } from '$lib/server/readModelCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_NAO_COMISSIONAVEIS_BODY_BYTES = 32 * 1024;

type NaoComissionaveisBody = {
  id?: unknown;
  termo?: unknown;
  descricao?: unknown;
  ativo?: unknown;
};

function readNaoComissionaveisBody(value: unknown): NaoComissionaveisBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return {
    id: body.id,
    termo: body.termo,
    descricao: body.descricao,
    ativo: body.ativo
  };
}

export async function handleParametrosNaoComissionaveisGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Admin'], 1, 'Sem acesso.');
    }

    const query = client
      .from('parametros_pagamentos_nao_comissionaveis')
      .select('id, termo, termo_normalizado, ativo, created_at')
      .order('termo');

    const { data, error: queryError } = await query.limit(200);
    if (queryError) throw queryError;

    return json({ items: data || [] }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar termos não comissionáveis.');
  }
}

export async function handleParametrosNaoComissionaveisPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_NAO_COMISSIONAVEIS_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Admin'], 2, 'Sem permissão.');
    }

    const body = readNaoComissionaveisBody(bodyResult.data);
    const { id, termo, descricao, ativo } = body;
    const itemId = String(id || '').trim();

    if (!String(termo || '').trim()) {
      return json({ error: 'Termo obrigatório.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const payload = {
      termo: String(termo).trim(),
      termo_normalizado: String(termo)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' '),
      ativo: ativo !== false,
      created_by: scope.userId
    };

    let result;
    if (isUuid(itemId)) {
      const { data, error: updateError } = await client
        .from('parametros_pagamentos_nao_comissionaveis')
        .update(payload)
        .eq('id', itemId)
        .select('id')
        .single();
      if (updateError) throw updateError;
      result = data;
    } else {
      const { data, error: insertError } = await client
        .from('parametros_pagamentos_nao_comissionaveis')
        .insert(payload)
        .select('id')
        .single();
      if (insertError) throw insertError;
      result = data;
    }

    invalidateSalesReadModels();
    return json({ ok: true, id: result?.id }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar termo.');
  }
}

export async function handleParametrosNaoComissionaveisDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Admin'], 4, 'Sem permissão.');
    }

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const { error: deleteError } = await client
      .from('parametros_pagamentos_nao_comissionaveis')
      .delete()
      .eq('id', id);
    if (deleteError) throw deleteError;

    invalidateSalesReadModels();
    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir termo.');
  }
}
