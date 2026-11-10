import type { DataClient } from '$lib/server/data';
// Migrado para Hono de src/routes/api/v1/viagens/dossie-batch/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { syncViagemStatusIfNeeded, syncViagensStatus } from '$lib/server/viagensStatus';
import { invalidateClientReadModels, invalidateTripReadModels } from '$lib/server/readModelCache';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_VIAGEM_DOSSIE_BODY_BYTES = 512 * 1024;

type ViagemDossieBatchBody = {
  viagemId?: string | null;
  action?: string | null;
  data?: Record<string, unknown> | null;
};

type ViagemVendedorRelation = {
  vendedor_id: string | null;
};

type ViagemVendaDossieRelation = {
  vendedor_id: string | null;
  cliente_id?: string | null;
};

type ViagemDossieBatchRow = {
  id: string | null;
  company_id: string | null;
  venda_id: string | null;
  cliente_id?: string | null;
  responsavel_user_id: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  status?: string | null;
  venda: ViagemVendaDossieRelation[] | null;
};

function firstVendedorRelation<T extends { vendedor_id: string | null }>(
  venda: T[] | null | undefined
) {
  return Array.isArray(venda) ? (venda[0] ?? null) : null;
}

function vendedorOwnsViagem(userId: string, viagem: ViagemDossieBatchRow) {
  const responsavelId = String(viagem?.responsavel_user_id || '').trim();
  const vendedorId = String(firstVendedorRelation(viagem?.venda)?.vendedor_id || '').trim();
  return responsavelId === userId || vendedorId === userId;
}

async function loadDossie(
  client: DataClient,
  viagemId: string,
  companyId: string,
  userId: string,
  isVendedor: boolean
) {
  const query = client
    .from('viagens')
    .select(
      `
      id,
      company_id,
      venda_id,
      orcamento_id,
      data_inicio,
      data_fim,
      status,
      origem,
      destino,
      responsavel_user_id,
      responsavel:users!responsavel_user_id (nome_completo),
      observacoes,
      follow_up_text,
      follow_up_fechado,
      venda:vendas (
        id,
        vendedor_id,
        cliente_id,
        destino_id,
        clientes:clientes (id, nome),
        vendas_recibos (
          id,
          numero_recibo,
          valor_total,
          valor_taxas,
          data_inicio,
          data_fim,
          produto_id,
          produto_resolvido_id
        )
      ),
      viagem_acompanhantes (
        id,
        acompanhante_id,
        papel,
        documento_url,
        observacoes,
        cliente_acompanhantes:acompanhante_id (
          nome_completo,
          cpf,
          rg,
          telefone,
          grau_parentesco,
          data_nascimento
        )
      ),
      viagem_servicos (
        id,
        tipo,
        fornecedor,
        descricao,
        status,
        data_inicio,
        data_fim,
        valor,
        moeda,
        voucher_url,
        observacoes
      ),
      viagem_documentos (
        id,
        titulo,
        tipo,
        url,
        mime_type,
        size_bytes,
        created_at
      )
    `
    )
    .eq('id', viagemId)
    .eq('company_id', companyId);

  const { data: detalhe, error } = await query.maybeSingle();
  if (error) throw error;
  if (!detalhe) return null;
  if (isVendedor && !vendedorOwnsViagem(userId, detalhe)) return null;

  const statusAtual = await syncViagemStatusIfNeeded(client, detalhe);
  detalhe.status = statusAtual;

  let viagensVenda: Array<{
    id: string | null;
    recibo_id?: string | null;
    origem?: string | null;
    destino?: string | null;
    status?: string | null;
    data_inicio?: string | null;
    data_fim?: string | null;
    observacoes?: string | null;
  }> = [];
  if (detalhe?.venda_id) {
    const ownsVenda =
      String(firstVendedorRelation(detalhe?.venda)?.vendedor_id || '').trim() === userId;
    let viagensQuery = client
      .from('viagens')
      .select('id, recibo_id, origem, destino, status, data_inicio, data_fim, observacoes')
      .eq('venda_id', detalhe.venda_id)
      .eq('company_id', companyId);
    if (isVendedor && !ownsVenda) {
      viagensQuery = viagensQuery.eq('responsavel_user_id', userId);
    }
    const { data } = await viagensQuery;
    viagensVenda = data || [];
    await syncViagensStatus(client, viagensVenda);
  }

  let acompanhantesCliente: Array<{
    id: string | null;
    nome_completo?: string | null;
    cpf?: string | null;
    telefone?: string | null;
    grau_parentesco?: string | null;
    data_nascimento?: string | null;
  }> = [];
  const clienteBaseId =
    (firstVendedorRelation(detalhe?.venda) as { cliente_id?: string | null } | null)?.cliente_id ||
    null;
  if (clienteBaseId) {
    const { data } = await client
      .from('cliente_acompanhantes')
      .select('id, nome_completo, cpf, telefone, grau_parentesco, data_nascimento')
      .eq('cliente_id', clienteBaseId)
      .eq('ativo', true)
      .order('nome_completo', { ascending: true });
    acompanhantesCliente = data || [];
  }

  return { detalhe, viagensVenda, acompanhantesCliente };
}

