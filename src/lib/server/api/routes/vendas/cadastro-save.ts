// Migrado para Hono de src/routes/api/v1/vendas/cadastro-save/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler mudou). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  NO_MATCH_COMPANY_ID,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse,
  isUuid
} from '$lib/server/v1';
import {
  buildVendaPayload,
  syncVendaChildren,
  ensureAssignableActiveSeller,
  ensureReciboReservaUnicos,
  closeQuoteIfNeeded,
  toNullableString
} from '$lib/server/vendasSave';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { registrarLog } from '$lib/server/auditLog';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { invalidateSalesReadModels } from '$lib/server/readModelCache';
import { getPlatformExecutionContext, triggerRebuildAsync } from '$lib/server/readModelRebuild';
import { publishKvInvalidationAsync } from '$lib/server/kvInvalidation';
import { cleanStringSet } from '$lib/utils/array';
import { toUserMessage } from '$lib/utils/errors';

// Espelha o contrato de vtur-app/src/pages/api/v1/vendas/cadastro-save.ts
// Aceita POST com payload { venda, recibos, pagamentos, orcamento_id? }
// Usa sync_venda_children RPC para inserir/atualizar recibos, viagens, passageiros e pagamentos de forma atômica.

const MAX_VENDA_CADASTRO_SAVE_BODY_BYTES = 512 * 1024;

type CadastroSaveVendaPayload = Parameters<typeof buildVendaPayload>[0] & {
  id?: string | null;
  cliente_id?: string | null;
  destino_id?: string | null;
  vendedor_id?: string | null;
  company_id?: string | null;
  empresa_id?: string | null;
};

type CadastroSavePagamentosPayload = Parameters<typeof syncVendaChildren>[0]['pagamentos'];
type CadastroSaveRecibosPayload = Parameters<typeof syncVendaChildren>[0]['recibos'];

type CadastroSaveBody = {
  venda?: CadastroSaveVendaPayload;
  recibos?: CadastroSaveRecibosPayload;
  pagamentos?: CadastroSavePagamentosPayload;
  orcamento_id?: string | null;
};

type UserCompanyRow = {
  id?: string | null;
  company_id?: string | null;
};

type VendaCompanyRow = {
  id?: string | null;
  company_id?: string | null;
};

