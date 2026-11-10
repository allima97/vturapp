/**
 * Regras e utilitários PUROS do formulário de venda (Fase 2.4).
 *
 * Extraídos SEM alteração de lógica das páginas vendas/nova e
 * vendas/[id]/editar, onde existiam duplicados e idênticos. As páginas
 * continuam com funções de mesmo nome que só repassam o estado da tela
 * (tipos, produtos, clientes, cidades...) para cá — templates e fluxo não mudam.
 *
 * O que NÃO está aqui de propósito: validateStep e montagem do payload, porque
 * nova e editar divergem nesses pontos (ver docs da Fase 2.4) e unificá-los
 * mudaria regra.
 */
import { addMonthsISODate } from '$lib/date';

export type VendaFormOption = {
  id: string;
  nome?: string | null;
  pais_nome?: string | null;
  estado?: string | null;
  uf?: string | null;
  sigla?: string | null;
  subdivisao_nome?: string | null;
  subdivisao?: { nome?: string | null; sigla?: string | null } | null;
  label?: string | null;
  grau_importancia?: number | null;
  tipo?: string | null;
  tipo_produto?: string | null;
  cidade_id?: string | null;
  todas_as_cidades?: boolean | null;
  destino?: string | null;
  paga_comissao?: boolean | null;
  permite_desconto?: boolean | null;
  desconto_padrao_pct?: number | null;
  ativo?: boolean | null;
  nome_completo?: string | null;
  company_id?: string | null;
};

export type VendaFormCliente = {
  id: string;
  nome: string;
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
};

export type VendaFormParcela = { numero: string; valor: string; vencimento: string };

export type VendaCalculadoraResultado = {
  valorFinal?: string | number | null;
  valorBruto?: string | number | null;
  descontoValor?: string | number | null;
  taxas?: string | number | null;
};

const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});
const PT_BR_BASE_COLLATOR = new Intl.Collator('pt-BR', { sensitivity: 'base' });
const DIACRITICS_RE = /[̀-ͯ]/g;

// ---------------------------------------------------------------- pagamentos

export function createPagamento() {
  return {
    forma_pagamento_id: '',
    forma_nome: '',
    operacao: '',
    plano: '',
    valor_bruto: '',
    desconto_valor: '',
    valor_total: '',
    parcelas_qtd: 1,
    parcelas_valor: '',
    vencimento_primeira: '',
    paga_comissao: true,
    parcelas: [] as Array<VendaFormParcela>
  };
}

/** Parcelas iguais a partir do total, quantidade e 1º vencimento (mês a mês). */
export function gerarParcelas(pagamento: {
  parcelas_qtd?: number | string | null;
  valor_total?: string | number | null;
  vencimento_primeira?: string | null;
}): { parcelas: VendaFormParcela[]; parcelas_valor: string } {
  const quantidade = Math.max(1, Number(pagamento.parcelas_qtd || 1));
  const valorTotal = parseMoney(pagamento.valor_total);
  const valorParcela = quantidade > 0 ? valorTotal / quantidade : 0;
  const inicio = pagamento.vencimento_primeira || '';

  const parcelas = Array.from({ length: quantidade }).map((_, parcelaIndex) => {
    const vencimento = inicio ? addMonthsISODate(inicio, parcelaIndex) : '';

    return {
      numero: String(parcelaIndex + 1),
      valor: valorParcela ? valorParcela.toFixed(2) : '',
      vencimento
    };
  });

  return { parcelas, parcelas_valor: valorParcela ? valorParcela.toFixed(2) : '' };
}

export function adicionarParcela(parcelas: VendaFormParcela[]) {
  const novas = [
    ...parcelas,
    {
      numero: String(parcelas.length + 1),
      valor: '',
      vencimento: ''
    }
  ];
  return { parcelas: novas, parcelas_qtd: novas.length };
}

export function removerParcela(parcelas: VendaFormParcela[], parcelaIndex: number) {
  let novas = parcelas.filter((_, indexItem) => indexItem !== parcelaIndex);
  novas = novas.map((item, itemIndex) => ({
    ...item,
    numero: String(itemIndex + 1)
  }));
  return { parcelas: novas, parcelas_qtd: Math.max(1, novas.length || 1) };
}

