/**
 * Esquema da saída estruturada (output_config.format, json_schema).
 *
 * Pensado para gastar o MÍNIMO de tokens de saída (a parte mais cara da
 * chamada): a IA não escreve datas (só o número do dia, 1..N), não escreve o
 * nome do roteiro (o servidor monta) e, para passeios que já estão no
 * catálogo da agência ou na biblioteca de opcionais, devolve só o código
 * ("a3", "b7") — nome e descrição são completados pelo servidor.
 *
 * Campo novo no roteiro que a IA deva preencher → entra aqui E no
 * pós-processamento (posProcessar.ts) no mesmo commit, e VERSAO_PROMPT
 * (prompt.ts) sobe, para não reaproveitar resultados no formato antigo.
 */
export const FERRAMENTA_ROTEIRO = {
  name: 'preencher_roteiro',
  description:
    'Preenche o rascunho do roteiro personalizado (dia a dia, passeios opcionais e inclusões) no formato do sistema da agência.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['dias', 'opcionais_ref', 'opcionais_novos', 'inclui', 'nao_inclui'],
    properties: {
      dias: {
        type: 'array',
        description: 'Um item por dia, do dia 1 ao último, em ordem.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['dia', 'cidade', 'percurso', 'descricao'],
          properties: {
            dia: { type: 'integer', description: 'Número do dia (1 = saída).' },
            cidade: { type: 'string', description: 'Só o nome da cidade.' },
            percurso: {
              type: 'string',
              description: 'Ex.: "Roma → Barcelona". Vazio se não há deslocamento.'
            },
            descricao: { type: 'string', description: '1 a 4 frases.' }
          }
        }
      },
      opcionais_ref: {
        type: 'array',
        description: 'Opcionais escolhidos da lista de referência, pelo código.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['ref'],
          properties: {
            ref: { type: 'string', description: 'Código da lista, ex.: "a3".' },
            dia: { type: 'integer', description: 'Dia sugerido. Opcional.' }
          }
        }
      },
      opcionais_novos: {
        type: 'array',
        description: 'Opcionais fora da lista de referência, por cidade.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['cidade', 'passeios'],
          properties: {
            cidade: { type: 'string' },
            passeios: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['nome', 'descricao'],
                properties: {
                  nome: { type: 'string' },
                  descricao: { type: 'string', description: '1 a 2 frases.' },
                  dia: { type: 'integer', description: 'Dia sugerido. Opcional.' }
                }
              }
            }
          }
        }
      },
      inclui: { type: 'array', items: { type: 'string' } },
      nao_inclui: { type: 'array', items: { type: 'string' } }
    }
  }
} as const;

// Limites de quantidade (dias, passeios) são aplicados no pós-processamento.

/** Formato bruto que o Claude devolve (antes da validação). */
export type SaidaBrutaRoteiro = {
  dias?: unknown;
  opcionais_ref?: unknown;
  opcionais_novos?: unknown;
  inclui?: unknown;
  nao_inclui?: unknown;
};

/**
 * Saída já com as referências expandidas e ainda SEM datas (dia 1..N).
 * É o que vai para o cache: independe das datas do pedido.
 */
export type SaidaNormalizada = {
  dias: { dia: number; cidade: string; percurso: string; descricao: string }[];
  opcionais: {
    cidade: string;
    passeios: { nome: string; descricao: string; dia?: number; novo?: boolean }[];
  }[];
  inclui: string[];
  nao_inclui: string[];
};
