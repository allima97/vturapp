// Migrado para Hono de src/routes/api/v1/orcamentos/create/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
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
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateQuoteReadModels } from '$lib/server/readModelCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { complementarListaOperacional } from '$lib/server/destinoOperacional';
import { lerDetalhes, rawDetalhes, validarDetalhes } from '$lib/quote/detalhesItem';
import { validadeDoOrcamento, validadeInformadaValida } from '$lib/quote/validade';

const MAX_ORCAMENTO_CREATE_BODY_BYTES = 512 * 1024;

type OrcamentoCreateBody = {
  client_id?: unknown;
  client_name?: unknown;
  cliente_nome?: unknown;
  client_whatsapp?: unknown;
  cliente_telefone?: unknown;
  client_email?: unknown;
  status?: unknown;
  status_negociacao?: unknown;
  currency?: unknown;
  valid_until?: unknown;
  data_embarque?: unknown;
  data_final?: unknown;
  notes?: unknown;
  observacoes?: unknown;
  itens?: unknown;
};

type OrcamentoCreateItem = Record<string, unknown> & {
  title?: unknown;
  descricao?: unknown;
  product_name?: unknown;
  produto?: unknown;
  item_type?: unknown;
  total_amount?: unknown;
  valor_total?: unknown;
  order_index?: unknown;
  city_name?: unknown;
  cidade?: unknown;
  quantity?: unknown;
  quantidade?: unknown;
  unit_price?: unknown;
  valor_unitario?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  raw?: unknown;
};

type ClienteScopeRow = {
  id?: unknown;
  company_id?: unknown;
};

export async function handleOrcamentosCreatePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_ORCAMENTO_CREATE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Orcamentos'], 2, 'Sem permissao para criar orcamentos.');
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as OrcamentoCreateBody)
        : {};

    const clientId = String(body.client_id || '').trim() || null;
    const clientName = String(body.client_name || body.cliente_nome || '').trim();
    const clientWhatsapp =
      String(body.client_whatsapp || body.cliente_telefone || '').trim() || null;
    const clientEmail = String(body.client_email || '').trim() || null;

    if (!validadeInformadaValida(body.valid_until)) {
      return json(
        { error: 'Data de validade inválida.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (!clientId && !clientName) {
      return json(
        { error: 'Informe o nome do cliente.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (clientId && !isUuid(clientId)) {
      return json({ error: 'Cliente invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    if (clientId) {
      const { data: cliente, error: clienteError } = await client
        .from('clientes')
        .select('id, company_id')
        .eq('id', clientId)
        .maybeSingle();
      if (clienteError) throw clienteError;
      const clienteRow = cliente as ClienteScopeRow | null;
      if (!clienteRow?.id) {
        return json(
          { error: 'Cliente nao encontrado.' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }
      if (!scope.isAdmin) {
        const clienteCompanyId = String(clienteRow.company_id || '').trim();
        if (clienteCompanyId && !scope.companyIds.includes(clienteCompanyId)) {
          return json(
            { error: 'Cliente fora do seu escopo.' },
            { status: 403, headers: NO_STORE_HEADERS }
          );
        }
      }
    }

    if (!body.itens || !Array.isArray(body.itens) || body.itens.length === 0) {
      return json(
        { error: 'Adicione pelo menos um item.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (body.itens.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
      return json({ error: 'Item inválido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const itens = body.itens as OrcamentoCreateItem[];
    for (const [index, item] of itens.entries()) {
      const detalhes = { ...lerDetalhes(item), item_type: String(item.item_type || 'servico') };
      const erro = validarDetalhes(detalhes);
      if (erro)
        return json(
          { error: `Item ${index + 1}: ${erro}` },
          { status: 400, headers: NO_STORE_HEADERS }
        );
    }
    const preparados = await complementarListaOperacional(
      itens,
      event.platform?.env?.DB,
      event.platform?.env?.GEO_DB,
      'city_name'
    );
    if (!preparados.ok)
      return json(
        { error: preparados.error },
        { status: preparados.status, headers: NO_STORE_HEADERS }
      );

    // quote nao tem company_id — usa created_by como FK auth.users
    const total = itens.reduce((acc: number, item) => {
      const valor = Number(item.total_amount || item.valor_total || 0);
      return acc + valor;
    }, 0);

    const { data: quote, error: quoteError } = await client
      .from('quote')
      .insert({
        client_id: clientId,
        client_name: clientName || null,
        client_whatsapp: clientWhatsapp,
        client_email: clientEmail,
        status: body.status || 'DRAFT',
        status_negociacao: body.status_negociacao || 'Enviado',
        total: total,
        currency: body.currency || 'BRL',
        raw_json: validadeDoOrcamento({ valid_until: body.valid_until })
          ? { valid_until: body.valid_until }
          : {},
        created_by: user.id,
        data_embarque: body.data_embarque || null,
        data_final: body.data_final || null,
        last_interaction_notes: body.notes || body.observacoes || null
      })
      .select(
        'id, client_id, client_name, client_whatsapp, client_email, status, status_negociacao, total, currency, created_by, data_embarque, data_final, created_at'
      )
      .single();

    if (quoteError) {
      logServerError('[orcamentos/create] erro ao criar quote', quoteError);
      return json(
        { error: 'Erro ao criar orcamento.' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    const itensParaInserir = preparados.itens.map((item, index: number) => ({
      quote_id: quote.id,
      title: item.title || item.descricao || `Item ${index + 1}`,
      product_name: item.product_name || item.produto || null,
      item_type: item.item_type || 'servico',
      total_amount: Number(item.total_amount || item.valor_total || 0),
      order_index: item.order_index ?? index,
      city_name: item.city_name || item.cidade || null,
      ...(item.destino_geografico_id ? { destino_geografico_id: item.destino_geografico_id } : {}),
      quantity: item.quantity || item.quantidade || 1,
      unit_price: item.unit_price || item.valor_unitario || 0,
      currency: body.currency || 'BRL',
      start_date: item.start_date,
      end_date: item.end_date,
      raw: {
        detalhes_orcamento: rawDetalhes({
          ...lerDetalhes(item),
          item_type: String(item.item_type || 'servico')
        })
      }
    }));

    const { error: itemsError } = await client.from('quote_item').insert(itensParaInserir);

    if (itemsError) {
      // Desfaz o orcamento para nao deixar registro sem itens
      await client.from('quote').delete().eq('id', quote.id);
      logServerError('[orcamentos/create] erro ao criar itens do quote', itemsError);
      return json(
        { error: 'Erro ao salvar itens do orcamento.' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    invalidateQuoteReadModels({
      companyIds: scope.companyIds,
      vendedorIds: [user.id],
      userId: user.id
    });

    return json(
      {
        success: true,
        data: {
          id: quote.id,
          codigo: `ORC-${quote.id.slice(0, 8).toUpperCase()}`,
          client_id: quote.client_id,
          client_name: quote.client_name,
          client_whatsapp: quote.client_whatsapp,
          client_email: quote.client_email,
          total: quote.total,
          status: quote.status,
          created_at: quote.created_at
        }
      },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao criar orcamento.');
  }
}
