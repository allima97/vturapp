import { fetchWithTimeout } from '$lib/server/fetchWithTimeout';
import { ErroClaude, type ResultadoClaude } from './claude';

/**
 * Chamada ao Groq (API compatível com OpenAI, sem SDK).
 *
 * - Prompt caching é AUTOMÁTICO no Groq (não existe cache_control): ele
 *   reaproveita o início idêntico do prompt. Por isso o system (fixo) vai
 *   primeiro e o pedido (variável) por último — mesma ordem do Claude.
 *   Tokens em cache custam 50% e não contam no limite de tokens por minuto.
 * - Saída estruturada em modo strict (decodificação restrita ao esquema):
 *   exige todas as propriedades em `required`; opcionais viram `[tipo, null]`
 *   (ver esquemaEstrito).
 * - Modelos gpt-oss "raciocinam" antes de responder e o raciocínio é cobrado
 *   como saída: reasoning_effort "low" reduz esse gasto ao mínimo.
 */
const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TIMEOUT_MS = 150_000;

type JsonSchema = Record<string, unknown>;

/** Converte o esquema para o modo strict do Groq (todas as chaves obrigatórias, opcionais anuláveis). */
export function esquemaEstrito(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;
  const s = { ...(schema as JsonSchema) };
  if (s.type === 'object' && s.properties && typeof s.properties === 'object') {
    const obrigatorias = new Set(Array.isArray(s.required) ? (s.required as string[]) : []);
    const props: JsonSchema = {};
    for (const [nome, valor] of Object.entries(s.properties as JsonSchema)) {
      const convertido = esquemaEstrito(valor) as JsonSchema;
      props[nome] =
        obrigatorias.has(nome) || typeof convertido.type !== 'string'
          ? convertido
          : { ...convertido, type: [convertido.type, 'null'] };
    }
    s.properties = props;
    s.required = Object.keys(props);
    s.additionalProperties = false;
  }
  if (s.items) s.items = esquemaEstrito(s.items);
  return s;
}

type RespostaGroq = {
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null; refusal?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number } | null;
    completion_tokens_details?: { reasoning_tokens?: number } | null;
  };
  error?: { message?: string };
};

export async function chamarGroq(params: {
  apiKey: string;
  modelo: string;
  sistema: string;
  mensagem: string;
  esquema: { name: string; schema: unknown };
  maxTokens?: number;
  fetcher?: typeof fetch;
}): Promise<ResultadoClaude> {
  const corpo = {
    model: params.modelo,
    // Teto inclui o raciocínio do modelo (cobrado como saída).
    max_completion_tokens: params.maxTokens ?? 16_000,
    reasoning_effort: 'low',
    reasoning_format: 'hidden',
    messages: [
      { role: 'system', content: params.sistema },
      { role: 'user', content: params.mensagem }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: params.esquema.name,
        strict: true,
        schema: esquemaEstrito(params.esquema.schema)
      }
    }
  };

  let resposta: Response;
  try {
    resposta = await fetchWithTimeout(
      API_URL,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${params.apiKey}`
        },
        body: JSON.stringify(corpo)
      },
      TIMEOUT_MS,
      params.fetcher
    );
  } catch {
    throw new ErroClaude('A IA demorou demais para responder. Tente novamente.', 504, true);
  }

  const dados = (await resposta.json().catch(() => ({}))) as RespostaGroq;
  if (!resposta.ok) {
    const s = resposta.status;
    if (s === 401 || s === 403)
      throw new ErroClaude('Chave da API do Groq inválida ou sem permissão.', 503, false);
    if (s === 429)
      throw new ErroClaude(
        'Limite de uso do Groq atingido no momento. Tente em alguns instantes.',
        503,
        true
      );
    if (s === 404 || s === 400 || s === 422)
      throw new ErroClaude(
        `Pedido recusado pela IA (${dados.error?.message || 'modelo ou parâmetros inválidos'}).`,
        502,
        false
      );
    if (s >= 500)
      throw new ErroClaude('A IA está ocupada no momento. Tente em alguns instantes.', 503, true);
    throw new ErroClaude('Falha ao chamar a IA.', 502, false);
  }

  const escolha = dados.choices?.[0];
  if (escolha?.message?.refusal)
    throw new ErroClaude(
      'A IA recusou este pedido. Revise as observações e tente de novo.',
      422,
      false
    );
  let entrada: unknown = null;
  try {
    entrada = escolha?.message?.content ? JSON.parse(escolha.message.content) : null;
  } catch {
    entrada = null;
  }
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    const cortado = escolha?.finish_reason === 'length';
    throw new ErroClaude(
      cortado
        ? 'O roteiro ficou longo demais para uma geração. Reduza o período ou os destinos.'
        : 'A IA não devolveu o roteiro no formato esperado.',
      502,
      !cortado,
      cortado
    );
  }

  // Uso no mesmo formato do Claude: entrada sem cache + leitura de cache + saída.
  const cache = dados.usage?.prompt_tokens_details?.cached_tokens || 0;
  const prompt = dados.usage?.prompt_tokens || 0;
  return {
    entrada: entrada as Record<string, unknown>,
    modelo: dados.model || params.modelo,
    uso: {
      input_tokens: Math.max(0, prompt - cache),
      cache_read_input_tokens: cache,
      cache_creation_input_tokens: 0,
      output_tokens: dados.usage?.completion_tokens || 0
    }
  };
}
