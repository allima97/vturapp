// Migrado para Hono de src/routes/api/v1/conciliacao/rateio-info/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler e caminhos de import relativos mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';

type RateioInfoReciboRow = {
  id: string;
  valor_total: number | null;
  vendas: Array<{
    company_id: string | null;
    vendedor: Array<{ id: string; nome_completo: string | null }> | null;
  }> | null;
  produto_resolvido: Array<{
    nome: string | null;
    tipo_produto: Array<{
      nome: string | null;
      soma_na_meta: boolean | null;
    }> | null;
  }> | null;
  rateio:
    | Array<{
        id: string;
        ativo: boolean | null;
        vendedor_destino_id: string | null;
        percentual_origem: number | null;
        percentual_destino: number | null;
        vendedor_destino: Array<{ nome_completo: string | null }> | null;
      }>
    | {
        id: string;
        ativo: boolean | null;
        vendedor_destino_id: string | null;
        percentual_origem: number | null;
        percentual_destino: number | null;
        vendedor_destino: Array<{ nome_completo: string | null }> | null;
      }
    | null;
};

type RateioInfoPayload = {
  id: string;
  ativo: boolean | null;
  vendedor_destino_id: string | null;
  vendedor_destino_nome: string | null;
  percentual_origem: number;
  percentual_destino: number;
  valor_origem: number;
  valor_destino: number;
};

/**
 * GET /api/v1/conciliacao/rateio-info?venda_recibo_id=<uuid>&company_id=<uuid>
 *
 * Retorna, para um venda_recibo_id, as informações de rateio e se o produto
 * soma na meta — usado pelo front durante o assign para exibir a divisão
 * de ranking entre vendedor origem e vendedor destino.
 *
 * Resposta:
 * {
 *   venda_recibo_id: string
 *   soma_na_meta: boolean | null        // null = produto não encontrado
 *   produto_nome: string | null
 *   produto_tipo_nome: string | null
 *   vendedor_origem: { id, nome } | null
 *   rateio: {
 *     id: string
 *     ativo: boolean
 *     vendedor_destino_id: string
 *     vendedor_destino_nome: string
 *     percentual_origem: number         // % do ranking para o vendedor da venda
 *     percentual_destino: number        // % do ranking para o vendedor destino
 *     valor_origem: number              // valor_calculada_loja * pct_origem / 100
 *     valor_destino: number             // valor_calculada_loja * pct_destino / 100
 *   } | null
 *   valor_calculada_loja: number | null // vindo de conciliacao_recibos se passado
 * }
 */
export async function handleConciliacaoRateioInfoGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster && !scope.isFinanceiro && !scope.isGestor) {
      ensureModuloAccess(scope, ['operacao_conciliacao', 'conciliacao'], 1, 'Sem acesso à Conciliação.');
    }

    const { searchParams } = event.url;
    const vendaReciboId = String(searchParams.get('venda_recibo_id') || '').trim();
    const conciliacaoReciboId = String(searchParams.get('conciliacao_recibo_id') || '').trim();

    if (!isUuid(vendaReciboId)) {
      return json({ error: 'venda_recibo_id inválido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const companyIds = resolveScopedCompanyIds(scope, searchParams.get('company_id'));
    // 1. Busca o recibo com produto e vendedor de origem
    const { data: reciboData, error: reciboErr } = await client
      .from('vendas_recibos')
      .select(`
        id,
        valor_total,
        vendas!inner(
          company_id,
          vendedor_id,
          vendedor:users!vendedor_id(id, nome_completo)
        ),
        produto_resolvido:produtos!produto_resolvido_id(
          id, nome,
          tipo_produto:tipo_produtos!tipo_produto_id(id, nome, soma_na_meta)
        ),
        rateio:vendas_recibos_rateio(
          id, ativo,
          vendedor_destino_id, percentual_origem, percentual_destino,
          vendedor_destino:users!vendedor_destino_id(id, nome_completo)
        )
      `)
      .eq('id', vendaReciboId)
      .maybeSingle();

    if (reciboErr) throw reciboErr;
    if (!reciboData) return json({ error: 'Recibo não encontrado.' }, { status: 404, headers: NO_STORE_HEADERS });

    // Ownership check
    const recibo = reciboData as RateioInfoReciboRow;
    const vendaRow = Array.isArray(recibo.vendas) ? (recibo.vendas[0] ?? null) : null;
    const produtoRow = Array.isArray(recibo.produto_resolvido) ? (recibo.produto_resolvido[0] ?? null) : null;
    const tipoProduto = Array.isArray(produtoRow?.tipo_produto) ? (produtoRow.tipo_produto[0] ?? null) : null;
    const vendedorOrigemRow = Array.isArray(vendaRow?.vendedor) ? (vendaRow.vendedor[0] ?? null) : null;
    const reciboCompany = vendaRow?.company_id;
    if (!scope.isAdmin && (!reciboCompany || companyIds.length === 0 || !companyIds.includes(reciboCompany))) {
      return json({ error: 'Recibo fora do escopo.' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const somaNaMeta: boolean | null = tipoProduto?.soma_na_meta ?? null;

    const vendedorOrigem = vendedorOrigemRow
      ? { id: vendedorOrigemRow.id, nome: vendedorOrigemRow.nome_completo }
      : null;

    // 2. Rateio ativo
    const rateioRow = Array.isArray(recibo.rateio)
      ? recibo.rateio.find((r) => r.ativo !== false) ?? recibo.rateio[0] ?? null
      : recibo.rateio ?? null;

    // 3. Valor de referência — tenta buscar em conciliacao_recibos se passado
    let valorCalculadaLoja: number | null = null;
    if (isUuid(conciliacaoReciboId)) {
      const { data: concRow } = await client
        .from('conciliacao_recibos')
        .select('valor_calculada_loja, valor_lancamentos')
        .eq('id', conciliacaoReciboId)
        .maybeSingle();
      if (concRow) {
        valorCalculadaLoja =
          Number(concRow.valor_calculada_loja ?? concRow.valor_lancamentos ?? 0) || null;
      }
    }

    if (!valorCalculadaLoja) {
      valorCalculadaLoja = Number(recibo.valor_total || 0) || null;
    }

    let rateioInfo: RateioInfoPayload | null = null;
    if (rateioRow && rateioRow.ativo !== false) {
      const pctOrigem = Number(rateioRow.percentual_origem ?? 100);
      const pctDestino = Number(rateioRow.percentual_destino ?? 0);
      const base = valorCalculadaLoja ?? 0;
      const vendedorDestinoRow = Array.isArray(rateioRow.vendedor_destino)
        ? (rateioRow.vendedor_destino[0] ?? null)
        : null;

      rateioInfo = {
        id: rateioRow.id,
        ativo: rateioRow.ativo,
        vendedor_destino_id: rateioRow.vendedor_destino_id,
        vendedor_destino_nome:
          vendedorDestinoRow?.nome_completo ?? rateioRow.vendedor_destino_id,
        percentual_origem: pctOrigem,
        percentual_destino: pctDestino,
        valor_origem: Math.round((base * pctOrigem) / 100 * 100) / 100,
        valor_destino: Math.round((base * pctDestino) / 100 * 100) / 100
      };
    }

    return json({
      venda_recibo_id: vendaReciboId,
      soma_na_meta: somaNaMeta,
      produto_nome: produtoRow?.nome ?? null,
      produto_tipo_nome: tipoProduto?.nome ?? null,
      vendedor_origem: vendedorOrigem,
      rateio: rateioInfo,
      valor_calculada_loja: valorCalculadaLoja
    }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar informações de rateio.');
  }
}
