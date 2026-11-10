// Migrado para Hono de src/routes/api/v1/vendas/[id]/ranking-recibos/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler mudou). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
/**
 * GET /api/v1/vendas/[id]/ranking-recibos
 *
 * Retorna o snapshot de ranking/conciliação por recibo da venda.
 * A venda e seus recibos permanecem intactos; os valores efetivos vêm da
 * conciliação quando há BAIXA confirmada, e ficam provisórios enquanto não há.
 */
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { buildVendaRankingConciliacaoSnapshot } from '$lib/conciliacao/vendaRanking';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';

type VendaRankingSaleRow = {
  company_id?: string | null;
  cancelada?: boolean | null;
};

type RankingReciboRow = {
  id?: string | null;
  numero_recibo?: string | null;
  numero_recibo_normalizado?: string | null;
  numero_reserva?: string | null;
  valor_total?: number | string | null;
  valor_taxas?: number | string | null;
};

function toNullableNumber(value: number | string | null | undefined) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function handleVendasIdRankingRecibosGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    // Admin, Master e Gestor têm acesso implícito a vendas — igual ao endpoint /api/v1/vendas/[id]
    if (!scope.isAdmin && !scope.isMaster && !scope.isGestor) {
      ensureModuloAccess(scope, ['vendas_consulta', 'vendas'], 1, 'Sem acesso a Vendas.');
    }

    const id = String(event.params.id || '').trim();
    if (!isUuid(id)) {
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    // Busca a venda diretamente sem filtro de scope para diagnóstico —
    // o scope já foi verificado pelo ensureModuloAccess acima.
    // Usar getAdminClient (service_role) garante que RLS não interfere.
    const { data: vendaRaw, error: vendaErr } = await client
      .from('vendas')
      .select('id, company_id, vendedor_id, cancelada')
      .eq('id', id)
      .maybeSingle();

    if (vendaErr) throw vendaErr;
    if (!vendaRaw) {
      return json({ recibos: [], totais: null }, { headers: DYNAMIC_READ_HEADERS });
    }
    const venda = vendaRaw as VendaRankingSaleRow;
    if (venda.cancelada) {
      return json({ recibos: [], totais: null }, { headers: DYNAMIC_READ_HEADERS });
    }

    // Verifica scope manualmente apenas para vendedor individual
    // (gestor/master/admin já foram liberados acima)
    if (!scope.isAdmin && !scope.isMaster && !scope.isGestor && !scope.isFinanceiro) {
      const vendaCompanyId = String(venda.company_id || '').trim();
      const scopeCompanyIds = new Set<string>();
      for (const companyId of scope.companyIds || []) {
        if (companyId) scopeCompanyIds.add(companyId);
      }
      if (scopeCompanyIds.size > 0 && !scopeCompanyIds.has(vendaCompanyId)) {
        return json({ recibos: [], totais: null }, { headers: DYNAMIC_READ_HEADERS });
      }
    }

    const { data: recibosData, error: recibosErr } = await client
      .from('vendas_recibos')
      .select(
        'id, numero_recibo, numero_recibo_normalizado, numero_reserva, valor_total, valor_taxas'
      )
      .eq('venda_id', id);

    if (recibosErr) throw recibosErr;

    const recibos = Array.isArray(recibosData) ? (recibosData as RankingReciboRow[]) : [];
    if (recibos.length === 0)
      return json({ recibos: [], totais: null }, { headers: DYNAMIC_READ_HEADERS });

    // Resolve companyId: usa o da venda; fallback para o do scope (ex: admin sem company_id na venda)
    const companyId = String(venda.company_id || scope.companyId || '');

    const snapshot = await buildVendaRankingConciliacaoSnapshot({
      client,
      vendaId: id,
      companyId,
      recibos: recibos.map((recibo) => ({
        id: String(recibo.id),
        numero_recibo: recibo.numero_recibo ?? null,
        numero_recibo_normalizado: recibo.numero_recibo_normalizado ?? null,
        numero_reserva: recibo.numero_reserva ?? null,
        valor_total: toNullableNumber(recibo.valor_total),
        valor_taxas: toNullableNumber(recibo.valor_taxas)
      }))
    });

    return json(snapshot, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    logServerError('[ranking-recibos] erro ao carregar snapshot', err);
    return toErrorResponse(err, 'Erro ao carregar ranking de recibos.');
  }
}
