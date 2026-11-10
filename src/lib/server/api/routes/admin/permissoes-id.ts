// Migrado para Hono de src/routes/api/v1/admin/permissoes/[id]/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { registrarLog } from '$lib/server/auditLog';
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import {
  buildPermissionMatrix,
  ensureAssignablePermissionSet,
  ensureCanManagePermissions,
  loadManagedUser,
  loadSystemModuleSettings,
  loadUserPermissions,
  saveUserPermissions
} from '$lib/server/admin';
import {
  agruparModulosPorSecao,
  isMissingSystemModuleSettingsTable,
  listSystemModuleCatalog,
  MODULOS_ADMIN_PERMISSOES
} from '$lib/admin/modules';
import {
  getAdminClient,
  isUuid,
  logServerError,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateUserReadModels } from '$lib/server/readModelCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_PERMISSIONS_BODY_BYTES = 256 * 1024;

type SystemModuleSettingRow = {
  module_key?: string | null;
  enabled?: boolean | null;
  reason?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
};

export async function handleAdminPermissoesIdGet(event: RequestEvent) {
  try {
    const { session, user } = await event.locals.safeGetSession();
    if (!session || !user)
      return new Response('Sessao invalida.', { status: 401, headers: NO_STORE_HEADERS });

    const client = getAdminClient();
    const scope = await resolveUserScope(client, user.id);

    ensureCanManagePermissions(scope);

    const userId = String(event.params.id || '').trim();
    if (!isUuid(userId))
      return new Response('ID invalido.', { status: 400, headers: NO_STORE_HEADERS });

    const targetUser = await loadManagedUser(client, scope, userId);
    const permissions = await loadUserPermissions(client, userId);

    let globalModules: SystemModuleSettingRow[] = [];
    try {
      const settings = await loadSystemModuleSettings(client);
      globalModules = settings.rows;
    } catch (settingsError) {
      if (!isMissingSystemModuleSettingsTable(settingsError)) throw settingsError;
      globalModules = [];
    }

    return json(
      {
        user: {
          id: targetUser.id,
          nome: targetUser.nome_completo || targetUser.email || 'Usuario sem nome',
          email: targetUser.email || null
        },
        permissions: buildPermissionMatrix(permissions),
        global_modules: globalModules,
        sections: agruparModulosPorSecao(MODULOS_ADMIN_PERMISSOES),
        system_module_catalog: listSystemModuleCatalog(
          globalModules.map((row) => String(row.module_key || '').trim())
        )
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    logServerError('[admin/permissoes/[id]] falha ao carregar permissoes', err);
    return toErrorResponse(err, 'Erro ao carregar permissoes do usuario.');
  }
}

export async function handleAdminPermissoesIdPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_PERMISSIONS_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const { session, user } = await event.locals.safeGetSession();
    if (!session || !user)
      return new Response('Sessao invalida.', { status: 401, headers: NO_STORE_HEADERS });

    const client = getAdminClient();
    const scope = await resolveUserScope(client, user.id);

    ensureCanManagePermissions(scope);

    const userId = String(event.params.id || '').trim();
    if (!isUuid(userId))
      return new Response('ID invalido.', { status: 400, headers: NO_STORE_HEADERS });

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};

    const targetUser = await loadManagedUser(client, scope, userId);
    if (!targetUser)
      return new Response('Usuario fora do escopo.', { status: 403, headers: NO_STORE_HEADERS });

    const permissions = Array.isArray(body.permissions) ? body.permissions : [];
    ensureAssignablePermissionSet(scope, permissions);
    await saveUserPermissions(client, userId, permissions);
    registrarLog(event, {
      userId: user.id,
      modulo: 'Admin',
      acao: 'permissoes_atualizadas',
      detalhes: {
        permissoes: Object.fromEntries(
          (permissions as Array<{ modulo?: unknown; permissao?: unknown }>).map((item) => [
            String(item?.modulo ?? ''),
            String(item?.permissao ?? '')
          ])
        ),
        usuario_alterado_id: userId
      }
    });
    invalidateUserReadModels({
      userId,
      companyIds: scope.companyIds
    });

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logServerError('[admin/permissoes/[id]] falha ao salvar permissoes', err);
    return toErrorResponse(err, 'Erro ao salvar permissoes.');
  }
}
