// Migrado para Hono de src/routes/api/v1/orcamentos/save/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import {
  requireAuthenticatedUser,
  resolveUserScope,
  ensureModuloAccess,
  normalizeText,
  isUuid,
  logServerError
} from '$lib/server/v1';
import { getAdminClient } from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateQuoteReadModels } from '$lib/server/readModelCache';
import { isQuoteCreatorAllowed, resolveQuoteCreatorScope } from '$lib/server/orcamentos';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { chunkArray } from '$lib/utils/array';

const MAX_ORCAMENTO_SAVE_BODY_BYTES = 2 * 1024 * 1024;

const EXCLUDED_PRODUTO_TIPOS = new Set(
  ['Seguro viagem', 'Passagem Aerea', 'Passagem Facial', 'Aereo', 'Chip', 'Aluguel de Carro'].map(
    (value) => normalizeLookupText(value)
  )
);

type QuoteItemPayload = {
  id?: string | null;
  item_type: string;
  title: string | null;
  product_name: string | null;
  city_name: string | null;
  cidade_id?: string | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  taxes_amount?: number | null;
  start_date: string | null;
  end_date: string | null;
  currency: string | null;
  raw?: Record<string, unknown> | null;
  order_index?: number | null;
  segments?: QuoteItemSegmentPayload[] | null;
};

type QuoteItemSegmentPayload = {
  segment_type: string;
  data: Record<string, unknown>;
  order_index?: number | null;
};

type OrcamentoSaveBody = {
  quote_id?: unknown;
  items?: unknown;
  removed_item_ids?: unknown;
  client_id?: unknown;
  client_name?: unknown;
  cliente_nome?: unknown;
  client_whatsapp?: unknown;
  cliente_telefone?: unknown;
  client_email?: unknown;
  status?: unknown;
  raw_json?: unknown;
};

type ClienteScopeRow = {
  id?: unknown;
  company_id?: unknown;
};

function normalizeLookupText(value: string) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function validateItem(item: QuoteItemPayload) {
  return Boolean(
    item.item_type &&
    item.quantity > 0 &&
    item.start_date &&
    item.title &&
    Number(item.total_amount || 0) > 0
  );
}

async function buildTipoLabelMap(client: Awaited<ReturnType<typeof getAdminClient>>) {
  const { data, error: err } = await client
    .from('tipo_produtos')
    .select('id, nome, tipo')
    .order('nome', { ascending: true })
    .limit(500);
  if (err) throw err;
  const map = new Map<string, string>();
  for (const tipo of data || []) {
    const label = String(tipo?.nome || tipo?.tipo || '').trim();
    const key = normalizeLookupText(label);
    if (key) map.set(key, tipo.id);
  }
  return map;
}

async function syncProductsCatalog(
  client: Awaited<ReturnType<typeof getAdminClient>>,
  items: QuoteItemPayload[]
) {
  if (!items.length) return;
  const tipoLabelMap = await buildTipoLabelMap(client);
  for (const item of items) {
    const nomeRaw = String(item.title || item.product_name || '').trim();
    if (!nomeRaw) continue;
    const destinoRaw = String(item.city_name || '').trim();
    const cidadeId = item.cidade_id || null;
    const tipoKey = normalizeLookupText(item.item_type || '');
    if (EXCLUDED_PRODUTO_TIPOS.has(tipoKey)) continue;

    const payload = {
      nome: nomeRaw,
      destino: destinoRaw || null,
      cidade_id: cidadeId,
      tipo_produto: tipoLabelMap.get(tipoKey) || null
    };

    try {
      let query = client.from('produtos').select('id');
      query = query.eq('nome', payload.nome);
      if (payload.destino) {
        query = query.eq('destino', payload.destino);
      } else {
        query = query.is('destino', null);
      }
      if (payload.cidade_id) {
        query = query.eq('cidade_id', payload.cidade_id);
      } else {
        query = query.is('cidade_id', null);
      }
      const { data: existing, error: selectErr } = await query.maybeSingle();
      if (selectErr) {
        logServerError('[Orcamentos] Falha ao buscar produto', selectErr);
        continue;
      }
      if (existing?.id) {
        const { error: updateErr } = await client
          .from('produtos')
          .update(payload)
          .eq('id', existing.id);
        if (updateErr) logServerError('[Orcamentos] Falha ao atualizar produto', updateErr);
      } else {
        const { error: insertErr } = await client.from('produtos').insert(payload);
        if (insertErr) logServerError('[Orcamentos] Falha ao inserir produto', insertErr);
      }
    } catch (err) {
      logServerError('[Orcamentos] Erro ao sincronizar produto', err);
    }
  }
}

