// Migrado para Hono de src/routes/api/v1/clientes/create/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { registrarLog } from '$lib/server/auditLog';
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import {
  buildClientePayload,
  createInitialClienteForm,
  fillClienteFormFromApi,
  type ClienteFormData,
  validateClienteForm
} from '$lib/features/clientes/form';
import { ensureClienteModuloAccess } from '$lib/server/clientes';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateClientReadModels } from '$lib/server/readModelCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { cleanStringSet } from '$lib/utils/array';

const MAX_CLIENTE_CREATE_BODY_BYTES = 128 * 1024;

function readClienteCreateBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

export async function handleClientesCreatePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_CLIENTE_CREATE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) ensureClienteModuloAccess(scope, 2, 'Sem permissao para criar clientes.');

    const body = readClienteCreateBody(bodyResult.data);

    // ✅ Valida company_id contra o escopo do usuário
    const requestedCompanyId = String(body?.company_id || '').trim();
    const scopedIds = (scope.companyIds || []).filter(isUuid);
    const scopedIdSet = cleanStringSet(scopedIds);

    let companyId: string | null = null;
    if (scope.isAdmin) {
      // Admin: usa company_id explícito se válido, senão null
      companyId = isUuid(requestedCompanyId) ? requestedCompanyId : null;
    } else if (requestedCompanyId) {
      // Qualquer papel com company_id explícito: valida se está no escopo
      if (!isUuid(requestedCompanyId) || !scopedIdSet.has(requestedCompanyId)) {
        return json(
          { error: 'company_id fora do escopo.' },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }
      companyId = requestedCompanyId;
    } else {
      // Sem company_id explícito: usa o primeiro disponível no escopo do usuário
      // (funciona para Vendedor, Gestor, Master, Financeiro)
      companyId =
        scope.isVendedor && scope.usoIndividual ? null : (scopedIds[0] ?? scope.companyId ?? null);
      if (!companyId && !(scope.isVendedor && scope.usoIndividual)) {
        return json(
          { error: 'Empresa não identificada para criar cliente.' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
    }

    const form: ClienteFormData = {
      ...createInitialClienteForm(),
      ...fillClienteFormFromApi(body),
      nome: String(body?.nome || ''),
      cpf: String(body?.cpf || body?.cnpj || ''),
      tipo_pessoa: body?.tipo_pessoa === 'PJ' ? 'PJ' : 'PF',
      telefone: String(body?.telefone || ''),
      whatsapp: String(body?.whatsapp || ''),
      email: String(body?.email || ''),
      classificacao: String(body?.classificacao || ''),
      endereco: String(body?.endereco || ''),
      numero: String(body?.numero || ''),
      complemento: String(body?.complemento || ''),
      cidade: String(body?.cidade || ''),
      estado: String(body?.estado || ''),
      cep: String(body?.cep || ''),
      rg: String(body?.rg || ''),
      genero: String(body?.genero || ''),
      nacionalidade: String(body?.nacionalidade || ''),
      tags: Array.isArray(body?.tags) ? body.tags.join(', ') : String(body?.tags || ''),
      tipo_cliente: String(body?.tipo_cliente || 'passageiro'),
      notas: String(body?.notas || body?.observacoes || ''),
      ativo: body?.ativo !== false,
      active: body?.active !== false
    };

    const validation = validateClienteForm(form);
    if (!validation.valid) {
      return json(
        { error: validation.firstError || 'Dados invalidos.', errors: validation.errors },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const payload = buildClientePayload(form);
    const { data, error: insertError } = await client
      .from('clientes')
      .insert([{ ...payload, company_id: companyId, created_by: user.id }])
      .select(
        'id, nome, cpf, nascimento, telefone, whatsapp, email, classificacao, tipo_pessoa, tipo_cliente, cidade, estado, tags, notas, ativo, active, company_id, created_at'
      )
      .single();

    if (insertError) throw insertError;

    registrarLog(event, {
      userId: user.id,
      modulo: 'Clientes',
      acao: 'cliente_criado',
      detalhes: { ...payload, created_by: user.id }
    });

    invalidateClientReadModels({
      companyIds: companyId ? [companyId] : [],
      vendedorIds: [user.id],
      userId: user.id
    });

    return json(
      { success: true, data, message: 'Cliente criado com sucesso.' },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao criar cliente.');
  }
}
