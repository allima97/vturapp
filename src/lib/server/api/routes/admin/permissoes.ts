// Migrado para Hono de src/routes/api/v1/admin/permissoes/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { registrarLog } from '$lib/server/auditLog';
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import {
  buildPermissionMatrix,
  ensureAssignablePermissionSet,
  ensureCanManagePermissions,
  listManagedUsers,
  loadSystemModuleSettings,
  saveSystemModuleSettings,
  saveUserPermissions,
  type ManagedPermissionRow
} from '$lib/server/admin';
import {
  agruparModulosPorSecao,
  isMissingSystemModuleSettingsTable,
  listSystemModuleCatalog,
  MODULOS_ADMIN_PERMISSOES
} from '$lib/admin/modules';
import { getAdminClient, logServerError, resolveUserScope, toErrorResponse } from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateUserReadModels } from '$lib/server/readModelCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { chunkArray } from '$lib/utils/array';

const MAX_PERMISSIONS_BODY_BYTES = 256 * 1024;

type SystemModuleSettingRows = Awaited<ReturnType<typeof loadSystemModuleSettings>>['rows'];

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function handleAdminPermissoesGet(event: RequestEvent) {
  try {
    const { session, user } = await event.locals.safeGetSession();
    if (!session || !user)
      return new Response('Sessao invalida.', { status: 401, headers: NO_STORE_HEADERS });

    const client = getAdminClient();
    const scope = await resolveUserScope(client, user.id);

    ensureCanManagePermissions(scope);

    const users = await listManagedUsers(client, scope);
    const userIds = users.map((row) => row.id);
    const permissionsRows: ManagedPermissionRow[] = [];

    for (const batch of chunkArray(userIds)) {
      if (batch.length === 0) continue;
      const permissionsRes = await client
        .from('modulo_acesso')
        .select('usuario_id, modulo, permissao, ativo')
        .in('usuario_id', batch);

      if (permissionsRes.error) throw permissionsRes.error;
      permissionsRows.push(...((permissionsRes.data || []) as ManagedPermissionRow[]));
    }

    const activePermissionCounts = new Map<string, number>();
    for (const item of permissionsRows) {
      const userId = String(item?.usuario_id || '').trim();
      if (!userId || item?.ativo === false || item?.permissao === 'none') continue;
      activePermissionCounts.set(userId, Number(activePermissionCounts.get(userId) || 0) + 1);
    }

    let globalModules: SystemModuleSettingRows = [];
    try {
      const settings = await loadSystemModuleSettings(client);
      globalModules = settings.rows;
    } catch (settingsError) {
      if (!isMissingSystemModuleSettingsTable(settingsError)) throw settingsError;
      globalModules = [];
    }

    return json(
      {
        items: users.map((row) => {
          const userType = firstRelation(row.user_types);
          const company = firstRelation(row.companies);

          return {
            id: row.id,
            nome: row.nome_completo || row.email || 'Usuario sem nome',
            email: row.email || null,
            tipo: userType?.name || 'OUTRO',
            empresa: company?.nome_fantasia || company?.nome_empresa || 'Sem empresa',
            ativos: Number(activePermissionCounts.get(row.id) || 0)
          };
        }),
        sections: agruparModulosPorSecao(MODULOS_ADMIN_PERMISSOES),
        global_modules: globalModules,
        system_module_catalog: listSystemModuleCatalog(
          globalModules.map((row) => String(row.module_key || '').trim())
        )
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    logServerError('[admin/permissoes] falha ao carregar painel', err);
    return toErrorResponse(err, 'Erro ao carregar painel de permissoes.');
  }
}

// Auditoria: lista completa de módulos desligados depois de salvar (formato do histórico).
async function listDisabledModules(client: ReturnType<typeof getAdminClient>) {
  const { data } = await client
    .from('system_module_settings')
    .select('module_key')
    .eq('enabled', false);
  return ((data || []) as Array<{ module_key: string | null }>)
    .map((row) => String(row.module_key || ''))
    .filter(Boolean);
}

export async function handleAdminPermissoesPost(event: RequestEvent) {
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

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};
    const action = String(body.action || 'user')
      .trim()
      .toLowerCase();

    if (action === 'global') {
      if (!scope.isAdmin) {
        return new Response('Somente ADMIN pode alterar modulos globais.', {
          status: 403,
          headers: NO_STORE_HEADERS
        });
      }
      await saveSystemModuleSettings(client, Array.isArray(body.settings) ? body.settings : []);
      registrarLog(event, {
        userId: user.id,
        modulo: 'Admin',
        acao: 'modulos_globais_atualizados',
        detalhes: async () => ({ disabled_modules: await listDisabledModules(client) })
      });
      invalidateUserReadModels();
      return json({ ok: true }, { headers: NO_STORE_HEADERS });
    }

    const userId = String(body.user_id || '').trim();
    if (!userId) {
      return new Response('Usuario alvo nao informado.', {
        status: 400,
        headers: NO_STORE_HEADERS
      });
    }

    const managedUsers = await listManagedUsers(client, scope);
    const isManagedUser = managedUsers.some((row) => row.id === userId);
    if (!isManagedUser) {
      return new Response('Usuario fora do escopo.', { status: 403, headers: NO_STORE_HEADERS });
    }

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
    logServerError('[admin/permissoes] falha ao salvar permissoes', err);
    return toErrorResponse(err, 'Erro ao salvar permissoes.');
  }
}
