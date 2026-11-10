// Migrado para Hono de src/routes/api/v1/fornecedores/create/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { fetchFornecedorById, sanitizeFornecedorPayload } from '$lib/server/fornecedores';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateCatalogReadModels } from '$lib/server/readModelCache';
import { prepararCidadeFornecedor } from '$lib/server/fornecedorCidadeGeografica';

const MAX_FORNECEDOR_CREATE_BODY_BYTES = 128 * 1024;
const validationError = (message: string) =>
  json({ error: message }, { status: 400, headers: NO_STORE_HEADERS });

function readFornecedorCreateBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

export async function handleFornecedoresCreatePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_FORNECEDOR_CREATE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Fornecedores'], 2, 'Sem permissão para criar fornecedores.');
    }

    const body = readFornecedorCreateBody(bodyResult.data);
    const cidade = await prepararCidadeFornecedor(
      body,
      null,
      event.platform?.env?.DB,
      event.platform?.env?.GEO_DB
    );
    if (!cidade.ok)
      return json({ error: cidade.error }, { status: cidade.status, headers: NO_STORE_HEADERS });
    const payload = { ...sanitizeFornecedorPayload(body, scope), ...cidade.cidade };

    if (!payload.company_id) {
      return validationError('Empresa do fornecedor não identificada.');
    }
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

    const { data, error } = await client
      .from('fornecedores')
      .insert([payload])
      .select('id')
      .single();
    if (error) throw error;

    invalidateCatalogReadModels({
      companyIds: payload.company_id ? [payload.company_id] : [],
      userId: user.id
    });

    const fornecedor = await fetchFornecedorById(client, data.id);
    return json({ success: true, data: fornecedor }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao criar fornecedor.');
  }
}
