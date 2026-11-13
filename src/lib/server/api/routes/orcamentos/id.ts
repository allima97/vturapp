// Migrado para Hono de src/routes/api/v1/orcamentos/[id]/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateQuoteReadModels } from '$lib/server/readModelCache';
import { isQuoteCreatorAllowed, resolveQuoteCreatorScope } from '$lib/server/orcamentos';
import { complementarListaOperacional } from '$lib/server/destinoOperacional';

const QUOTE_SELECT_FIELDS =
  'id, created_at, updated_at, created_by, client_id, client_name, client_whatsapp, client_email, status, status_negociacao, currency, total, data_embarque, data_final, last_interaction_at, last_interaction_notes';

const QUOTE_ITEM_SELECT_FIELDS =
  'id, quote_id, item_type, title, product_name, city_name, cidade_id, quantity, unit_price, total_amount, taxes_amount, start_date, end_date, currency, confidence, raw, order_index, created_at, updated_at';
const QUOTE_ITEM_SEGMENT_SELECT_FIELDS = 'id, quote_item_id, segment_type, data, order_index';

const MAX_ORCAMENTO_UPDATE_BODY_BYTES = 256 * 1024;
const errorResponse = (message: string, status: number) =>
  json({ error: message }, { status, headers: NO_STORE_HEADERS });

type OrcamentoUpdateBody = {
  status?: unknown;
  status_negociacao?: unknown;
  total?: unknown;
  currency?: unknown;
  client_id?: unknown;
  client_name?: unknown;
  cliente_nome?: unknown;
  client_whatsapp?: unknown;
  cliente_telefone?: unknown;
  client_email?: unknown;
  data_embarque?: unknown;
  data_final?: unknown;
  itens?: unknown;
};

type OrcamentoUpdatePayload = {
  updated_at: string;
  status?: unknown;
  status_negociacao?: unknown;
  total?: unknown;
  currency?: unknown;
  client_id?: string | null;
  client_name?: string | null;
  client_whatsapp?: string | null;
  client_email?: string | null;
  data_embarque?: unknown;
  data_final?: unknown;
};

type ClienteScopeRow = {
  id?: unknown;
  company_id?: unknown;
};

type OrcamentoUpdateItem = Record<string, unknown> & {
  title?: unknown;
  product_name?: unknown;
  item_type?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
  total_amount?: unknown;
  city_name?: unknown;
};

