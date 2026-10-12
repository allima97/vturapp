/**
 * Extractor para o formato "Reserva Fácil" da Rextur.
 *
 * Campos extraídos:
 *  - LOC (número de reserva)
 *  - Passageiros: sobrenome, nome, gênero
 *  - Tarifas totais: tarifa, tax. emb. (taxas), rav, rc/rac, total
 *  - Segmentos de voo: origem, destino, datas
 *
 * Regras fixas:
 *  - Número do recibo = "REXTUR"
 *  - Reserva          = LOC
 *  - Forma pagamento  = "CARTÃO DE CRÉDITO 1X"
 *  - valor_total      = total das tarifas
 *  - Sem CPF — a conciliação utiliza o localizador da reserva
 */

import type { ContratoDraft, PassageiroDraft, PagamentoDraft } from './reservaTypes';

const SSR_MONTH_MAP: Record<string, string> = {
  JAN: '01',
  FEB: '02',
  MAR: '03',
  APR: '04',
  MAY: '05',
  JUN: '06',
  JUL: '07',
  AUG: '08',
  SEP: '09',
  OCT: '10',
  NOV: '11',
  DEC: '12'
};
const IGNORED_LOC_CANDIDATES = new Set(['PRAZO', 'DADOS', 'FILIAL', 'GRUPO', 'STATUS', 'ROTA']);

function parseCurrencyBR(value: string | null | undefined): number | null {
  if (!value) return null;
  const clean = value.replace(/R\$\s*/gi, '').replace(/\./g, '').replace(',', '.').trim();
  const n = parseFloat(clean);
  return isFinite(n) ? n : null;
}

function parseDateBR(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // formato "DD/MM/YYYY - HH:MM"
  const m2 = value.match(/(\d{2})\/(\d{2})\/(\d{4})\s*[-–]\s*\d{2}:\d{2}/);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
  // formato "YYYY-MM-DD"
  const m3 = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m3) return `${m3[1]}-${m3[2]}-${m3[3]}`;
  return null;
}