export async function handleOrcamentosSavePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_ORCAMENTO_SAVE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const user = await requireAuthenticatedUser(event);
    const client = getAdminClient();

    const scope = await resolveUserScope(client, user.id);
    ensureModuloAccess(scope, ['Orcamentos'], 3, 'Sem acesso para editar Orcamentos.');

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as OrcamentoSaveBody)
        : null;
    const quoteId = String(body?.quote_id || '').trim();
    if (!isUuid(quoteId))
      return new Response('Quote invalido.', { status: 400, headers: NO_STORE_HEADERS });

    const items = Array.isArray(body?.items) ? (body.items as QuoteItemPayload[]) : [];
    const removedItemIds = Array.isArray(body?.removed_item_ids)
      ? (body.removed_item_ids as string[])
      : [];
    const clienteId = String(body?.client_id || '').trim() || null;
    const clientName = String(body?.client_name ?? body?.cliente_nome ?? '').trim();
    const clientWhatsapp = String(body?.client_whatsapp ?? body?.cliente_telefone ?? '').trim();
    const clientEmail = String(body?.client_email ?? '').trim();

    if (!clienteId && !clientName) {
      return new Response('Informe o nome do cliente.', { status: 400, headers: NO_STORE_HEADERS });
    }

    const quoteScope = await resolveQuoteCreatorScope(client, scope, {
      companyId:
        event.url.searchParams.get('company_id') || event.url.searchParams.get('empresa_id')
    });
    const { data: existingQuote, error: quoteCheckError } = await client
      .from('quote')
      .select('id, created_by')
      .eq('id', quoteId)
      .maybeSingle();
    if (quoteCheckError) throw quoteCheckError;
    if (!existingQuote?.id || !isQuoteCreatorAllowed(quoteScope, existingQuote.created_by)) {
      return new Response('Orcamento nao encontrado.', { status: 404, headers: NO_STORE_HEADERS });
    }
    if (clienteId) {
      if (!isUuid(clienteId))
        return new Response('Cliente invalido.', { status: 400, headers: NO_STORE_HEADERS });
      const { data: cliente, error: clienteErr } = await client
        .from('clientes')
        .select('id, company_id')
        .eq('id', clienteId)
        .maybeSingle();
      if (clienteErr) throw clienteErr;
      const clienteRow = cliente as ClienteScopeRow | null;
      if (!clienteRow?.id)
        return new Response('Cliente nao encontrado.', { status: 404, headers: NO_STORE_HEADERS });
      const clienteCompanyId = String(clienteRow.company_id || '').trim();
      if (!scope.isAdmin && clienteCompanyId && !scope.companyIds.includes(clienteCompanyId)) {
        return new Response('Cliente fora do seu escopo.', {
          status: 403,
          headers: NO_STORE_HEADERS
        });
      }
    }

    const requestedItemIds = Array.from(
      new Set(
        [
          ...items.map((item) => String(item.id || '').trim()),
          ...removedItemIds.map((id) => String(id || '').trim())
        ].filter(isUuid)
      )
    );
    const allowedExistingItemIds = new Set<string>();
    if (requestedItemIds.length) {
      for (const batch of chunkArray(requestedItemIds)) {
        const { data: existingItems, error: existingItemsError } = await client
          .from('quote_item')
          .select('id')
          .eq('quote_id', quoteId)
          .in('id', batch);
        if (existingItemsError) throw existingItemsError;
        for (const row of existingItems || []) {
          allowedExistingItemIds.add(String(row.id));
        }
      }
    }

    const payload = items.map((item, index) => ({
      id: item.id && allowedExistingItemIds.has(String(item.id)) ? item.id : undefined,
      quote_id: quoteId,
      item_type: item.item_type,
      title: item.title,
      product_name: item.product_name,
      city_name: item.city_name,
      cidade_id: item.cidade_id || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_amount: item.total_amount,
      taxes_amount: Number(item.taxes_amount || 0),
      start_date: item.start_date || null,
      end_date: item.end_date || item.start_date || null,
      currency: item.currency || 'BRL',
      raw: item.raw || {},
      order_index: typeof item.order_index === 'number' ? item.order_index : index
    }));

    const { error: itemError } = await client
      .from('quote_item')
      .upsert(payload, { onConflict: 'id' });
    if (itemError) throw itemError;

    const scopedRemovedItemIds = removedItemIds
      .map((id) => String(id || '').trim())
      .filter((id) => isUuid(id) && allowedExistingItemIds.has(id));

    if (scopedRemovedItemIds.length) {
      for (const batch of chunkArray(scopedRemovedItemIds)) {
        const { error: deleteRemovedSegs } = await client
          .from('quote_item_segment')
          .delete()
          .in('quote_item_id', batch);
        if (deleteRemovedSegs) throw deleteRemovedSegs;

        const { error: deleteRemovedItems } = await client
          .from('quote_item')
          .delete()
          .eq('quote_id', quoteId)
          .in('id', batch);
        if (deleteRemovedItems) throw deleteRemovedItems;
      }
    }

    const itemIds: string[] = [];
    for (const item of payload) {
      if (item.id) itemIds.push(item.id);
    }
    if (itemIds.length) {
      for (const batch of chunkArray(itemIds)) {
        const { error: deleteSegErr } = await client
          .from('quote_item_segment')
          .delete()
          .in('quote_item_id', batch);
        if (deleteSegErr) throw deleteSegErr;
      }

      const segmentPayloads = items
        .flatMap((item) =>
          (item.segments || []).map((segment, idx) => ({
            quote_item_id: item.id,
            segment_type: segment.segment_type,
            data: segment.data || {},
            order_index: typeof segment.order_index === 'number' ? segment.order_index : idx
          }))
        )
        .filter((seg) => Boolean(seg.quote_item_id));

      if (segmentPayloads.length) {
        const { error: segErr } = await client.from('quote_item_segment').insert(segmentPayloads);
        if (segErr) throw segErr;
      }
    }

    await syncProductsCatalog(client, items);

    const subtotal = items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const taxes = items.reduce((sum, item) => sum + Number(item.taxes_amount || 0), 0);
    const total = subtotal + taxes;
    const canConfirm = items.length > 0 && items.every(validateItem);
    const nextStatus = canConfirm ? 'CONFIRMED' : String(body?.status || 'DRAFT');

    const quotePayload: Record<string, unknown> = {
      subtotal,
      taxes,
      total,
      status: nextStatus,
      client_id: clienteId,
      client_name: clientName || null,
      client_whatsapp: clientWhatsapp || null,
      client_email: clientEmail || null,
      updated_at: new Date().toISOString()
    };
    if (body?.raw_json && typeof body.raw_json === 'object' && !Array.isArray(body.raw_json)) {
      quotePayload.raw_json = body.raw_json;
    }

    const { error: quoteError } = await client.from('quote').update(quotePayload).eq('id', quoteId);
    if (quoteError) throw quoteError;

    invalidateQuoteReadModels({
      companyIds: quoteScope.companyIds,
      vendedorIds: quoteScope.creatorIds.length > 0 ? quoteScope.creatorIds : [user.id],
      userId: user.id
    });

    return new Response(JSON.stringify({ ok: true, status: nextStatus }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...NO_STORE_HEADERS }
    });
  } catch (err: unknown) {
    logServerError('[orcamentos/save] falha ao salvar orcamento', err);
    return new Response('Erro ao salvar orcamento.', { status: 500, headers: NO_STORE_HEADERS });
  }
}