export async function handleOrcamentosIdGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const id = String(event.params.id || '').trim();

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Orcamentos'], 1, 'Sem acesso a Orcamentos.');
    }
    if (!isUuid(id)) return errorResponse('ID invalido.', 400);

    const quoteScope = await resolveQuoteCreatorScope(client, scope, {
      companyId:
        event.url.searchParams.get('company_id') || event.url.searchParams.get('empresa_id'),
      vendedorRaw: event.url.searchParams.get('vendedor_id')
    });

    const { data: quote, error: quoteError } = await client
      .from('quote')
      .select(QUOTE_SELECT_FIELDS)
      .eq('id', id)
      .maybeSingle();
    if (quoteError) throw quoteError;
    if (!quote || !isQuoteCreatorAllowed(quoteScope, quote.created_by)) {
      return errorResponse('Orcamento nao encontrado.', 404);
    }

    // As 3 queries são completamente independentes entre si — executar em paralelo.
    const previewPdf = event.url.searchParams.get('preview_pdf') === '1';
    const [itemsResult, clienteResult, vendedorResult, settingsResult] = await Promise.all([
      client
        .from('quote_item')
        .select(QUOTE_ITEM_SELECT_FIELDS)
        .eq('quote_id', id)
        .order('order_index', { ascending: true }),
      quote.client_id
        ? client
            .from('clientes')
            .select('id, nome, email, telefone')
            .eq('id', quote.client_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      quote.created_by
        ? client.from('users').select('nome_completo').eq('id', quote.created_by).maybeSingle()
        : Promise.resolve({ data: null }),
      previewPdf
        ? client
            .from('quote_print_settings')
            .select(
              'imagem_complementar_url, imagem_complementar_path, consultor_nome, filial_nome, endereco_linha1, endereco_linha2, endereco_linha3, telefone, whatsapp, whatsapp_codigo_pais, email, rodape_texto'
            )
            .eq('owner_user_id', user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null })
    ]);
    if (previewPdf && itemsResult.error) throw itemsResult.error;
    if (previewPdf && clienteResult.error) throw clienteResult.error;
    if (settingsResult.error) throw settingsResult.error;
    const items = itemsResult.data;
    const itemIds = (items || []).map((item: any) => item.id).filter(Boolean);
    const { data: itemSegments, error: itemSegmentsError } =
      itemIds.length > 0
        ? await client
            .from('quote_item_segment')
            .select(QUOTE_ITEM_SEGMENT_SELECT_FIELDS)
            .in('quote_item_id', itemIds)
            .order('order_index', { ascending: true })
        : { data: [], error: null };
    if (itemSegmentsError) throw itemSegmentsError;

    const segmentMap = new Map<string, Array<Record<string, unknown>>>();
    for (const segment of itemSegments || []) {
      const itemId = String(segment.quote_item_id || '');
      if (!itemId) continue;
      const list = segmentMap.get(itemId) || [];
      list.push(segment);
      segmentMap.set(itemId, list);
    }

    const itemsWithSegments = (items || []).map((item: any) => ({
      ...item,
      segments: segmentMap.get(String(item.id || '')) || []
    }));

    const cliente = clienteResult.data ?? null;
    const vendedor = vendedorResult.data?.nome_completo || 'Equipe VTUR';

    return json(
      {
        id: quote.id,
        codigo: `ORC-${quote.id.slice(0, 8).toUpperCase()}`,
        status: quote.status_negociacao || quote.status || 'pendente',
        status_negociacao: quote.status_negociacao,
        total: quote.total,
        currency: quote.currency || 'BRL',
        client_id: quote.client_id,
        cliente: cliente || { nome: quote.client_name || 'Cliente manual' },
        client_name: quote.client_name || cliente?.nome || null,
        client_whatsapp: quote.client_whatsapp || null,
        client_email: quote.client_email || cliente?.email || null,
        cliente_email: quote.client_email || cliente?.email,
        created_at: quote.created_at,
        updated_at: quote.updated_at,
        data_criacao: quote.created_at?.slice(0, 10),
        data_embarque: quote.data_embarque || null,
        data_final: quote.data_final || null,
        last_interaction_at: quote.last_interaction_at || null,
        last_interaction_notes: quote.last_interaction_notes || null,
        vendedor,
        itens: itemsWithSegments,
        ...(previewPdf ? { pdf_settings: settingsResult.data ?? {} } : {})
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar orcamento.');
  }
}

