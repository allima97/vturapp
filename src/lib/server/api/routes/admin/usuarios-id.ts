// Migrado para Hono de src/routes/api/v1/admin/usuarios/[id]/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  buildPermissionMatrix,
  ensureAssignableCompany,
  ensureAssignableUserType,
  ensureCanManageUsers,
  extractCompanyName,
  extractUserTypeName,
  getAccessibleCompanyIds,
  isFinanceiroRole,
  loadAvisoTemplates,
  loadFinanceiroCompanyIds,
  loadManagedCompanies,
  loadManagedUser,
  loadManagedUserTypes,
  loadUserPermissions,
  loadUserTypeDefaultPermissions,
  syncFinanceiroCompanyLinks,
  syncUserTypeDefaultPermissions
} from '$lib/server/admin';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import {
  invalidateReadModelCache,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_ADMIN_USER_BODY_BYTES = 64 * 1024;
const ADMIN_USER_ALLOWED_UPDATE_FIELDS = [
  'nome_completo',
  'telefone',
  'cidade',
  'estado',
  'active',
  'uso_individual',
  'participa_ranking',
  'user_type_id',
  'company_id',
  'cargo',
  'birth_date'
] as const;

function invalidateManagedUserCache(params: {
  actorId?: string | null;
  userId?: string | null;
  companyIds?: string[] | null;
}) {
  invalidateReadModelCache({
    tags: [
      READ_MODEL_TAGS.users,
      READ_MODEL_TAGS.finance,
      READ_MODEL_TAGS.dashboard,
      READ_MODEL_TAGS.comissoes
    ],
    scopeTags: [
      ...scopeCacheTags({ userId: params.actorId || null }),
      ...scopeCacheTags({ userId: params.userId || null, companyIds: params.companyIds || [] })
    ]
  });
}

function resolveFinanceiroCompanyIds(input: unknown, companyId?: string | null) {
  const values = Array.isArray(input) ? input.map((id: unknown) => String(id || '').trim()) : [];
  return Array.from(new Set([...values, ...(companyId ? [companyId] : [])]));
}

export async function handleAdminUsuariosIdGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    ensureCanManageUsers(scope);

    const userId = String(event.params.id || '').trim();
    const targetUser = await loadManagedUser(client, scope, userId);
    const [permissions, defaultPermissions, userTypes, companies, templates, financeiroCompanyIds] =
      await Promise.all([
        loadUserPermissions(client, userId),
        targetUser.user_type_id
          ? loadUserTypeDefaultPermissions(client, String(targetUser.user_type_id))
          : Promise.resolve([]),
        loadManagedUserTypes(client, scope),
        loadManagedCompanies(client, scope),
        loadAvisoTemplates(client).catch(() => []),
        loadFinanceiroCompanyIds(client, scope, userId)
      ]);

    return json({
      user: {
        id: targetUser.id,
        nome: targetUser.nome_completo || targetUser.email || 'Usuario sem nome',
        email: targetUser.email,
        telefone: targetUser.telefone || null,
        cidade: targetUser.cidade || null,
        estado: targetUser.estado || null,
        tipo: extractUserTypeName(targetUser) || 'OUTRO',
        tipo_id: targetUser.user_type_id || null,
        empresa: extractCompanyName(targetUser) || 'Sem empresa',
        empresa_id: targetUser.company_id || null,
        ativo: targetUser.active !== false && targetUser.ativo !== false,
        uso_individual: Boolean(targetUser.uso_individual),
        created_by_gestor: Boolean(targetUser.created_by_gestor),
        participa_ranking: Boolean(targetUser.participa_ranking),
        financeiro_company_ids: financeiroCompanyIds,
        created_at: targetUser.created_at || null,
        updated_at: targetUser.updated_at || null
      },
      permissions: buildPermissionMatrix(permissions),
      default_permissions: buildPermissionMatrix(defaultPermissions),
      available: {
        user_types: userTypes,
        companies,
        aviso_templates: templates,
        company_ids: getAccessibleCompanyIds(scope)
      },
      scope: {
        papel: scope.papel
      }
    });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar detalhe do usuario.');
  }
}

