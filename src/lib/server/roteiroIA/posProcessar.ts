import { parseRoteiroOpcionais } from '$lib/roteiroOpcionais';
import {
  ROTEIRO_IA_MAX_DESTINOS,
  ROTEIRO_IA_MAX_DIAS,
  type DiaRoteiroIA,
  type OpcionalRoteiroIA,
  type PedidoRoteiroIA,
  type RascunhoRoteiroIA
} from '$lib/roteiroIA/tipos';
import type { SaidaBrutaRoteiro, SaidaNormalizada } from './esquema';
import { diasDoPedido, type ReferenciaOpcional } from './prompt';

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

const numeroDia = (v: unknown, total: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isInteger(n) && n >= 1 && n <= total ? n : null;
};

function dataValida(v: unknown): string {
  if (typeof v !== 'string' || !DATA_ISO.test(v)) return '';
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v ? v : '';
}

function somarDias(iso: string, dias: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 864e5).toISOString().slice(0, 10);
}

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
];

/** Nome do roteiro montado no servidor (a IA não gasta tokens com isso). */
export function nomeRoteiroIA(pedido: PedidoRoteiroIA) {
  const [ano, mes] = pedido.data_inicio.split('-');
  const destinos =
    pedido.destinos.length > 3
      ? `${pedido.destinos.slice(0, 3).join(', ')} e mais`
      : pedido.destinos.join(', ');
  return `Viagem ${destinos} - ${MESES[Number(mes) - 1] || ''} ${ano}`
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

// Valores e números de voo nunca podem sair da IA (regra da agência).
const RE_VALOR =
  /(?:R\$|US\$|U\$|€|£|\bUSD\b|\bEUR\b|\bBRL\b)\s?\d[\d.,]*(?:\s?(?:mil|reais|dólares|euros))?/gi;
const RE_VOO = /\b(?:voo|vôo)\s+[A-Z0-9]{2}\s?\d{2,4}\b/gi;

function limparProibidos(s: string): { texto: string; removeu: boolean } {
  const limpo = s
    .replace(RE_VALOR, '')
    .replace(RE_VOO, 'voo')
    .replace(/\s{2,}/g, ' ')
    .trim();
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
  const total = diasDoPedido({ data_inicio: inicio, data_fim: fim });
  if (total < 1) return 'A data de fim deve ser igual ou depois da data de início.';
  if (total > ROTEIRO_IA_MAX_DIAS)
    return `O período pode ter no máximo ${ROTEIRO_IA_MAX_DIAS} dias.`;
  if (!Number.isFinite(adultos) || adultos < 1 || adultos > 50) return 'Informe de 1 a 50 adultos.';
  if (!Number.isFinite(criancas) || criancas < 0 || criancas > 50)
    return 'Informe de 0 a 50 crianças.';
  return {
    origem,
    destinos,
    data_inicio: inicio,
    data_fim: fim,
    adultos,
    criancas,
    perfil: texto(b.perfil, 200),
    observacoes: texto(b.observacoes, 1500),
    ...(b.nova_versao === true ? { nova_versao: true } : {})
  };
}

/**
 * Saída bruta da IA → formato normalizado (o que vai para o cache):
 * referências de opcionais expandidas com nome e descrição da lista,
 * dias 1..N válidos e sem repetição. Ainda sem datas.
 */
export function normalizarSaidaIA(
  bruta: SaidaBrutaRoteiro,
  referencias: ReferenciaOpcional[],
  totalDias: number
): { saida: SaidaNormalizada; usadasBiblioteca: ReferenciaOpcional[] } {
  const dias: SaidaNormalizada['dias'] = [];
  const vistos = new Set<number>();
  for (const item of Array.isArray(bruta.dias)
    ? bruta.dias.slice(0, ROTEIRO_IA_MAX_DIAS * 2)
    : []) {
    if (!item || typeof item !== 'object') continue;
    const d = item as Record<string, unknown>;
    const dia = numeroDia(d.dia, totalDias);
    const cidade = texto(d.cidade, 200);
    if (!dia || vistos.has(dia) || !cidade) continue;
    vistos.add(dia);
    dias.push({
      dia,
      cidade,
      percurso: texto(d.percurso, 300),
      descricao: texto(d.descricao, 4000)
    });
  }
  dias.sort((a, b) => a.dia - b.dia);

  const grupos = new Map<string, SaidaNormalizada['opcionais'][number]>();
  const grupo = (cidade: string) => {
    const chave = cidade.toLocaleLowerCase('pt-BR');
    if (!grupos.has(chave)) grupos.set(chave, { cidade, passeios: [] });
    return grupos.get(chave)!;
  };
  const porRef = new Map(referencias.map((r) => [r.ref.toLowerCase(), r]));
  const usadas = new Set<string>();
  const usadasBiblioteca: ReferenciaOpcional[] = [];
  for (const item of Array.isArray(bruta.opcionais_ref) ? bruta.opcionais_ref.slice(0, 80) : []) {
    if (!item || typeof item !== 'object') continue;
    const x = item as Record<string, unknown>;
    const ref = porRef.get(texto(x.ref, 12).toLowerCase());
    if (!ref || usadas.has(ref.ref)) continue;
    usadas.add(ref.ref);
    if (ref.ref.startsWith('b')) usadasBiblioteca.push(ref);
    const dia = numeroDia(x.dia, totalDias);
    grupo(ref.cidade).passeios.push({
      nome: ref.nome,
      descricao: ref.descricao,
      ...(dia ? { dia } : {})
    });
  }
  for (const g of Array.isArray(bruta.opcionais_novos) ? bruta.opcionais_novos.slice(0, 30) : []) {
    if (!g || typeof g !== 'object') continue;
    const x = g as Record<string, unknown>;
    const cidade = texto(x.cidade, 200);
    if (!cidade) continue;
    for (const p of Array.isArray(x.passeios) ? x.passeios.slice(0, 8) : []) {
      const y = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
      const nome = texto(y.nome, 300);
      if (!nome) continue;
      const dia = numeroDia(y.dia, totalDias);
      grupo(cidade).passeios.push({
        nome,
        descricao: texto(y.descricao, 2000),
        novo: true,
        ...(dia ? { dia } : {})
      });
    }
  }
  const lista = (v: unknown) =>
    (Array.isArray(v) ? v.slice(0, 30) : []).map((s) => texto(s, 200)).filter(Boolean);
  return {
    saida: {
      dias,
      opcionais: [...grupos.values()].filter((g) => g.passeios.length),
      inclui: lista(bruta.inclui),
      nao_inclui: lista(bruta.nao_inclui)
    },
    usadasBiblioteca
  };
}

/**
 * Converte a saída normalizada (da IA ou do cache) no rascunho do formulário,
 * aplicando as datas do pedido e as mesmas regras da gravação: cidades
 * conferidas na base geográfica, opcionais validados, sem valores nem voos.
 */
export async function posProcessarRoteiroIA(
  saida: SaidaNormalizada,
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
  const total = diasDoPedido(pedido);
  const dataDoDia = (n: number) => somarDias(pedido.data_inicio, n - 1);

  // ── Cidades: resolvidas uma vez por nome ──────────────────────────────
  const cache = new Map<string, Promise<CidadeResolvida | null>>();
  const naoEncontradas = new Set<string>();
  const resolver = async (nome: string) => {
    const chave = nome.toLocaleLowerCase('pt-BR');
    if (!cache.has(chave))
      cache.set(
        chave,
        resolverCidade(nome).catch(() => null)
      );
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

  // ── Dias: dia N → data do pedido; um por data, em ordem ───────────────
  const porDia = new Map(
    (Array.isArray(saida.dias) ? saida.dias : [])
      .filter((d) => numeroDia(d?.dia, total) && texto(d?.cidade, 200))
      .map((d) => [d.dia, d] as const)
  );
  const faltando: string[] = [];
  const dias: DiaRoteiroIA[] = [];
  for (let n = 1; n <= total; n++) {
    const data = dataDoDia(n);
    const dia = porDia.get(n);
    if (!dia) {
      faltando.push(data.split('-').reverse().join('/'));
      continue;
    }
    const cidade = texto(dia.cidade, 200);
    const r = await resolver(cidade);
    dias.push({
      ...identidade(cidade, r),
      data,
      percurso: limpo(dia.percurso, 300).replace(/\s+(?:->|-|–|—)\s+/g, ' → '),
      descricao: limpo(dia.descricao, 4000)
    });
  }
  if (!dias.length) throw new Error('A IA não devolveu nenhum dia válido para o período.');
  if (faltando.length)
    avisos.push(
      `A IA não preencheu ${faltando.length} dia(s): ${faltando.slice(0, 6).join(', ')}${faltando.length > 6 ? '…' : ''}.`
    );

  // ── Opcionais: mesmas regras de parseRoteiroOpcionais ─────────────────
  const opcionais: OpcionalRoteiroIA[] = [];
  let descartados = 0;
  for (const g of Array.isArray(saida.opcionais) ? saida.opcionais.slice(0, 30) : []) {
    const nomeCidade = texto(g?.cidade, 200);
    if (!nomeCidade) continue;
    const passeios = (Array.isArray(g.passeios) ? g.passeios.slice(0, 8) : [])
      .map((p) => {
        const dia = numeroDia(p?.dia, total);
        return {
          nome: limpo(p?.nome, 300),
          descricao: limpo(p?.descricao, 2000),
          ...(dia ? { data: dataDoDia(dia) } : {})
        };
      })
      .filter((p) => p.nome);
    if (!passeios.length) continue;
    const r = await resolver(nomeCidade);
    const ident = identidade(nomeCidade, r);
    try {
      // Validação idêntica à da gravação. Um grupo inválido é descartado
      // (com aviso) em vez de jogar fora o roteiro inteiro já pago.
      parseRoteiroOpcionais([
        {
          cidade: ident.cidade,
          ...(ident.cidade_id ? { cidade_id: ident.cidade_id } : {}),
          passeios
        }
      ]);
    } catch {
      descartados++;
      continue;
    }
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
  if (descartados)
    avisos.push(`${descartados} grupo(s) de opcionais vieram fora do formato e foram ignorados.`);
  if (removeuProibido)
    avisos.push('Valores ou números de voo sugeridos pela IA foram removidos do texto.');

  return {
    nome: nomeRoteiroIA(pedido),
    dias,
    opcionais,
    inclui_texto: lista(saida.inclui),
    nao_inclui_texto: lista(saida.nao_inclui),
    avisos,
    modelo
  };
}
