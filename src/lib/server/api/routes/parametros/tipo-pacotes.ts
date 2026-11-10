// Migrado para Hono de src/routes/api/v1/parametros/tipo-pacotes/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  sanitizePostgrestSearchTerm,
  toErrorResponse
} from '$lib/server/v1';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  invalidateCatalogReadModels,
  READ_MODEL_TAGS
} from '$lib/server/readModelCache';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_TIPO_PACOTES_BODY_BYTES = 64 * 1024;

type TipoPacoteRow = {
  id: string;
  nome?: string | null;
  ativo?: boolean | null;
};

type TipoPacoteBody = {
  id?: unknown;
  nome?: unknown;
  ativo?: unknown;
};

function readTipoPacoteBody(value: unknown): TipoPacoteBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return {
    id: body.id,
    nome: body.nome,
    ativo: body.ativo
  };
}

export async function handleParametrosTipoPacotesGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['parametros'], 1, 'Sem acesso a Parâmetros.');
    }

    const { items } = await getCachedReadModel<{ items: TipoPacoteRow[] }>({
      key: buildReadModelCacheKey('parametros:tipo-pacotes:list', {}),
      tags: [READ_MODEL_TAGS.catalog],
      ttlMs: 300_000,
      staleTtlMs: 1_800_000,
      loader: async () => {
        const { data, error: queryError } = await client
          .from('tipo_pacotes')
          .select('id, nome, ativo')
          .order('nome');

        if (queryError) throw queryError;
        return { items: (data || []) as unknown as TipoPacoteRow[] };
      }
    });

    return json({ items }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar tipos de pacote.');
  }
}

export async function handleParametrosTipoPacotesPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_TIPO_PACOTES_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['parametros'], 2, 'Sem permissão para salvar tipos de pacote.');
    }

    const body = readTipoPacoteBody(bodyResult.data);
    const { id, nome, ativo } = body;
    const idRaw = String(id || '').trim();

    const nomeTrimmed = String(nome || '')
      .trim()
      .slice(0, 120);
    if (!nomeTrimmed)
      return json({ error: 'Nome obrigatório.' }, { status: 400, headers: NO_STORE_HEADERS });
    if (idRaw && !isUuid(idRaw))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });
    const nomeBusca = sanitizePostgrestSearchTerm(nomeTrimmed, 120);

    // Verifica duplicata
    const { data: existing } = await client
      .from('tipo_pacotes')
      .select('id')
      .ilike('nome', nomeBusca || nomeTrimmed)
      .limit(1);

    if (existing && existing.length > 0 && existing[0].id !== idRaw) {
      return json(
        { error: 'Já existe um tipo de pacote com este nome.' },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const payload = {
      nome: nomeTrimmed,
      ativo: ativo !== false
    };

    let result;
    if (idRaw && isUuid(idRaw)) {
      const { data: updated, error: updateError } = await client
        .from('tipo_pacotes')
        .update(payload)
        .eq('id', idRaw)
        .select('id')
        .single();
      if (updateError) throw updateError;
      result = updated;
    } else {
      const { data: inserted, error: insertError } = await client
        .from('tipo_pacotes')
        .insert(payload)
        .select('id')
        .single();
      if (insertError) throw insertError;
      result = inserted;
    }

    invalidateCatalogReadModels({ userId: user.id });
    return json({ ok: true, id: result?.id }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar tipo de pacote.');
  }
}

export async function handleParametrosTipoPacotesDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['parametros'], 5, 'Sem permissão para excluir tipos de pacote.');
    }

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const { error: deleteError } = await client.from('tipo_pacotes').delete().eq('id', id);
    if (deleteError) throw deleteError;

    invalidateCatalogReadModels({ userId: user.id });
    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir tipo de pacote.');
  }
}
