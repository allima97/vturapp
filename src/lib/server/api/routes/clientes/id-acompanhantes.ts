// Migrado para Hono de src/routes/api/v1/clientes/[id]/acompanhantes/+server.ts — corpo IDÊNTICO ao original
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
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { validateOptionalCPF } from '$lib/utils/validation';

const MAX_ACOMPANHANTE_CREATE_BODY_BYTES = 64 * 1024;

export async function handleClientesIdAcompanhantesGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const clienteId = String(event.params.id || '').trim();

    await ensureClienteAccess(client, scope, clienteId, null, null, 1);

    const { data, error } = await client
      .from('cliente_acompanhantes')
      .select(
        'id, cliente_id, company_id, nome_completo, cpf, telefone, grau_parentesco, rg, data_nascimento, observacoes, ativo, created_at, updated_at'
      )
      .eq('cliente_id', clienteId)
      .order('nome_completo', { ascending: true });

    if (error) throw error;

    return json({
      items: data || []
    });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar acompanhantes.');
  }
}

export async function handleClientesIdAcompanhantesPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_ACOMPANHANTE_CREATE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const clienteId = String(event.params.id || '').trim();

    await ensureClienteAccess(client, scope, clienteId, null, null, 2);

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};
    const nomeCompleto = String(body?.nome_completo || '').trim();
    if (!validateOptionalCPF(body.cpf)) {
      return json(
        { error: 'CPF inválido. Confira os dígitos informados.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (!nomeCompleto) {
      return json(
        { error: 'Informe o nome completo do acompanhante.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { data: clienteRow, error: clienteError } = await client
      .from('clientes')
      .select('id, company_id')
      .eq('id', clienteId)
      .maybeSingle();
    if (clienteError) throw clienteError;
    if (!clienteRow) {
      return json({ error: 'Cliente não encontrado.' }, { status: 404, headers: NO_STORE_HEADERS });
    }

    const { data, error } = await client
      .from('cliente_acompanhantes')
      .insert({
        cliente_id: clienteId,
        company_id: clienteRow.company_id || scope.companyId || scope.companyIds[0] || null,
        nome_completo: nomeCompleto,
        cpf: String(body?.cpf || '').replace(/\D/g, '') || null,
        telefone: String(body?.telefone || '').trim() || null,
        grau_parentesco: String(body?.grau_parentesco || '').trim() || null,
        rg: String(body?.rg || '').trim() || null,
        data_nascimento: String(body?.data_nascimento || '').trim() || null,
        observacoes: String(body?.observacoes || '').trim() || null,
        ativo: body?.ativo !== false,
        created_by: user.id
      })
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
        message: 'Acompanhante cadastrado com sucesso.'
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar acompanhante.');
  }
}