export async function handleVendasCadastroSavePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_VENDA_CADASTRO_SAVE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const adminClient = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(adminClient, user.id);

    const body: CadastroSaveBody =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as CadastroSaveBody)
        : {};
    const { venda, recibos = [], pagamentos = [], orcamento_id } = body;

    // Validações mínimas
    if (!venda || typeof venda !== 'object') {
      return json(
        { error: 'Payload inválido: campo "venda" obrigatório.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (!isUuid(venda.cliente_id)) {
      return json(
        { error: 'cliente_id inválido ou ausente.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (!isUuid(venda.destino_id)) {
      return json(
        { error: 'destino_id inválido ou ausente.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (!Array.isArray(recibos) || recibos.length === 0) {
      return json(
        { error: 'Pelo menos um recibo é obrigatório.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const clienteId = String(venda.cliente_id).trim();
    const vendaId = String(venda.id || '').trim();
    const isEdit = isUuid(vendaId);
    const requestedCompanyId = String(venda.company_id || venda.empresa_id || '').trim();
    const scopedCompanyIds = resolveScopedCompanyIds(scope, requestedCompanyId);
    const scopedCompanySet = cleanStringSet(scopedCompanyIds);
    let targetCompanyId = scope.isAdmin
      ? requestedCompanyId || scope.companyId || null
      : scopedCompanyIds.length === 1
        ? scopedCompanyIds[0]
        : null;

    // Permissão: criação = nível 2; edição = nível 3
    if (!scope.isAdmin) {
      const moduloMin = isEdit ? 3 : 2;
      ensureModuloAccess(
        scope,
        ['vendas', 'vendas_cadastro'],
        moduloMin,
        'Sem permissão para salvar vendas.'
      );
    }

    if (
      !scope.isAdmin &&
      (scopedCompanyIds.length === 0 || scopedCompanyIds[0] === NO_MATCH_COMPANY_ID)
    ) {
      return json(
        { error: 'Empresa fora do escopo do usuario.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    // Resolver vendedor_id
    const canAssign = scope.isGestor || scope.isMaster || scope.isFinanceiro || scope.isAdmin;
    const vendedorId =
      canAssign && isUuid(venda.vendedor_id) ? String(venda.vendedor_id) : scope.userId;

    // Validar vendedor
    if (!scope.isAdmin) {
      const denied = await ensureAssignableActiveSeller(adminClient, scope, vendedorId);
      if (denied) {
        return json({ error: denied }, { status: 403, headers: NO_STORE_HEADERS });
      }
    }

    const { data: sellerScope, error: sellerScopeError } = await adminClient
      .from('users')
      .select('id, company_id')
      .eq('id', vendedorId)
      .maybeSingle();
    if (sellerScopeError) throw sellerScopeError;
    const sellerCompanyId =
      String((sellerScope as UserCompanyRow | null)?.company_id || '').trim() || null;

    if (
      !targetCompanyId &&
      sellerCompanyId &&
      (scope.isAdmin || scopedCompanySet.has(sellerCompanyId))
    ) {
      targetCompanyId = sellerCompanyId;
    }

    if (!targetCompanyId && scopedCompanyIds.length > 1) {
      return json(
        { error: 'Selecione a empresa da venda.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (sellerCompanyId && targetCompanyId && sellerCompanyId !== targetCompanyId) {
      return json(
        { error: 'Vendedor fora da empresa selecionada.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    if (isEdit) {
      const { data: existingSale, error: existingSaleError } = await adminClient
        .from('vendas')
        .select('id, company_id')
        .eq('id', vendaId)
        .maybeSingle();
      if (existingSaleError) throw existingSaleError;
      const existingCompanyId = String(
        (existingSale as VendaCompanyRow | null)?.company_id || ''
      ).trim();
      if (
        !existingSale?.id ||
        (!scope.isAdmin && scopedCompanySet.size > 0 && !scopedCompanySet.has(existingCompanyId))
      ) {
        return json(
          { error: 'Venda não encontrada ou sem permissão.' },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }
      if (isUuid(existingCompanyId)) targetCompanyId = existingCompanyId;
    }

    if (!isUuid(String(targetCompanyId || ''))) {
      return json(
        { error: 'Empresa da venda invalida.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Verificar duplicidade de recibos/reservas
    await ensureReciboReservaUnicos({
      client: adminClient,
      companyId: targetCompanyId,
      clienteId,
      ignoreVendaId: isEdit ? vendaId : null,
      recibos
    });

    // Montar payload correto da venda (campos reais do banco)
    let vendaPayload: Record<string, unknown>;
    try {
      vendaPayload = buildVendaPayload(
        venda,
        vendedorId,
        clienteId,
        String(venda.destino_id),
        targetCompanyId
      );
    } catch (e: unknown) {
      const message = toUserMessage(e, '');
      if (message === 'DATA_VENDA_INVALIDA') {
        return json({ error: 'data_venda inválida.' }, { status: 400, headers: NO_STORE_HEADERS });
      }
      throw e;
    }

    let vendaIdFinal: string;

    if (isEdit) {
      // Edição: atualizar venda
      const { data: updated, error: updateError } = await adminClient
        .from('vendas')
        .update(vendaPayload)
        .eq('id', vendaId)
        .select('id')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated?.id) {
        return json(
          { error: 'Venda não encontrada ou sem permissão.' },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }
      vendaIdFinal = updated.id;
    } else {
      // Criação: inserir venda
      const { data: inserted, error: insertError } = await adminClient
        .from('vendas')
        .insert(vendaPayload)
        .select('id')
        .single();
      if (insertError) throw insertError;
      vendaIdFinal = inserted.id;
    }

    if (!vendaIdFinal) {
      return json({ error: 'Venda não foi gerada.' }, { status: 500, headers: NO_STORE_HEADERS });
    }

    // Sincronizar recibos, viagens, passageiros e pagamentos via RPC atômica
    await syncVendaChildren({
      client: adminClient,
      vendaId: vendaIdFinal,
      companyId: targetCompanyId,
      clienteId,
      vendedorId,
      userId: user.id,
      dataVenda: String(vendaPayload.data_venda || ''),
      recibos,
      pagamentos
    });

    // Fechar orçamento vinculado, se houver
    await closeQuoteIfNeeded(adminClient, orcamento_id);

    const targetCompanyIdText = String(targetCompanyId || '');
    const invalidationCompanyIds = isUuid(targetCompanyIdText) ? [targetCompanyIdText] : [];
    const invalidationVendedorIds = isUuid(vendedorId) ? [vendedorId] : [];

    // Invalidar cache de vendas/ranking/dashboard após criar ou editar venda
    invalidateSalesReadModels({
      companyIds: invalidationCompanyIds,
      vendedorIds: invalidationVendedorIds,
      userId: user.id
    });

    // Reconstruir read model de ranking de forma assíncrona (fire-and-forget)
    triggerRebuildAsync({
      companyIds: invalidationCompanyIds,
      dataVenda: String(vendaPayload.data_venda || ''),
      executionContext: getPlatformExecutionContext(event.platform)
    });

    // Publicar invalidação no KV para propagar para outras instâncias Workers (fire-and-forget)
    publishKvInvalidationAsync({
      companyIds: invalidationCompanyIds
    });

    // Auditoria (mesmo formato do vturapp original: {id, venda, recibos})
    registrarLog(event, {
      userId: user.id,
      modulo: 'Vendas',
      acao: isEdit ? 'venda_atualizada' : 'venda_criada',
      detalhes: { id: vendaIdFinal, venda, recibos }
    });

    return json(
      { ok: true, venda_id: vendaIdFinal },
      { status: isEdit ? 200 : 201, headers: NO_STORE_HEADERS }
    );
  } catch (err: unknown) {
    const code = toUserMessage(err, '');
    if (code === 'RECIBO_DUPLICADO' || code === 'RESERVA_DUPLICADA' || code === 'RECIBO_INVALIDO') {
      return json({ error: code }, { status: 409, headers: NO_STORE_HEADERS });
    }
    return toErrorResponse(err, 'Erro ao salvar cadastro de venda.');
  }
}
