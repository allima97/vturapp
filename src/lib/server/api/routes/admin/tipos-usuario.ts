// Migrado para Hono de src/routes/api/v1/admin/tipos-usuario/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import {
  buildPermissionMatrix,
  ensureCanManagePermissions,
  isRestrictedUserTypeName,
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
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { chunkArray } from '$lib/utils/array';

const MAX_TIPO_USUARIO_BODY_BYTES = 32 * 1024;

type UserTypeBody = {
  action?: unknown;
  id?: unknown;
  name?: unknown;
  description?: unknown;
};

type DefaultPermissionRow = {
  user_type_id?: string | null;
  ativo?: boolean | null;
};

type UserTypeUserRow = {
  user_type_id?: string | null;
};

function readUserTypeBody(value: unknown): UserTypeBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return {
    action: body.action,
    id: body.id,
    name: body.name,
    description: body.description
  };
}

export async function handleAdminTiposUsuarioGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    ensureCanManagePermissions(scope);

    const userTypes = await loadManagedUserTypes(client, scope);
    const typeIds = userTypes.map((row) => row.id);

    const defaultPermRows: DefaultPermissionRow[] = [];
    const userRows: UserTypeUserRow[] = [];
    for (const batch of chunkArray(typeIds)) {
      if (batch.length === 0) continue;
      const [defaultPermsRes, usersRes] = await Promise.all([
        client
          .from('user_type_default_perms')
          .select('user_type_id, modulo, permissao, ativo')
          .in('user_type_id', batch),
        client.from('users').select('id, user_type_id').in('user_type_id', batch)
      ]);

      if (defaultPermsRes.error) throw defaultPermsRes.error;
      if (usersRes.error) throw usersRes.error;
      defaultPermRows.push(...((defaultPermsRes.data || []) as DefaultPermissionRow[]));
      userRows.push(...((usersRes.data || []) as UserTypeUserRow[]));
    }

    const defaultPermCounts = new Map<string, number>();
    for (const row of defaultPermRows) {
      if (row?.ativo === false || !row?.user_type_id) continue;
      defaultPermCounts.set(
        String(row.user_type_id),
        Number(defaultPermCounts.get(String(row.user_type_id)) || 0) + 1
      );
    }

    const userCounts = new Map<string, number>();
    for (const row of userRows) {
      if (!row?.user_type_id) continue;
      userCounts.set(
        String(row.user_type_id),
        Number(userCounts.get(String(row.user_type_id)) || 0) + 1
      );
    }

    return json(
      {
        items: userTypes.map((row) => ({
          id: row.id,
          nome: row.name,
          descricao: row.description || '',
          created_at: row.created_at || null,
          usuarios: Number(userCounts.get(row.id) || 0),
          permissoes_padrao: Number(defaultPermCounts.get(row.id) || 0)
        }))
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar tipos de usuario.');
  }
}

export async function handleAdminTiposUsuarioPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_TIPO_USUARIO_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const body = readUserTypeBody(bodyResult.data);

    ensureCanManagePermissions(scope);

    const action = String(body.action || 'save')
      .trim()
      .toLowerCase();
    const id = String(body.id || '').trim();
    const managedTypes = await loadManagedUserTypes(client, scope);

    if (action === 'delete') {
      if (!id)
        return new Response('Tipo de usuario nao informado.', {
          status: 400,
          headers: NO_STORE_HEADERS
        });
      if (!managedTypes.some((row) => row.id === id)) {
        return new Response('Tipo de usuario fora do escopo.', {
          status: 403,
          headers: NO_STORE_HEADERS
        });
      }
      const { error: deleteError } = await client.from('user_types').delete().eq('id', id);
      if (deleteError) throw deleteError;
      return json({ id, deleted: true }, { headers: NO_STORE_HEADERS });
    }

    const name = String(body.name || '').trim();
    const description = String(body.description || '').trim() || null;

    if (!name) {
      return new Response('Nome do tipo de usuario obrigatorio.', {
        status: 400,
        headers: NO_STORE_HEADERS
      });
    }
    if (!scope.isAdmin && isRestrictedUserTypeName(name)) {
      return new Response('Sem permissao para criar ou editar perfis ADMIN/MASTER.', {
        status: 403,
        headers: NO_STORE_HEADERS
      });
    }

    if (id) {
      if (!managedTypes.some((row) => row.id === id)) {
        return new Response('Tipo de usuario fora do escopo.', {
          status: 403,
          headers: NO_STORE_HEADERS
        });
      }
      const { error: updateError } = await client
        .from('user_types')
        .update({ name, description })
        .eq('id', id);
      if (updateError) throw updateError;
      return json({ id, updated: true }, { headers: NO_STORE_HEADERS });
    }

    const { data, error: insertError } = await client
      .from('user_types')
      .insert({ name, description })
      .select('id')
      .single();
    if (insertError) throw insertError;

    return json({ id: data.id, created: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar tipo de usuario.');
  }
}