export async function handleOrcamentosIdPatch(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_ORCAMENTO_UPDATE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const id = String(event.params.id || '').trim();

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Orcamentos'], 2, 'Sem permissao para editar orcamentos.');
    }
    if (!isUuid(id)) return errorResponse('ID invalido.', 400);

    const quoteScope = await resolveQuoteCreatorScope(client, scope, {
      companyId:
        event.url.searchParams.get('company_id') || event.url.searchParams.get('empresa_id'),
      vendedorRaw: event.url.searchParams.get('vendedor_id')
    });

    const { data: existingQuote, error: existingError } = await client
      .from('quote')
      .select('id, created_by')
      .eq('id', id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existingQuote || !isQuoteCreatorAllowed(quoteScope, existingQuote.created_by)) {
      return errorResponse('Orcamento nao encontrado.', 404);
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as OrcamentoUpdateBody)
        : {};
    const updateData: OrcamentoUpdatePayload = { updated_at: new Date().toISOString() };
    if (body.status !== undefined) updateData.status = body.status;
    if (body.status_negociacao !== undefined) updateData.status_negociacao = body.status_negociacao;
    if (body.total !== undefined) updateData.total = body.total;
    if (body.currency !== undefined) updateData.currency = body.currency;
    if (body.client_id !== undefined) {
      const nextClientId = String(body.client_id || '').trim();
      if (nextClientId && !isUuid(nextClientId)) {
        return errorResponse('Cliente invalido.', 400);
      }
      if (nextClientId) {
        const { data: cliente, error: clienteErr } = await client
          .from('clientes')
          .select('id, company_id')
          .eq('id', nextClientId)
          .maybeSingle();
        if (clienteErr) throw clienteErr;
        const clienteRow = cliente as ClienteScopeRow | null;
        if (!clienteRow?.id) return errorResponse('Cliente nao encontrado.', 404);
        const clienteCompanyId = String(clienteRow.company_id || '').trim();
        if (!scope.isAdmin && clienteCompanyId && !scope.companyIds.includes(clienteCompanyId)) {
          return errorResponse('Cliente fora do seu escopo.', 403);
        }
      }
      updateData.client_id = nextClientId || null;
    }
    if (body.client_name !== undefined || body.cliente_nome !== undefined) {
      updateData.client_name = String(body.client_name ?? body.cliente_nome ?? '').trim() || null;
    }
    if (body.client_whatsapp !== undefined || body.cliente_telefone !== undefined) {
      updateData.client_whatsapp =
        String(body.client_whatsapp ?? body.cliente_telefone ?? '').trim() || null;
    }
    if (body.client_email !== undefined)
      updateData.client_email = String(body.client_email || '').trim() || null;
    if (body.data_embarque !== undefined) updateData.data_embarque = body.data_embarque;
    if (body.data_final !== undefined) updateData.data_final = body.data_final;

    const { data, error } = await client
      .from('quote')
      .update(updateData)
      .eq('id', id)
      .select(QUOTE_SELECT_FIELDS)
      .single();
    if (error) throw error;

    if (body.itens && Array.isArray(body.itens)) {
      await client.from('quote_item').delete().eq('quote_id', id);
      const preparados = await complementarListaOperacional(
        body.itens as OrcamentoUpdateItem[],
        event.platform?.env?.DB,
        event.platform?.env?.GEO_DB,
        'city_name'
      );
      if (!preparados.ok) return errorResponse(preparados.error, preparados.status);
      const itensParaInserir = preparados.itens.map((item, index: number) => ({
        quote_id: id,
        title: item.title || '',
        product_name: item.product_name || null,
        item_type: item.item_type || 'servico',
        quantity: item.quantity || 1,
        unit_price: item.unit_price || 0,
        total_amount: item.total_amount || 0,
        city_name: item.city_name || null,
        ...(item.destino_geografico_id
          ? { destino_geografico_id: item.destino_geografico_id }
          : {}),
        order_index: index
      }));
      await client.from('quote_item').insert(itensParaInserir);
    }

    invalidateQuoteReadModels({
      companyIds: quoteScope.companyIds,
      vendedorIds: quoteScope.creatorIds.length > 0 ? quoteScope.creatorIds : [user.id],
      userId: user.id
    });

    return json({ success: true, data }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao atualizar orcamento.');
  }
}

export async function handleOrcamentosIdDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const id = String(event.params.id || '').trim();

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Orcamentos'], 3, 'Sem permissao para excluir orcamentos.');
    }
    if (!isUuid(id)) return errorResponse('ID invalido.', 400);

    const quoteScope = await resolveQuoteCreatorScope(client, scope, {
      companyId:
        event.url.searchParams.get('company_id') || event.url.searchParams.get('empresa_id')
    });

    const { data: existingQuote, error: existingError } = await client
      .from('quote')
      .select('id, created_by')
      .eq('id', id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existingQuote || !isQuoteCreatorAllowed(quoteScope, existingQuote.created_by)) {
      return errorResponse('Orcamento nao encontrado.', 404);
    }

    await client.from('quote_item').delete().eq('quote_id', id);

    const { error } = await client.from('quote').delete().eq('id', id);
    if (error) throw error;

    invalidateQuoteReadModels({
      companyIds: quoteScope.companyIds,
      vendedorIds: quoteScope.creatorIds.length > 0 ? quoteScope.creatorIds : [user.id],
      userId: user.id
    });

    return json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir orcamento.');
  }
}
