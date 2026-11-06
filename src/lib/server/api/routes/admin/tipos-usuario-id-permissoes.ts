// Migrado para Hono de src/routes/api/v1/admin/tipos-usuario/[id]/permissoes/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  buildPermissionMatrix,
  ensureAssignablePermissionSet,
  ensureCanManagePermissions,
  loadManagedUserTypes,
  loadUserTypeDefaultPermissions,
  saveDefaultPermissions
} from '$lib/server/admin';
import { agruparModulosPorSecao, MODULOS_ADMIN_PERMISSOES } from '$lib/admin/modules';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_TIPO_USUARIO_PERMISSOES_BODY_BYTES = 256 * 1024;

type UserTypePermissionsBody = {
  permissions?: unknown;
};

function readUserTypePermissionsBody(value: unknown): UserTypePermissionsBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return {
    permissions: body.permissions
  };
}

export async function handleAdminTiposUsuarioIdPermissoesGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const userTypeId = String(event.params.id || '').trim();

    ensureCanManagePermissions(scope);

    const userTypes = await loadManagedUserTypes(client, scope);
    if (!userTypes.some((row) => row.id === userTypeId)) {
      return new Response('Tipo de usuario fora do escopo.', {
        status: 403,
        headers: NO_STORE_HEADERS
      });
    }

    const rows = await loadUserTypeDefaultPermissions(client, userTypeId);
    return json(
      {
        permissions: buildPermissionMatrix(rows),
        sections: agruparModulosPorSecao(MODULOS_ADMIN_PERMISSOES)
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar permissoes padrao.');
  }
}

export async function handleAdminTiposUsuarioIdPermissoesPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(
      event.request,
      MAX_TIPO_USUARIO_PERMISSOES_BODY_BYTES
    );
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const userTypeId = String(event.params.id || '').trim();
    const body = readUserTypePermissionsBody(bodyResult.data);

    ensureCanManagePermissions(scope);

    const userTypes = await loadManagedUserTypes(client, scope);
    if (!userTypes.some((row) => row.id === userTypeId)) {
      return new Response('Tipo de usuario fora do escopo.', {
        status: 403,
        headers: NO_STORE_HEADERS
      });
    }

    const permissions = Array.isArray(body.permissions) ? body.permissions : [];
    ensureAssignablePermissionSet(scope, permissions);
    await saveDefaultPermissions(client, userTypeId, permissions);

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar permissoes padrao.');
  }
}
