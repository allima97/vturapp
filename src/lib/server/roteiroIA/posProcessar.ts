import { parseRoteiroOpcionais } from '$lib/roteiroOpcionais';
import {
  ROTEIRO_IA_MAX_DESTINOS,
  ROTEIRO_IA_MAX_DIAS,
  type DiaRoteiroIA,
  type OpcionalRoteiroIA,
  type PedidoRoteiroIA,
  type RascunhoRoteiroIA
} from '$lib/roteiroIA/tipos';
import type { SaidaBrutaRoteiro } from './esquema';

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Cidade resolvida na base geográfica (ou não encontrada). */
export type CidadeResolvida = {
  cidade: string;
  cidade_id: string | null;
  geografica: boolean;
};
export type ResolverCidade = (nome: string) => Promise<CidadeResolvida | null>;

const texto = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

function dataValida(v: unknown): string {
  if (typeof v !== 'string' || !DATA_ISO.test(v)) return '';
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v ? v : '';
}

function somarDias(iso: string, dias: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 864e5).toISOString().slice(0, 10);
}

function diasEntre(inicio: string, fim: string) {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 864e5);
}

// Valores e números de voo nunca podem sair da IA (regra da agência).
const RE_VALOR = /(?:R\$|US\$|U\$|€|£|\bUSD\b|\bEUR\b|\bBRL\b)\s?\d[\d.,]*(?:\s?(?:mil|reais|dólares|euros))?/gi;
const RE_VOO = /\b(?:voo|vôo)\s+[A-Z0-9]{2}\s?\d{2,4}\b/gi;

function limparProibidos(s: string): { texto: string; removeu: boolean } {
  const limpo = s.replace(RE_VALOR, '').replace(RE_VOO, 'voo').replace(/\s{2,}/g, ' ').trim();
  return { texto: limpo, removeu: limpo !== s };
}

/** Valida o pedido vindo da tela. Retorna o pedido limpo ou a mensagem de erro. */
export function validarPedidoRoteiroIA(body: unknown): PedidoRoteiroIA | string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Pedido inválido.';
  const b = body as Record<string, unknown>;
  const origem = texto(b.origem, 120);
  const destinos = (Array.isArray(b.destinos) ? b.destinos : [])
    .map((d) => texto(d, 120))
    .filter(Boolean);
  const inicio = dataValida(b.data_inicio);
  const fim = dataValida(b.data_fim);
  const adultos = Math.trunc(Number(b.adultos));
  const criancas = Math.trunc(Number(b.criancas || 0));
  if (!origem) return 'Informe a cidade de origem.';
  if (!destinos.length) return 'Informe ao menos um destino.';
  if (destinos.length > ROTEIRO_IA_MAX_DESTINOS)
    return `Informe no máximo ${ROTEIRO_IA_MAX_DESTINOS} destinos.`;
  if (!inicio || !fim) return 'Informe as datas de início e fim.';
  const total = diasEntre(inicio, fim) + 1;
  if (total < 1) return 'A data de fim deve ser igual ou depois da data de início.';
  if (total > ROTEIRO_IA_MAX_DIAS) return `O período pode ter no máximo ${ROTEIRO_IA_MAX_DIAS} dias.`;
  if (!Number.isFinite(adultos) || adultos < 1 || adultos > 50) return 'Informe de 1 a 50 adultos.';
  if (!Number.isFinite(criancas) || criancas < 0 || criancas > 50) return 'Informe de 0 a 50 crianças.';
  return {
    origem,
    destinos,
    data_inicio: inicio,
    data_fim: fim,
    adultos,
    criancas,
    perfil: texto(b.perfil, 200),
    observacoes: texto(b.observacoes, 1500)
  };
}

/**
 * Converte a saída bruta do Claude no rascunho do formulário, aplicando as
 * mesmas regras da gravação: datas no período e em sequência, cidades
 * conferidas na base geográfica, opcionais validados, sem valores nem voos.
 */
