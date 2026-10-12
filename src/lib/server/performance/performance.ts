/**
 * Relatório de performance da agência.
 *
 * Só agrega; não busca dados. Definições confirmadas pelo usuário:
 * - Venda: as mesmas contribuições por recibo do Ranking/Dashboard (`fetchVendasKpiReciboContributions`), valor bruto.
 * - Venda RA = vendas REXTUR (recibo "REXTUR"). Business "Consolidadora" = REXTUR.
 * - Nacional = destino em cidade do Brasil; Internacional = destino fora do Brasil.
 * - Marítimo = produto do tipo Cruzeiro.
 * - Produto = o tipo do produto no cadastro (tipo_produtos), como nas vendas.
 * - Meta até D-1 = meta do mês proporcional aos dias corridos até o dia de corte.
 * - Passageiros = passageiros cadastrados na venda, sem repetir na mesma venda.
 * - Orçamentos = orçamentos cadastrados no VTUR (tabela quote); conversão igual à da tela de Orçamentos
 *   (aprovados + fechados ÷ total).
 */

export type Business = 'Nacional' | 'Internacional' | 'Marítimo' | 'Consolidadora' | 'Não informado';

export type ContribuicaoPerformance = {
  vendaId: string | null;
  vendaKey: string;
  reciboNumero: string | null;
  vendedorId: string | null;
  produtoNome: string | null;
  bruto: number;
  taxas: number;
  /** País do destino (null = sem destino cadastrado). */
  destinoPais: string | null;
  destinoCidade: string | null;
  /** Data de embarque (ISO). */
  embarque: string | null;
};

export type PassageiroVenda = { vendaId: string; clienteId: string; nascimento: string | null };
export type PagamentoVenda = { vendaId: string; forma: string; valor: number };

export type OrcamentoPerformance = {
  id: string;
  status: 'novo' | 'pendente' | 'enviado' | 'aprovado' | 'rejeitado' | 'expirado' | 'fechado';
  produtos: string[];
  destinoPais: string | null;
  destinoCidade: string | null;
  embarque: string | null;
};

export type EntradaPerformance = {
  corte: string; // AAAA-MM-DD (último dia considerado)
  diasNoMes: number;
  diasAteCorte: number;
  meta: number;
  focoLiquido: boolean;
  usarTaxasNaMeta: boolean;
  nomesVendedores: Record<string, string>;
  atual: ContribuicaoPerformance[];
  anoAnterior: ContribuicaoPerformance[];
  passageiros: PassageiroVenda[];
  passageirosAnoAnterior: PassageiroVenda[];
  pagamentos: PagamentoVenda[];
  orcamentos: OrcamentoPerformance[];
  orcamentosMesAnterior: OrcamentoPerformance[];
};

const pct = (parte: number, total: number) => (total > 0 ? (parte / total) * 100 : 0);
const variacao = (atual: number, anterior: number) => (anterior > 0 ? ((atual - anterior) / anterior) * 100 : null);

function semAcento(texto: string) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function isRextur(reciboNumero: string | null | undefined) {
  return String(reciboNumero || '').toUpperCase().includes('REXTUR');
}

export function isBrasil(pais: string | null | undefined) {
  const p = semAcento(String(pais || ''));
  return p === 'brasil' || p === 'brazil';
}

export function isCruzeiro(produto: string | null | undefined) {
  return semAcento(String(produto || '')).includes('cruzeiro');
}

/** Consolidadora (REXTUR) > Marítimo (cruzeiro) > Nacional/Internacional pelo país do destino. */
export function businessDaContribuicao(c: Pick<ContribuicaoPerformance, 'reciboNumero' | 'produtoNome' | 'destinoPais'>): Business {
  if (isRextur(c.reciboNumero)) return 'Consolidadora';
  if (isCruzeiro(c.produtoNome)) return 'Marítimo';
  if (!c.destinoPais) return 'Não informado';
  return isBrasil(c.destinoPais) ? 'Nacional' : 'Internacional';
}

