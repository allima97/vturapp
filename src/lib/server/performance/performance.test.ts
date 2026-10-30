import { describe, expect, it } from 'vitest';
import {
  businessDaContribuicao,
  faixaEtaria,
  idadeEm,
  montarRelatorioPerformance,
  type ContribuicaoPerformance,
  type EntradaPerformance,
} from './performance';

const c = (o: Partial<ContribuicaoPerformance>): ContribuicaoPerformance => ({
  vendaId: 'v1', vendaKey: 'v1', reciboNumero: '100', vendedorId: 'u1', produtoNome: 'Terrestre',
  bruto: 0, taxas: 0, destinoPais: 'Brasil', destinoCidade: 'Maceió', embarque: '2026-12-10', ...o,
});

function entrada(o: Partial<EntradaPerformance> = {}): EntradaPerformance {
  return {
    corte: '2026-09-24', diasNoMes: 30, diasAteCorte: 24, meta: 30000, focoLiquido: false, usarTaxasNaMeta: true,
    nomesVendedores: { u1: 'Ana', u2: 'Bruno' },
    atual: [], anoAnterior: [], passageiros: [], passageirosAnoAnterior: [], pagamentos: [],
    orcamentos: [], orcamentosMesAnterior: [], ...o,
  };
}

describe('Relatório de Performance: regras confirmadas pelo usuário', () => {
  it('business: REXTUR = Consolidadora; cruzeiro = Marítimo; Brasil = Nacional; resto Internacional', () => {
    expect(businessDaContribuicao(c({ reciboNumero: 'REXTUR', destinoPais: 'Portugal' }))).toBe('Consolidadora');
    expect(businessDaContribuicao(c({ produtoNome: 'Cruzeiro', destinoPais: 'Brasil' }))).toBe('Marítimo');
    expect(businessDaContribuicao(c({ destinoPais: 'Brazil' }))).toBe('Nacional');
    expect(businessDaContribuicao(c({ destinoPais: 'Italy' }))).toBe('Internacional');
    expect(businessDaContribuicao(c({ destinoPais: null }))).toBe('Não informado');
  });

  it('meta até D-1 por dias corridos, ICM e gap; variação sobre o ano anterior', () => {
    const r = montarRelatorioPerformance(entrada({
      atual: [c({ bruto: 18000 }), c({ vendaId: 'v2', vendaKey: 'v2', reciboNumero: 'REXTUR', bruto: 2000, vendedorId: 'u2' })],
      anoAnterior: [c({ bruto: 16000 }), c({ reciboNumero: 'REXTUR', bruto: 4000 })],
    }));
    expect(r.vendas.vendaMes).toBe(20000);
    expect(r.vendas.metaAteCorte).toBe(24000);
    expect(r.vendas.icmAteCorte).toBeCloseTo(83.333, 2);
    expect(r.vendas.icmMes).toBeCloseTo(66.667, 2);
    expect(r.vendas.gapAteCorte).toBe(-4000);
    expect(r.vendas.gapMes).toBe(-10000);
    expect(r.vendas.variacaoAnoAnterior).toBe(0);
    expect(r.topVendedores.map((v) => [v.nome, v.pct])).toEqual([['Ana', 90], ['Bruno', 10]]);
  });

  it('meta sobre o líquido quando o parâmetro não usa taxas (mesma base do Ranking)', () => {
    const r = montarRelatorioPerformance(entrada({ usarTaxasNaMeta: false, atual: [c({ bruto: 10000, taxas: 1000 })] }));
    expect(r.vendas.vendaMes).toBe(10000);
    expect(r.vendas.icmMes).toBe(30);
  });

  it('passageiros: distintos por venda; ticket = venda ÷ passageiros; faixa etária no corte', () => {
    const r = montarRelatorioPerformance(entrada({
      atual: [c({ bruto: 6000 }), c({ bruto: 2000, produtoNome: 'Seguro Viagem' })],
      passageiros: [
        { vendaId: 'v1', clienteId: 'a', nascimento: '1960-01-01' },
        { vendaId: 'v1', clienteId: 'a', nascimento: '1960-01-01' },
        { vendaId: 'v1', clienteId: 'b', nascimento: '2000-09-25' },
      ],
    }));
    expect(r.vendas.passageiros).toBe(2);
    expect(r.vendas.ticketMedio).toBe(4000);
    expect(r.produtos.map((p) => [p.nome, p.passageiros])).toEqual([['Terrestre', 2], ['Seguro Viagem', 2]]);
    expect(r.faixaEtaria.filter((f) => f.quantidade).map((f) => [f.nome, f.pct])).toEqual([['18 a 25', 50], ['61 +', 50]]);
    expect(idadeEm('2000-09-25', '2026-09-24')).toBe(25);
    expect(faixaEtaria(61)).toBe('61 +');
  });

  it('destinos e antecipação separados em nacional e internacional', () => {
    const r = montarRelatorioPerformance(entrada({
      atual: [
        c({ bruto: 300, destinoCidade: 'Maceió', embarque: '2026-12-01' }),
        c({ bruto: 100, destinoCidade: 'Recife', embarque: '2027-01-05' }),
        c({ bruto: 500, destinoPais: 'Portugal', destinoCidade: 'Lisboa', embarque: '2026-10-01' }),
      ],
    }));
    expect(r.topDestinosNacional.map((d) => [d.nome, d.pct])).toEqual([['MACEIÓ', 75], ['RECIFE', 25]]);
    expect(r.topDestinosInternacional[0]).toMatchObject({ nome: 'LISBOA', pct: 100 });
    expect(r.antecipacaoNacional.map((a) => [a.mes, a.ano, a.pct])).toEqual([['dez', 'Ano atual', 75], ['jan', 'Próximo ano', 25]]);
  });

  it('orçamentos: por produto e business, conversão (aprovado + fechado) e variação sobre o mês anterior', () => {
    const o = (id: string, status: any, produtos: string[], destinoPais: string | null) => ({ id, status, produtos, destinoPais, destinoCidade: 'X', embarque: null });
    const r = montarRelatorioPerformance(entrada({
      orcamentos: [o('1', 'fechado', ['Hotel'], 'Brasil'), o('2', 'enviado', ['Hotel'], 'Brasil'), o('3', 'aprovado', ['Hotel', 'Aéreo'], 'Chile'), o('4', 'enviado', ['Aéreo'], null)],
      orcamentosMesAnterior: [o('9', 'enviado', ['Hotel'], 'Brasil')],
    }));
    const hotel = r.orcamentos.porProduto.find((p) => p.nome === 'Hotel')!;
    expect(hotel.total).toEqual({ quantidade: 3, variacaoMesAnterior: 200, conversao: (2 / 3) * 100 });
    expect(hotel.nacional.quantidade).toBe(2);
    expect(hotel.internacional.quantidade).toBe(1);
    expect(r.orcamentos.totais.total.quantidade).toBe(4);
    expect(r.orcamentos.totais.total.conversao).toBe(50);
    expect(r.orcamentos.business).toEqual([{ nome: 'Nacional', pct: (2 / 3) * 100 }, { nome: 'Internacional', pct: (1 / 3) * 100 }]);
  });
});
