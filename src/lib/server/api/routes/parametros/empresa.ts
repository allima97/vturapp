import { VTUR_LOGO_PATH } from "$lib/brand";
// Migrado para Hono de src/routes/api/v1/parametros/empresa/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { invalidateUserReadModels } from '$lib/server/readModelCache';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_PARAMETROS_EMPRESA_BODY_BYTES = 64 * 1024;
const EMPRESA_ALLOWED_UPDATE_FIELDS = ['nome_empresa', 'nome_fantasia', 'cnpj', 'telefone', 'endereco', 'cidade', 'estado'];
type EmpresaUpdateField = (typeof EMPRESA_ALLOWED_UPDATE_FIELDS)[number];
type EmpresaRequestBody = Partial<Record<EmpresaUpdateField, unknown>>;
type EmpresaUpdatePayload = Partial<Record<EmpresaUpdateField, unknown | null>>;

export async function handleParametrosEmpresaGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Parametros'], 1, 'Sem acesso a Parâmetros da Empresa.');
    }

    const companyId = scope.companyId;
    if (!companyId) return json({ error: 'Usuário não vinculado a uma empresa.' }, { status: 400, headers: NO_STORE_HEADERS });

    // Identidade visual padronizada independentemente das configurações antigas.
    const { data, error: queryError } = await client
      .from('companies')
      .select('id, nome_empresa, nome_fantasia, cnpj, telefone, endereco, cidade, estado, active')
      .eq('id', companyId)
      .maybeSingle();


    if (queryError) throw queryError;
    if (!data) return json({ error: 'Empresa não encontrada.' }, { status: 404, headers: NO_STORE_HEADERS });

    return json({ ...data, logo_url: VTUR_LOGO_PATH }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar dados da empresa.');
  }
}

export async function handleParametrosEmpresaPatch(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_PARAMETROS_EMPRESA_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Parametros'], 3, 'Sem permissão para editar dados da empresa.');
    }

    const companyId = scope.companyId;
    if (!companyId) return json({ error: 'Usuário não vinculado a uma empresa.' }, { status: 400, headers: NO_STORE_HEADERS });

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as EmpresaRequestBody)
        : {};

    const payload: EmpresaUpdatePayload = {};
    for (const key of EMPRESA_ALLOWED_UPDATE_FIELDS) {
      if (key in body) {
        payload[key] = body[key] === '' ? null : body[key];
      }
    }

    if (Object.keys(payload).length === 0) {
      return json({ error: 'Nenhum campo para atualizar.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { error: updateError } = await client.from('companies').update(payload).eq('id', companyId);
    if (updateError) throw updateError;

    invalidateUserReadModels({
      companyIds: [companyId],
      userId: user.id
    });
    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar dados da empresa.');
  }
}