function businessGeografico(pais: string | null): 'Nacional' | 'Internacional' | 'Não informado' {
  if (!pais) return 'Não informado';
  return isBrasil(pais) ? 'Nacional' : 'Internacional';
}

export function idadeEm(nascimento: string | null, referencia: string): number | null {
  const n = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(nascimento || ''));
  const r = /^(\d{4})-(\d{2})-(\d{2})/.exec(referencia);
  if (!n || !r) return null;
  let idade = Number(r[1]) - Number(n[1]);
  if (Number(r[2]) < Number(n[2]) || (r[2] === n[2] && Number(r[3]) < Number(n[3]))) idade -= 1;
  return idade >= 0 && idade < 130 ? idade : null;
}

export const FAIXAS_ETARIAS = ['Até 17', '18 a 25', '26 a 35', '36 a 45', '46 a 60', '61 +'] as const;

export function faixaEtaria(idade: number): (typeof FAIXAS_ETARIAS)[number] {
  if (idade <= 17) return 'Até 17';
  if (idade <= 25) return '18 a 25';
  if (idade <= 35) return '26 a 35';
  if (idade <= 45) return '36 a 45';
  if (idade <= 60) return '46 a 60';
  return '61 +';
}

/** Passageiros distintos por venda (o mesmo cliente em várias viagens da venda conta 1 vez). */
function paxPorVenda(passageiros: PassageiroVenda[]) {
  const mapa = new Map<string, Map<string, string | null>>();
  for (const p of passageiros) {
    const m = mapa.get(p.vendaId) || new Map<string, string | null>();
    if (!m.has(p.clienteId)) m.set(p.clienteId, p.nascimento);
    mapa.set(p.vendaId, m);
  }
  return mapa;
}

function somaPorChave<T>(itens: T[], chave: (i: T) => string, valor: (i: T) => number) {
  const m = new Map<string, number>();
  for (const i of itens) m.set(chave(i), (m.get(chave(i)) || 0) + valor(i));
  return m;
}

function ranking(m: Map<string, number>, total: number, limite: number) {
  return Array.from(m.entries())
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limite)
    .map(([nome, valor]) => ({ nome, valor, pct: pct(valor, total) }));
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** % do valor por mês de embarque, marcando ano atual / próximo ano / anterior em relação ao ano do relatório. */
function antecipacao<T>(itens: T[], embarque: (i: T) => string | null, valor: (i: T) => number, anoRelatorio: number) {
  const total = itens.reduce((s, i) => s + valor(i), 0);
  const m = new Map<string, number>();
  for (const i of itens) {
    const e = /^(\d{4})-(\d{2})/.exec(String(embarque(i) || ''));
    const chave = e ? `${e[1]}-${e[2]}` : 'sem-data';
    m.set(chave, (m.get(chave) || 0) + valor(i));
  }
  return Array.from(m.entries())
    .filter(([, v]) => v !== 0)
    .sort((a, b) => b[1] - a[1])
    .map(([chave, v]) => {
      if (chave === 'sem-data') return { mes: 'sem data', ano: 'Sem data', pct: pct(v, total) };
      const [ano, mes] = chave.split('-').map(Number);
      const rotuloAno = ano === anoRelatorio ? 'Ano atual' : ano === anoRelatorio + 1 ? 'Próximo ano' : String(ano);
      return { mes: MESES[mes - 1], ano: rotuloAno, anoNumero: ano, pct: pct(v, total) };
    });
}

