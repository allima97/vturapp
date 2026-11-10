// Migrado para Hono de src/routes/api/v1/admin/usuarios/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  createOrReuseAuthUser,
  ensureAssignableCompany,
  ensureAssignableUserType,
  ensureCanManageUsers,
  extractCompanyName,
  extractUserTypeName,
  getAccessibleCompanyIds,
  isFinanceiroRole,
  listManagedUsers,
  loadManagedUser,
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

type UserTypeNameRow = {
  name?: string | null;
};

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

function matchesSearch(haystack: string, query: string) {
  return haystack.toLowerCase().includes(query);
}

function resolveFinanceiroCompanyIds(input: unknown[], companyId?: string | null) {
  return Array.from(
    new Set([
      ...input.map((id: unknown) => String(id || '').trim()),
      ...(companyId ? [companyId] : [])
    ])
  );
}

export async function handleAdminUsuariosGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    ensureCanManageUsers(scope);

    const search = String(event.url.searchParams.get('q') || '').trim();
    const tipo = String(event.url.searchParams.get('tipo') || '')
      .trim()
      .toUpperCase();
    const companyId = String(
      event.url.searchParams.get('company_id') || event.url.searchParams.get('empresa_id') || ''
    ).trim();
    const status = String(
      event.url.searchParams.get('status') || event.url.searchParams.get('ativo') || ''
    )
      .trim()
      .toLowerCase();
    const usoIndividual = String(event.url.searchParams.get('uso_individual') || '')
      .trim()
      .toLowerCase();

    let rows = await listManagedUsers(client, scope);

    if (search) {
      const searchLower = search.toLowerCase();
      rows = rows.filter((row) =>
        matchesSearch(
          [
            row.nome_completo || '',
            row.email || '',
            extractUserTypeName(row),
            extractCompanyName(row)
          ].join(' '),
          searchLower
        )
      );
    }

    if (tipo) {
      rows = rows.filter((row) => extractUserTypeName(row) === tipo);
    }

    if (companyId) {
      rows = rows.filter((row) => String(row.company_id || '') === companyId);
    }

    if (status) {
      const desired = status === 'ativo' || status === 'true';
      rows = rows.filter((row) => (row.active !== false && row.ativo !== false) === desired);
    }

    if (usoIndividual) {
      const desired = usoIndividual === 'true' || usoIndividual === 'sim';
      rows = rows.filter((row) => Boolean(row.uso_individual) === desired);
    }

    return json({
      items: rows.map((row) => ({
        id: row.id,
        nome: row.nome_completo || row.email || 'Usuario sem nome',
        email: row.email,
        telefone: row.telefone || null,
        cidade: row.cidade || null,
        estado: row.estado || null,
        tipo: extractUserTypeName(row) || 'OUTRO',
        tipo_id: row.user_type_id || null,
        empresa: extractCompanyName(row) || 'Sem empresa',
        empresa_id: row.company_id || null,
        ativo: row.active !== false && row.ativo !== false,
        uso_individual: Boolean(row.uso_individual),
        created_by_gestor: Boolean(row.created_by_gestor),
        participa_ranking: Boolean(row.participa_ranking),
        created_at: row.created_at || null,
        updated_at: row.updated_at || null
      })),
      scope: {
        papel: scope.papel,
        company_ids: getAccessibleCompanyIds(scope)
      }
    });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar usuarios.');
  }
}

