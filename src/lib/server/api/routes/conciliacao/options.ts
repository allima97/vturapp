// Migrado para Hono de src/routes/api/v1/conciliacao/options/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler e caminhos de import relativos mudaram). Ver src/lib/server/api/app.ts.
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
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';

const PT_BR_COLLATOR = new Intl.Collator('pt-BR');

type ConciliacaoVendedorOptionRow = {
  id?: string | null;
  nome_completo?: string | null;
};

export async function handleConciliacaoOptionsGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster && !scope.isFinanceiro && !scope.isGestor) {
      ensureModuloAccess(scope, ['operacao_conciliacao', 'conciliacao'], 1, 'Sem acesso à Conciliação.');
    }

    const companyIds = resolveScopedCompanyIds(scope, event.url.searchParams.get('company_id'));

    if (companyIds.length === 0) return json({ vendedores: [], produtosMeta: [] }, { headers: DYNAMIC_READ_HEADERS });

    const usersData = await fetchRankingVendedoresByCompanyIds(client, companyIds);

    const vendedoresFinal = ((usersData || []) as ConciliacaoVendedorOptionRow[])
      .map((row) => ({
        id: String(row?.id || '').trim(),
        nome_completo: String(row?.nome_completo || '').trim() || 'Usuario'
      }))
      .filter((row) => Boolean(row.id))
      .sort((a, b) => PT_BR_COLLATOR.compare(a.nome_completo, b.nome_completo));

    // Produtos com meta (tipo_produtos com soma_na_meta = true)
    const { data: produtosData } = await client
      .from('tipo_produtos')
      .select('id, nome')
      .eq('ativo', true)
      .eq('soma_na_meta', true)
      .order('nome')
      .limit(100);

    return json({
      vendedores: vendedoresFinal,
      produtosMeta: produtosData || []
    }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar opções da conciliação.');
  }
}
