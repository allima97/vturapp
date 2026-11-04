// Migrado para Hono de src/routes/api/v1/admin/planos/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_PLAN_BODY_BYTES = 16 * 1024;

type PlanBody = {
  id?: unknown;
  nome?: unknown;
  descricao?: unknown;
  valor_mensal?: unknown;
  moeda?: unknown;
  ativo?: unknown;
};

function readPlanBody(value: unknown): PlanBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return {
    id: body.id,
    nome: body.nome,
    descricao: body.descricao,
    valor_mensal: body.valor_mensal,
    moeda: body.moeda,
    ativo: body.ativo
  };
}

export async function handleAdminPlanosGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      return json(
        { error: 'Somente administradores podem acessar planos.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const { data, error: queryError } = await client
      .from('plans')
      .select('id, nome, descricao, valor_mensal, moeda, ativo')
      .order('nome');

    if (queryError) throw queryError;

    return json({ items: data || [] }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar planos.');
  }
}

export async function handleAdminPlanosPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_PLAN_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      return json(
        { error: 'Somente administradores podem gerenciar planos.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const body = readPlanBody(bodyResult.data);
    const { id, nome, descricao, valor_mensal, moeda, ativo } = body;
    const planId = String(id || '').trim();

    if (!String(nome || '').trim())
      return json({ error: 'Nome obrigatório.' }, { status: 400, headers: NO_STORE_HEADERS });

    const payload = {
      nome: String(nome).trim(),
      descricao: String(descricao || '').trim() || null,
      valor_mensal: Number(valor_mensal || 0),
      moeda: String(moeda || 'BRL').trim(),
      ativo: ativo !== false
    };

    let result;
    if (isUuid(planId)) {
      const { data, error: updateError } = await client
        .from('plans')
        .update(payload)
        .eq('id', planId)
        .select('id')
        .single();
      if (updateError) throw updateError;
      result = data;
    } else {
      const { data, error: insertError } = await client
        .from('plans')
        .insert(payload)
        .select('id')
        .single();
      if (insertError) throw insertError;
      result = data;
    }

    return json({ ok: true, id: result?.id }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar plano.');
  }
}

export async function handleAdminPlanosDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      return json({ error: 'Sem permissão.' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const { error: deleteError } = await client.from('plans').delete().eq('id', id);
    if (deleteError) throw deleteError;

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir plano.');
  }
}