export async function handleViagensDossieBatchPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_VIAGEM_DOSSIE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['operacao_viagens', 'viagens', 'operacao'],
        2,
        'Sem acesso a Viagens.'
      );
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as ViagemDossieBatchBody)
        : {};
    const viagemId = String(body?.viagemId || '').trim();
    const action = String(body?.action || '').trim();
    const data = body?.data || {};
    if (!viagemId || !action) {
      return json({ error: 'Parametros invalidos.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const baseQuery = client
      .from('viagens')
      .select(
        'id, company_id, venda_id, cliente_id, responsavel_user_id, venda:vendas!venda_id(id, vendedor_id)'
      )
      .eq('id', viagemId)
      .eq('company_id', scope.companyId || '');
    const { data: viagemRow, error: viagemErr } = await baseQuery.maybeSingle();
    if (viagemErr) throw viagemErr;
    if (!viagemRow)
      return json({ error: 'Viagem nao encontrada.' }, { status: 404, headers: NO_STORE_HEADERS });
    if (scope.isVendedor && !vendedorOwnsViagem(user.id, viagemRow)) {
      return json(
        { error: 'Sem acesso a esta viagem.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    if (action === 'acompanhante_save') {
      const payload = {
        viagem_id: viagemRow.id,
        company_id: viagemRow.company_id,
        acompanhante_id: data?.acompanhante_id || null,
        papel: data?.papel || null,
        documento_url: data?.documento_url || null,
        observacoes: data?.observacoes || null
      };
      if (data?.id) {
        const { error } = await client
          .from('viagem_acompanhantes')
          .update(payload)
          .eq('id', data.id)
          .eq('viagem_id', viagemRow.id);
        if (error) throw error;
      } else {
        const { error } = await client.from('viagem_acompanhantes').insert(payload);
        if (error) throw error;
      }
    } else if (action === 'acompanhante_delete') {
      const { error } = await client
        .from('viagem_acompanhantes')
        .delete()
        .eq('id', data?.id)
        .eq('viagem_id', viagemRow.id);
      if (error) throw error;
    } else if (action === 'cliente_acompanhante_create') {
      const payload = {
        cliente_id: data?.cliente_id || viagemRow.cliente_id || null,
        company_id: viagemRow.company_id,
        nome_completo: data?.nome_completo || '',
        cpf: data?.cpf || null,
        telefone: data?.telefone || null,
        grau_parentesco: data?.grau_parentesco || null,
        rg: data?.rg || null,
        data_nascimento: data?.data_nascimento || null,
        observacoes: data?.observacoes || null,
        ativo: Boolean(data?.ativo ?? true)
      };
      const { error } = await client.from('cliente_acompanhantes').insert(payload);
      if (error) throw error;
    } else if (action === 'servico_save') {
      const payload = {
        viagem_id: viagemRow.id,
        company_id: viagemRow.company_id,
        tipo: data?.tipo || 'outro',
        fornecedor: data?.fornecedor || null,
        descricao: data?.descricao || null,
        status: data?.status || null,
        data_inicio: data?.data_inicio || null,
        data_fim: data?.data_fim || null,
        valor: data?.valor ?? null,
        moeda: data?.moeda || 'BRL',
        voucher_url: data?.voucher_url || null,
        observacoes: data?.observacoes || null
      };
      if (data?.id) {
        const { error } = await client
          .from('viagem_servicos')
          .update(payload)
          .eq('id', data.id)
          .eq('viagem_id', viagemRow.id);
        if (error) throw error;
      } else {
        const { error } = await client.from('viagem_servicos').insert(payload);
        if (error) throw error;
      }
    } else if (action === 'servico_delete') {
      const { error } = await client
        .from('viagem_servicos')
        .delete()
        .eq('id', data?.id)
        .eq('viagem_id', viagemRow.id);
      if (error) throw error;
    } else if (action === 'documento_create') {
      const payload = {
        viagem_id: viagemRow.id,
        company_id: viagemRow.company_id,
        titulo: data?.titulo || '',
        tipo: data?.tipo || 'outro',
        url: data?.url || null,
        mime_type: data?.mime_type || null,
        size_bytes: data?.size_bytes || null
      };
      const { error } = await client.from('viagem_documentos').insert(payload);
      if (error) throw error;
    } else if (action === 'documento_delete') {
      const { error } = await client
        .from('viagem_documentos')
        .delete()
        .eq('id', data?.id)
        .eq('viagem_id', viagemRow.id);
      if (error) throw error;
    } else if (action === 'followup_save') {
      let updateQuery = client
        .from('viagens')
        .update({
          follow_up_text: data?.texto || null,
          follow_up_fechado: Boolean(data?.fechado)
        })
        .eq('company_id', viagemRow.company_id);
      updateQuery = viagemRow.venda_id
        ? updateQuery.eq('venda_id', viagemRow.venda_id)
        : updateQuery.eq('id', viagemRow.id);
      const ownsVenda =
        String(firstVendedorRelation(viagemRow?.venda)?.vendedor_id || '').trim() === user.id;
      if (scope.isVendedor && !ownsVenda)
        updateQuery = updateQuery.eq('responsavel_user_id', user.id);
      const { error } = await updateQuery;
      if (error) throw error;
    } else {
      return json({ error: 'Acao invalida.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    invalidateTripReadModels({
      companyIds: [String(viagemRow.company_id || '')].filter(Boolean),
      vendedorIds: [String(viagemRow.responsavel_user_id || '')].filter(Boolean),
      userId: user.id
    });
    if (action === 'cliente_acompanhante_create') {
      invalidateClientReadModels({
        companyIds: [String(viagemRow.company_id || '')].filter(Boolean),
        userId: user.id
      });
    }

    const loaded = await loadDossie(
      client,
      viagemId,
      viagemRow.company_id,
      user.id,
      scope.isVendedor
    );
    if (!loaded)
      return json({ error: 'Viagem nao encontrada.' }, { status: 404, headers: NO_STORE_HEADERS });

    return json(
      {
        viagem: loaded.detalhe,
        viagensVenda: loaded.viagensVenda,
        acompanhantesCliente: loaded.acompanhantesCliente
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar dossie.');
  }
}