// ---------------------------------------------------------------- valores

export function parseMoney(value: string | number | null | undefined) {
  const raw = String(value ?? '')
    .trim()
    .replace(/[^\d,.-]/g, '');
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatMoney(value: number) {
  return BRL_CURRENCY_FORMATTER.format(value || 0);
}

/** Campos da venda preenchidos pela calculadora. */
export function valoresDaCalculadora(resultado: VendaCalculadoraResultado) {
  return {
    valor_total: String(resultado.valorFinal || ''),
    valor_total_bruto: String(resultado.valorBruto || ''),
    desconto_comercial_aplicado: Number(resultado.descontoValor || 0) > 0,
    desconto_comercial_valor: String(resultado.descontoValor || ''),
    valor_taxas: String(resultado.taxas || '')
  };
}

// ---------------------------------------------------------------- texto

export function normalizeText(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .toLowerCase()
    .trim();
}

export function normalizeLookup(value: string | null | undefined) {
  return normalizeText(value);
}

export function getSelectValue(event: Event) {
  return String((event.target as HTMLSelectElement | null)?.value || '');
}

// ---------------------------------------------------------------- vale viagem / produtos

export function isValeViagemTipo(tipos: VendaFormOption[], tipoId: string) {
  if (!tipoId) return false;
  const tipoSelecionado = tipos.find((item) => String(item.id) === String(tipoId));
  return [tipoId, String(tipoSelecionado?.nome || ''), String(tipoSelecionado?.tipo || '')].some(
    (value) => normalizeText(value).includes('vale viagem')
  );
}

export function isValeViagemProduto(item: VendaFormOption) {
  const nome = normalizeText(String(item.nome || ''));
  return nome.includes('vale viagem');
}

export function getValeViagemProdutoVirtual(
  tipos: VendaFormOption[],
  tipoId: string
): VendaFormOption | null {
  if (!isValeViagemTipo(tipos, tipoId)) return null;
  const tipoSelecionado = tipos.find((item) => String(item.id) === String(tipoId));
  return {
    id: tipoId,
    nome: String(tipoSelecionado?.nome || 'Vale Viagem'),
    tipo: tipoId,
    tipo_produto: tipoId,
    todas_as_cidades: true,
    ativo: true
  };
}

export function produtoMatchesTipo(
  tipos: VendaFormOption[],
  item: VendaFormOption,
  tipoId: string
) {
  if (!tipoId) return true;
  const selectedType = tipos.find((tipo) => String(tipo.id) === String(tipoId));
  const tipoSelecionadoNome = normalizeText(String(selectedType?.nome || selectedType?.tipo || ''));
  const tipoProduto = normalizeText(String(item.tipo_produto || item.tipo || ''));
  return (
    String(item.tipo) === String(tipoId) ||
    String(item.tipo_produto) === String(tipoId) ||
    (tipoSelecionadoNome && tipoProduto === tipoSelecionadoNome)
  );
}

export function isProdutoCompativelCidade(produto: VendaFormOption, cidadeId: string) {
  if (!cidadeId) return produto.todas_as_cidades === true;
  if (produto.todas_as_cidades === true) return true;
  return String(produto.cidade_id) === String(cidadeId);
}

export function filtrarProdutosPorTipo<T extends VendaFormOption>(
  produtos: T[],
  tipos: VendaFormOption[],
  tipoId: string,
  cidadeId: string
) {
  return produtos.filter((item) => {
    const matchesTipo = produtoMatchesTipo(tipos, item, tipoId);
    return matchesTipo && isProdutoCompativelCidade(item, cidadeId);
  });
}

export function filtrarProdutosPorTipoCidade<T extends VendaFormOption>(
  produtos: T[],
  tipos: VendaFormOption[],
  tipoId: string,
  cidadeId: string
): Array<T | VendaFormOption> {
  const filtered = produtos.filter((item) => {
    const matchesTipo = produtoMatchesTipo(tipos, item, tipoId);
    if (isValeViagemTipo(tipos, tipoId)) return matchesTipo || isValeViagemProduto(item);
    return matchesTipo && isProdutoCompativelCidade(item, cidadeId);
  });
  const valeViagemVirtual = getValeViagemProdutoVirtual(tipos, tipoId);
  if (!valeViagemVirtual) return filtered;
  if (
    filtered.some(
      (item) => String(item.id) === String(valeViagemVirtual.id) || isValeViagemProduto(item)
    )
  ) {
    return filtered;
  }
  return [valeViagemVirtual, ...filtered];
}

// ---------------------------------------------------------------- clientes

export function getClienteLabel(cliente: VendaFormCliente) {
  return `${cliente.nome}${cliente.cpf ? ` • ${cliente.cpf}` : ''}`;
}

/** Junta clientes por id (novos sobrescrevem campos dos existentes), mantendo a ordem. */
export function mergeClientesById<T extends VendaFormCliente>(atuais: T[], items: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of atuais) {
    byId.set(String(item.id), item);
  }
  for (const item of items) {
    const id = String(item?.id || '').trim();
    if (!id) continue;
    byId.set(id, { ...(byId.get(id) || {}), ...item } as T);
  }
  return Array.from(byId.values());
}

