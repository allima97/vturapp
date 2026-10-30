/**
 * F4-01 — Validação e normalização do cadastro de vendas (servidor).
 *
 * Regras portadas do sistema legado (docs/f4/F4-01-vendas-d1.md):
 *   - data_venda obrigatória, formato YYYY-MM-DD, não pode ser futura;
 *   - data_lancamento obrigatória, não pode ser futura;
 *   - data_venda <= data_lancamento;
 *   - pelo menos 1 item obrigatório; pelo menos 1 pagamento obrigatório;
 *   - valores em centavos inteiros (ADR-005);
 *   - chave_idempotencia: UUID v4 quando fornecida.
 *
 * Todos os campos entram como strings/numbers do body JSON e são normalizados aqui.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MOEDAS_VALIDAS = new Set(['BRL', 'USD', 'EUR', 'ARS', 'CLP', 'PYG', 'UYU', 'GBP']);
const TIPOS_PRODUTO_VALIDOS = new Set(['pacote', 'hotel', 'passagem', 'servico', 'seguro']);

// ─────────────────────────────────────────────────────────────────────────────
// Utilitários de conversão (ADR-005)
// ─────────────────────────────────────────────────────────────────────────────

/** Converte reais (string ou number) para centavos inteiros. '123,45' ou 123.45 → 12345. */
export function reaisToCentavos(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const raw = String(v)
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '');
  // Formato BR: '1.234,56' → remove pontos como separador de milhar, vírgula → ponto
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const num = Number(normalized);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

/** Valida formato de data civil YYYY-MM-DD. */
function isDataCivil(v: unknown): v is string {
  return typeof v === 'string' && ISO_DATE_RE.test(v);
}

