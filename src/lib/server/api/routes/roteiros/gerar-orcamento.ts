// Migrado para Hono de src/routes/api/v1/roteiros/gerar-orcamento/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  ensureModuloAccess,
  isUuid,
  toErrorResponse
} from '$lib/server/v1';
import { todayISODateLocal } from '$lib/date';
import { invalidateQuoteReadModels } from '$lib/server/readModelCache';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';

const MAX_ROTEIRO_GERAR_ORCAMENTO_BODY_BYTES = 64 * 1024;

type GerarOrcamentoBody = {
  roteiro_id?: unknown;
  client_name?: unknown;
  client_whatsapp?: unknown;
  client_email?: unknown;
  client_id?: unknown;
};

type RoteiroPagamentoRow = {
  servico?: string | null;
  valor_total_com_taxas?: number | string | null;
  taxas?: number | string | null;
  forma_pagamento?: string | null;
  ordem?: number | null;
};

type ClienteResumoRow = {
  nome?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  company_id?: string | null;
};

function readGerarOrcamentoBody(value: unknown): GerarOrcamentoBody | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  return {
    roteiro_id: body.roteiro_id,
    client_name: body.client_name,
    client_whatsapp: body.client_whatsapp,
    client_email: body.client_email,
    client_id: body.client_id
  };
}

export async function handleRoteirosGerarOrcamentoPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(
      event.request,
      MAX_ROTEIRO_GERAR_ORCAMENTO_BODY_BYTES
    );
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    ensureModuloAccess(scope, ['Orcamentos'], 2, 'Sem acesso para criar Orcamentos.');

    const body = readGerarOrcamentoBody(bodyResult.data);
    if (!body) return new Response('Body invalido.', { status: 400, headers: NO_STORE_HEADERS });

    const roteiroId = String(body.roteiro_id || '').trim();
    if (!isUuid(roteiroId))
      return new Response('roteiro_id invalido.', { status: 400, headers: NO_STORE_HEADERS });

    const clientName = String(body.client_name || '').trim();
    if (!clientName)
      return new Response('client_name obrigatorio.', { status: 400, headers: NO_STORE_HEADERS });

    // Carregar roteiro
    const { data: roteiro, error: roteiroErr } = await client
      .from('roteiro_personalizado')
      .select('id, nome')
      .eq('id', roteiroId)
      .maybeSingle();

    if (roteiroErr) throw roteiroErr;
    if (!roteiro)
      return new Response('Roteiro nao encontrado.', { status: 404, headers: NO_STORE_HEADERS });

    // Carregar pagamentos do roteiro
    const { data: pagamentos, error: pagErr } = await client
      .from('roteiro_pagamento')
      .select('servico, valor_total_com_taxas, taxas, forma_pagamento, ordem')
      .eq('roteiro_id', roteiroId)
      .order('ordem', { ascending: true });

    if (pagErr) throw pagErr;

    const total = (pagamentos || []).reduce(
      (sum: number, p: RoteiroPagamentoRow) => sum + Number(p.valor_total_com_taxas || 0),
      0
    );
    const taxesTotal = (pagamentos || []).reduce(
      (sum: number, p: RoteiroPagamentoRow) => sum + Number(p.taxas || 0),
      0
    );

    // Dados opcionais do cliente
    let clientWhatsapp: string | null = String(body.client_whatsapp || '').trim() || null;
    let clientEmail: string | null = String(body.client_email || '').trim() || null;
    const clientId: string | null = String(body.client_id || '').trim() || null;
    if (clientId && !isUuid(clientId)) {
      return new Response('client_id invalido.', { status: 400, headers: NO_STORE_HEADERS });
    }

    if (clientId) {
      const { data: cliente } = await client
        .from('clientes')
        .select('nome, whatsapp, email, company_id')
        .eq('id', clientId)
        .maybeSingle();

      if (cliente) {
        const clienteRow = cliente as ClienteResumoRow;
        const clienteCompanyId = String(clienteRow.company_id || '').trim();
        if (!scope.isAdmin && clienteCompanyId && !scope.companyIds.includes(clienteCompanyId)) {
          return new Response('Cliente fora do seu escopo.', {
            status: 403,
            headers: NO_STORE_HEADERS
          });
        }
        clientWhatsapp = clientWhatsapp || clienteRow.whatsapp || null;
        clientEmail = clientEmail || clienteRow.email || null;
      }
    }

    // Criar quote — usa client_id (não cliente_id) e created_by (FK→auth.users)
    const { data: quote, error: quoteErr } = await client
      .from('quote')
      .insert({
        created_by: user.id,
        roteiro_id: roteiroId,
        client_id: clientId,
        client_name: clientName,
        client_whatsapp: clientWhatsapp,
        client_email: clientEmail,
        status: 'CONFIRMED',
        currency: 'BRL',
        subtotal: total - taxesTotal,
        taxes: taxesTotal,
        total,
        average_confidence: 1,
        raw_json: { roteiro: true, roteiro_id: roteiroId }
      })
      .select('id')
      .single();

    if (quoteErr || !quote) throw quoteErr || new Error('Falha ao criar orcamento.');

    // Criar quote_items a partir dos pagamentos
    if (pagamentos && pagamentos.length > 0) {
      const items = pagamentos.map((p: RoteiroPagamentoRow, idx: number) => ({
        quote_id: quote.id,
        item_type: p.servico || 'Servico',
        title: p.servico || 'Servico',
        product_name: p.servico || null,
        city_name: null,
        quantity: 1,
        unit_price: Number(p.valor_total_com_taxas || 0) - Number(p.taxas || 0),
        total_amount: Number(p.valor_total_com_taxas || 0) - Number(p.taxas || 0),
        taxes_amount: Number(p.taxas || 0),
        start_date: todayISODateLocal(),
        end_date: null,
        currency: 'BRL',
        confidence: 1,
        order_index: typeof p.ordem === 'number' ? p.ordem : idx,
        raw: { forma_pagamento: p.forma_pagamento || null }
      }));

      const { error: itemErr } = await client.from('quote_item').insert(items);
      if (itemErr) throw itemErr;
    }

    invalidateQuoteReadModels({
      companyIds: scope.companyIds,
      vendedorIds: [user.id],
      userId: user.id
    });

    return json({ ok: true, quote_id: quote.id }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao gerar orcamento.');
  }
}
