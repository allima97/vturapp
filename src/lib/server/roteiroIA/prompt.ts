import type { PedidoRoteiroIA } from '$lib/roteiroIA/tipos';

export type CatalogoCidadeIA = {
  cidade: string;
  passeios: { nome: string; descricao: string }[];
};

/**
 * Prompt de sistema: fixo (vai em cache na API). Regras da agência para o
 * conteúdo; o FORMATO é garantido pela ferramenta `preencher_roteiro`.
 */
export const PROMPT_SISTEMA_ROTEIRO = `Você é um consultor de viagens brasileiro experiente que monta roteiros personalizados para uma agência de turismo.
Escreva sempre em português do Brasil. Responda SOMENTE com o JSON no esquema pedido.

O QUE VOCÊ PREENCHE
- dias: um item por dia, da data de início à data de fim, inclusive, em ordem e sem pular datas.
- opcionais: passeios sugeridos por cidade que NÃO estão incluídos no pacote.
- inclui / nao_inclui: itens curtos, um por linha.

REGRAS DO DIA A DIA
- O dia 1 é a saída da cidade de origem. Ex.: cidade "Roma", percurso "São Paulo → Roma", descrição "Embarque no aeroporto de Guarulhos com destino a Roma."
- O último dia é o retorno. Ex.: percurso "Roma → São Paulo", descrição sobre o deslocamento ao aeroporto e o voo de volta.
- Em dias de deslocamento entre cidades, preencha percurso com seta: "Barcelona → Madri". Em dias na mesma cidade, percurso vazio.
- A partir do segundo dia hospedado, comece com "Café da manhã." e depois o que fazer.
- 1 a 4 frases por dia, objetivas, com atrações reais e conhecidas da cidade, distribuídas sem repetir.
- Respeite o perfil (família com crianças, casal, terceira idade etc.) e as observações do consultor.
- Distribua as noites entre os destinos na ordem pedida, de forma equilibrada e realista para os deslocamentos.

O QUE VOCÊ NUNCA ESCREVE (o consultor preenche depois)
- Preços, valores, taxas, câmbio, descontos ou formas de pagamento.
- Companhia aérea, número de voo, horários exatos, localizador ou assentos.
- Nome de hotel. Pode dizer "check-in no hotel", nunca qual hotel.
- Dados pessoais de viajantes.

OPCIONAIS
- Quando houver catálogo da agência para a cidade, use os nomes do catálogo, exatamente como estão.
- Fora do catálogo, sugira no máximo 3 por cidade, conhecidos e factíveis.
- Não repita como opcional o que já está descrito como incluído no dia a dia.

INCLUSÕES
- inclui: o que um roteiro desse tipo normalmente inclui (ex.: "Hospedagem com café da manhã", "Passagem aérea em classe econômica") sem valores e sem nomes de hotel ou companhia.
- nao_inclui: ex.: "Passeios opcionais", "Seguro viagem", "Refeições não mencionadas", "Despesas pessoais".`;

function linhasCatalogo(catalogo: CatalogoCidadeIA[]) {
  const comItens = catalogo.filter((c) => c.passeios.length);
  if (!comItens.length) return 'Sem catálogo cadastrado para estas cidades.';
  return comItens
    .map(
      (c) =>
        `${c.cidade}:\n${c.passeios
          .map((p) => `- ${p.nome}${p.descricao ? ` — ${p.descricao.slice(0, 160)}` : ''}`)
          .join('\n')}`
    )
    .join('\n\n');
}

/** Mensagem do usuário: o pedido do consultor + catálogo da agência. */
export function montarMensagemPedido(pedido: PedidoRoteiroIA, catalogo: CatalogoCidadeIA[]) {
  const pessoas = [
    `${pedido.adultos} adulto${pedido.adultos === 1 ? '' : 's'}`,
    pedido.criancas ? `${pedido.criancas} criança${pedido.criancas === 1 ? '' : 's'}` : ''
  ]
    .filter(Boolean)
    .join(' e ');
  return `PEDIDO DO CONSULTOR
Origem: ${pedido.origem}
Destinos, nesta ordem: ${pedido.destinos.join(' → ')}
Período: ${pedido.data_inicio} a ${pedido.data_fim} (datas AAAA-MM-DD)
Viajantes: ${pessoas}
Perfil: ${pedido.perfil || 'não informado'}
Observações: ${pedido.observacoes || 'nenhuma'}

CATÁLOGO DE OPCIONAIS DA AGÊNCIA
${linhasCatalogo(catalogo)}`;
}
