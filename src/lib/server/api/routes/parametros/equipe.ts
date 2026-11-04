// Migrado para Hono de src/routes/api/v1/parametros/equipe/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { invalidateUserReadModels } from '$lib/server/readModelCache';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_PARAMETROS_EQUIPE_BODY_BYTES = 64 * 1024;

export async function handleParametrosEquipeGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['parametros_equipe', 'equipe', 'parametros'],
        1,
        'Sem acesso a Equipe.'
      );
    }

    // Busca usuários da empresa
    let usersQuery = client
      .from('users')
      .select('id, nome_completo, email, active, uso_individual, company_id, user_types(name)')
      .eq('active', true)
      .order('nome_completo');

    if (scope.companyId && !scope.isAdmin) {
      usersQuery = usersQuery.eq('company_id', scope.companyId);
    }

    const { data: usersData, error: usersError } = await usersQuery.limit(200);
    if (usersError) throw usersError;

    // Busca relações gestor-vendedor
    let relQuery = client.from('gestor_vendedor').select('gestor_id, vendedor_id, ativo');
    if (scope.isGestor) {
      relQuery = relQuery.eq('gestor_id', scope.userId);
    } else if (scope.companyId && !scope.isAdmin) {
      // Filtra por empresa via join
    }

    const { data: relData, error: relError } = await relQuery.limit(500);
    if (relError) throw relError;

    // Busca convites pendentes
    let convitesQuery = client
      .from('user_convites')
      .select(
        'id, invited_email, company_id, user_type_id, invited_by, invited_by_role, status, created_at, expires_at'
      )
      .eq('status', 'pending');

    if (scope.companyId && !scope.isAdmin) {
      convitesQuery = convitesQuery.eq('company_id', scope.companyId);
    }

    const { data: convitesData } = await convitesQuery
      .order('created_at', { ascending: false })
      .limit(100);

    // Busca tipos de usuário para o formulário de convite
    const { data: tiposData } = await client
      .from('user_types')
      .select('id, name')
      .order('name')
      .limit(50);

    return json(
      {
        usuarios: usersData || [],
        relacoes: relData || [],
        convites: convitesData || [],
        tipos_usuario: tiposData || []
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar equipe.');
  }
}

export async function handleParametrosEquipePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_PARAMETROS_EQUIPE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['parametros_equipe', 'equipe', 'parametros'],
        2,
        'Sem permissão para gerenciar equipe.'
      );
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};
    const { action, vendedor_id, ativo } = body;
    const vendedorId = String(vendedor_id || '').trim();

    if (action === 'toggle_relacao') {
      if (!isUuid(vendedorId))
        return json({ error: 'Vendedor inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

      const gestorId = scope.isGestor ? scope.userId : String(body.gestor_id || '').trim();
      if (!isUuid(gestorId))
        return json({ error: 'Gestor inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

      // Verifica se já existe
      const { data: existing } = await client
        .from('gestor_vendedor')
        .select('id, ativo')
        .eq('gestor_id', gestorId)
        .eq('vendedor_id', vendedorId)
        .maybeSingle();

      if (existing) {
        const { error: updateError } = await client
          .from('gestor_vendedor')
          .update({ ativo: ativo !== false })
          .eq('id', existing.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await client
          .from('gestor_vendedor')
          .insert({ gestor_id: gestorId, vendedor_id: vendedorId, ativo: ativo !== false });
        if (insertError) throw insertError;
      }

      invalidateUserReadModels({
        companyIds: scope.companyIds,
        vendedorIds: [gestorId, vendedorId],
        userId: user.id
      });
      return json({ ok: true }, { headers: NO_STORE_HEADERS });
    }

    return json({ error: 'Ação inválida.' }, { status: 400, headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao gerenciar equipe.');
  }
}
