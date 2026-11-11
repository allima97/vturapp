// Migrado para Hono de src/routes/api/v1/orcamentos/cliente-create/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  requireAuthenticatedUser,
  resolveUserScope,
  ensureModuloAccess,
  getAdminClient,
  resolveScopedCompanyId,
  toErrorResponse
} from '$lib/server/v1';
import { titleCaseNome } from '$lib/normalizeText';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateClientReadModels } from '$lib/server/readModelCache';

const MAX_ORCAMENTO_CLIENTE_CREATE_BODY_BYTES = 32 * 1024;

type OrcamentoClienteCreateBody = {
  nome?: unknown;
  telefone?: unknown;
  company_id?: unknown;
};

type ClienteInsertPayload = {
  nome: string;
  telefone: string;
  whatsapp: string;
  ativo: boolean;
  active: boolean;
  company_id?: string;
  created_by: string;
};

export async function handleOrcamentosClienteCreatePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(
      event.request,
      MAX_ORCAMENTO_CLIENTE_CREATE_BODY_BYTES
    );
    if (!bodyResult.ok) return bodyResult.response;

    const user = await requireAuthenticatedUser(event);
    const client = getAdminClient();
    const scope = await resolveUserScope(client, user.id);

    ensureModuloAccess(scope, ['Orcamentos'], 2, 'Sem acesso para criar Orcamentos.');

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as OrcamentoClienteCreateBody)
        : null;
    const nome = titleCaseNome(String(body?.nome || '').trim());
    const telefone = String(body?.telefone || '').trim();
    if (!nome || !telefone) {
      return new Response('Nome e telefone obrigatorios.', {
        status: 400,
        headers: NO_STORE_HEADERS
      });
    }

    const requestedCompanyId = String(body?.company_id || '').trim();
    const companyId = scope.isAdmin
      ? requestedCompanyId || null
      : resolveScopedCompanyId(scope, requestedCompanyId || null);
    const individual = scope.isVendedor && scope.usoIndividual && !requestedCompanyId;
    if (!scope.isAdmin && !companyId && !individual) {
      return new Response(
        requestedCompanyId ? 'Empresa fora do escopo.' : 'Empresa nao identificada.',
        {
          status: requestedCompanyId ? 403 : 400,
          headers: NO_STORE_HEADERS
        }
      );
    }

    const payload: ClienteInsertPayload = {
      nome,
      created_by: user.id,
      telefone,
      whatsapp: telefone,
      ativo: true,
      active: true
    };
    if (companyId) payload.company_id = companyId;

    const { data, error } = await client
      .from('clientes')
      .insert(payload)
      .select('id, nome, cpf, whatsapp, email')
      .single();
    if (error || !data) throw error || new Error('Falha ao criar cliente.');

    invalidateClientReadModels({
      companyIds: companyId ? [companyId] : [],
      vendedorIds: [user.id],
      userId: user.id
    });

    return new Response(JSON.stringify({ item: data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...NO_STORE_HEADERS }
    });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao criar cliente.');
  }
}
