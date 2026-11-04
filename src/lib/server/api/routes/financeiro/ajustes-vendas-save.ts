// Migrado para Hono de src/routes/api/v1/financeiro/ajustes-vendas/save/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  fetchRankingVendedoresByCompanyIds,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { invalidateReadModelCache, READ_MODEL_TAGS } from '$lib/server/readModelCache';
import { cleanStringSet, uniqueCleanStrings } from '$lib/utils/array';

const MAX_AJUSTES_VENDAS_SAVE_BODY_BYTES = 32 * 1024;

type ErrorWithCode = {
  code?: string | null;
  message?: string | null;
};

type AjusteVendaSaveBody = {
  ajuste_id?: string | null;
  venda_recibo_id?: string | null;
  vendedor_destino_id?: string | null;
  percentual_destino?: number | string | null;
  observacao?: string | null;
};

type VendaReciboRateioVendaRow = {
  id?: string | null;
  vendedor_id?: string | null;
  company_id?: string | null;
  cancelada?: boolean | null;
};

type VendaReciboRateioRow = {
  id?: string | null;
  venda_id?: string | null;
  vendas?: VendaReciboRateioVendaRow | null;
};

type ConciliacaoReciboRateioRow = {
  id?: string | null;
  company_id?: string | null;
  ranking_vendedor_id?: string | null;
  venda_id?: string | null;
};

type VendaRateioFallbackRow = {
  id?: string | null;
  vendedor_id?: string | null;
  company_id?: string | null;
  cancelada?: boolean | null;
};

type DestinoUserRow = {
  id?: string | null;
  company_id?: string | null;
  active?: boolean | null;
};

function parsePercent(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) / 100;
}

function isRateioTableMissingError(err: unknown) {
  const error = err as ErrorWithCode;
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '42P01' &&
    (message.includes('vendas_recibos_rateio') || message.includes('does not exist'))
  );
}

function invalidateAjustesVendasReadModels() {
  invalidateReadModelCache({
    tags: [
      READ_MODEL_TAGS.sales,
      READ_MODEL_TAGS.conciliacao,
      READ_MODEL_TAGS.finance,
      READ_MODEL_TAGS.dashboard,
      READ_MODEL_TAGS.vendasKpis,
      READ_MODEL_TAGS.ranking,
      READ_MODEL_TAGS.comissoes
    ]
  });
}

export async function handleFinanceiroAjustesVendasSavePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_AJUSTES_VENDAS_SAVE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['operacao_conciliacao', 'conciliacao'],
        3,
        'Sem permissao para editar Ajustes de Vendas.'
      );
    }

    if (!scope.isAdmin && !scope.isMaster && !scope.isFinanceiro && !scope.isGestor) {
      return json(
        { error: 'Somente financeiro/gestor/master podem editar Ajustes de Vendas.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as AjusteVendaSaveBody)
        : null;
    const ajusteId = String(body?.ajuste_id || '').trim();
    const vendaReciboIdRaw = String(body?.venda_recibo_id || '').trim();
    const vendedorDestinoId = String(body?.vendedor_destino_id || '').trim();
    const percentualDestino = parsePercent(body?.percentual_destino);
    const observacao = String(body?.observacao || '').trim();

    const isConciliacao = ajusteId.startsWith('cr:');
    const rawId = ajusteId
      ? ajusteId.replace(/^vr:/, '').replace(/^cr:/, '').trim()
      : vendaReciboIdRaw;

    if (!isUuid(rawId)) {
      return json(
        { error: 'Identificador do recibo invalido.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (percentualDestino === null || percentualDestino < 0 || percentualDestino >= 100) {
      return json(
        { error: 'percentual_destino deve ser >= 0 e < 100.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    let vendedorOrigemId = '';
    let sourceCompanyId = '';
    let keyColumn: 'venda_recibo_id' | 'conciliacao_recibo_id' = 'venda_recibo_id';

    if (!isConciliacao) {
      // Recibo de venda normal
      const { data: reciboRow, error: reciboError } = await client
        .from('vendas_recibos')
        .select(
          `
            id,
            venda_id,
            vendas!inner (
              id,
              vendedor_id,
              company_id,
              cancelada
            )
          `
        )
        .eq('id', rawId)
        .eq('vendas.cancelada', false)
        .maybeSingle();

      if (reciboError) throw reciboError;
      if (!reciboRow)
        return json(
          { error: 'Recibo nao encontrado.' },
          { status: 404, headers: NO_STORE_HEADERS }
        );

      const recibo = reciboRow as VendaReciboRateioRow;
      const reciboCompany = String(recibo?.vendas?.company_id || '').trim();
      if (!scope.isAdmin && !scope.companyIds.includes(reciboCompany)) {
        return json(
          { error: 'Recibo fora do escopo da empresa.' },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }

      sourceCompanyId = reciboCompany;
      vendedorOrigemId = String(recibo?.vendas?.vendedor_id || '').trim();
      keyColumn = 'venda_recibo_id';
    } else {
      // Recibo de conciliação
      const { data: concRow, error: concErr } = await client
        .from('conciliacao_recibos')
        .select('id, company_id, ranking_vendedor_id, venda_id')
        .eq('id', rawId)
        .maybeSingle();

      if (concErr) throw concErr;
      if (!concRow)
        return json(
          { error: 'Recibo da conciliacao nao encontrado.' },
          { status: 404, headers: NO_STORE_HEADERS }
        );

      const conciliacao = concRow as ConciliacaoReciboRateioRow;
      const concCompany = String(conciliacao?.company_id || '').trim();
      if (!scope.isAdmin && !scope.companyIds.includes(concCompany)) {
        return json(
          { error: 'Recibo de conciliacao fora do escopo da empresa.' },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }

      sourceCompanyId = concCompany;
      vendedorOrigemId = String(conciliacao?.ranking_vendedor_id || '').trim();

      // Fallback: buscar vendedor_id na venda associada
      if (!isUuid(vendedorOrigemId)) {
        const vendaId = String(conciliacao?.venda_id || '').trim();
        if (isUuid(vendaId)) {
          const { data: vendaRow, error: vendaErr } = await client
            .from('vendas')
            .select('id, vendedor_id, company_id, cancelada')
            .eq('id', vendaId)
            .eq('cancelada', false)
            .maybeSingle();
          if (vendaErr) throw vendaErr;
          vendedorOrigemId = String(
            (vendaRow as VendaRateioFallbackRow | null)?.vendedor_id || ''
          ).trim();
        }
      }

      keyColumn = 'conciliacao_recibo_id';
    }

    if (!isUuid(vendedorOrigemId)) {
      return json(
        { error: 'Venda sem vendedor valido para rateio.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (!isUuid(sourceCompanyId)) {
      return json(
        { error: 'Recibo sem empresa valida para rateio.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Desfazer rateio quando percentual_destino = 0.
    // Mantemos a linha inativa para preservar histórico; todos os consumidores
    // relevantes filtram ativo=true, então os valores voltam ao recibo inteiro.
    if (percentualDestino === 0) {
      const { error: clearError } = await client
        .from('vendas_recibos_rateio')
        .update({
          ativo: false,
          percentual_origem: 100,
          percentual_destino: 0,
          observacao: observacao || null,
          updated_by: user.id
        })
        .eq(keyColumn, rawId)
        .eq('company_id', sourceCompanyId);
      if (clearError) throw clearError;

      invalidateAjustesVendasReadModels();
      return json({ ok: true, cleared: true }, { headers: NO_STORE_HEADERS });
    }

    if (!isUuid(vendedorDestinoId)) {
      return json(
        { error: 'vendedor_destino_id invalido.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (vendedorDestinoId === vendedorOrigemId) {
      return json(
        { error: 'O vendedor destino deve ser diferente do vendedor de origem.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Restrição de gestor: só pode ratear vendas da própria equipe
    if (scope.isGestor) {
      const gestorCompanyIds = sourceCompanyId
        ? [sourceCompanyId]
        : scope.companyIds.length > 0
          ? scope.companyIds
          : scope.companyId
            ? [scope.companyId]
            : [];
      const equipeIds = uniqueCleanStrings(
        (await fetchRankingVendedoresByCompanyIds(client, gestorCompanyIds)).map((row) => row?.id)
      );
      const equipeSet = cleanStringSet(equipeIds);
      if (!equipeSet.has(vendedorOrigemId) || !equipeSet.has(vendedorDestinoId)) {
        return json(
          { error: 'Gestor so pode ratear vendas da propria empresa.' },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }
    }

    // Confirmar que vendedor destino existe e está ativo na empresa
    const { data: destinoUser, error: destinoError } = await client
      .from('users')
      .select('id, company_id, active')
      .eq('id', vendedorDestinoId)
      .eq('active', true)
      .maybeSingle();
    if (destinoError) throw destinoError;
    if (!destinoUser) {
      return json(
        { error: 'Vendedor destino nao encontrado ou inativo.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const destino = destinoUser as DestinoUserRow;
    if (!scope.isAdmin && destino.company_id !== sourceCompanyId) {
      return json(
        { error: 'Vendedor destino fora do escopo da empresa.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const percentualOrigem = Math.round((100 - percentualDestino) * 100) / 100;
    if (percentualOrigem <= 0) {
      return json(
        { error: 'percentual_destino invalido: origem deve ficar com percentual > 0.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const payload = {
      venda_recibo_id: keyColumn === 'venda_recibo_id' ? rawId : null,
      conciliacao_recibo_id: keyColumn === 'conciliacao_recibo_id' ? rawId : null,
      company_id: sourceCompanyId,
      vendedor_origem_id: vendedorOrigemId,
      vendedor_destino_id: vendedorDestinoId,
      percentual_origem: percentualOrigem,
      percentual_destino: percentualDestino,
      ativo: true,
      observacao: observacao || null,
      updated_by: user.id,
      created_by: user.id
    };

    // Upsert: tenta atualizar linha existente; se não houver, insere
    const { data: updatedRows, error: updateError } = await client
      .from('vendas_recibos_rateio')
      .update(payload)
      .eq(keyColumn, rawId)
      .eq('company_id', sourceCompanyId)
      .select('id');
    if (updateError) throw updateError;

    if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
      const { error: insertError } = await client.from('vendas_recibos_rateio').insert(payload);
      if (insertError) throw insertError;
    }

    invalidateAjustesVendasReadModels();
    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    if (isRateioTableMissingError(err)) {
      return new Response(
        'Ajustes de Vendas indisponivel: aplique a migration 20260412_vendas_recibos_rateio.sql.',
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }
    return toErrorResponse(err, 'Erro ao salvar ajuste de venda.');
  }
}