export async function handleAdminUsuariosIdPatch(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_ADMIN_USER_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    ensureCanManageUsers(scope);

    const userId = String(event.params.id || '').trim();
    const targetUser = await loadManagedUser(client, scope, userId);

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};
    let effectiveUserTypeName = extractUserTypeName(targetUser);

    if (body.company_id !== undefined) {
      ensureAssignableCompany(scope, String(body.company_id || '').trim());
    }

    if (body.user_type_id !== undefined) {
      const requestedTypeId = String(body.user_type_id || '').trim();
      if (!requestedTypeId) {
        if (!scope.isAdmin) {
          return json(
            { error: 'Tipo de usuario obrigatorio.' },
            { status: 400, headers: NO_STORE_HEADERS }
          );
        }
      } else {
        const managedTypes = await loadManagedUserTypes(client, scope);
        const targetType = managedTypes.find((row) => row.id === requestedTypeId);
        if (!targetType) {
          return json(
            { error: 'Tipo de usuario fora do escopo.' },
            { status: 403, headers: NO_STORE_HEADERS }
          );
        }
        ensureAssignableUserType(scope, targetType.name);
        effectiveUserTypeName = String(targetType.name || '')
          .trim()
          .toUpperCase();
      }
    }

    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    // Campos permitidos na tabela users
    for (const field of ADMIN_USER_ALLOWED_UPDATE_FIELDS) {
      if (body[field] !== undefined) updatePayload[field] = body[field];
    }
    const effectiveUsoIndividual =
      body.uso_individual !== undefined
        ? Boolean(body.uso_individual)
        : Boolean(targetUser.uso_individual);
    const effectiveCompanyId =
      body.company_id !== undefined
        ? String(body.company_id || '').trim()
        : String(targetUser.company_id || '').trim();
    const financeiroCompanyIds = resolveFinanceiroCompanyIds(
      body.financeiro_company_ids,
      effectiveCompanyId
    );
    if (isFinanceiroRole(effectiveUserTypeName)) {
      if (effectiveUsoIndividual) {
        return json(
          { error: 'Usuario financeiro deve ser corporativo e vinculado a empresa.' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      if (financeiroCompanyIds.length === 0) {
        return json(
          { error: 'Usuario financeiro deve ser vinculado a pelo menos uma empresa.' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      updatePayload.participa_ranking = false;
    }
    const shouldSyncFinanceiroLinks =
      isFinanceiroRole(effectiveUserTypeName) &&
      (Array.isArray(body.financeiro_company_ids) ||
        body.user_type_id !== undefined ||
        body.company_id !== undefined);

    if (Object.keys(updatePayload).length === 1 && !shouldSyncFinanceiroLinks) {
      return json(
        { error: 'Nenhum campo para atualizar.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    let data: unknown = {
      id: targetUser.id,
      nome_completo: targetUser.nome_completo,
      email: targetUser.email,
      active: targetUser.active,
      uso_individual: targetUser.uso_individual,
      user_type_id: targetUser.user_type_id,
      company_id: targetUser.company_id
    };

    if (Object.keys(updatePayload).length > 1) {
      const { data: updatedUser, error } = await client
        .from('users')
        .update(updatePayload)
        .eq('id', userId)
        .select('id, nome_completo, email, active, uso_individual, user_type_id, company_id')
        .maybeSingle();

      if (error) throw error;
      if (!updatedUser)
        return json(
          { error: 'Usuário não encontrado.' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      data = updatedUser;
    }

    // Sincronizar permissões se user_type_id mudou
    if (body.user_type_id && body.user_type_id !== targetUser.user_type_id) {
      try {
        await syncUserTypeDefaultPermissions(client, userId, String(body.user_type_id));
      } catch {
        // não fatal — permissões serão atualizadas manualmente
      }
    }

    if (shouldSyncFinanceiroLinks) {
      await syncFinanceiroCompanyLinks(client, scope, userId, financeiroCompanyIds, user.id);
    }

    invalidateManagedUserCache({
      actorId: user.id,
      userId,
      companyIds: financeiroCompanyIds
    });

    return json({ ok: true, user: data }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao atualizar usuario.');
  }
}