export async function posProcessarRoteiroIA(
  saida: SaidaBrutaRoteiro,
  pedido: PedidoRoteiroIA,
  resolverCidade: ResolverCidade,
  modelo: string
): Promise<RascunhoRoteiroIA> {
  const avisos: string[] = [];
  let removeuProibido = false;
  const limpo = (v: unknown, max: number) => {
    const r = limparProibidos(texto(v, max));
    if (r.removeu) removeuProibido = true;
    return r.texto;
  };

  // ── Cidades: resolvidas uma vez por nome ──────────────────────────────
  const cache = new Map<string, Promise<CidadeResolvida | null>>();
  const naoEncontradas = new Set<string>();
  const resolver = async (nome: string) => {
    const chave = nome.toLocaleLowerCase('pt-BR');
    if (!cache.has(chave)) cache.set(chave, resolverCidade(nome).catch(() => null));
    const r = await cache.get(chave)!;
    if (!r) naoEncontradas.add(nome);
    return r;
  };
  const identidade = (nome: string, r: CidadeResolvida | null) =>
    r
      ? {
          cidade: r.cidade,
          cidade_id: r.cidade_id,
          cidade_pendente: false,
          ...(r.geografica ? { cidade_modo_geografico: true } : {})
        }
      : { cidade: nome, cidade_id: null, cidade_pendente: true };

  // ── Dias: dentro do período, uma entrada por data, em ordem ────────────
  const brutos = Array.isArray(saida.dias) ? saida.dias.slice(0, ROTEIRO_IA_MAX_DIAS * 2) : [];
  const porData = new Map<string, { cidade: string; percurso: string; descricao: string }>();
  for (const item of brutos) {
    if (!item || typeof item !== 'object') continue;
    const d = item as Record<string, unknown>;
    const data = dataValida(d.data);
    if (!data || data < pedido.data_inicio || data > pedido.data_fim || porData.has(data)) continue;
    const cidade = texto(d.cidade, 200);
    if (!cidade) continue;
    porData.set(data, {
      cidade,
      percurso: limpo(d.percurso, 300).replace(/\s+(?:->|-|–|—)\s+/g, ' → '),
      descricao: limpo(d.descricao, 4000)
    });
  }
  const total = diasEntre(pedido.data_inicio, pedido.data_fim) + 1;
  const faltando: string[] = [];
  const dias: DiaRoteiroIA[] = [];
  for (let i = 0; i < total; i++) {
    const data = somarDias(pedido.data_inicio, i);
    const dia = porData.get(data);
    if (!dia) {
      faltando.push(data.split('-').reverse().join('/'));
      continue;
    }
    const r = await resolver(dia.cidade);
    dias.push({ ...identidade(dia.cidade, r), data, percurso: dia.percurso, descricao: dia.descricao });
  }
  if (!dias.length) throw new Error('A IA não devolveu nenhum dia válido para o período.');
  if (faltando.length)
    avisos.push(`A IA não preencheu ${faltando.length} dia(s): ${faltando.slice(0, 6).join(', ')}${faltando.length > 6 ? '…' : ''}.`);

  // ── Opcionais: mesmas regras de parseRoteiroOpcionais ─────────────────
  const opcionais: OpcionalRoteiroIA[] = [];
  for (const g of Array.isArray(saida.opcionais) ? saida.opcionais.slice(0, 30) : []) {
    if (!g || typeof g !== 'object') continue;
    const grupo = g as Record<string, unknown>;
    const nomeCidade = texto(grupo.cidade, 200);
    if (!nomeCidade) continue;
    const passeios = (Array.isArray(grupo.passeios) ? grupo.passeios.slice(0, 8) : [])
      .map((p) => {
        const x = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
        const data = dataValida(x.data);
        return {
          nome: limpo(x.nome, 300),
          descricao: limpo(x.descricao, 2000),
          ...(data && data >= pedido.data_inicio && data <= pedido.data_fim ? { data } : {})
        };
      })
      .filter((p) => p.nome);
    if (!passeios.length) continue;
    const r = await resolver(nomeCidade);
    const ident = identidade(nomeCidade, r);
    // Validação idêntica à da gravação (lança se algo estiver fora do formato).
    parseRoteiroOpcionais([
      { cidade: ident.cidade, ...(ident.cidade_id ? { cidade_id: ident.cidade_id } : {}), passeios }
    ]);
    opcionais.push({
      cidade: ident.cidade,
      ...(ident.cidade_id ? { cidade_id: ident.cidade_id } : {}),
      cidade_pendente: ident.cidade_pendente,
      ...('cidade_modo_geografico' in ident ? { cidade_modo_geografico: true } : {}),
      passeios
    });
  }

  // ── Inclusões ─────────────────────────────────────────────────────────
  const lista = (v: unknown) =>
    (Array.isArray(v) ? v.slice(0, 30) : [])
      .map((s) => limpo(s, 200))
      .filter(Boolean)
      .join('\n');

  if (naoEncontradas.size)
    avisos.push(
      `Confirme a cidade de: ${[...naoEncontradas].join(', ')} (não encontrada automaticamente).`
    );
  if (removeuProibido)
    avisos.push('Valores ou números de voo sugeridos pela IA foram removidos do texto.');

  return {
    nome: limpo(saida.nome, 120) || `Viagem ${pedido.destinos.join(' • ')}`,
    dias,
    opcionais,
    inclui_texto: lista(saida.inclui),
    nao_inclui_texto: lista(saida.nao_inclui),
    avisos,
    modelo
  };
}
