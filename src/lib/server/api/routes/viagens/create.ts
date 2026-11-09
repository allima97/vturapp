// Migrado para Hono de src/routes/api/v1/viagens/create/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveScopedCompanyId,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { resolveViagemStatus } from '$lib/viagens/status';
import { invalidateTripReadModels } from '$lib/server/readModelCache';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { complementoDestinoOperacional } from '$lib/server/destinoOperacional';

const MAX_VIAGEM_CREATE_BODY_BYTES = 256 * 1024;

type ViagemCreateBody = {
  origem?: unknown;
  destino?: unknown;
  data_inicio?: unknown;
  data_fim?: unknown;
  status?: unknown;
  cliente_id?: unknown;
  observacoes?: unknown;
  follow_up_text?: unknown;
  follow_up_fechado?: unknown;
  company_id?: unknown;
  origem_geografica_id?: unknown;
  destino_geografico_id?: unknown;
};

function readViagemCreateBody(value: unknown): ViagemCreateBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return {
    origem: body.origem,
    destino: body.destino,
    data_inicio: body.data_inicio,
    data_fim: body.data_fim,
    status: body.status,
    cliente_id: body.cliente_id,
    observacoes: body.observacoes,
    follow_up_text: body.follow_up_text,
    follow_up_fechado: body.follow_up_fechado,
    company_id: body.company_id,
    origem_geografica_id: body.origem_geografica_id,
    destino_geografico_id: body.destino_geografico_id
  };
}

export async function handleViagensCreatePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_VIAGEM_CREATE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['operacao_viagens', 'viagens', 'operacao'],
        2,
        'Sem acesso a Viagens.'
      );
    }

    const body = readViagemCreateBody(bodyResult.data);
    const origem = String(body?.origem || '').trim();
    const destino = String(body?.destino || '').trim();
    const dataInicio = String(body?.data_inicio || '').trim();
    const dataFim = String(body?.data_fim || '').trim() || null;
    const status = resolveViagemStatus({
      status: body?.status,
      data_inicio: dataInicio,
      data_fim: dataFim
    });
    const clienteId = String(body?.cliente_id || '').trim();
    const observacoes = String(body?.observacoes || '').trim() || null;
    const followUpText = String(body?.follow_up_text || '').trim() || null;
    const followUpFechado = Boolean(body?.follow_up_fechado);
    const requestedCompanyId = isUuid(String(body?.company_id || ''))
      ? String(body.company_id)
      : null;

    if (!origem || !destino || !dataInicio || !clienteId) {
      return json(
        { error: 'Dados obrigatorios ausentes.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { data: clienteRow, error: clienteError } = await client
      .from('clientes')
      .select('id, company_id')
      .eq('id', clienteId)
      .maybeSingle();

    if (clienteError) throw clienteError;
    if (!clienteRow?.id) {
      return json({ error: 'Cliente não encontrado.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const clienteCompanyId = isUuid(clienteRow.company_id) ? String(clienteRow.company_id) : null;
    const requestedScopedCompanyId = resolveScopedCompanyId(scope, requestedCompanyId);
    const companyId = clienteCompanyId || requestedScopedCompanyId;

    if (!companyId) {
      return json(
        { error: 'Não foi possível determinar a empresa da viagem.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (
      !scope.isAdmin &&
      (!scope.companyIds.includes(companyId) ||
        (requestedCompanyId && requestedScopedCompanyId !== requestedCompanyId))
    ) {
      return json(
        { error: 'Sem acesso ao cliente selecionado.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const origemGeografica = await complementoDestinoOperacional(
      body,
      event.platform?.env?.DB,
      event.platform?.env?.GEO_DB,
      'origem_geografica_id',
      'origem'
    );
    if (!origemGeografica.ok)
      return json(
        { error: origemGeografica.error },
        { status: origemGeografica.status, headers: NO_STORE_HEADERS }
      );
    const destinoGeografico = await complementoDestinoOperacional(
      body,
      event.platform?.env?.DB,
      event.platform?.env?.GEO_DB,
      'destino_geografico_id',
      'destino'
    );
    if (!destinoGeografico.ok)
      return json(
        { error: destinoGeografico.error },
        { status: destinoGeografico.status, headers: NO_STORE_HEADERS }
      );
    const payload = {
      company_id: companyId,
      responsavel_user_id: user.id,
      cliente_id: clienteId,
      origem: origemGeografica.campos.origem || origem,
      destino: destinoGeografico.campos.destino || destino,
      ...origemGeografica.campos,
      ...destinoGeografico.campos,
      data_inicio: dataInicio,
      data_fim: dataFim,
      status,
      observacoes,
      follow_up_text: followUpText,
      follow_up_fechado: followUpFechado,
      orcamento_id: null
    };

    const { data, error } = await client
      .from('viagens')
      .insert(payload)
      .select('id, cliente_id, origem, destino, data_inicio, data_fim, status')
      .single();

    if (error) throw error;

    invalidateTripReadModels({
      companyIds: [companyId],
      vendedorIds: [user.id],
      userId: user.id
    });

    return json({ ok: true, viagem: data }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao criar viagem.');
  }
}
