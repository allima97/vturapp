// Migrado para Hono de src/routes/api/v1/clientes/[id]/acompanhantes/[acompanhanteId]/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { ensureClienteAccess } from '$lib/server/clientes';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateClientReadModels } from '$lib/server/readModelCache';
import {
  readJsonBodyLimited,
  rejectCrossOriginRequest,
  rejectLargePayload
} from '$lib/server/requestGuards';

const MAX_ACOMPANHANTE_UPDATE_BODY_BYTES = 64 * 1024;
const MAX_ACOMPANHANTE_DELETE_BODY_BYTES = 8 * 1024;

export async function handleClientesIdAcompanhantesAcompanhanteIdPatch(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_ACOMPANHANTE_UPDATE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const clienteId = String(event.params.id || '').trim();
    const acompanhanteId = String(event.params.acompanhanteId || '').trim();

    await ensureClienteAccess(client, scope, clienteId, null, null, 2);

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};
    const nomeCompleto = String(body?.nome_completo || '').trim();
    if (!nomeCompleto) {
      return json(
        { error: 'Informe o nome completo do acompanhante.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { data, error } = await client
      .from('cliente_acompanhantes')
      .update({
        nome_completo: nomeCompleto,
        cpf: String(body?.cpf || '').replace(/\D/g, '') || null,
        telefone: String(body?.telefone || '').trim() || null,
        grau_parentesco: String(body?.grau_parentesco || '').trim() || null,
        rg: String(body?.rg || '').trim() || null,
        data_nascimento: String(body?.data_nascimento || '').trim() || null,
        observacoes: String(body?.observacoes || '').trim() || null,
        ativo: body?.ativo !== false,
        updated_at: new Date().toISOString()
      })
      .eq('id', acompanhanteId)
      .eq('cliente_id', clienteId)
      .select(
        'id, cliente_id, company_id, nome_completo, cpf, telefone, grau_parentesco, rg, data_nascimento, observacoes, ativo, created_at, updated_at'
      )
      .single();

    if (error) throw error;

    invalidateClientReadModels({
      companyIds: data?.company_id ? [data.company_id] : scope.companyIds,
      userId: user.id
    });

    return json(
      {
        item: data,
        message: 'Acompanhante atualizado com sucesso.'
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao atualizar acompanhante.');
  }
}

export async function handleClientesIdAcompanhantesAcompanhanteIdDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const payloadError = rejectLargePayload(event.request, MAX_ACOMPANHANTE_DELETE_BODY_BYTES);
    if (payloadError) return payloadError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const clienteId = String(event.params.id || '').trim();
    const acompanhanteId = String(event.params.acompanhanteId || '').trim();

    await ensureClienteAccess(client, scope, clienteId, null, null, 3);

    const { data: deleted, error } = await client
      .from('cliente_acompanhantes')
      .delete()
      .eq('id', acompanhanteId)
      .eq('cliente_id', clienteId)
      .select('company_id')
      .maybeSingle();

    if (error) throw error;

    invalidateClientReadModels({
      companyIds: deleted?.company_id ? [deleted.company_id] : scope.companyIds,
      userId: user.id
    });

    return json(
      {
        message: 'Acompanhante removido com sucesso.'
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao remover acompanhante.');
  }
}
