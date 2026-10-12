// @ts-nocheck -- contém uma cópia congelada de código de página, tipada de forma frouxa de propósito
/**
 * Paridade da Fase 2.4: formulário de venda (nova / editar).
 *
 * `antigo()` é uma cópia CONGELADA das funções como estavam nas páginas
 * vendas/nova e vendas/[id]/editar antes da extração (idênticas nas duas).
 * `novo()` reproduz os repasses que as páginas fazem hoje para ./form.
 * Os dois recebem os mesmos dados e têm que produzir exatamente o mesmo
 * resultado, inclusive nas funções que alteram o estado da tela.
 * Não "atualize" antigo() junto com form.ts: ele é a referência de regra.
 */
import { expect, it } from 'vitest';
import { addMonthsISODate } from '$lib/date';
import {
  adicionarParcela, createPagamento, filtrarProdutosPorTipo, filtrarProdutosPorTipoCidade, gerarParcelas,
  getValeViagemProdutoVirtual as getValeViagemProdutoVirtualBase, isProdutoCompativelCidade as isProdutoCompativelCidadeBase,
  isValeViagemTipo as isValeViagemTipoBase, mergeCidadesById, mergeClientesById, produtoMatchesTipo as produtoMatchesTipoBase,
  removerParcela, valoresDaCalculadora, type VendaFormOption, type VendaFormCliente, type VendaCalculadoraResultado,
} from './form';

type Option = VendaFormOption; type Cliente = VendaFormCliente; type CalculadoraResultado = VendaCalculadoraResultado;