export function montarRelatorioPerformance(e: EntradaPerformance) {
  const anoRelatorio = Number(e.corte.slice(0, 4));
  const totalBruto = e.atual.reduce((s, c) => s + c.bruto, 0);
  const totalTaxas = e.atual.reduce((s, c) => s + c.taxas, 0);
  const totalAnoAnterior = e.anoAnterior.reduce((s, c) => s + c.bruto, 0);
  // Mesma base de meta do Ranking: líquido por padrão; bruto se "usar taxas na meta" (e não foco líquido).
  const baseMeta = e.focoLiquido ? totalBruto - totalTaxas : e.usarTaxasNaMeta ? totalBruto : totalBruto - totalTaxas;
  const metaAteCorte = e.diasNoMes > 0 ? (e.meta * e.diasAteCorte) / e.diasNoMes : 0;

  const pax = paxPorVenda(e.passageiros);
  const paxAnterior = paxPorVenda(e.passageirosAnoAnterior);
  const vendasAtuais = new Set(e.atual.map((c) => c.vendaId).filter((v): v is string => Boolean(v)));
  const vendasAnteriores = new Set(e.anoAnterior.map((c) => c.vendaId).filter((v): v is string => Boolean(v)));
  const contarPax = (ids: Iterable<string>, mapa: Map<string, Map<string, string | null>>) => {
    let n = 0;
    for (const id of ids) n += mapa.get(id)?.size || 0;
    return n;
  };
  const passageiros = contarPax(vendasAtuais, pax);
  const passageirosAnoAnterior = contarPax(vendasAnteriores, paxAnterior);
  const ticket = passageiros > 0 ? totalBruto / passageiros : 0;
  const ticketAnterior = passageirosAnoAnterior > 0 ? totalAnoAnterior / passageirosAnoAnterior : 0;

  const rextur = e.atual.filter((c) => isRextur(c.reciboNumero)).reduce((s, c) => s + c.bruto, 0);
  const rexturAnterior = e.anoAnterior.filter((c) => isRextur(c.reciboNumero)).reduce((s, c) => s + c.bruto, 0);

  // Vendedores
  const porVendedor = somaPorChave(e.atual.filter((c) => c.vendedorId), (c) => String(c.vendedorId), (c) => c.bruto);
  const topVendedores = ranking(porVendedor, totalBruto, 10).map((v) => ({ ...v, nome: e.nomesVendedores[v.nome] || 'Sem nome' }));

  // Produtos (tipo do produto)
  const nomeProduto = (c: ContribuicaoPerformance) => c.produtoNome?.trim() || 'Sem tipo';
  const porProduto = somaPorChave(e.atual, nomeProduto, (c) => c.bruto);
  const porProdutoAnterior = somaPorChave(e.anoAnterior, nomeProduto, (c) => c.bruto);
  const vendasPorProduto = new Map<string, Set<string>>();
  for (const c of e.atual) {
    if (!c.vendaId) continue;
    const s = vendasPorProduto.get(nomeProduto(c)) || new Set<string>();
    s.add(c.vendaId);
    vendasPorProduto.set(nomeProduto(c), s);
  }
  const businessPorProduto = new Map<string, Map<Business, number>>();
  for (const c of e.atual) {
    const m = businessPorProduto.get(nomeProduto(c)) || new Map<Business, number>();
    const b = businessDaContribuicao(c);
    m.set(b, (m.get(b) || 0) + c.bruto);
    businessPorProduto.set(nomeProduto(c), m);
  }
  const produtos = Array.from(porProduto.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([nome, venda]) => {
      const p = contarPax(vendasPorProduto.get(nome) || [], pax);
      const bm = businessPorProduto.get(nome) || new Map();
      return {
        nome,
        venda,
        variacaoAnoAnterior: variacao(venda, porProdutoAnterior.get(nome) || 0),
        passageiros: p,
        ticketMedio: p > 0 ? venda / p : null,
        business: Object.fromEntries(Array.from(bm.entries()).map(([k, v]) => [k, pct(v, venda)])) as Partial<Record<Business, number>>
      };
    });

  // Business da venda
  const porBusiness = somaPorChave(e.atual, businessDaContribuicao, (c) => c.bruto);
  const business = (['Nacional', 'Internacional', 'Marítimo', 'Consolidadora', 'Não informado'] as Business[])
    .map((b) => ({ nome: b, valor: porBusiness.get(b) || 0, pct: pct(porBusiness.get(b) || 0, totalBruto) }))
    .filter((b) => b.nome !== 'Não informado' || b.valor > 0);

  // Faixa etária (passageiros das vendas do mês)
  const faixas = new Map<string, number>();
  let comIdade = 0;
  for (const id of vendasAtuais) {
    for (const nascimento of pax.get(id)?.values() || []) {
      const idade = idadeEm(nascimento, e.corte);
      if (idade === null) continue;
      comIdade += 1;
      const f = faixaEtaria(idade);
      faixas.set(f, (faixas.get(f) || 0) + 1);
    }
  }
  const faixaEtariaLista = FAIXAS_ETARIAS.map((f) => ({ nome: f, quantidade: faixas.get(f) || 0, pct: pct(faixas.get(f) || 0, comIdade) }))
    .filter((f) => f.nome !== 'Até 17' || f.quantidade > 0);

  // Formas de pagamento
  const pagamentos = e.pagamentos.filter((p) => vendasAtuais.has(p.vendaId));
  const totalPago = pagamentos.reduce((s, p) => s + p.valor, 0);
  const formas = ranking(somaPorChave(pagamentos, (p) => p.forma?.trim() || 'Não informado', (p) => p.valor), totalPago, 5);

  // Destinos e antecipação (nacional x internacional, pelo país do destino; REXTUR e cruzeiro incluídos pelo destino)
  const nacionais = e.atual.filter((c) => businessGeografico(c.destinoPais) === 'Nacional');
  const internacionais = e.atual.filter((c) => businessGeografico(c.destinoPais) === 'Internacional');
  const destinoNome = (c: ContribuicaoPerformance) => (c.destinoCidade || 'Sem cidade').toUpperCase();
  const totalNac = nacionais.reduce((s, c) => s + c.bruto, 0);
  const totalInt = internacionais.reduce((s, c) => s + c.bruto, 0);

  // Orçamentos
  const orc = montarOrcamentos(e.orcamentos, e.orcamentosMesAnterior, anoRelatorio);

  return {
    corte: e.corte,
    vendas: {
      vendaMes: totalBruto,
      variacaoAnoAnterior: variacao(totalBruto, totalAnoAnterior),
      metaAteCorte,
      gapAteCorte: baseMeta - metaAteCorte,
      metaMes: e.meta,
      gapMes: baseMeta - e.meta,
      icmAteCorte: pct(baseMeta, metaAteCorte),
      icmMes: pct(baseMeta, e.meta),
      passageiros,
      variacaoPassageiros: variacao(passageiros, passageirosAnoAnterior),
      ticketMedio: ticket,
      variacaoTicket: variacao(ticket, ticketAnterior),
      vendaRA: rextur,
      variacaoVendaRA: variacao(rextur, rexturAnterior)
    },
    topVendedores,
    produtos,
    totalProdutos: {
      venda: totalBruto,
      variacaoAnoAnterior: variacao(totalBruto, totalAnoAnterior),
      passageiros,
      ticketMedio: passageiros > 0 ? totalBruto / passageiros : null
    },
    business,
    faixaEtaria: faixaEtariaLista,
    formasPagamento: formas,
    topDestinosNacional: ranking(somaPorChave(nacionais, destinoNome, (c) => c.bruto), totalNac, 10),
    topDestinosInternacional: ranking(somaPorChave(internacionais, destinoNome, (c) => c.bruto), totalInt, 10),
    antecipacaoNacional: antecipacao(nacionais, (c) => c.embarque, (c) => c.bruto, anoRelatorio),
    antecipacaoInternacional: antecipacao(internacionais, (c) => c.embarque, (c) => c.bruto, anoRelatorio),
    orcamentos: orc
  };
}

