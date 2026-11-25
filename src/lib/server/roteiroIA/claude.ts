import { fetchWithTimeout } from '$lib/server/fetchWithTimeout';

/**
 * Chamada à API de Mensagens do Claude via fetch (sem SDK: roda igual no
 * Cloudflare Workers e não adiciona dependência).
 *
 * MODELO: definido pela variável ROTEIRO_IA_MODELO (wrangler.toml [vars] ou
 * secret). Sem ela, usa MODELO_PADRAO. Ex.: "claude-opus-5-5" (mais caprichado,
 * mais caro e lento) ou "claude-sonnet-5-5" (equilíbrio, padrão).
 */
export const MODELO_PADRAO = 'claude-sonnet-5-5';

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
  uso: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
};

type RespostaMensagens = {
  model?: string;
  stop_reason?: string;
  content?: Array<{ type: string; name?: string; input?: unknown }>;
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
    // Regras fixas em cache: chamadas seguintes ficam mais baratas e rápidas.
    system: [{ type: 'text', text: params.sistema, cache_control: { type: 'ephemeral' } }],
    tools: [params.ferramenta],
    tool_choice: { type: 'tool', name: params.ferramenta.name },
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

  const bloco = dados.content?.find((c) => c.type === 'tool_use' && c.name === params.ferramenta.name);
  if (!bloco || !bloco.input || typeof bloco.input !== 'object' || Array.isArray(bloco.input)) {
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
    entrada: bloco.input as Record<string, unknown>,
    modelo: dados.model || params.modelo,
    uso: dados.usage || {}
  };
}
