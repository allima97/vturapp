// Migrado para Hono de src/routes/api/v1/produtos/+server.ts — corpo IDÊNTICO ao original
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
import { fetchProdutosBase } from '$lib/server/cadastros-base';
import { CATALOG_READ_HEADERS, DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';

export async function handleProdutosGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Produtos'], 1, 'Sem acesso a Produtos.');
    }

    const payload = await fetchProdutosBase(client, scope, event.url.searchParams);
    return json(
      {
        items: payload.produtos,
        total: payload.total,
        tipos: payload.tipos,
        cidades: payload.cidades,
        fornecedores: payload.fornecedores
      },
      { headers: CATALOG_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar produtos.');
  }
}