// ---------------------------------------------------------------- cidades

export function getCidadeLabel(cidade: VendaFormOption) {
  const preferred = String(cidade.label || '').trim();
  if (preferred) return preferred;
  const nome = String(cidade.nome || '').trim();
  const estado = String(
    cidade.estado ||
      cidade.uf ||
      cidade.sigla ||
      cidade.subdivisao_nome ||
      cidade.subdivisao?.sigla ||
      cidade.subdivisao?.nome ||
      ''
  ).trim();
  return estado ? `${nome} (${estado})` : nome;
}

export function getCidadeImportanceRank(cidade: VendaFormOption) {
  const parsed = Number(cidade?.grau_importancia);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 9999;
}

export function getCidadeSearchScore(cidade: VendaFormOption, input: string) {
  const term = normalizeLookup(input);
  if (!term) return 100;

  const nome = normalizeLookup(cidade.nome);
  const label = normalizeLookup(getCidadeLabel(cidade));
  const estado = normalizeLookup(
    cidade.estado || cidade.uf || cidade.sigla || cidade.subdivisao_nome || cidade.subdivisao?.nome
  );
  const full = `${nome} ${estado}`.trim();

  if (nome === term) return 0;
  if (label === term) return 1;
  if (nome.startsWith(term)) return 2;
  if (label.startsWith(term)) return 3;
  if (estado && estado.startsWith(term)) return 4;
  if (full.includes(term)) return 5;
  return 10;
}

export function sortCidades<T extends VendaFormOption>(items: T[], input = ''): T[] {
  return [...items].sort((a, b) => {
    const scoreDiff = getCidadeSearchScore(a, input) - getCidadeSearchScore(b, input);
    if (scoreDiff !== 0) return scoreDiff;

    const importanceDiff = getCidadeImportanceRank(a) - getCidadeImportanceRank(b);
    if (importanceDiff !== 0) return importanceDiff;

    const nomeDiff = PT_BR_BASE_COLLATOR.compare(String(a.nome || ''), String(b.nome || ''));
    if (nomeDiff !== 0) return nomeDiff;

    return PT_BR_BASE_COLLATOR.compare(
      String(a.estado || a.subdivisao_nome || ''),
      String(b.estado || b.subdivisao_nome || '')
    );
  });
}

/** Junta cidades por id recalculando o label e devolve ordenado (sortCidades sem termo). */
export function mergeCidadesById<T extends VendaFormOption>(atuais: T[], items: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of atuais) {
    byId.set(String(item.id), item);
  }
  for (const item of items) {
    const id = String(item?.id || '').trim();
    if (!id) continue;
    byId.set(id, {
      ...(byId.get(id) || {}),
      ...item,
      label: getCidadeLabel({ ...(byId.get(id) || {}), ...item })
    } as T);
  }
  return sortCidades(Array.from(byId.values()));
}
