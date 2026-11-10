// Migrado para Hono de src/routes/api/v1/admin/tipos-usuario/[id]/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import {
  buildPermissionMatrix,
  ensureCanManagePermissions,
  loadManagedUserTypes,
  loadUserTypeDefaultPermissions
} from '$lib/server/admin';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';

type UserTypeDetailUserRow = {
  id: string;
  nome_completo?: string | null;
  email?: string | null;
};

export async function handleAdminTiposUsuarioIdGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const typeId = String(event.params.id || '').trim();

    ensureCanManagePermissions(scope);

    const userTypes = await loadManagedUserTypes(client, scope);
    const target = userTypes.find((row) => row.id === typeId);
    if (!target) {
      return new Response('Tipo de usuario nao encontrado.', {
        status: 404,
        headers: NO_STORE_HEADERS
      });
    }

    const [defaultPermsRes, usersRes] = await Promise.all([
      loadUserTypeDefaultPermissions(client, typeId),
      client
        .from('users')
        .select('id, nome_completo, email')
        .eq('user_type_id', typeId)
        .order('nome_completo')
    ]);

    if (usersRes.error) throw usersRes.error;

    return json(
      {
        tipo: target,
        default_permissions: buildPermissionMatrix(defaultPermsRes),
        usuarios: ((usersRes.data || []) as UserTypeDetailUserRow[]).map((row) => ({
          id: row.id,
          nome: row.nome_completo || row.email || 'Usuario sem nome',
          email: row.email || null
        }))
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar detalhe do tipo de usuario.');
  }
}
