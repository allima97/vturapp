// Migrado para Hono de src/routes/api/v1/roteiros/[id]/+server.ts — corpo IDÊNTICO ao original
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
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { revisaoRoteiroAtiva } from '$lib/config/destinosGeograficos';
import { LIMITES_ROTEIRO } from '$lib/roteiroLimites';
import { identificarOpcionaisLegados } from '$lib/server/roteiroOpcionaisLegados';

export async function handleRoteirosIdGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['Orcamentos'], 1, 'Sem acesso a Roteiros.');
    }

    const id = event.params.id;
    if (typeof id !== 'string' || !isUuid(id))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const consultarRoteiro = (colunas: string) => {
      let query = client.from('roteiro_personalizado').select(colunas).eq('id', id);
      if (!scope.isAdmin && !scope.isGestor && !scope.isMaster) {
        query = query.eq('created_by', scope.userId);
      } else if (scope.companyId && !scope.isAdmin && !scope.isMaster) {
        query = query.eq('company_id', scope.companyId);
      }
      return query.maybeSingle();
    };

    for (let tentativa = 0; tentativa < (revisaoRoteiroAtiva ? 3 : 1); tentativa++) {
      const { data: roteiro, error: roteiroError } = await consultarRoteiro(
        `id, nome, opcionais, duracao, inicio_cidade, fim_cidade, inclui_texto, nao_inclui_texto, informacoes_importantes, mostrar_pagamento_pdf, mostrar_informacoes_pdf, mostrar_rodape_pdf, created_by, company_id, created_at, updated_at${revisaoRoteiroAtiva ? ', revisao' : ''}`
      );
      if (roteiroError) throw roteiroError;
      if (!roteiro)
        return json(
          { error: 'Roteiro não encontrado.' },
          { status: 404, headers: NO_STORE_HEADERS }
        );

      // Busca todos os filhos em paralelo
      const [dias, hoteis, passeios, transportes, investimentos, pagamentos] = await Promise.all([
        client
          .from('roteiro_dia')
          .select('id, ordem, cidade, cidade_id, data, descricao, percurso')
          .eq('roteiro_id', id)
          .order('ordem')
          .limit(LIMITES_ROTEIRO.dias.limite + (revisaoRoteiroAtiva ? 1 : 0)),

        client
          .from('roteiro_hotel')
          .select(
            'id, roteiro_id, cidade, cidade_id, hotel, data_inicio, data_fim, noites, apto, categoria, regime, ordem, endereco, qtd_apto, tipo_tarifa, qtd_adultos, qtd_criancas, valor_original, valor_final'
          )
          .eq('roteiro_id', id)
          .order('ordem')
          .limit(LIMITES_ROTEIRO.hoteis.limite + (revisaoRoteiroAtiva ? 1 : 0)),

        client
          .from('roteiro_passeio')
          .select(
            'id, roteiro_id, cidade, cidade_id, passeio, data_inicio, data_fim, tipo, ingressos, ordem, fornecedor, qtd_adultos, qtd_criancas, valor_original, valor_final'
          )
          .eq('roteiro_id', id)
          .order('ordem')
          .limit(LIMITES_ROTEIRO.passeios.limite + (revisaoRoteiroAtiva ? 1 : 0)),

        client
          .from('roteiro_transporte')
          .select(
            'id, roteiro_id, tipo, fornecedor, descricao, data_inicio, data_fim, categoria, observacao, ordem, trecho, cia_aerea, data_voo, classe_reserva, hora_saida, aeroporto_saida, duracao_voo, tipo_voo, hora_chegada, aeroporto_chegada, tarifa_nome, reembolso_tipo, qtd_adultos, qtd_criancas, valor_total, taxas'
          )
          .eq('roteiro_id', id)
          .order('ordem')
          .limit(LIMITES_ROTEIRO.transportes.limite + (revisaoRoteiroAtiva ? 1 : 0)),

        client
          .from('roteiro_investimento')
          .select('id, roteiro_id, tipo, valor_por_pessoa, qtd_apto, valor_por_apto, ordem')
          .eq('roteiro_id', id)
          .order('ordem')
          .limit(LIMITES_ROTEIRO.investimentos.limite + (revisaoRoteiroAtiva ? 1 : 0)),

        client
          .from('roteiro_pagamento')
          .select('id, roteiro_id, servico, valor_total_com_taxas, taxas, forma_pagamento, ordem')
          .eq('roteiro_id', id)
          .order('ordem')
          .limit(LIMITES_ROTEIRO.pagamentos.limite + (revisaoRoteiroAtiva ? 1 : 0))
      ]);

      for (const result of [dias, hoteis, passeios, transportes, investimentos, pagamentos]) {
        if (result.error) throw result.error;
      }

      if (revisaoRoteiroAtiva) {
        const limites = [
          { resultado: dias, ...LIMITES_ROTEIRO.dias },
          { resultado: hoteis, ...LIMITES_ROTEIRO.hoteis },
          { resultado: passeios, ...LIMITES_ROTEIRO.passeios },
          { resultado: transportes, ...LIMITES_ROTEIRO.transportes },
          { resultado: investimentos, ...LIMITES_ROTEIRO.investimentos },
          { resultado: pagamentos, ...LIMITES_ROTEIRO.pagamentos }
        ];
        const excedido = limites.find(({ resultado, limite }) => resultado.data.length > limite);
        if (excedido)
          return json(
            {
              error: `Este roteiro excede o limite de ${excedido.limite} ${excedido.nome} para edição. Nenhum dado foi carregado para evitar perdas.`
            },
            { status: 422, headers: NO_STORE_HEADERS }
          );
        const { data: atual, error: revisaoError } = await consultarRoteiro('revisao');
        if (revisaoError) throw revisaoError;
        if (!atual)
          return json(
            { error: 'Roteiro não encontrado.' },
            { status: 404, headers: NO_STORE_HEADERS }
          );
        if (typeof roteiro.revisao !== 'string' || typeof atual.revisao !== 'string')
          throw new Error('Revisão do roteiro indisponível.');
        if (roteiro.revisao !== atual.revisao) continue;
      }

      const opcionais = revisaoRoteiroAtiva
        ? await identificarOpcionaisLegados(roteiro.opcionais ?? [], id, roteiro.revisao)
        : roteiro.opcionais;
      return json(
        {
          roteiro: {
            ...roteiro,
            opcionais,
            dias: dias.data || [],
            hoteis: hoteis.data || [],
            passeios: passeios.data || [],
            transportes: transportes.data || [],
            investimentos: investimentos.data || [],
            pagamentos: pagamentos.data || []
          }
        },
        { headers: DYNAMIC_READ_HEADERS }
      );
    }
    return json(
      { error: 'O roteiro está sendo alterado. Tente carregá-lo novamente.' },
      { status: 409, headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    logServerError('[roteiros] falha ao carregar roteiro', err);
    return toErrorResponse(err, 'Erro ao carregar roteiro.');
  }
}