function parseSegmentDate(value: string | null | undefined): string | null {
  if (!value) return null;
  // "12/05/2026 - 20:30"
  const m = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function normalizeWS(s: string) {
  return s.replace(/\s+/g, ' ').trim();
}

function extractLoc(text: string) {
  const reservaTitleMatch = text.match(/Reserva\s+A[eé]rea\s*-\s*(?:[^/\n]+\/\s*){3}([A-Z0-9]{5,8})\b/i);
  if (reservaTitleMatch?.[1]) return reservaTitleMatch[1].trim().toUpperCase();

  const infoGeraisMatch = text.match(/informa[cç][oõ]es\s+gerais[\s\S]*?\bloc\b[\s\S]*?dados\s+adicionais\s+([A-Z0-9]{5,8})\b/i);
  if (infoGeraisMatch?.[1]) return infoGeraisMatch[1].trim().toUpperCase();

  const bilheteLocMatch = text.match(/n[úu]mero\s+do\s+bilhete[\s\S]*?\bloc\b[\s\S]*?\b\d{3}\s+\d{10,}\s+([A-Z0-9]{5,8})\b/i);
  if (bilheteLocMatch?.[1]) return bilheteLocMatch[1].trim().toUpperCase();

  const fallbackMatches = [...text.matchAll(/\bloc\b[\s\n:]+([A-Z0-9]{5,8})\b/gi)];
  for (const match of fallbackMatches) {
    const candidate = String(match[1] || '').trim().toUpperCase();
    if (candidate && !IGNORED_LOC_CANDIDATES.has(candidate)) return candidate;
  }

  return '';
}

function extractTarifaTotals(text: string) {
  const section = text.match(/tarifas[\s\S]*?(?=\btarifar\b|\bnotas\b|\bservi[cç]os\s+complementares\b)/i)?.[0] || text;
  const rows = [...section.matchAll(/(?:US\$\s*[\d.,]+\s+)?((?:R\$\s*[\d.,]+(?:\s+|$)){4,5})/gi)]
    .map((match) => [...String(match[1] || '').matchAll(/R\$\s*[\d.,]+/gi)].map((value) => parseCurrencyBR(value[0])))
    .filter((values) => values.length >= 4 && values.every((value) => value != null)) as number[][];

  if (rows.length === 0) return null;

  const values = rows[rows.length - 1];
  const hasRacColumn = /\b(?:rc|rac)\b/i.test(section);

  if (hasRacColumn && values.length >= 5) {
    const [tarifa, taxaEmb, rav, rac, total] = values;
    return {
      tarifa,
      taxaEmbarque: taxaEmb,
      taxaEmbarqueOriginal: taxaEmb,
      rav,
      rc: rac,
      total
    };
  }

  const [tarifa, taxaEmbarque, rav, total] = values;
  return {
    tarifa,
    taxaEmbarque,
    taxaEmbarqueOriginal: taxaEmbarque,
    rav,
    rc: 0,
    total
  };
}

export interface RexturContrato {
  loc: string;
  passageiros: { nome: string; sobrenome: string; genero: string | null; nascimento: string | null; cpf: string }[];
  tarifa: number | null;
  taxa_embarque: number | null;
  rc: number | null;
  rav: number | null;
  total: number | null;
  data_saida: string | null;
  data_retorno: string | null;
  destino: string | null;
  origem: string | null;
  /** CPF não está no documento. */
  cpfAusente: true;
}

export function extractRexturFromText(text: string): { contratos: ContratoDraft[]; raw_text: string } {
  // ── LOC ─────────────────────────────────────────────────────────────────────
  const loc = extractLoc(text);
  if (!loc) throw new Error('LOC não encontrado. Verifique se o texto é uma Reserva Fácil Rextur.');

  // ── SEGMENTOS (datas e destinos) ─────────────────────────────────────────────
  // Linha de segmento: "LA 6349 * 12/05/2026 - 20:30 13/05/2026 - 05:27 HK São Paulo - Guarulhos Nova Iorque - John F Kennedy ..."
  // Alternativa mais robusta: pegar todas as datas de voo
  const allFlightDates: string[] = [];
  for (const match of text.matchAll(/(\d{2}\/\d{2}\/\d{4})\s*[-–]\s*\d{2}:\d{2}/g)) {
    const date = parseSegmentDate(match[1]);
    if (date) allFlightDates.push(date);
  }

  const dataSaida = allFlightDates.length > 0 ? allFlightDates[0] : null;
  const dataRetorno = allFlightDates.length > 1 ? allFlightDates[allFlightDates.length - 1] : null;

  // Destinos: pegar cidades únicas dos segmentos
  // Formato típico: "São Paulo - Guarulhos   Nova Iorque - John F Kennedy"
  const destinoMatch = text.match(/HK\s+([\w\sÀ-ú\/\-]+?)\s+([\w\sÀ-ú\/\-]+?)\s+\d{3}/);
  let origem = null as string | null;
  let destino = null as string | null;
  if (destinoMatch) {
    origem = destinoMatch[1].trim();
    destino = destinoMatch[2].trim();
  }

  // ── PASSAGEIROS ──────────────────────────────────────────────────────────────
  // Seção "passageiros" com colunas: sobrenome / nome / gênero / status
  // Ex: "ADT  MATIAS DA SILVA CORREA  VINICIUS  Masculino  Reservada"
  const passageiros: PassageiroDraft[] = [];

  // Localizar bloco de passageiros
  const passSection = text.match(/passageiros[\s\S]*?(?=assentos|tarifas|bilhetes|ações|pedidos)/i)?.[0] || text;

  // Linhas de passageiro: "ADT  SOBRENOME  NOME  Masculino|Feminino"
  const passRegex = /ADT\s+([\w\s]+?)\s+([\w]+)\s+(Masculino|Feminino)/gi;
  let pm: RegExpExecArray | null;
  while ((pm = passRegex.exec(passSection)) !== null) {
    const sobrenome = pm[1].trim();
    const nome = pm[2].trim();
    const genero = pm[3];

    // Tentar extrair CPF/nascimento das informações especiais SSR DOCS
    // Ex: /BR/42572960893/BR/02MAY1995/M/31DEC9999/MATIAS DA SILVA CORREA/VINICIUS
    const nomeSearch = normalizeWS(`${sobrenome} ${nome}`).toUpperCase();
    let cpf = '';
    let nascimento: string | null = null;

    const ssrRegex = /SSR DOCS[^/]*\/I\/BR\/(\d{11})\/BR\/(\d{2})([A-Z]{3})(\d{4})\/[MF]\/\S+\/([\w\s]+)/gi;
    let sm: RegExpExecArray | null;
    while ((sm = ssrRegex.exec(text)) !== null) {
      const ssrNome = normalizeWS(sm[5]).toUpperCase();
      if (ssrNome.includes(sobrenome) || ssrNome.includes(nome) || nomeSearch.includes(ssrNome.split('/')[0]?.trim())) {
        cpf = sm[1];
        const day = sm[2];
        const mon = SSR_MONTH_MAP[sm[3].toUpperCase()] || '01';
        const year = sm[4];
        nascimento = `${year}-${mon}-${day}`;
        break;
      }
    }

    passageiros.push({ nome: `${sobrenome} ${nome}`, cpf, nascimento });
  }

  // ── TARIFAS ──────────────────────────────────────────────────────────────────
  // Linha total: "US$ 1.640,00  R$ 8.201,14  R$ 981,46  R$ 574,06  R$ 9.756,66"
  // Ou linha individual + totais no rodapé da tabela
  let tarifa: number | null = null;
  let taxaEmbarque: number | null = null;
  let rav: number | null = null;
  let rc: number | null = null;
  let total: number | null = null;

  // Tentar pegar a linha de totais. Quando houver coluna RC, ela também compõe as taxas.
  const totals = extractTarifaTotals(text);
  if (totals) {
    tarifa = totals.tarifa;
    taxaEmbarque = totals.taxaEmbarque;
    rav = totals.rav;
    rc = totals.rc;
    total = totals.total;
  }

  // Fallback: somar individual dos passageiros
  if (total == null && passageiros.length > 0) {
    // "total de tarifas: R$ 8201.14" no histórico
    const totalHistMatch = text.match(/total de tarifas[:\s]+R\$\s*([\d.,]+)/i);
    if (totalHistMatch) {
      const t = parseFloat(totalHistMatch[1].replace(',', '.'));
      if (isFinite(t)) tarifa = t;
    }
  }

  if (!total && !tarifa) {
    throw new Error('Tarifas não encontradas. Verifique se o texto é uma Reserva Fácil Rextur.');
  }

  const valorTotal = total ?? (tarifa ?? 0) + (taxaEmbarque ?? 0) + (rav ?? 0) + (rc ?? 0);

  // ── MONTA ContratoDraft ──────────────────────────────────────────────────────
  const pagamento: PagamentoDraft = {
    forma: 'CARTÃO DE CRÉDITO',
    plano: '1X',
    valor_bruto: valorTotal,
    total: valorTotal,
    desconto: null,
    parcelas: [{ numero: '1', valor: valorTotal, vencimento: null }],
  };

  const contrato: ContratoDraft = {
    contrato_numero: 'REXTUR',
    reserva_numero: loc,
    destino: destino || null,
    data_saida: dataSaida,
    data_retorno: dataRetorno,
    produto_principal: destino || 'Bilhete Aéreo',
    produto_tipo: 'Aéreo',
    contratante: {
      nome: passageiros[0]?.nome || '',
      cpf: '',  // ausente no documento
    },
    passageiros,
    pagamentos: [pagamento],
    total_bruto: valorTotal,
    total_pago: valorTotal,
    taxas_embarque: taxaEmbarque,
    taxa_du: rav,   // RAV/RAC é persistido em valor_rav no importador
    rc,
    tipo_pacote: 'Passagem Facial',
    raw_text: text,
  };

  return { contratos: [contrato], raw_text: text };
}
