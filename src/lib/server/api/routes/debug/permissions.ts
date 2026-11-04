// Migrado para Hono de src/routes/api/v1/debug/permissions/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  getAdminClient,
  isDebugEndpointEnabled,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';

const DEBUG_HEADERS = NO_STORE_HEADERS;

export async function handleDebugPermissionsGet(event: RequestEvent) {
  try {
    if (!isDebugEndpointEnabled(event)) {
      return json({ error: 'Not found' }, { status: 404, headers: DEBUG_HEADERS });
    }

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    // ✅ Apenas administradores podem acessar este endpoint de debug
    if (!scope.isAdmin) {
      return json(
        { error: 'Acesso restrito a administradores.' },
        { status: 403, headers: DEBUG_HEADERS }
      );
    }

    const { data: userData } = await client
      .from('users')
      .select('id, company_id, nome_completo, email, uso_individual, user_type_id')
      .eq('id', user.id)
      .single();

    const { data: permissoes } = await client
      .from('modulo_acesso')
      .select('modulo, permissao, ativo')
      .eq('usuario_id', user.id);

    // Empresas filtradas pelo escopo do admin
    const { data: empresas } =
      scope.companyIds.length > 0
        ? await client.from('companies').select('id, nome_fantasia').in('id', scope.companyIds)
        : await client.from('companies').select('id, nome_fantasia');

    return json(
      {
        usuario: {
          id: user.id,
          email: user.email,
          nome: userData?.nome_completo,
          company_id: userData?.company_id,
          user_type_id: userData?.user_type_id,
          uso_individual: userData?.uso_individual
        },
        scope: {
          isAdmin: scope.isAdmin,
          isMaster: scope.isMaster,
          isGestor: scope.isGestor,
          isVendedor: scope.isVendedor,
          papel: scope.papel,
          companyIds: scope.companyIds,
          permissoes: scope.permissoes
        },
        permissoes_detalhadas: permissoes,
        empresas_disponiveis: empresas
      },
      { headers: DEBUG_HEADERS }
    );
  } catch (err: unknown) {
    logServerError('[debug/permissions]', err);
    return json({ error: 'Erro interno.' }, { status: 500, headers: DEBUG_HEADERS });
  }
}