function convertido(o: OrcamentoPerformance) {
  return o.status === 'aprovado' || o.status === 'fechado';
}

function montarOrcamentos(atual: OrcamentoPerformance[], anterior: OrcamentoPerformance[], anoRelatorio: number) {
  const geo = (o: OrcamentoPerformance) => businessGeografico(o.destinoPais);
  const produtosDe = (o: OrcamentoPerformance) => (o.produtos.length > 0 ? o.produtos : ['Sem produto']);

  type Linha = { total: number; convertidos: number; anterior: number };
  const nova = (): Linha => ({ total: 0, convertidos: 0, anterior: 0 });
  const tabela = new Map<string, Record<'Internacional' | 'Nacional' | 'Total', Linha>>();
  const linha = (produto: string) => {
    const l = tabela.get(produto) || { Internacional: nova(), Nacional: nova(), Total: nova() };
    tabela.set(produto, l);
    return l;
  };
  const totais = { Internacional: nova(), Nacional: nova(), Total: nova() };

  for (const o of atual) {
    const g = geo(o);
    for (const p of produtosDe(o)) {
      const l = linha(p);
      l.Total.total += 1;
      if (convertido(o)) l.Total.convertidos += 1;
      if (g !== 'Não informado') {
        l[g].total += 1;
        if (convertido(o)) l[g].convertidos += 1;
      }
    }
    totais.Total.total += 1;
    if (convertido(o)) totais.Total.convertidos += 1;
    if (g !== 'Não informado') {
      totais[g].total += 1;
      if (convertido(o)) totais[g].convertidos += 1;
    }
  }
  for (const o of anterior) {
    const g = geo(o);
    for (const p of produtosDe(o)) {
      const l = linha(p);
      l.Total.anterior += 1;
      if (g !== 'Não informado') l[g].anterior += 1;
    }
    totais.Total.anterior += 1;
    if (g !== 'Não informado') totais[g].anterior += 1;
  }

  const fmt = (l: Linha) => ({
    quantidade: l.total,
    variacaoMesAnterior: variacao(l.total, l.anterior),
    conversao: pct(l.convertidos, l.total)
  });

  const porProduto = Array.from(tabela.entries())
    .filter(([, l]) => l.Total.total > 0)
    .sort((a, b) => b[1].Total.total - a[1].Total.total || a[0].localeCompare(b[0]))
    .map(([nome, l]) => ({ nome, internacional: fmt(l.Internacional), nacional: fmt(l.Nacional), total: fmt(l.Total) }));

  const destinos = (g: 'Nacional' | 'Internacional') => {
    const lista = atual.filter((o) => geo(o) === g);
    const m = new Map<string, { n: number; conv: number }>();
    for (const o of lista) {
      const nome = (o.destinoCidade || 'Sem cidade').toUpperCase();
      const v = m.get(nome) || { n: 0, conv: 0 };
      v.n += 1;
      if (convertido(o)) v.conv += 1;
      m.set(nome, v);
    }
    return {
      total: lista.length,
      conversao: pct(lista.filter(convertido).length, lista.length),
      itens: Array.from(m.entries())
        .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
        .slice(0, 10)
        .map(([nome, v]) => ({ nome, pct: pct(v.n, lista.length), conversao: pct(v.conv, v.n) }))
    };
  };

  const nac = atual.filter((o) => geo(o) === 'Nacional');
  const int = atual.filter((o) => geo(o) === 'Internacional');
  const comGeo = nac.length + int.length;

  return {
    total: atual.length,
    porProduto,
    totais: { internacional: fmt(totais.Internacional), nacional: fmt(totais.Nacional), total: fmt(totais.Total) },
    business: [
      { nome: 'Nacional', pct: pct(nac.length, comGeo) },
      { nome: 'Internacional', pct: pct(int.length, comGeo) }
    ],
    topDestinosNacional: destinos('Nacional'),
    topDestinosInternacional: destinos('Internacional'),
    antecipacaoNacional: antecipacao(nac, (o) => o.embarque, () => 1, anoRelatorio),
    antecipacaoInternacional: antecipacao(int, (o) => o.embarque, () => 1, anoRelatorio)
  };
}

export type RelatorioPerformance = ReturnType<typeof montarRelatorioPerformance>;
