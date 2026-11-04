// Migrado para Hono de src/routes/api/v1/circuitos/+server.ts — corpo IDÊNTICO ao original
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

const MAX_CIRCUITO_BODY_BYTES = 128 * 1024;

type CircuitoBody = {
  id?: unknown;
  nome?: unknown;
  codigo?: unknown;
  operador?: unknown;
  resumo?: unknown;
  ativo?: unknown;
};

function readCircuitoBody(value: unknown): CircuitoBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return {
    id: body.id,
    nome: body.nome,
    codigo: body.codigo,
    operador: body.operador,
    resumo: body.resumo,
    ativo: body.ativo
  };
}

export async function handleCircuitosGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Circuitos'], 1, 'Sem acesso a Circuitos.');
    }

    const ativo = event.url.searchParams.get('ativo');

    let query = client
      .from('circuitos')
      .select('id, nome, codigo, operador, resumo, ativo, created_at')
      .order('nome');

    if (ativo !== null) query = query.eq('ativo', ativo === 'true');

    const { data, error } = await query;
    if (error) throw error;

    return json({ success: true, items: data || [] }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err: unknown) {
    return toErrorResponse(err, 'Erro ao carregar circuitos.');
  }
}

export async function handleCircuitosPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_CIRCUITO_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Circuitos'], 2, 'Sem permissão para salvar circuitos.');
    }

    const body = readCircuitoBody(bodyResult.data);
    const id = String(body.id || '').trim();

    const payload = {
      nome: String(body.nome || '').trim(),
      codigo: String(body.codigo || '').trim() || null,
      operador: String(body.operador || '').trim() || null,
      resumo: String(body.resumo || '').trim() || null,
      ativo: body.ativo !== false
    };

    if (!payload.nome)
      return json({ error: 'Nome obrigatório.' }, { status: 400, headers: NO_STORE_HEADERS });

    let result;
    if (id && isUuid(id)) {
      const { data, error } = await client
        .from('circuitos')
        .update(payload)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await client.from('circuitos').insert(payload).select('id').single();
      if (error) throw error;
      result = data;
    }

    return json({ success: true, item: result }, { headers: NO_STORE_HEADERS });
  } catch (err: unknown) {
    return toErrorResponse(err, 'Erro ao salvar circuito.');
  }
}
