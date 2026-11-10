// Migrado para Hono de src/routes/api/v1/vendas/create/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler mudou). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveScopedCompanyId,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import {
  buildVendaPayload,
  closeQuoteIfNeeded,
  ensureAssignableActiveSeller,
  ensureReciboReservaUnicos,
  resolveVendaDestinoProduto,
  syncVendaChildren
} from '$lib/server/vendasSave';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { registrarLog } from '$lib/server/auditLog';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { invalidateSalesReadModels } from '$lib/server/readModelCache';
import { resolveCompanyClienteIds } from '$lib/server/clientes';
import { toUserMessage } from '$lib/utils/errors';

const MAX_VENDA_CREATE_BODY_BYTES = 512 * 1024;

type JsonObject = Record<string, unknown>;
type SellerScopeRow = { company_id?: string | null } | null;

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isVendaDestinoFkError(err: unknown) {
  const errorLike =
    err && typeof err === 'object'
      ? (err as { code?: string | null; message?: string | null; details?: string | null })
      : null;
  const text = `${errorLike?.message || ''} ${errorLike?.details || ''}`.toLowerCase();
  return errorLike?.code === '23503' && text.includes('vendas_destino_id_fkey');
}

export async function handleVendasCreatePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_VENDA_CREATE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['vendas', 'vendas_cadastro'],
        2,
        'Sem permissao para cadastrar vendas.'
      );
    }

    const body = isJsonObject(bodyResult.data) ? bodyResult.data : {};
    const venda = isJsonObject(body.venda) ? body.venda : {};
    const recibos = Array.isArray(body?.recibos) ? body.recibos : [];
    const pagamentos = Array.isArray(body?.pagamentos) ? body.pagamentos : [];

    const vendedorId = String(venda?.vendedor_id || scope.userId).trim();
    if (!isUuid(vendedorId)) {
      return json({ error: 'Vendedor invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const deniedSeller = await ensureAssignableActiveSeller(client, scope, vendedorId);
    if (deniedSeller) {
      return json({ error: deniedSeller }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { data: sellerScope, error: sellerScopeError } = await client
      .from('users')
      .select('id, company_id')
      .eq('id', vendedorId)
      .maybeSingle();
    if (sellerScopeError) throw sellerScopeError;

    const sellerCompanyId =
      String((sellerScope as SellerScopeRow)?.company_id || '').trim() || null;
    const requestedCompanyId = String(venda?.company_id || venda?.empresa_id || '').trim();
    const targetCompanyId = scope.isAdmin
      ? requestedCompanyId || sellerCompanyId || scope.companyId
      : resolveScopedCompanyId(scope, requestedCompanyId || sellerCompanyId || scope.companyId);

    if (!targetCompanyId) {
      return json(
        { error: 'Selecione uma empresa para cadastrar a venda.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (sellerCompanyId && sellerCompanyId !== targetCompanyId) {
      return json(
        { error: 'Vendedor fora da empresa selecionada.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const clienteId = String(venda?.cliente_id || '').trim();
    if (!isUuid(clienteId))
      return json({ error: 'Cliente invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
    const companyClienteIds = await resolveCompanyClienteIds(client, [targetCompanyId]);
    if (!companyClienteIds.includes(clienteId)) {
      return json(
        { error: 'Cliente fora da empresa selecionada.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    if (!Array.isArray(recibos) || recibos.length === 0) {
      return json(
        { error: 'Inclua ao menos um recibo.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    let destinoResolvido;
    try {
      destinoResolvido = await resolveVendaDestinoProduto({
        client,
        venda,
        recibos,
        companyId: targetCompanyId,
        userId: user.id
      });
    } catch (err) {
      const code = toUserMessage(err, '');
      if (
        code === 'RECIBO_INVALIDO' ||
        code === 'DESTINO_INVALIDO' ||
        code === 'VALE_VIAGEM_TIPO_NAO_ENCONTRADO' ||
        code === 'VALE_VIAGEM_PRODUTO_INVALIDO'
      ) {
        return json(
          code === 'RECIBO_INVALIDO'
            ? {
                code,
                error: 'Recibo invalido: selecione um tipo/produto valido.'
              }
            : { error: 'Produto/destino invalido para a venda.' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      throw err;
    }

    try {
      await ensureReciboReservaUnicos({
        client,
        companyId: targetCompanyId,
        clienteId,
        recibos: destinoResolvido.recibos
      });
    } catch (err) {
      const code = toUserMessage(err, 'Erro ao validar recibos.');
      if (code === 'RECIBO_DUPLICADO' || code === 'RESERVA_DUPLICADA') {
        return json(
          {
            code,
            error:
              code === 'RECIBO_DUPLICADO'
                ? 'Numero de recibo duplicado nesta venda ou ja utilizado em outra venda da empresa.'
                : 'Reserva ja vinculada a outro recibo/venda.'
          },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }
      throw err;
    }

    let vendaPayload;
    try {
      vendaPayload = buildVendaPayload(
        venda,
        vendedorId,
        clienteId,
        destinoResolvido.destinoId,
        targetCompanyId
      );
    } catch (err) {
      const code = toUserMessage(err, '');
      if (code === 'DATA_VENDA_INVALIDA') {
        return json(
          { error: 'Data da venda invalida.' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      throw err;
    }
    const { data: insertedSale, error: saleError } = await client
      .from('vendas')
      .insert(vendaPayload)
      .select('id')
      .single();
    if (isVendaDestinoFkError(saleError)) {
      return json(
        { error: 'Produto/destino invalido para a venda.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (saleError || !insertedSale?.id) throw saleError || new Error('Erro ao criar venda.');

    await syncVendaChildren({
      client,
      vendaId: insertedSale.id,
      companyId: targetCompanyId,
      clienteId,
      vendedorId,
      userId: user.id,
      dataVenda: String(vendaPayload.data_venda || ''),
      recibos: destinoResolvido.recibos,
      pagamentos
    });

    await closeQuoteIfNeeded(client, String(body.orcamento_id || ''));
    invalidateSalesReadModels({
      companyIds: [targetCompanyId],
      vendedorIds: [vendedorId],
      userId: user.id
    });

    // Auditoria (mesmo formato do vturapp original: {id, venda, recibos})
    registrarLog(event, {
      userId: user.id,
      modulo: 'Vendas',
      acao: 'venda_criada',
      detalhes: { id: insertedSale.id, venda, recibos }
    });

    return json({ ok: true, venda_id: insertedSale.id }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar venda.');
  }
}