/* eslint-disable */
function antigo(st: any) {
  let { tipos, produtos, venda, pagamentos, clientes, cidades } = st;
  const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const PT_BR_BASE_COLLATOR = new Intl.Collator('pt-BR', { sensitivity: 'base' });
  const DIACRITICS_RE = /[\u0300-\u036f]/g;

  function createPagamento() {
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
      parcelas: [] as Array<{ numero: string; valor: string; vencimento: string }>
    };
  }

  function parseMoney(value: string | number | null | undefined) {
    const raw = String(value ?? '').trim().replace(/[^\d,.-]/g, '');
    const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatMoney(value: number) {
    return BRL_CURRENCY_FORMATTER.format(value || 0);
  }

  function normalizeText(value: string | null | undefined) {
    return String(value || '')
      .normalize('NFD')
      .replace(DIACRITICS_RE, '')
      .toLowerCase()
      .trim();
  }

  function isValeViagemProduto(item: Option) {
    const nome = normalizeText(String(item.nome || ''));
    return nome.includes('vale viagem');
  }

  function getSelectValue(event: Event) {
    return String((event.target as HTMLSelectElement | null)?.value || '');
  }

  function getClienteLabel(cliente: Cliente) {
    return `${cliente.nome}${cliente.cpf ? ` • ${cliente.cpf}` : ''}`;
  }

  function getCidadeLabel(cidade: Option) {
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

  function normalizeLookup(value: string | null | undefined) {
    return normalizeText(value);
  }

  function getCidadeImportanceRank(cidade: Option) {
    const parsed = Number(cidade?.grau_importancia);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 9999;
  }

  function getCidadeSearchScore(cidade: Option, input: string) {
    const term = normalizeLookup(input);
    if (!term) return 100;

    const nome = normalizeLookup(cidade.nome);
    const label = normalizeLookup(getCidadeLabel(cidade));
    const estado = normalizeLookup(cidade.estado || cidade.uf || cidade.sigla || cidade.subdivisao_nome || cidade.subdivisao?.nome);
    const full = `${nome} ${estado}`.trim();

    if (nome === term) return 0;
    if (label === term) return 1;
    if (nome.startsWith(term)) return 2;
    if (label.startsWith(term)) return 3;
    if (estado && estado.startsWith(term)) return 4;
    if (full.includes(term)) return 5;
    return 10;
  }

  function sortCidades(items: Option[], input = '') {
    return [...items].sort((a, b) => {
      const scoreDiff = getCidadeSearchScore(a, input) - getCidadeSearchScore(b, input);
      if (scoreDiff !== 0) return scoreDiff;

      const importanceDiff = getCidadeImportanceRank(a) - getCidadeImportanceRank(b);
      if (importanceDiff !== 0) return importanceDiff;

      const nomeDiff = PT_BR_BASE_COLLATOR.compare(String(a.nome || ''), String(b.nome || ''));
      if (nomeDiff !== 0) return nomeDiff;

      return PT_BR_BASE_COLLATOR.compare(String(a.estado || a.subdivisao_nome || ''), String(b.estado || b.subdivisao_nome || ''));
    });
  }

  function isValeViagemTipo(tipoId: string) {
    if (!tipoId) return false;
    const tipoSelecionado = tipos.find((item) => String(item.id) === String(tipoId));
    return [
      tipoId,
      String(tipoSelecionado?.nome || ''),
      String(tipoSelecionado?.tipo || '')
    ].some((value) => normalizeText(value).includes('vale viagem'));
  }

  function getValeViagemProdutoVirtual(tipoId: string): Option | null {
    if (!isValeViagemTipo(tipoId)) return null;
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

  function produtoMatchesTipo(item: Option, tipoId: string) {
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

  function isProdutoCompativelCidade(produto: Option, cidadeId = venda.destino_cidade_id) {
    if (!cidadeId) return produto.todas_as_cidades === true;
    if (produto.todas_as_cidades === true) return true;
    return String(produto.cidade_id) === String(cidadeId);
  }

  function getProdutosByTipo(tipoId: string) {
    return produtos.filter((item) => {
      const matchesTipo = produtoMatchesTipo(item, tipoId);
      return matchesTipo && isProdutoCompativelCidade(item);
    });
  }

  function getProdutosByTipoCidade(tipoId: string, cidadeId: string) {
    const filtered = produtos.filter((item) => {
      const matchesTipo = produtoMatchesTipo(item, tipoId);
      if (isValeViagemTipo(tipoId)) return matchesTipo || isValeViagemProduto(item);
      return matchesTipo && isProdutoCompativelCidade(item, cidadeId);
    });
    const valeViagemVirtual = getValeViagemProdutoVirtual(tipoId);
    if (!valeViagemVirtual) return filtered;
    if (filtered.some((item) => String(item.id) === String(valeViagemVirtual.id) || isValeViagemProduto(item))) {
      return filtered;
    }
    return [valeViagemVirtual, ...filtered];
  }

  function rebuildParcelas(index: number) {
    const pagamento = pagamentos[index];
    const quantidade = Math.max(1, Number(pagamento.parcelas_qtd || 1));
    const valorTotal = parseMoney(pagamento.valor_total);
    const valorParcela = quantidade > 0 ? valorTotal / quantidade : 0;
    const inicio = pagamento.vencimento_primeira || '';

    pagamento.parcelas = Array.from({ length: quantidade }).map((_, parcelaIndex) => {
      const vencimento = inicio ? addMonthsISODate(inicio, parcelaIndex) : '';

      return {
        numero: String(parcelaIndex + 1),
        valor: valorParcela ? valorParcela.toFixed(2) : '',
        vencimento
      };
    });

    pagamento.parcelas_valor = valorParcela ? valorParcela.toFixed(2) : '';
    pagamentos = pagamentos;
  }

  function addParcela(index: number) {
    const pagamento = pagamentos[index];
    pagamento.parcelas = [
      ...pagamento.parcelas,
      {
        numero: String(pagamento.parcelas.length + 1),
        valor: '',
        vencimento: ''
      }
    ];
    pagamento.parcelas_qtd = pagamento.parcelas.length;
    pagamentos = pagamentos;
  }

  function removeParcela(index: number, parcelaIndex: number) {
    const pagamento = pagamentos[index];
    pagamento.parcelas = pagamento.parcelas.filter((_, indexItem) => indexItem !== parcelaIndex);
    pagamento.parcelas = pagamento.parcelas.map((item, itemIndex) => ({
      ...item,
      numero: String(itemIndex + 1)
    }));
    pagamento.parcelas_qtd = Math.max(1, pagamento.parcelas.length || 1);
    pagamentos = pagamentos;
  }

  function mergeClientes(items: Cliente[]) {
    if (!items.length) return;
    const byId = new Map<string, Cliente>();
    for (const item of clientes) {
      byId.set(String(item.id), item);
    }
    for (const item of items) {
      const id = String(item?.id || '').trim();
      if (!id) continue;
      byId.set(id, { ...(byId.get(id) || {}), ...item });
    }
    clientes = Array.from(byId.values());
  }

  function mergeCidades(items: Option[]) {
    if (!items.length) return;
    const byId = new Map<string, Option>();
    for (const item of cidades) {
      byId.set(String(item.id), item);
    }
    for (const item of items) {
      const id = String(item?.id || '').trim();
      if (!id) continue;
      byId.set(id, { ...(byId.get(id) || {}), ...item, label: getCidadeLabel({ ...(byId.get(id) || {}), ...item }) });
    }
    cidades = sortCidades(Array.from(byId.values()));
  }

  function applyValoresCalculadora(resultado: CalculadoraResultado) {
    venda.valor_total = String(resultado.valorFinal || '');
    venda.valor_total_bruto = String(resultado.valorBruto || '');
    venda.desconto_comercial_aplicado = Number(resultado.descontoValor || 0) > 0;
    venda.desconto_comercial_valor = String(resultado.descontoValor || '');
    venda.valor_taxas = String(resultado.taxas || '');
  }

  return { isValeViagemTipo, getValeViagemProdutoVirtual, produtoMatchesTipo, isProdutoCompativelCidade, getProdutosByTipo, getProdutosByTipoCidade, rebuildParcelas, addParcela, removeParcela, mergeClientes, mergeCidades, applyValoresCalculadora, state: () => ({ pagamentos, clientes, cidades, venda }) };
}
function novo(st: any) {
  let { tipos, produtos, venda, pagamentos, clientes, cidades } = st;

  function isValeViagemTipo(tipoId: string) {
    return isValeViagemTipoBase(tipos, tipoId);
  }

  function getValeViagemProdutoVirtual(tipoId: string): Option | null {
    return getValeViagemProdutoVirtualBase(tipos, tipoId);
  }

  function produtoMatchesTipo(item: Option, tipoId: string) {
    return produtoMatchesTipoBase(tipos, item, tipoId);
  }

  function isProdutoCompativelCidade(produto: Option, cidadeId = venda.destino_cidade_id) {
    return isProdutoCompativelCidadeBase(produto, cidadeId);
  }

  function getProdutosByTipo(tipoId: string) {
    return filtrarProdutosPorTipo(produtos, tipos, tipoId, venda.destino_cidade_id);
  }

  function getProdutosByTipoCidade(tipoId: string, cidadeId: string): Option[] {
    return filtrarProdutosPorTipoCidade(produtos, tipos, tipoId, cidadeId);
  }

  function rebuildParcelas(index: number) {
    const pagamento = pagamentos[index];
    const { parcelas, parcelas_valor } = gerarParcelas(pagamento);
    pagamento.parcelas = parcelas;
    pagamento.parcelas_valor = parcelas_valor;
    pagamentos = pagamentos;
  }

  function addParcela(index: number) {
    const pagamento = pagamentos[index];
    const { parcelas, parcelas_qtd } = adicionarParcela(pagamento.parcelas);
    pagamento.parcelas = parcelas;
    pagamento.parcelas_qtd = parcelas_qtd;
    pagamentos = pagamentos;
  }

  function removeParcela(index: number, parcelaIndex: number) {
    const pagamento = pagamentos[index];
    const { parcelas, parcelas_qtd } = removerParcela(pagamento.parcelas, parcelaIndex);
    pagamento.parcelas = parcelas;
    pagamento.parcelas_qtd = parcelas_qtd;
    pagamentos = pagamentos;
  }

  function mergeClientes(items: Cliente[]) {
    if (!items.length) return;
    clientes = mergeClientesById(clientes, items);
  }

  function mergeCidades(items: Option[]) {
    if (!items.length) return;
    cidades = mergeCidadesById(cidades, items);
  }

  function applyValoresCalculadora(resultado: CalculadoraResultado) {
    const valores = valoresDaCalculadora(resultado);
    venda.valor_total = valores.valor_total;
    venda.valor_total_bruto = valores.valor_total_bruto;
    venda.desconto_comercial_aplicado = valores.desconto_comercial_aplicado;
    venda.desconto_comercial_valor = valores.desconto_comercial_valor;
    venda.valor_taxas = valores.valor_taxas;
  }

  return { isValeViagemTipo, getValeViagemProdutoVirtual, produtoMatchesTipo, isProdutoCompativelCidade, getProdutosByTipo, getProdutosByTipoCidade, rebuildParcelas, addParcela, removeParcela, mergeClientes, mergeCidades, applyValoresCalculadora, state: () => ({ pagamentos, clientes, cidades, venda }) };
}
const tipos = [
  { id: 't1', nome: 'Aéreo', tipo: 'aereo' }, { id: 't2', nome: 'Hotel', tipo: 'hotel' },
  { id: 't3', nome: 'Vale Viagem', tipo: 'vale' }, { id: 't4', nome: 'Pacote', tipo: null }, { id: 't5', nome: 'Seguro', tipo: 'seguro' },
];
const produtos = [
  { id: 'p1', nome: 'LATAM', tipo_produto: 't1', todas_as_cidades: true },
  { id: 'p2', nome: 'Hotel Rio', tipo_produto: 't2', cidade_id: 'c1' },
  { id: 'p3', nome: 'Hotel SP', tipo_produto: 't2', cidade_id: 'c2' },
  { id: 'p4', nome: 'Vale  Viagem Agência', tipo_produto: 'x' },
  { id: 'p5', nome: 'Pacote Nordeste', tipo: 'pacote', cidade_id: 'c1' },
  { id: 'p6', nome: 'Seguro', tipo_produto: 'SEGURO', todas_as_cidades: false },
  { id: 'p7', nome: 'Hotel sem cidade', tipo_produto: 't2' },
];
const cidades = [ { id: 'c1', nome: 'Rio de Janeiro', estado: 'RJ', grau_importancia: 2 }, { id: 'c2', nome: 'São Paulo', uf: 'SP', grau_importancia: 1 }, { id: 'c3', nome: 'Salvador', subdivisao: { sigla: 'BA' } } ];
const clientes = [ { id: 'k1', nome: 'Ana', cpf: '1' }, { id: 'k2', nome: 'Bia' } ];
const tipoIds = ['', 't1', 't2', 't3', 't4', 't5', 'vale viagem', 'nao-existe'];
const cidadeIds = ['', 'c1', 'c2', 'c9'];
const mk = (destino = '') => ({
  tipos, produtos, cidades: [...cidades], clientes: [...clientes],
  venda: { destino_cidade_id: destino, valor_total: '', valor_total_bruto: '', desconto_comercial_aplicado: false, desconto_comercial_valor: '', valor_taxas: '' },
  pagamentos: [ { ...createPagamento(), valor_total: '1.234,56', parcelas_qtd: 3, vencimento_primeira: '2026-01-31' }, { ...createPagamento(), valor_total: '100', parcelas_qtd: 0 }, { ...createPagamento(), valor_total: '', parcelas_qtd: '2' as any } ],
});
const clone = (v: any) => JSON.parse(JSON.stringify(v));

it('funções de consulta: antigo === novo', () => {
  let n = 0;
  for (const destino of cidadeIds) {
    const a = antigo(mk(destino)), b = novo(mk(destino));
    for (const t of tipoIds) {
      expect(b.isValeViagemTipo(t)).toEqual(a.isValeViagemTipo(t));
      expect(b.getValeViagemProdutoVirtual(t)).toEqual(a.getValeViagemProdutoVirtual(t));
      expect(b.getProdutosByTipo(t)).toEqual(a.getProdutosByTipo(t));
      for (const c of cidadeIds) expect(b.getProdutosByTipoCidade(t, c)).toEqual(a.getProdutosByTipoCidade(t, c));
      for (const p of produtos) { expect(b.produtoMatchesTipo(p, t)).toEqual(a.produtoMatchesTipo(p, t)); n++; }
    }
    for (const p of produtos) { expect(b.isProdutoCompativelCidade(p)).toEqual(a.isProdutoCompativelCidade(p)); for (const c of cidadeIds) expect(b.isProdutoCompativelCidade(p, c)).toEqual(a.isProdutoCompativelCidade(p, c)); }
  }
  expect(n).toBeGreaterThan(100);
});

it('funções que alteram estado: antigo === novo', () => {
  const ops: Array<(x: any) => void> = [
    (x) => x.rebuildParcelas(0), (x) => x.rebuildParcelas(1), (x) => x.rebuildParcelas(2),
    (x) => { x.rebuildParcelas(0); x.addParcela(0); x.removeParcela(0, 1); }, (x) => { x.addParcela(1); x.removeParcela(1, 0); x.removeParcela(1, 0); },
    (x) => x.mergeClientes([]), (x) => x.mergeClientes([{ id: 'k2', nome: 'Bia 2', cpf: '9' }, { id: ' ', nome: 'x' }, { id: 'k3', nome: 'Caio' }]),
    (x) => x.mergeCidades([]), (x) => x.mergeCidades([{ id: 'c3', nome: 'Salvador', estado: 'BA', grau_importancia: 1 }, { id: 'c4', nome: 'Aracaju', label: 'Aracaju - SE' }]),
    (x) => x.applyValoresCalculadora({ valorFinal: 1000, valorBruto: '1100', descontoValor: 100, taxas: 0 }), (x) => x.applyValoresCalculadora({}),
  ];
  for (const op of ops) {
    const sa = mk('c1'), sb = mk('c1');
    const a = antigo(sa), b = novo(sb);
    op(a); op(b);
    expect(clone(b.state())).toEqual(clone(a.state()));
  }
});
