// Provedor de IA dos roteiros, escolhido pelo admin em /admin/ia.
//
// Ordem de decisão do modelo: painel do admin (tabela roteiro_ia_config) →
// variável ROTEIRO_IA_MODELO do wrangler → padrão (Claude Haiku 5.5).
// Os dois provedores recebem o MESMO prompt na mesma ordem (system fixo
// primeiro, pedido por último), então os dois aproveitam prompt caching:
// no Claude via cache_control (leitura a 0,1×/0,05×), no Groq automático (0,5×).
import { logServerError } from '$lib/server/v1';
import { chamarFerramentaClaude, type ResultadoClaude, type UsoClaude } from './claude';
import { chamarGroq } from './groq';

export type ProvedorIA = 'anthropic' | 'groq';

export type ModeloIA = {
  provedor: ProvedorIA;
  id: string;
  nome: string;
  descricao: string;
  /** USD por milhão de tokens (tabela padrão, nov/2026). */
  preco: { entrada: number; saida: number; leituraCache: number; gravacaoCache: number };
};

/**
 * Modelos oferecidos no painel. Preços conferidos em
 * https://platform.claude.com/docs/en/about-claude/pricing e
 * https://console.groq.com/docs/models — revisar ao incluir modelos.
 */
export const MODELOS_IA: ModeloIA[] = [
  {
    provedor: 'anthropic',
    id: 'claude-haiku-5-5',
    nome: 'Claude Haiku 5.5',
    descricao: 'Padrão. Mais barato da Anthropic, rápido e bom em português.',
    preco: { entrada: 0.1, saida: 0.5, leituraCache: 0.01, gravacaoCache: 0.125 }
  },
  {
    provedor: 'anthropic',
    id: 'claude-sonnet-5-5',
    nome: 'Claude Sonnet 5.5',
    descricao: 'Texto mais caprichado; cerca de 20× o custo do Haiku.',
    preco: { entrada: 2, saida: 10, leituraCache: 0.1, gravacaoCache: 2.5 }
  },
  {
    provedor: 'groq',
    id: 'openai/gpt-oss-120b',
    nome: 'Groq · GPT-OSS 120B',
    descricao: 'Modelo aberto no Groq. Raciocina antes de responder (cobrado como saída).',
    preco: { entrada: 0.15, saida: 0.6, leituraCache: 0.075, gravacaoCache: 0 }
  },
  {
    provedor: 'groq',
    id: 'openai/gpt-oss-20b',
    nome: 'Groq · GPT-OSS 20B',
    descricao: 'O mais barato por token; texto mais simples. Testar antes de adotar.',
    preco: { entrada: 0.075, saida: 0.3, leituraCache: 0.0375, gravacaoCache: 0 }
  }
];

export const MODELO_PADRAO_IA = MODELOS_IA[0];

export const modeloIA = (id: string | null | undefined) =>
  MODELOS_IA.find((m) => m.id === String(id || '').trim()) || null;

/** Custo estimado de uma chamada, em USD (null para modelo fora da tabela). */
export function custoEstimadoUSD(modelo: string, uso: UsoClaude): number | null {
  const m = MODELOS_IA.find((x) => modelo === x.id || modelo.startsWith(x.id));
  if (!m) return null;
  const p = m.preco;
  const custo =
    ((uso.input_tokens || 0) * p.entrada +
      (uso.cache_creation_input_tokens || 0) * p.gravacaoCache +
      (uso.cache_read_input_tokens || 0) * p.leituraCache +
      (uso.output_tokens || 0) * p.saida) /
    1e6;
  return Math.round(custo * 1e6) / 1e6;
}

type EnvIA = {
  ANTHROPIC_API_KEY?: string;
  GROQ_API_KEY?: string;
  ROTEIRO_IA_MODELO?: string;
};

export const chaveDoProvedor = (env: EnvIA | undefined, provedor: ProvedorIA) =>
  (provedor === 'groq' ? env?.GROQ_API_KEY : env?.ANTHROPIC_API_KEY)?.trim() || '';

export type ConfigIA = {
  modelo: ModeloIA;
  origem: 'painel' | 'variavel' | 'padrao';
  atualizadoEm: string | null;
  atualizadoPor: string | null;
};

// Com 40–50 mil gerações por dia, não vale ler o D1 em toda chamada: a
// escolha do admin fica em memória por isolate durante 60 s.
const TTL_MEMORIA_MS = 60_000;
let memoria: { valor: ConfigIA; ate: number } | null = null;

export function limparMemoriaConfigIA() {
  memoria = null;
}

export async function carregarConfigIA(
  db: D1Database | undefined,
  env: EnvIA | undefined,
  usarMemoria = true
): Promise<ConfigIA> {
  if (usarMemoria && memoria && memoria.ate > Date.now()) return memoria.valor;
  let valor: ConfigIA | null = null;
  if (db) {
    try {
      const row = await db
        .prepare('SELECT modelo, updated_at, updated_by FROM roteiro_ia_config WHERE id = 1')
        .first<{ modelo: string; updated_at: string | null; updated_by: string | null }>();
      const m = modeloIA(row?.modelo);
      if (m)
        valor = {
          modelo: m,
          origem: 'painel',
          atualizadoEm: row?.updated_at ?? null,
          atualizadoPor: row?.updated_by ?? null
        };
    } catch (err) {
      // Tabela ainda não migrada: segue com variável/padrão.
      logServerError('[roteiro-ia] falha ao ler configuração', err);
    }
  }
  if (!valor) {
    const daVariavel = modeloIA(env?.ROTEIRO_IA_MODELO);
    valor = {
      modelo: daVariavel || MODELO_PADRAO_IA,
      origem: daVariavel ? 'variavel' : 'padrao',
      atualizadoEm: null,
      atualizadoPor: null
    };
  }
  memoria = { valor, ate: Date.now() + TTL_MEMORIA_MS };
  return valor;
}

export async function salvarConfigIA(db: D1Database, modeloId: string, userId: string) {
  const m = modeloIA(modeloId);
  if (!m) throw new Error('Modelo de IA desconhecido.');
  await db
    .prepare(
      `INSERT INTO roteiro_ia_config (id, provedor, modelo, updated_by, updated_at)
       VALUES (1, ?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT (id) DO UPDATE SET provedor = excluded.provedor, modelo = excluded.modelo,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`
    )
    .bind(m.provedor, m.id, userId)
    .run();
  limparMemoriaConfigIA();
  return m;
}

/** Chama o provedor do modelo escolhido com o mesmo prompt e esquema. */
export function gerarComIA(params: {
  modelo: ModeloIA;
  apiKey: string;
  sistema: string;
  mensagem: string;
  ferramenta: { name: string; description: string; input_schema: unknown };
  maxTokens?: number;
  fetcher?: typeof fetch;
}): Promise<ResultadoClaude> {
  if (params.modelo.provedor === 'groq')
    return chamarGroq({
      apiKey: params.apiKey,
      modelo: params.modelo.id,
      sistema: params.sistema,
      mensagem: params.mensagem,
      esquema: { name: params.ferramenta.name, schema: params.ferramenta.input_schema },
      // gpt-oss raciocina antes da resposta: folga para o raciocínio no teto.
      maxTokens: params.maxTokens ? params.maxTokens + 2_000 : undefined,
      fetcher: params.fetcher
    });
  return chamarFerramentaClaude({
    apiKey: params.apiKey,
    modelo: params.modelo.id,
    sistema: params.sistema,
    mensagem: params.mensagem,
    ferramenta: params.ferramenta,
    maxTokens: params.maxTokens,
    fetcher: params.fetcher
  });
}
