import type { PedidoRoteiroIA } from '$lib/roteiroIA/tipos';

/**
 * Sobe a cada mudança no prompt, no esquema ou no pós-processamento que
 * altere o resultado: entra na chave do cache de resultados
 * (roteiro_ia_cache), então gerações antigas deixam de ser reaproveitadas.
 */
export const VERSAO_PROMPT = 2;

/** Item da lista de referência enviada à IA (catálogo da agência ou biblioteca). */
export type ReferenciaOpcional = {
  /** Código curto que a IA devolve: "a1".. (agência) ou "b1".. (biblioteca). */
  ref: string;
  cidade: string;
  nome: string;
  descricao: string;
};

/**
 * Prompt de sistema: 100% fixo (vai em cache na API — nunca interpolar nada
 * do pedido aqui). Regras da agência para o conteúdo; o FORMATO é garantido
 * pela saída estruturada (esquema.ts).
 */
export const PROMPT_SISTEMA_ROTEIRO = `Você é um consultor de viagens brasileiro experiente que monta roteiros personalizados para uma agência de turismo.
Escreva sempre em português do Brasil. Responda SOMENTE com o JSON no esquema pedido.

O QUE VOCÊ PREENCHE
- dias: exatamente um item por dia, do dia 1 ao último dia informado no pedido, em ordem, sem pular números.
- opcionais_ref: passeios opcionais escolhidos da LISTA DE REFERÊNCIA do pedido, só pelo código (ref).
- opcionais_novos: passeios opcionais que não estão na lista, agrupados por cidade.
- inclui / nao_inclui: itens curtos, um por linha.

REGRAS DO DIA A DIA
- O dia 1 é a saída da cidade de origem. Ex.: cidade "Roma", percurso "São Paulo → Roma", descrição "Embarque no aeroporto de Guarulhos com destino a Roma."
- O último dia é o retorno. Ex.: percurso "Roma → São Paulo", descrição sobre o deslocamento ao aeroporto e o voo de volta.
- Em dias de deslocamento entre cidades, preencha percurso com seta: "Barcelona → Madri". Em dias na mesma cidade, percurso vazio.
- A partir do segundo dia hospedado, comece com "Café da manhã." e depois o que fazer.
- 1 a 4 frases por dia, objetivas, com atrações reais e conhecidas da cidade, distribuídas sem repetir.
- Respeite o perfil (família com crianças, casal, terceira idade etc.) e as observações do consultor.
- Distribua as noites entre os destinos na ordem pedida, de forma equilibrada e realista para os deslocamentos.
- Não cite datas, dias da semana nem estações do ano: o mesmo texto pode ser usado em outras datas.

O QUE VOCÊ NUNCA ESCREVE (o consultor preenche depois)
- Preços, valores, taxas, câmbio, descontos ou formas de pagamento.
- Companhia aérea, número de voo, horários exatos, localizador ou assentos.
- Nome de hotel. Pode dizer "check-in no hotel", nunca qual hotel.
- Dados pessoais de viajantes.

OPCIONAIS
- Se a cidade tem itens na LISTA DE REFERÊNCIA, escolha de 2 a 5 que combinem com o perfil e devolva só o código em opcionais_ref. Não reescreva nome nem descrição desses itens.
- Só use opcionais_novos para cidades sem itens na lista: no máximo 3 por cidade, conhecidos e factíveis, descrição de 1 a 2 frases.
- "dia" do opcional é o número de um dia em que o viajante está nessa cidade. Deixe de fora se não souber.
- Não repita como opcional o que já está descrito no dia a dia.

INCLUSÕES
- inclui: o que um roteiro desse tipo normalmente inclui (ex.: "Hospedagem com café da manhã", "Passagem aérea em classe econômica") sem valores e sem nomes de hotel ou companhia.
- nao_inclui: ex.: "Passeios opcionais", "Seguro viagem", "Refeições não mencionadas", "Despesas pessoais".`;

export function diasDoPedido(pedido: Pick<PedidoRoteiroIA, 'data_inicio' | 'data_fim'>) {
  return (
    Math.round(
      (Date.parse(`${pedido.data_fim}T00:00:00Z`) - Date.parse(`${pedido.data_inicio}T00:00:00Z`)) /
        864e5
    ) + 1
  );
}

function linhasReferencia(referencias: ReferenciaOpcional[]) {
  if (!referencias.length) return 'Nenhuma.';
  const porCidade = new Map<string, ReferenciaOpcional[]>();
  for (const r of referencias) porCidade.set(r.cidade, [...(porCidade.get(r.cidade) || []), r]);
  // Só o nome: a descrição fica no servidor (economiza tokens de entrada).
  return [...porCidade]
    .map(([cidade, itens]) => `${cidade}:\n${itens.map((i) => `${i.ref} ${i.nome}`).join('\n')}`)
    .join('\n');
}

/**
 * Mensagem do usuário: só o que varia de pedido para pedido. Sem datas
 * (a IA trabalha com dia 1..N e o servidor aplica as datas), para que o
 * mesmo resultado possa ser reaproveitado em outras datas.
 */
export function montarMensagemPedido(pedido: PedidoRoteiroIA, referencias: ReferenciaOpcional[]) {
  const pessoas = [
    `${pedido.adultos} adulto${pedido.adultos === 1 ? '' : 's'}`,
    pedido.criancas ? `${pedido.criancas} criança${pedido.criancas === 1 ? '' : 's'}` : ''
  ]
    .filter(Boolean)
    .join(' e ');
  return `PEDIDO
Origem: ${pedido.origem}
Destinos, nesta ordem: ${pedido.destinos.join(' → ')}
Duração: ${diasDoPedido(pedido)} dias (dia 1 = saída, último dia = retorno)
Viajantes: ${pessoas}
Perfil: ${pedido.perfil || 'não informado'}
Observações: ${pedido.observacoes || 'nenhuma'}

LISTA DE REFERÊNCIA DE OPCIONAIS
${linhasReferencia(referencias)}`;
}
