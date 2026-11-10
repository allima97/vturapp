import type { QueryError } from '$lib/server/data';
// Migrado para Hono de src/routes/api/v1/tipo-produtos/+server.ts — corpo IDÊNTICO ao original
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
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_TIPO_PRODUTOS_BODY_BYTES = 64 * 1024;

type TipoProdutoRow = {
  id?: string | null;
  nome?: string | null;
  tipo?: string | null;
  descricao?: string | null;
  ativo?: boolean | null;
  created_at?: string | null;
};

type TipoProdutosBody = {
  id?: string;
  nome?: string;
  tipo?: string;
  descricao?: string;
  ativo?: boolean;
};

function isMissingColumnError(err: unknown) {
  const error = err as Partial<QueryError> | null | undefined;
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('could not find') ||
    details.includes('could not find')
  );
}

function readTipoProdutosBody(value: unknown): TipoProdutosBody {
  if (!value || typeof value !== 'object') return {};

  const body = value as Record<string, unknown>;
  const parsed: TipoProdutosBody = {};

  if (typeof body.id === 'string') parsed.id = body.id;
  if (typeof body.nome === 'string') parsed.nome = body.nome;
  if (typeof body.tipo === 'string') parsed.tipo = body.tipo;
  if (typeof body.descricao === 'string') parsed.descricao = body.descricao;
  if (typeof body.ativo === 'boolean') parsed.ativo = body.ativo;

  return parsed;
}

export async function handleTipoProdutosGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['cadastros', 'parametros'], 1, 'Sem acesso a Tipos de Produto.');
    }

    const all = event.url.searchParams.get('all') === '1';

    let query = client
      .from('tipo_produtos')
      .select('id, nome, tipo, descricao, ativo, created_at')
      .order('nome', { ascending: true })
      .limit(200);

    if (!all) query = query.eq('ativo', true);

    const { data, error: queryError } = await query;
    let error = queryError;
    let items = (data || []) as unknown as TipoProdutoRow[];

    // Se falhar por colunas inexistentes, tenta com colunas basicas reais
    if (error && isMissingColumnError(error)) {
      const fallback = await client
        .from('tipo_produtos')
        .select('id, nome, tipo, ativo, created_at')
        .order('nome', { ascending: true })
        .limit(200);
      if (!fallback.error) {
        items = ((fallback.data || []) as unknown as TipoProdutoRow[]).map((row) => ({
          ...row,
          descricao: null
        }));
        error = null;
      }
    }

    if (error) throw error;

    return json(
      {
        items
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar tipos de produto.');
  }
}

export async function handleTipoProdutosPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_TIPO_PRODUTOS_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['parametros'], 2, 'Sem permissão para salvar tipos de produto.');
    }

    const body = readTipoProdutosBody(bodyResult.data);
    const { id, nome, tipo, descricao, ativo } = body;
    const idRaw = String(id || '').trim();

    const nomeTrimmed = String(nome || '').trim();
    if (!nomeTrimmed) {
      return json({ error: 'Nome obrigatório.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const payload = {
      nome: nomeTrimmed,
      tipo: String(tipo || 'servico').trim() || 'servico',
      descricao: String(descricao || '').trim() || null,
      ativo: ativo !== false
    };

    const fallbackPayload = {
      nome: payload.nome,
      tipo: payload.tipo,
      ativo: payload.ativo
    };

    let result;
    if (idRaw && isUuid(idRaw)) {
      const { data: updated, error: updateError } = await client
        .from('tipo_produtos')
        .update(payload)
        .eq('id', idRaw)
        .select('id')
        .single();

      if (updateError) {
        if (!isMissingColumnError(updateError)) throw updateError;
        const { data: fallbackUpdated, error: fallbackUpdateError } = await client
          .from('tipo_produtos')
          .update(fallbackPayload)
          .eq('id', idRaw)
          .select('id')
          .single();
        if (fallbackUpdateError) throw fallbackUpdateError;
        result = fallbackUpdated;
      } else {
        result = updated;
      }
    } else {
      const { data: inserted, error: insertError } = await client
        .from('tipo_produtos')
        .insert(payload)
        .select('id')
        .single();

      if (insertError) {
        if (!isMissingColumnError(insertError)) throw insertError;
        const { data: fallbackInserted, error: fallbackInsertError } = await client
          .from('tipo_produtos')
          .insert(fallbackPayload)
          .select('id')
          .single();
        if (fallbackInsertError) throw fallbackInsertError;
        result = fallbackInserted;
      } else {
        result = inserted;
      }
    }

    return json({ ok: true, id: result?.id }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar tipo de produto.');
  }
}

export async function handleTipoProdutosDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['parametros'], 5, 'Sem permissão para excluir tipos de produto.');
    }

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const { error: deleteError } = await client.from('tipo_produtos').delete().eq('id', id);
    if (deleteError) throw deleteError;

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir tipo de produto.');
  }
}
