// Migrado para Hono de src/routes/api/v1/produtos/create/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { fetchProdutoById, sanitizeProdutoPayload } from '$lib/server/cadastros-base';
import { invalidateCatalogReadModels } from '$lib/server/readModelCache';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_PRODUTO_CREATE_BODY_BYTES = 128 * 1024;

function readProdutoCreateBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

export async function handleProdutosCreatePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_PRODUTO_CREATE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Produtos'], 2, 'Sem permissão para criar produtos.');
    }

    const body = readProdutoCreateBody(bodyResult.data);
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

    const insertPayload = {
      ...payload,
      cidade_id: payload.todas_as_cidades ? null : payload.cidade_id
    };

    const { data, error: insertError } = await client
      .from('produtos')
      .insert([insertPayload])
      .select('id')
      .single();

    if (insertError) throw insertError;

    invalidateCatalogReadModels({
      companyIds: scope.companyId ? [scope.companyId] : undefined,
      userId: user.id
    });
    const produto = await fetchProdutoById(client, data.id);
    return json({ success: true, data: produto }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao criar produto.');
  }
}
