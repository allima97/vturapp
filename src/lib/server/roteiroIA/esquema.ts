/**
 * Esquema da saída estruturada (output_config.format, json_schema). O `input_schema`
 * é um recorte do formato em que o roteiro já é salvo (RoteiroPayload):
 * só dias, opcionais e inclusões. Valores, voos, hotéis e dados do cliente
 * ficam de fora de propósito (ver docs/especificação da IA de roteiros).
 *
 * Campo novo no roteiro que a IA deva preencher → entra aqui E no
 * pós-processamento (posProcessar.ts) no mesmo commit.
 */
export const FERRAMENTA_ROTEIRO = {
  name: 'preencher_roteiro',
  description:
    'Preenche o rascunho do roteiro personalizado (dia a dia, passeios opcionais e inclusões) no formato do sistema da agência.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['nome', 'dias', 'opcionais', 'inclui', 'nao_inclui'],
    properties: {
      nome: {
        type: 'string',
        description: 'Nome do roteiro, curto. Ex.: "Viagem Europa - Agosto 2027".'
      },
      dias: {
        type: 'array',
        description: 'Um item por dia da viagem, do primeiro ao último, em ordem.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['data', 'cidade', 'percurso', 'descricao'],
          properties: {
            data: { type: 'string', description: 'Data do dia, formato AAAA-MM-DD.' },
            cidade: {
              type: 'string',
              description: 'Cidade onde o viajante dorme ou passa o dia. Só o nome da cidade.'
            },
            percurso: {
              type: 'string',
              description:
                'Deslocamento do dia com seta, ex.: "Roma → Barcelona". Vazio quando fica na mesma cidade.'
            },
            descricao: {
              type: 'string',
              description: 'O que acontece no dia, 1 a 4 frases, em português do Brasil.'
            }
          }
        }
      },
      opcionais: {
        type: 'array',
        description: 'Passeios opcionais sugeridos, agrupados por cidade.',
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
                  data: {
                    type: 'string',
                    description: 'Data sugerida AAAA-MM-DD, dentro dos dias nessa cidade. Opcional.'
                  }
                }
              }
            }
          }
        }
      },
      inclui: {
        type: 'array',
        description: 'Itens de "O que está incluído", um por linha, sem valores.',
        items: { type: 'string' }
      },
      nao_inclui: {
        type: 'array',
        description: 'Itens de "O que não está incluído", um por linha, sem valores.',
        items: { type: 'string' }
      }
    }
  }
} as const;

// Limites de quantidade (dias, passeios) são aplicados no pós-processamento.

/** Formato bruto que o Claude devolve (antes da validação). */
export type SaidaBrutaRoteiro = {
  nome?: unknown;
  dias?: unknown;
  opcionais?: unknown;
  inclui?: unknown;
  nao_inclui?: unknown;
};
