// GET /api/v1/roteiros/gerar-ia/permissao — diz ao front se o usuário logado
// pode usar "Gerar com IA" (e os limites configurados), para mostrar ou
// esconder o botão sem expor a lógica de liberação no cliente.
import { json, type RequestEvent } from '@sveltejs/kit';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { carregarPermissaoRoteiroIA } from '$lib/server/roteiroIA/permissao';
import {
  ensureModuloAccess,
  getAdminClient,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';

export async function handleRoteirosGerarIaPermissaoGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    ensureModuloAccess(scope, ['Orcamentos'], 1, 'Sem acesso a Roteiros.');

    const env = event.platform?.env;
    const configurado = Boolean(env?.ANTHROPIC_API_KEY?.trim());
    const permissao = await carregarPermissaoRoteiroIA(env?.DB, user.id);
    const liberado = configurado && (scope.isAdmin || permissao.liberado);

    return json(
      {
        liberado,
        limite_dia: permissao.limiteDia,
        limite_mes: permissao.limiteMes
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    logServerError('[roteiro-ia] falha ao checar permissao', err);
    return toErrorResponse(err, 'Erro ao checar permissão de IA.');
  }
}
