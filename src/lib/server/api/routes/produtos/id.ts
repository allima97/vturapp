// Migrado para Hono de src/routes/api/v1/produtos/[id]/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { fetchProdutoById, sanitizeProdutoPayload } from '$lib/server/cadastros-base';
import { invalidateCatalogReadModels } from '$lib/server/readModelCache';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_PRODUTO_UPDATE_BODY_BYTES = 128 * 1024;

function readProdutoUpdateBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function handleProdutosIdGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Produtos'], 1, 'Sem acesso a Produtos.');
    }

    const id = String(event.params.id || '').trim();
    if (!id) throw error(400, 'ID do produto é obrigatório.');
    if (!isUuid(id))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const produto = await fetchProdutoById(client, id);
    if (!produto) throw error(404, 'Produto não encontrado.');

    return json(produto, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar produto.');
  }
}

export async function handleProdutosIdPatch(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_PRODUTO_UPDATE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Produtos'], 3, 'Sem permissão para editar produtos.');
    }

    const id = String(event.params.id || '').trim();
    if (!id) throw error(400, 'ID do produto é obrigatório.');
    if (!isUuid(id))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const body = readProdutoUpdateBody(bodyResult.data);
    const payload = sanitizeProdutoPayload(body);

    if (!payload.nome) {
      return json(
        { error: 'Nome do produto é obrigatório.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (!payload.destino) {
      return json({ error: 'Destino é obrigatório.' }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (!payload.tipo_produto) {
      return json(
        { error: 'Tipo de produto é obrigatório.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (!payload.todas_as_cidades && !payload.cidade_id) {
      return json(
        { error: 'Cidade é obrigatória para produtos não globais.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const updatePayload = {
      ...payload,
      cidade_id: payload.todas_as_cidades ? null : payload.cidade_id
    };

    const { data, error: updateError } = await client
      .from('produtos')
      .update(updatePayload)
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (updateError) throw updateError;
    if (!data) throw error(404, 'Produto não encontrado.');

    invalidateCatalogReadModels({
      companyIds: scope.companyId ? [scope.companyId] : undefined,
      userId: user.id
    });
    const produto = await fetchProdutoById(client, id);
    return json({ success: true, data: produto }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao atualizar produto.');
  }
}

export async function handleProdutosIdDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Produtos'], 4, 'Sem permissão para excluir produtos.');
    }

    const id = String(event.params.id || '').trim();
    if (!id) throw error(400, 'ID do produto é obrigatório.');
    if (!isUuid(id))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const { error: tarifasError } = await client
      .from('produtos_tarifas')
      .delete()
      .eq('produto_id', id);
    if (tarifasError) throw tarifasError;

    const { error: deleteError } = await client.from('produtos').delete().eq('id', id);
    if (deleteError) throw deleteError;

    invalidateCatalogReadModels({
      companyIds: scope.companyId ? [scope.companyId] : undefined,
      userId: user.id
    });
    return json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir produto.');
  }
}
