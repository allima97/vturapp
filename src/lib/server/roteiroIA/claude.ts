import { fetchWithTimeout } from '$lib/server/fetchWithTimeout';

/**
 * Chamada à API de Mensagens do Claude via fetch (sem SDK: roda igual no
 * Cloudflare Workers e não adiciona dependência).
 *
 * O MODELO é escolhido pelo admin em /admin/ia (ver provedores.ts); sem
 * escolha, vale ROTEIRO_IA_MODELO do wrangler e, por fim, MODELO_PADRAO.
 */
export const MODELO_PADRAO = 'claude-haiku-5-5';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const TIMEOUT_MS = 150_000;

export class ErroClaude extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly tentarDeNovo: boolean
  ) {
    super(message);
    this.name = 'ErroClaude';
  }
}

type Ferramenta = { name: string; description: string; input_schema: unknown };

export type ResultadoClaude = {
  entrada: Record<string, unknown>;
  modelo: string;
  uso: UsoClaude;
};

export type UsoClaude = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

type RespostaMensagens = {
  model?: string;
  stop_reason?: string;
  content?: Array<{ type: string; text?: string }>;
  usage?: ResultadoClaude['uso'];
  error?: { message?: string };
};

export async function chamarFerramentaClaude(params: {
  apiKey: string;
  modelo: string;
  sistema: string;
  mensagem: string;
  ferramenta: Ferramenta;
  maxTokens?: number;
  fetcher?: typeof fetch;
}): Promise<ResultadoClaude> {
  const corpo = {
    model: params.modelo,
    max_tokens: params.maxTokens ?? 16_000,
    // Regras fixas em cache (prefixo estável: nada do pedido entra aqui). Na
    // Sonnet/Haiku/Opus 5.5 o mínimo cacheável é 512 tokens e a leitura custa
    // 0,05× a entrada; TTL padrão de 5 min, renovado a cada acerto. O
    // cache_control fica só no system: a mensagem muda a cada pedido, e
    // marcá-la só pagaria a gravação (1,25×) sem nunca ser lida.
    system: [{ type: 'text', text: params.sistema, cache_control: { type: 'ephemeral' } }],
    // Saída estruturada: a resposta vem como JSON que segue exatamente o esquema
    // (funciona em todos os modelos; tool_choice forçado não é aceito por alguns).
    output_config: { format: { type: 'json_schema', schema: params.ferramenta.input_schema } },
    messages: [{ role: 'user', content: params.mensagem }]
  };

  let resposta: Response;
  try {
    resposta = await fetchWithTimeout(
      API_URL,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': params.apiKey,
          'anthropic-version': API_VERSION
        },
        body: JSON.stringify(corpo)
      },
      TIMEOUT_MS,
      params.fetcher
    );
  } catch {
    throw new ErroClaude('A IA demorou demais para responder. Tente novamente.', 504, true);
  }

  const dados = (await resposta.json().catch(() => ({}))) as RespostaMensagens;
  if (!resposta.ok) {
    const s = resposta.status;
    if (s === 401 || s === 403)
      throw new ErroClaude('Chave da API do Claude inválida ou sem permissão.', 503, false);
    if (s === 404 || s === 400)
      throw new ErroClaude(
        `Pedido recusado pela IA (${dados.error?.message || 'modelo ou parâmetros inválidos'}).`,
        502,
        false
      );
    if (s === 429 || s === 529 || s >= 500)
      throw new ErroClaude('A IA está ocupada no momento. Tente em alguns instantes.', 503, true);
    throw new ErroClaude('Falha ao chamar a IA.', 502, false);
  }

  const textoJson = (dados.content || [])
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('');
  let entrada: unknown = null;
  try {
    entrada = textoJson ? JSON.parse(textoJson) : null;
  } catch {
    entrada = null;
  }
  if (dados.stop_reason === 'refusal')
    throw new ErroClaude(
      'A IA recusou este pedido. Revise as observações e tente de novo.',
      422,
      false
    );
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    const cortado = dados.stop_reason === 'max_tokens';
    throw new ErroClaude(
      cortado
        ? 'O roteiro ficou longo demais para uma geração. Reduza o período ou os destinos.'
        : 'A IA não devolveu o roteiro no formato esperado.',
      502,
      !cortado
    );
  }

  return {
    entrada: entrada as Record<string, unknown>,
    modelo: dados.model || params.modelo,
    uso: dados.usage || {}
  };
}
