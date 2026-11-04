// Migrado para Hono de src/routes/api/v1/cidades/[id]/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { registrarLog } from '$lib/server/auditLog';
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
import { invalidateCatalogReadModels } from '$lib/server/readModelCache';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_CIDADE_UPDATE_BODY_BYTES = 64 * 1024;

type CidadeUpdateBody = {
  nome?: unknown;
  descricao?: unknown;
};

function readCidadeUpdateBody(value: unknown): CidadeUpdateBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const body = value as Record<string, unknown>;
  return {
    nome: body.nome,
    descricao: body.descricao
  };
}

const CIDADE_SELECT_FIELDS = `
  id, nome, subdivisao_id, descricao, created_at,
  subdivisao:subdivisoes!subdivisao_id(id, nome, pais_id, pais:paises!pais_id(id, nome))
`;

export async function handleCidadesIdGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Cidades'], 1, 'Sem acesso a Cidades.');
    }

    const cidadeId = String(event.params.id || '').trim();
    if (!isUuid(cidadeId))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const { data, error } = await client
      .from('cidades')
      .select(CIDADE_SELECT_FIELDS)
      .eq('id', cidadeId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return json({ error: 'Cidade nao encontrada' }, { status: 404, headers: NO_STORE_HEADERS });
      }
      throw error;
    }

    return json(data, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar cidade.');
  }
}

export async function handleCidadesIdPatch(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_CIDADE_UPDATE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Cidades'], 3, 'Sem permissao para editar cidades.');
    }

    const cidadeId = String(event.params.id || '').trim();
    if (!isUuid(cidadeId))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });
    const body = readCidadeUpdateBody(bodyResult.data);

    const updateData: Record<string, string | null> = {};

    if (body.nome !== undefined) updateData.nome = String(body.nome).trim();
    if (body.descricao !== undefined)
      updateData.descricao = String(body.descricao || '').trim() || null;

    if (Object.keys(updateData).length === 0) {
      return json(
        { error: 'Nenhum campo para atualizar.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { data, error } = await client
      .from('cidades')
      .update(updateData)
      .eq('id', cidadeId)
      .select(CIDADE_SELECT_FIELDS)
      .single();

    if (error) throw error;
    registrarLog(event, {
      userId: user.id,
      modulo: 'Cadastros',
      acao: 'cidade_editada',
      detalhes: { id: cidadeId, payload: updateData }
    });

    invalidateCatalogReadModels({ userId: user.id });
    return json({ success: true, data }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao atualizar cidade.');
  }
}

export async function handleCidadesIdDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Cidades'], 4, 'Sem permissao para excluir cidades.');
    }

    const cidadeId = String(event.params.id || '').trim();
    if (!isUuid(cidadeId))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const { error } = await client.from('cidades').delete().eq('id', cidadeId);

    if (error) throw error;
    registrarLog(event, {
      userId: user.id,
      modulo: 'Cadastros',
      acao: 'cidade_excluida',
      detalhes: { id: cidadeId }
    });

    invalidateCatalogReadModels({ userId: user.id });
    return json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir cidade.');
  }
}
