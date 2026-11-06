// Migrado para Hono de src/routes/api/v1/circuitos/[id]/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';

const MAX_CIRCUITO_UPDATE_BODY_BYTES = 128 * 1024;
const CIRCUITO_ALLOWED_UPDATE_FIELDS = ['nome', 'codigo', 'operador', 'resumo', 'ativo'];

function readCircuitoUpdateBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function handleCircuitosIdGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Circuitos'], 1, 'Sem acesso a Circuitos.');
    }

    const id = String(event.params.id || '').trim();
    if (!isUuid(id))
      return json(
        { success: false, error: 'ID inválido.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );

    const { data, error } = await client
      .from('circuitos')
      .select(
        `
        id, nome, codigo, operador, resumo, ativo, created_at,
        circuito_dias(id, dia_numero, titulo, descricao),
        circuito_datas(id, data_inicio, cidade_inicio_id, dias_extra_antes, dias_extra_depois)
      `
      )
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data)
      return json(
        { success: false, error: 'Circuito não encontrado' },
        { status: 404, headers: NO_STORE_HEADERS }
      );

    return json({ success: true, item: data }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err: unknown) {
    return toErrorResponse(err, 'Erro ao carregar circuito.');
  }
}

export async function handleCircuitosIdPatch(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_CIRCUITO_UPDATE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Circuitos'], 3, 'Sem permissão para editar circuitos.');
    }

    const id = String(event.params.id || '').trim();
    if (!isUuid(id))
      return json(
        { success: false, error: 'ID inválido.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );

    const body = readCircuitoUpdateBody(bodyResult.data);

    // Apenas colunas reais da tabela circuitos
    const payload: Record<string, unknown> = {};
    for (const key of CIRCUITO_ALLOWED_UPDATE_FIELDS) {
      if (key in body) payload[key] = body[key];
    }

    const { data, error } = await client
      .from('circuitos')
      .update(payload)
      .eq('id', id)
      .select('id, nome, codigo, operador, resumo, ativo, created_at')
      .single();

    if (error) throw error;

    return json({ success: true, item: data }, { headers: NO_STORE_HEADERS });
  } catch (err: unknown) {
    return toErrorResponse(err, 'Erro ao atualizar circuito.');
  }
}

export async function handleCircuitosIdDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Circuitos'], 4, 'Sem permissão para excluir circuitos.');
    }

    const id = String(event.params.id || '').trim();
    if (!isUuid(id))
      return json(
        { success: false, error: 'ID inválido.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );

    const { error } = await client.from('circuitos').delete().eq('id', id);

    if (error) throw error;

    return json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (err: unknown) {
    return toErrorResponse(err, 'Erro ao excluir circuito.');
  }
}
