// Migrado para Hono de src/routes/api/v1/parametros/cambios/+server.ts — corpo IDÊNTICO ao original
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
import { invalidateQuoteReadModels } from '$lib/server/readModelCache';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_PARAMETROS_CAMBIOS_BODY_BYTES = 32 * 1024;

export async function handleParametrosCambiosGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['parametros_cambios', 'cambios', 'parametros'],
        1,
        'Sem acesso a Câmbios.'
      );
    }

    let query = client
      .from('parametros_cambios')
      .select(
        'id, moeda, data, valor, created_at, owner_user_id, owner_user:owner_user_id(nome_completo)'
      )
      .order('data', { ascending: false })
      .order('created_at', { ascending: false });

    if (scope.companyId && !scope.isAdmin) {
      query = query.eq('company_id', scope.companyId);
    }

    const { data, error: queryError } = await query.limit(500);
    if (queryError) throw queryError;

    return json({ items: data || [] }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar câmbios.');
  }
}

export async function handleParametrosCambiosPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_PARAMETROS_CAMBIOS_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['parametros_cambios', 'cambios', 'parametros'],
        2,
        'Sem permissão para salvar câmbios.'
      );
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};
    const { id, moeda, data, valor } = body;
    const cambioId = String(id || '').trim();

    if (!String(moeda || '').trim())
      return json({ error: 'Moeda obrigatória.' }, { status: 400, headers: NO_STORE_HEADERS });
    if (!String(data || '').trim())
      return json({ error: 'Data obrigatória.' }, { status: 400, headers: NO_STORE_HEADERS });
    const valorNum = Number(valor);
    if (!Number.isFinite(valorNum) || valorNum <= 0)
      return json({ error: 'Valor inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const payload = {
      moeda: String(moeda).trim().toUpperCase(),
      data: String(data).trim(),
      valor: valorNum,
      owner_user_id: scope.userId,
      company_id: scope.companyId
    };

    let result;
    if (isUuid(cambioId)) {
      const { data: updated, error: updateError } = await client
        .from('parametros_cambios')
        .update(payload)
        .eq('id', cambioId)
        .select('id')
        .single();
      if (updateError) throw updateError;
      result = updated;
    } else {
      const { data: inserted, error: insertError } = await client
        .from('parametros_cambios')
        .insert(payload)
        .select('id')
        .single();
      if (insertError) throw insertError;
      result = inserted;
    }

    invalidateQuoteReadModels({
      companyIds: scope.companyId ? [scope.companyId] : null,
      userId: user.id
    });
    return json({ ok: true, id: result?.id }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar câmbio.');
  }
}

export async function handleParametrosCambiosDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['parametros_cambios', 'cambios', 'parametros'],
        3,
        'Sem permissão para excluir câmbios.'
      );
    }

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const { error: deleteError } = await client.from('parametros_cambios').delete().eq('id', id);
    if (deleteError) throw deleteError;

    invalidateQuoteReadModels({
      companyIds: scope.companyId ? [scope.companyId] : null,
      userId: user.id
    });
    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir câmbio.');
  }
}
