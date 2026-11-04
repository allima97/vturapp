// Migrado para Hono de src/routes/api/v1/fornecedores/[id]/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { fetchFornecedorById, sanitizeFornecedorPayload } from '$lib/server/fornecedores';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateCatalogReadModels } from '$lib/server/readModelCache';
import { cleanStringSet } from '$lib/utils/array';

const MAX_FORNECEDOR_UPDATE_BODY_BYTES = 128 * 1024;
const validationError = (message: string) =>
  json({ error: message }, { status: 400, headers: NO_STORE_HEADERS });

function readFornecedorUpdateBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function handleFornecedoresIdGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Fornecedores'], 1, 'Sem acesso a Fornecedores.');
    }

    const id = String(event.params.id || '').trim();
    if (!id) throw error(400, 'ID do fornecedor é obrigatório.');

    const fornecedor = await fetchFornecedorById(client, id);
    if (!fornecedor) throw error(404, 'Fornecedor não encontrado.');

    const allowedCompanyIds = resolveScopedCompanyIds(scope, fornecedor.company_id || null);
    const allowedCompanySet = cleanStringSet(allowedCompanyIds);
    if (
      !scope.isAdmin &&
      allowedCompanyIds.length > 0 &&
      fornecedor.company_id &&
      !allowedCompanySet.has(String(fornecedor.company_id).trim())
    ) {
      throw error(403, 'Sem acesso a este fornecedor.');
    }

    return json({ data: fornecedor }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar fornecedor.');
  }
}

export async function handleFornecedoresIdPut(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_FORNECEDOR_UPDATE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Fornecedores'], 3, 'Sem permissão para editar fornecedores.');
    }

    const id = String(event.params.id || '').trim();
    if (!id) throw error(400, 'ID do fornecedor é obrigatório.');

    const existing = await fetchFornecedorById(client, id);
    if (!existing) throw error(404, 'Fornecedor não encontrado.');

    const allowedCompanyIds = resolveScopedCompanyIds(scope, existing.company_id || null);
    const allowedCompanySet = cleanStringSet(allowedCompanyIds);
    if (
      !scope.isAdmin &&
      allowedCompanyIds.length > 0 &&
      existing.company_id &&
      !allowedCompanySet.has(String(existing.company_id).trim())
    ) {
      throw error(403, 'Sem acesso a este fornecedor.');
    }

    const body = readFornecedorUpdateBody(bodyResult.data);
    const payload = sanitizeFornecedorPayload(body, scope);

    if (!payload.nome_completo) {
      return validationError('Nome completo é obrigatório.');
    }
    if (!payload.nome_fantasia) {
      return validationError('Nome fantasia é obrigatório.');
    }
    if (!payload.cidade) {
      return validationError('Cidade é obrigatória.');
    }
    if (!payload.estado) {
      return validationError('Estado é obrigatório.');
    }
    if (!payload.telefone) {
      return validationError('Telefone é obrigatório.');
    }
    if (!payload.whatsapp) {
      return validationError('WhatsApp é obrigatório.');
    }
    if (!payload.telefone_emergencia) {
      return validationError('Telefone de emergência é obrigatório.');
    }
    if (!payload.responsavel) {
      return validationError('Responsável é obrigatório.');
    }
    if (!payload.principais_servicos) {
      return validationError('Principais serviços são obrigatórios.');
    }
    if (payload.localizacao === 'brasil' && !payload.cnpj) {
      return validationError('CNPJ é obrigatório para fornecedores no Brasil.');
    }
    if (payload.localizacao === 'brasil' && !payload.cep) {
      return validationError('CEP é obrigatório para fornecedores no Brasil.');
    }

    const { data, error: updateError } = await client
      .from('fornecedores')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (updateError) throw updateError;
    if (!data) throw error(404, 'Fornecedor não encontrado.');

    invalidateCatalogReadModels({
      companyIds: [existing.company_id, payload.company_id].filter(Boolean) as string[],
      userId: user.id
    });

    const fornecedor = await fetchFornecedorById(client, id);
    return json({ success: true, data: fornecedor }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao atualizar fornecedor.');
  }
}

export async function handleFornecedoresIdDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Fornecedores'], 5, 'Sem permissão para excluir fornecedores.');
    }

    const id = String(event.params.id || '').trim();
    if (!id) throw error(400, 'ID do fornecedor é obrigatório.');

    const fornecedor = await fetchFornecedorById(client, id);
    if (!fornecedor) throw error(404, 'Fornecedor não encontrado.');

    const allowedCompanyIds = resolveScopedCompanyIds(scope, fornecedor.company_id || null);
    const allowedCompanySet = cleanStringSet(allowedCompanyIds);
    if (
      !scope.isAdmin &&
      allowedCompanyIds.length > 0 &&
      fornecedor.company_id &&
      !allowedCompanySet.has(String(fornecedor.company_id).trim())
    ) {
      throw error(403, 'Sem acesso a este fornecedor.');
    }

    const { count, error: countError } = await client
      .from('produtos')
      .select('id', { count: 'exact', head: true })
      .eq('fornecedor_id', id);
    if (countError) throw countError;

    if ((count || 0) > 0) {
      return json(
        { error: 'Não é possível excluir fornecedor com produtos vinculados.' },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const { error: deleteError } = await client.from('fornecedores').delete().eq('id', id);
    if (deleteError) throw deleteError;

    invalidateCatalogReadModels({
      companyIds: fornecedor.company_id ? [fornecedor.company_id] : [],
      userId: user.id
    });

    return json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir fornecedor.');
  }
}