function textoOpcional(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

function textoObrigatorio(v: unknown, max: number): string {
  return textoOpcional(v, max) ?? '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de entrada
// ─────────────────────────────────────────────────────────────────────────────

export type ItemInput = {
  produto_id?: number | null;
  numero_recibo?: string | null;
  numero_reserva?: string | null;
  data_servico?: string | null;
  data_fim_servico?: string | null;
  pax?: number | null;
  descricao: string;
  tipo?: string | null;
  moeda?: string | null;
  cambio?: number | null;           // ex: 5.0150 (float, convertido para 4 casas inteiras)
  valor_neto?: unknown;             // reais → centavos
  valor_bruto?: unknown;
  valor_taxas?: unknown;
  paga_comissao?: boolean | null;
  notas?: string | null;
};

export type PagamentoInput = {
  forma_id?: number | null;
  forma_nome: string;
  operacao?: string | null;
  plano?: string | null;
  valor_bruto?: unknown;
  desconto?: unknown;
  valor_total?: unknown;
  parcelas_qtd?: number | null;
  paga_comissao?: boolean | null;
  parcelas?: Array<{ numero?: number | null; valor?: unknown; vencimento?: string | null }> | null;
};

export type VendaInput = {
  vendedor_id?: string | null;
  cliente_id?: number | null;
  produto_id?: number | null;
  data_venda: string;
  data_lancamento?: string | null;
  data_embarque?: string | null;
  data_final?: string | null;
  desconto_comercial_aplicado?: boolean | null;
  desconto_comercial?: unknown;
  valor_bruto?: unknown;
  valor_taxas?: unknown;
  valor_total?: unknown;
  valor_nao_comissionado?: unknown;
  notas?: string | null;
  chave_idempotencia?: string | null;
  itens: ItemInput[];
  pagamentos: PagamentoInput[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Tipos normalizados (saída da validação — usados pelo service)
// ─────────────────────────────────────────────────────────────────────────────

export type ItemNormalizado = {
  produto_id: number | null;
  numero_recibo: string | null;
  numero_reserva: string | null;
  data_servico: string | null;
  data_fim_servico: string | null;
  pax: number;
  descricao: string;
  tipo: string;
  moeda: string;
  cambio_centavos: number;
  valor_neto_centavos: number;
  valor_bruto_centavos: number;
  valor_taxas_centavos: number;
  valor_total_centavos: number;
  paga_comissao: boolean;
  notas: string | null;
};

export type PagamentoNormalizado = {
  forma_id: number | null;
  forma_nome: string;
  operacao: string | null;
  plano: string | null;
  valor_bruto_centavos: number;
  desconto_centavos: number;
  valor_total_centavos: number;
  parcelas_qtd: number;
  parcelas_valor_centavos: number;
  paga_comissao: boolean;
  parcelas: Array<{ numero: number; valor_centavos: number; vencimento: string | null }>;
};

export type VendaNormalizada = {
  vendedor_id: string | null;
  cliente_id: number | null;
  produto_id: number | null;
  data_venda: string;
  data_lancamento: string;
  data_embarque: string | null;
  data_final: string | null;
  desconto_comercial_aplicado: boolean;
  desconto_comercial_centavos: number;
  valor_bruto_centavos: number;
  valor_taxas_centavos: number;
  valor_total_centavos: number;
  valor_nao_comissionado_centavos: number;
  notas: string | null;
  chave_idempotencia: string | null;
  itens: ItemNormalizado[];
  pagamentos: PagamentoNormalizado[];
};

export type VendaValidationResult =
  | { ok: true; dados: VendaNormalizada }
  | { ok: false; errors: Record<string, string> };

// ─────────────────────────────────────────────────────────────────────────────
// Normalização dos filhos
// ─────────────────────────────────────────────────────────────────────────────

function normalizarItem(item: unknown, idx: number, errors: Record<string, string>): ItemNormalizado | null {
  if (!item || typeof item !== 'object') {
    errors[`itens[${idx}]`] = 'Item inválido.';
    return null;
  }
  const i = item as Record<string, unknown>;

  const descricao = textoObrigatorio(i.descricao, 300);
  if (!descricao) errors[`itens[${idx}].descricao`] = 'Descrição do item é obrigatória.';

  const tipo = TIPOS_PRODUTO_VALIDOS.has(String(i.tipo || '').trim())
    ? (String(i.tipo).trim())
    : 'pacote';

  const moedaRaw = String(i.moeda || 'BRL').trim().toUpperCase();
  const moeda = MOEDAS_VALIDAS.has(moedaRaw) ? moedaRaw : 'BRL';

  // câmbio: 4 casas decimais em inteiro (1.0000 BRL/BRL = 10000)
  const cambioFloat = Number(i.cambio ?? 1);
  const cambio_centavos = Number.isFinite(cambioFloat) && cambioFloat > 0
    ? Math.round(cambioFloat * 10000)
    : 10000;

  const valor_bruto_centavos = reaisToCentavos(i.valor_bruto);
  const valor_taxas_centavos = reaisToCentavos(i.valor_taxas);
  const valor_neto_centavos = reaisToCentavos(i.valor_neto);
  // valor_total = bruto + taxas (se não fornecido explicitamente)
  const valor_total_centavos = valor_bruto_centavos + valor_taxas_centavos;

  const pax = Math.max(1, Math.trunc(Number(i.pax ?? 1) || 1));

  return {
    produto_id: typeof i.produto_id === 'number' ? i.produto_id : null,
    numero_recibo: textoOpcional(i.numero_recibo, 100),
    numero_reserva: textoOpcional(i.numero_reserva, 100),
    data_servico: isDataCivil(i.data_servico) ? i.data_servico : null,
    data_fim_servico: isDataCivil(i.data_fim_servico) ? i.data_fim_servico : null,
    pax,
    descricao: descricao || '(item)',
    tipo,
    moeda,
    cambio_centavos,
    valor_neto_centavos,
    valor_bruto_centavos,
    valor_taxas_centavos,
    valor_total_centavos,
    paga_comissao: i.paga_comissao !== false,
    notas: textoOpcional(i.notas, 500),
  };
}

function normalizarPagamento(pag: unknown, idx: number, errors: Record<string, string>): PagamentoNormalizado | null {
  if (!pag || typeof pag !== 'object') {
    errors[`pagamentos[${idx}]`] = 'Pagamento inválido.';
    return null;
  }
  const p = pag as Record<string, unknown>;

  const forma_nome = textoObrigatorio(p.forma_nome, 100);
  if (!forma_nome) errors[`pagamentos[${idx}].forma_nome`] = 'Forma de pagamento é obrigatória.';

  const valor_bruto_centavos = reaisToCentavos(p.valor_bruto);
  const desconto_centavos = reaisToCentavos(p.desconto);
  // valor_total = bruto − desconto (se não fornecido explicitamente)
  const valor_total_centavos = p.valor_total !== undefined
    ? reaisToCentavos(p.valor_total)
    : Math.max(0, valor_bruto_centavos - desconto_centavos);

  const parcelas_qtd = Math.max(1, Math.trunc(Number(p.parcelas_qtd ?? 1) || 1));
  const parcelas_valor_centavos = parcelas_qtd > 0 ? Math.round(valor_total_centavos / parcelas_qtd) : 0;

  const parcelas_raw = Array.isArray(p.parcelas) ? p.parcelas : [];
  const parcelas = parcelas_raw.map((pp: unknown, pidx: number) => {
    const par = (pp && typeof pp === 'object' ? pp : {}) as Record<string, unknown>;
    return {
      numero: Math.max(1, Math.trunc(Number(par.numero ?? pidx + 1) || pidx + 1)),
      valor_centavos: reaisToCentavos(par.valor),
      vencimento: isDataCivil(par.vencimento) ? par.vencimento : null,
    };
  });

  return {
    forma_id: typeof p.forma_id === 'number' ? p.forma_id : null,
    forma_nome: forma_nome || '(forma)',
    operacao: textoOpcional(p.operacao, 60),
    plano: textoOpcional(p.plano, 60),
    valor_bruto_centavos,
    desconto_centavos,
    valor_total_centavos,
    parcelas_qtd,
    parcelas_valor_centavos,
    paga_comissao: p.paga_comissao !== false,
    parcelas,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validação principal
// ─────────────────────────────────────────────────────────────────────────────

/** Data atual no formato YYYY-MM-DD (UTC, para comparações de datas civis). */
export function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function validarVenda(body: unknown): VendaValidationResult {
  const errors: Record<string, string> = {};

  if (!body || typeof body !== 'object') {
    return { ok: false, errors: { _: 'Corpo da requisição inválido.' } };
  }
  const b = body as Record<string, unknown>;

  // ── datas ──
  const hoje = hojeISO();
  const dataVenda = isDataCivil(b.data_venda) ? b.data_venda : null;
  if (!dataVenda) {
    errors.data_venda = 'Data de venda é obrigatória (YYYY-MM-DD).';
  } else if (dataVenda > hoje) {
    errors.data_venda = 'Data de venda não pode ser futura.';
  }

  const dataLancamentoRaw = isDataCivil(b.data_lancamento) ? b.data_lancamento : hoje;
  const dataLancamento = dataLancamentoRaw > hoje ? hoje : dataLancamentoRaw;

  if (dataVenda && dataVenda > dataLancamento) {
    errors.data_venda = 'Data de venda não pode ser posterior à data de lançamento.';
  }

  const dataEmbarque = isDataCivil(b.data_embarque) ? b.data_embarque : null;
  const dataFinal = isDataCivil(b.data_final) ? b.data_final : null;

  // ── itens ──
  const itensRaw = Array.isArray(b.itens) ? b.itens : [];
  if (itensRaw.length === 0) {
    errors.itens = 'A venda deve ter pelo menos um item.';
  }
  const itens: ItemNormalizado[] = [];
  for (let i = 0; i < itensRaw.length; i++) {
    const item = normalizarItem(itensRaw[i], i, errors);
    if (item) itens.push(item);
  }

  // ── pagamentos ──
  const pagamentosRaw = Array.isArray(b.pagamentos) ? b.pagamentos : [];
  if (pagamentosRaw.length === 0) {
    errors.pagamentos = 'A venda deve ter pelo menos um pagamento.';
  }
  const pagamentos: PagamentoNormalizado[] = [];
  for (let i = 0; i < pagamentosRaw.length; i++) {
    const pag = normalizarPagamento(pagamentosRaw[i], i, errors);
    if (pag) pagamentos.push(pag);
  }

  // ── chave_idempotencia ──
  const chaveIdempotencia = typeof b.chave_idempotencia === 'string' && UUID_RE.test(b.chave_idempotencia)
    ? b.chave_idempotencia
    : null;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  // ── valores financeiros do cabeçalho ──
  // Se o cliente não enviou, calculamos a partir dos filhos
  const valorBrutoCentavos = b.valor_bruto !== undefined
    ? reaisToCentavos(b.valor_bruto)
    : itens.reduce((sum, it) => sum + it.valor_bruto_centavos, 0);
  const valorTaxasCentavos = b.valor_taxas !== undefined
    ? reaisToCentavos(b.valor_taxas)
    : itens.reduce((sum, it) => sum + it.valor_taxas_centavos, 0);
  const valorTotalCentavos = b.valor_total !== undefined
    ? reaisToCentavos(b.valor_total)
    : itens.reduce((sum, it) => sum + it.valor_total_centavos, 0);

  return {
    ok: true,
    dados: {
      vendedor_id: typeof b.vendedor_id === 'string' && b.vendedor_id.trim() ? b.vendedor_id.trim() : null,
      cliente_id: typeof b.cliente_id === 'number' ? b.cliente_id : null,
      produto_id: typeof b.produto_id === 'number' ? b.produto_id : null,
      data_venda: dataVenda!,
      data_lancamento: dataLancamento,
      data_embarque: dataEmbarque,
      data_final: dataFinal,
      desconto_comercial_aplicado: b.desconto_comercial_aplicado === true,
      desconto_comercial_centavos: reaisToCentavos(b.desconto_comercial),
      valor_bruto_centavos: valorBrutoCentavos,
      valor_taxas_centavos: valorTaxasCentavos,
      valor_total_centavos: valorTotalCentavos,
      valor_nao_comissionado_centavos: reaisToCentavos(b.valor_nao_comissionado),
      notas: textoOpcional(b.notas, 2000),
      chave_idempotencia: chaveIdempotencia,
      itens,
      pagamentos,
    },
  };
}