export async function handleAdminUsuariosPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_ADMIN_USER_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};

    ensureCanManageUsers(scope);

    const requestedId = String(body.id || '').trim();
    const email = String(body.email || '')
      .trim()
      .toLowerCase();
    const password = String(body.password || '').trim();
    const nomeCompleto = String(body.nome_completo || '').trim() || null;
    const userTypeId = String(body.user_type_id || '').trim() || null;
    const companyId = String(body.company_id || '').trim() || null;
    const financeiroCompanyIdsInput = Array.isArray(body.financeiro_company_ids)
      ? body.financeiro_company_ids
      : [];
    const usoIndividual = Boolean(body.uso_individual);
    const active = body.active !== false;
    const participaRanking = Boolean(body.participa_ranking);

    let userTypeName = '';
    if (userTypeId) {
      const { data: userTypeRow, error: typeError } = await client
        .from('user_types')
        .select('id, name')
        .eq('id', userTypeId)
        .maybeSingle();

      if (typeError || !userTypeRow) {
        return new Response('Tipo de usuario invalido.', {
          status: 400,
          headers: NO_STORE_HEADERS
        });
      }

      userTypeName = String((userTypeRow as UserTypeNameRow).name || '')
        .trim()
        .toUpperCase();
      ensureAssignableUserType(scope, userTypeName);
    }

    if (!requestedId) {
      if (!email) {
        return new Response('E-mail obrigatorio para criar usuario.', {
          status: 400,
          headers: NO_STORE_HEADERS
        });
      }

      if (!password || password.length < 8) {
        return new Response('Senha obrigatoria com pelo menos 8 caracteres.', {
          status: 400,
          headers: NO_STORE_HEADERS
        });
      }

      if (!userTypeId) {
        return new Response('Tipo de usuario obrigatorio.', {
          status: 400,
          headers: NO_STORE_HEADERS
        });
      }

      if (!usoIndividual) {
        ensureAssignableCompany(scope, companyId);
      }

      if (!scope.isAdmin && usoIndividual) {
        return new Response('Somente ADMIN pode criar usuario individual sem empresa.', {
          status: 403,
          headers: NO_STORE_HEADERS
        });
      }

      const financeiroCompanyIds = resolveFinanceiroCompanyIds(
        financeiroCompanyIdsInput,
        companyId
      );
      if (isFinanceiroRole(userTypeName)) {
        if (usoIndividual) {
          return new Response('Usuario financeiro deve ser corporativo e vinculado a empresa.', {
            status: 400,
            headers: NO_STORE_HEADERS
          });
        }
        if (financeiroCompanyIds.length === 0) {
          return new Response('Usuario financeiro deve ser vinculado a pelo menos uma empresa.', {
            status: 400,
            headers: NO_STORE_HEADERS
          });
        }
      }

      const authResult = await createOrReuseAuthUser(client, { email, password });
      const userId = authResult.userId;

      const payload = {
        id: userId,
        email,
        nome_completo: nomeCompleto,
        user_type_id: userTypeId,
        company_id: usoIndividual ? null : companyId,
        uso_individual: usoIndividual,
        created_by_gestor: scope.isGestor,
        participa_ranking: isFinanceiroRole(userTypeName) ? false : participaRanking,
        active
      };

      const { error: upsertError } = await client.from('users').upsert(payload);
      if (upsertError) throw upsertError;

      await syncUserTypeDefaultPermissions(client, userId, userTypeId);
      if (isFinanceiroRole(userTypeName)) {
        await syncFinanceiroCompanyLinks(client, scope, userId, financeiroCompanyIds, user.id);
      }

      invalidateManagedUserCache({
        actorId: user.id,
        userId,
        companyIds: financeiroCompanyIds
      });

      return json({
        id: userId,
        created: authResult.created,
        reused_auth_user: !authResult.created
      });
    }

    const currentUser = await loadManagedUser(client, scope, requestedId);
    const effectiveUserTypeName = userTypeName || extractUserTypeName(currentUser);
    const effectiveUsoIndividual =
      'uso_individual' in body ? usoIndividual : Boolean(currentUser.uso_individual);
    const effectiveCompanyId = companyId || currentUser.company_id || null;
    const financeiroCompanyIds = resolveFinanceiroCompanyIds(
      financeiroCompanyIdsInput,
      effectiveCompanyId
    );

    if (requestedId !== scope.userId) {
      ensureAssignableCompany(scope, effectiveUsoIndividual ? null : effectiveCompanyId);
    }

    if (isFinanceiroRole(effectiveUserTypeName)) {
      if (effectiveUsoIndividual) {
        return new Response('Usuario financeiro deve ser corporativo e vinculado a empresa.', {
          status: 400,
          headers: NO_STORE_HEADERS
        });
      }
      if (financeiroCompanyIds.length === 0) {
        return new Response('Usuario financeiro deve ser vinculado a pelo menos uma empresa.', {
          status: 400,
          headers: NO_STORE_HEADERS
        });
      }
    }

    const updatePayload: Record<string, unknown> = {};
    if ('nome_completo' in body) updatePayload.nome_completo = nomeCompleto;
    if ('user_type_id' in body) updatePayload.user_type_id = userTypeId;
    if ('company_id' in body) updatePayload.company_id = usoIndividual ? null : companyId;
    if ('uso_individual' in body) updatePayload.uso_individual = usoIndividual;
    if (isFinanceiroRole(effectiveUserTypeName)) updatePayload.participa_ranking = false;
    else if ('participa_ranking' in body) updatePayload.participa_ranking = participaRanking;
    if ('active' in body) {
      updatePayload.active = active;
    }
    if ('email' in body && email) updatePayload.email = email;

    if (Object.keys(updatePayload).length === 0) {
      return new Response('Nenhuma alteracao informada.', {
        status: 400,
        headers: NO_STORE_HEADERS
      });
    }

    const { error: updateError } = await client
      .from('users')
      .update(updatePayload)
      .eq('id', requestedId);
    if (updateError) throw updateError;

    if (userTypeId) {
      await syncUserTypeDefaultPermissions(client, requestedId, userTypeId);
    }

    if (isFinanceiroRole(effectiveUserTypeName)) {
      await syncFinanceiroCompanyLinks(client, scope, requestedId, financeiroCompanyIds, user.id);
    }

    invalidateManagedUserCache({
      actorId: user.id,
      userId: requestedId,
      companyIds: financeiroCompanyIds
    });

    return json({ id: requestedId, updated: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar usuario.');
  }
}
