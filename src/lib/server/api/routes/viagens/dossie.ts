// Migrado para Hono de src/routes/api/v1/viagens/dossie/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { syncViagemStatusIfNeeded } from '$lib/server/viagensStatus';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';

type ViagemDossieRow = {
  id: string | null;
  company_id: string | null;
  venda_id: string | null;
  cliente_id: string | null;
  responsavel_user_id: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  status: string | null;
  venda:
    | {
        vendedor_id: string | null;
      }[]
    | null;
};

function vendedorOwnsViagem(userId: string, viagem: ViagemDossieRow) {
  const responsavelId = String(viagem?.responsavel_user_id || '').trim();
  const venda = Array.isArray(viagem?.venda) ? (viagem.venda[0] ?? null) : null;
  const vendedorId = String(venda?.vendedor_id || '').trim();
  return responsavelId === userId || vendedorId === userId;
}

export async function handleViagensDossieGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    const viagemId = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(viagemId))
      return json({ error: 'ID de viagem inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const { data: viagem, error: viagemError } = await client
      .from('viagens')
      .select(
        `
        id, company_id, venda_id, orcamento_id, cliente_id,
        responsavel_user_id, origem, destino, data_inicio, data_fim,
        status, observacoes, follow_up_text, follow_up_fechado,
        created_at, updated_at,
        cliente:clientes!cliente_id(id, nome, email, telefone, whatsapp, nascimento, cpf),
        responsavel:users!responsavel_user_id(id, nome_completo, email),
        venda:vendas!venda_id(
          id, vendedor_id, numero_venda, valor_total, valor_total_pago, status, data_venda,
          recibos:vendas_recibos(
            id, numero_recibo, numero_reserva, tipo_pacote, valor_total, valor_taxas,
            data_inicio, data_fim, contrato_url,
            produto_resolvido:produtos!produto_resolvido_id(id, nome)
          ),
          pagamentos:vendas_pagamentos(
            id, forma_nome, valor_total, parcelas_qtd, vencimento_primeira, paga_comissao
          )
        )
      `
      )
      .eq('id', viagemId)
      .maybeSingle();

    if (viagemError) throw viagemError;
    if (!viagem)
      return json({ error: 'Viagem não encontrada.' }, { status: 404, headers: NO_STORE_HEADERS });

    // ✅ Ownership compatível com MASTER (múltiplos companyIds)
    const companyIds = resolveScopedCompanyIds(scope, viagem.company_id);
    if (!scope.isAdmin && !companyIds.includes(viagem.company_id)) {
      return json({ error: 'Viagem fora do escopo.' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    if (scope.isVendedor && !vendedorOwnsViagem(user.id, viagem)) {
      return json(
        { error: 'Sem acesso a esta viagem.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const statusAtual = await syncViagemStatusIfNeeded(client, viagem);
    const viagemComStatus = { ...viagem, status: statusAtual };

    const { data: acompanhantes } = await client
      .from('cliente_acompanhantes')
      .select('id, nome_completo, cpf, data_nascimento, grau_parentesco, telefone')
      .eq('cliente_id', viagem.cliente_id || '')
      .eq('ativo', true)
      .limit(20);

    const { data: vouchers } = viagemComStatus.venda_id
      ? await client
          .from('vouchers')
          .select('id, nome, provider, codigo_fornecedor, data_inicio, data_fim, ativo')
          .eq('company_id', viagemComStatus.company_id)
          .limit(20)
      : { data: [] };

    return json(
      {
        viagem: {
          ...viagemComStatus,
          passageiros: acompanhantes || [],
          vouchers: vouchers || [],
          historico: []
        }
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar dossie da viagem.');
  }
}
