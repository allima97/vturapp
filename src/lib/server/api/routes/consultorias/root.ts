// Migrado para Hono de src/routes/api/v1/consultorias/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateConsultoriaReadModels } from '$lib/server/readModelCache';

// Espelha: vtur-app/src/pages/api/consultorias/
// Tabela: consultorias_online

const MAX_CONSULTORIA_BODY_BYTES = 64 * 1024;
const errorResponse = (message: string, status: number) =>
  json({ error: message }, { status, headers: NO_STORE_HEADERS });

type ConsultoriaExistingRow = {
  id?: string | null;
  created_by?: string | null;
};

type ConsultoriaRequestBody = {
  id?: unknown;
  cliente_id?: unknown;
  clienteId?: unknown;
  cliente_nome?: unknown;
  clienteNome?: unknown;
  data_hora?: unknown;
  dataHora?: unknown;
  lembrete?: unknown;
  destino?: unknown;
  quantidade_pessoas?: unknown;
  quantidadePessoas?: unknown;
  orcamento_id?: unknown;
  orcamentoId?: unknown;
  taxa_consultoria?: unknown;
  taxaConsultoria?: unknown;
  notas?: unknown;
  fechada?: unknown;
  fechada_em?: unknown;
};

function getBodyValue(body: ConsultoriaRequestBody, ...keys: (keyof ConsultoriaRequestBody)[]) {
  for (const key of keys) {
    const value = body[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

function asOptionalString(value: unknown) {
  return value == null ? undefined : String(value);
}

export async function handleConsultoriasGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    let query = client
      .from('consultorias_online')
      .select(
        `
        id,
        cliente_id,
        cliente_nome,
        data_hora,
        lembrete,
        destino,
        quantidade_pessoas,
        orcamento_id,
        taxa_consultoria,
        notas,
        fechada,
        fechada_em,
        created_by,
        created_at,
        updated_at
      `
      )
      .order('data_hora', { ascending: true })
      .limit(200);

    // Filtro por status (fechada/aberta)
    const status = event.url.searchParams.get('status');
    if (status === 'fechada') query = query.eq('fechada', true);
    else if (status === 'aberta') query = query.eq('fechada', false);

    // Não-admin vê apenas as próprias consultorias
    if (!scope.isAdmin && !scope.isGestor && !scope.isMaster) {
      query = query.eq('created_by', user.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    return json(data || [], { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao listar consultorias.');
  }
}

export async function handleConsultoriasPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_CONSULTORIA_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    await resolveUserScope(client, user.id);

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as ConsultoriaRequestBody)
        : {};

    const clienteNome = String(getBodyValue(body, 'cliente_nome', 'clienteNome') ?? '').trim();
    const dataHora = getBodyValue(body, 'data_hora', 'dataHora');
    const clienteId = asOptionalString(getBodyValue(body, 'cliente_id', 'clienteId'));
    const orcamentoId = asOptionalString(getBodyValue(body, 'orcamento_id', 'orcamentoId'));

    if (!clienteNome) {
      return errorResponse('cliente_nome é obrigatório.', 400);
    }
    if (!dataHora) {
      return errorResponse('data_hora é obrigatória.', 400);
    }

    const payload = {
      cliente_id: isUuid(clienteId) ? clienteId : null,
      cliente_nome: clienteNome,
      data_hora: new Date(String(dataHora)).toISOString(),
      lembrete: String(body.lembrete || '15min').trim(),
      destino: String(body.destino || '').trim() || null,
      quantidade_pessoas: Math.max(
        1,
        Number(body.quantidade_pessoas ?? body.quantidadePessoas ?? 1) || 1
      ),
      orcamento_id: isUuid(orcamentoId) ? orcamentoId : null,
      taxa_consultoria: Number.isFinite(Number(body.taxa_consultoria ?? body.taxaConsultoria ?? 0))
        ? Number(body.taxa_consultoria ?? body.taxaConsultoria ?? 0)
        : 0,
      notas: String(body.notas || '').trim() || null,
      created_by: user.id
    };

    const { data, error } = await client
      .from('consultorias_online')
      .insert(payload)
      .select(
        `
        id, cliente_id, cliente_nome, data_hora, lembrete, destino,
        quantidade_pessoas, orcamento_id, taxa_consultoria, notas,
        fechada, created_at
      `
      )
      .single();

    if (error) throw error;

    invalidateConsultoriaReadModels({
      vendedorIds: [user.id],
      userId: user.id
    });

    return json(data, { status: 201, headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao criar consultoria.');
  }
}

export async function handleConsultoriasPatch(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_CONSULTORIA_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as ConsultoriaRequestBody)
        : {};
    const id = String(body.id || '').trim();

    if (!isUuid(id)) {
      return errorResponse('id da consultoria inválido.', 400);
    }

    // Verificar acesso: dono ou admin/gestor/master
    const { data: existing, error: checkErr } = await client
      .from('consultorias_online')
      .select('id, created_by')
      .eq('id', id)
      .maybeSingle();

    if (checkErr) throw checkErr;
    if (!existing) return errorResponse('Consultoria não encontrada.', 404);
    const existingConsultoria = existing as ConsultoriaExistingRow;

    const podeEditar =
      scope.isAdmin ||
      scope.isGestor ||
      scope.isMaster ||
      existingConsultoria.created_by === user.id;

    if (!podeEditar) {
      return json(
        { error: 'Sem permissão para editar esta consultoria.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    // Aceitar campos em snake_case (padrão) ou camelCase (compatibilidade)
    if (body.cliente_id !== undefined || body.clienteId !== undefined) {
      const val = asOptionalString(getBodyValue(body, 'cliente_id', 'clienteId'));
      payload.cliente_id = isUuid(val) ? val : null;
    }
    if (body.cliente_nome !== undefined || body.clienteNome !== undefined)
      payload.cliente_nome = String(body.cliente_nome ?? body.clienteNome ?? '').trim() || null;
    if (body.data_hora !== undefined || body.dataHora !== undefined) {
      const raw = getBodyValue(body, 'data_hora', 'dataHora');
      if (raw) payload.data_hora = new Date(String(raw)).toISOString();
    }
    if (body.lembrete !== undefined) payload.lembrete = body.lembrete;
    if (body.destino !== undefined) payload.destino = String(body.destino || '').trim() || null;
    if (body.quantidade_pessoas !== undefined || body.quantidadePessoas !== undefined)
      payload.quantidade_pessoas =
        Number(body.quantidade_pessoas ?? body.quantidadePessoas ?? 1) || 1;
    if (body.orcamento_id !== undefined || body.orcamentoId !== undefined) {
      const val = asOptionalString(getBodyValue(body, 'orcamento_id', 'orcamentoId'));
      payload.orcamento_id = isUuid(val) ? val : null;
    }
    if (body.taxa_consultoria !== undefined || body.taxaConsultoria !== undefined)
      payload.taxa_consultoria = Number(body.taxa_consultoria ?? body.taxaConsultoria ?? 0) || 0;
    if (body.notas !== undefined) payload.notas = String(body.notas || '').trim() || null;
    if (body.fechada !== undefined) payload.fechada = Boolean(body.fechada);
    if (body.fechada_em !== undefined) payload.fechada_em = body.fechada_em || null;

    if (Object.keys(payload).length === 1) {
      return errorResponse('Nenhum campo para atualizar.', 400);
    }

    const { error } = await client.from('consultorias_online').update(payload).eq('id', id);

    if (error) throw error;

    invalidateConsultoriaReadModels({
      vendedorIds: [String(existingConsultoria.created_by || '')].filter(Boolean),
      userId: user.id
    });

    return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao atualizar consultoria.');
  }
}
