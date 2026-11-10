// Migrado para Hono de src/routes/api/v1/financeiro/comissoes/vendedores/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  fetchRankingVendedoresByCompanyIds,
  getAdminClient,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { fetchCommissionContext } from '$lib/server/comissoes';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { rejectCrossOriginRequest, rejectLargePayload } from '$lib/server/requestGuards';

const MAX_COMISSOES_VENDEDORES_BODY_BYTES = 8 * 1024;

type CommissionRuleSummary = {
  nome?: string | null;
  tipo?: string | null;
  meta_atingida?: number | string | null;
};

type VendedorComissaoRow = {
  id?: string | null;
  nome_completo?: string | null;
  email?: string | null;
};

// Retorna vendedores com suas regras de comissão (commission_rule)
export async function handleFinanceiroComissoesVendedoresGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['Comissionamento', 'RegrasComissao', 'parametros'],
        1,
        'Sem acesso.'
      );
    }

    const { searchParams } = event.url;
    const regraId = searchParams.get('regra_id');
    const companyIds = resolveScopedCompanyIds(scope, searchParams.get('empresa_id'));

    const usersCompanyIds =
      companyIds.length > 0 ? companyIds : scope.companyId ? [scope.companyId] : [];
    const usersData =
      scope.isAdmin || scope.isMaster || scope.isFinanceiro || scope.isGestor
        ? await fetchRankingVendedoresByCompanyIds(client, usersCompanyIds)
        : [
            {
              id: scope.userId,
              nome_completo: scope.nome,
              email: scope.email
            }
          ];
    const commissionContext = await fetchCommissionContext(client, { companyIds });

    // regrasMap é Record<id, Regra> — converte para array para compatibilidade
    const regrasArray = Object.entries(commissionContext.regrasMap).map(([id, rule]) => ({
      id,
      nome: (rule as CommissionRuleSummary).nome || 'Regra',
      tipo: rule.tipo || 'GERAL',
      meta_atingida: Number(rule.meta_atingida || 0),
      ativo: true
    }));

    const regras = regrasArray.map((rule) => ({
      id: rule.id,
      nome: rule.nome,
      tipo: rule.tipo,
      meta_atingida: rule.meta_atingida,
      ativo: rule.ativo
    }));

    const items = ((usersData || []) as VendedorComissaoRow[]).map((u) => {
      const regraBase = regrasArray[0] || null;

      return {
        id: u.id,
        vendedor_id: u.id,
        nome: u.nome_completo || u.email || 'Vendedor',
        nome_completo: u.nome_completo || null,
        email: u.email || null,
        vendedor_nome: u.nome_completo || u.email || 'Vendedor',
        regra_id: regraId && commissionContext.regrasMap[regraId] ? regraId : regraBase?.id || null,
        regra_nome:
          regraId && commissionContext.regrasMap[regraId]
            ? (commissionContext.regrasMap[regraId] as CommissionRuleSummary).nome ||
              'Regra selecionada'
            : regraBase?.nome || 'Calculada por produto/pacote/meta',
        percentual_base: Number(regraBase?.meta_atingida || 0),
        ativo: true,
        vigente: true
      };
    });

    return json(
      { items, total: items.length, regras: regras || [] },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar vendedores.');
  }
}

export async function handleFinanceiroComissoesVendedoresPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const payloadError = rejectLargePayload(event.request, MAX_COMISSOES_VENDEDORES_BODY_BYTES);
    if (payloadError) return payloadError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['Comissionamento', 'RegrasComissao', 'parametros'],
        2,
        'Sem permissão.'
      );
    }

    // Retorna sucesso — associação de vendedor a regra não tem tabela dedicada no schema atual
    return json(
      { success: true, message: 'Associação registrada.' },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao associar vendedor.');
  }
}
