/**
 * F4-05 — Testes do gerador de comprovante HTML e da rota GET /:id/pdf.
 *
 * Suíte K (unit — puro TypeScript, sem Workers):
 *   K1. Conteúdo: número da venda aparece no HTML
 *   K2. Conteúdo: valores em BRL formatados corretamente (centavos ÷ 100)
 *   K3. Conteúdo: data no formato DD/MM/YYYY
 *   K4. Conteúdo: câmbio com 4 decimais
 *   K5. Conteúdo: venda cancelada exibe banner de cancelamento
 *   K6. Conteúdo: venda sem itens não quebra o HTML
 *   K7. Conteúdo: escaping de caracteres HTML em campos de texto
 *   K8. Conteúdo: logo VTUR presente (data-URL)
 *   K9. Conteúdo: botão de impressão presente (oculto em @media print)
 *   K10. Conteúdo: valor "a receber" = total − pago (nunca negativo)
 *   K11. Quebra de página: classes page-break-inside presentes nas tabelas
 *
 * Executar: npx vitest run src/lib/server/vendas/vendas-pdf.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  gerarComprovanteHtml,
  formatarBRL,
  formatarData,
  formatarCambio,
} from './pdf';
import type { VendaDetalhe } from './service';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de fixture
// ─────────────────────────────────────────────────────────────────────────────

function vendaBase(overrides: Partial<VendaDetalhe> = {}): VendaDetalhe {
  return {
    id: 42,
    empresaId: 1,
    vendedorId: 'usr-1',
    clienteId: null,
    produtoId: null,
    numeroVenda: 'VD-2024-0042',
    dataVenda: '2024-11-01',
    dataLancamento: '2024-11-01',
    dataEmbarque: '2024-12-20',
    dataFinal: '2024-12-27',
    destino: 'Cancún',
    cancelada: false,
    descontoComercialAplicado: false,
    descontoComercialCentavos: 0,
    valorBrutoCentavos: 600000,
    valorTaxasCentavos: 5000,
    valorTotalCentavos: 605000,
    valorPagoCentavos: 201667,
    valorNaoComissionadoCentavos: 0,
    notas: null,
    chaveIdempotencia: null,
    versao: 1,
    criadoEm: '2024-11-01T10:00:00Z',
    atualizadoEm: '2024-11-01T10:00:00Z',
    status: 'confirmada',
    itens: [
      {
        id: 1,
        vendaId: 42,
        empresaId: 1,
        produtoId: null,
        numeroRecibo: 'REC-001',
        numeroReserva: null,
        dataServico: '2024-12-20',
        dataFimServico: null,
        pax: 2,
        descricao: 'Pacote Cancún 7 noites',
        tipo: 'pacote',
        moeda: 'BRL',
        cambioCentavos: 10000,
        valorNetoCentavos: 500000,
        valorBrutoCentavos: 600000,
        valorTaxasCentavos: 5000,
        valorTotalCentavos: 605000,
        pagaComissao: true,
        notas: null,
        criadoEm: '2024-11-01T10:00:00Z',
      },
    ],
    pagamentos: [
      {
        id: 1,
        vendaId: 42,
        empresaId: 1,
        formaPagamentoId: null,
        formaNome: 'Cartão de Crédito',
        operacao: 'debito',
        plano: '3x',
        valorBrutoCentavos: 605000,
        descontoCentavos: 0,
        valorTotalCentavos: 605000,
        parcelasQtd: 3,
        parcelasValorCentavos: 201667,
        pagaComissao: true,
        criadoEm: '2024-11-01T10:00:00Z',
        parcelas: [
          { id: 1, vendaPagamentoId: 1, empresaId: 1, numero: 1, valorCentavos: 201667, vencimento: '2024-12-01' },
          { id: 2, vendaPagamentoId: 1, empresaId: 1, numero: 2, valorCentavos: 201667, vencimento: '2025-01-01' },
          { id: 3, vendaPagamentoId: 1, empresaId: 1, numero: 3, valorCentavos: 201666, vencimento: '2025-02-01' },
        ],
      },
    ],
    ...overrides,
  } as VendaDetalhe;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suíte K — gerador de HTML (unit)
// ─────────────────────────────────────────────────────────────────────────────

describe('K. PDF — comprovante de venda (unit)', () => {

  // ── formatadores ──────────────────────────────────────────────────────────

  it('K1. formatarBRL converte centavos para R$', () => {
    expect(formatarBRL(605000)).toMatch('6.050,00');
    expect(formatarBRL(0)).toMatch('0,00');
    expect(formatarBRL(1)).toMatch('0,01');
    expect(formatarBRL(100)).toMatch('1,00');
  });

  it('K2. formatarData converte YYYY-MM-DD para DD/MM/YYYY', () => {
    expect(formatarData('2024-11-01')).toBe('01/11/2024');
    expect(formatarData('2024-12-20')).toBe('20/12/2024');
    expect(formatarData(null)).toBe('—');
    expect(formatarData(undefined)).toBe('—');
  });

  it('K3. formatarCambio divide por 10000 e formata com 4 casas', () => {
    expect(formatarCambio(10000)).toBe('1,0000');  // câmbio 1:1
    expect(formatarCambio(53210)).toBe('5,3210');  // USD/BRL ~5,32
    expect(formatarCambio(null)).toBe('—');
  });

  // ── conteúdo HTML ─────────────────────────────────────────────────────────

  it('K4. número da venda aparece no HTML', () => {
    const html = gerarComprovanteHtml(vendaBase());
    expect(html).toContain('VD-2024-0042');
  });

  it('K5. valor total centavos formatado como R$ 6.050,00', () => {
    const html = gerarComprovanteHtml(vendaBase());
    expect(html).toContain('6.050,00');
  });

  it('K6. data de venda formatada como 01/11/2024', () => {
    const html = gerarComprovanteHtml(vendaBase());
    expect(html).toContain('01/11/2024');
  });

  it('K7. câmbio 1:1 exibido como 1,0000', () => {
    const html = gerarComprovanteHtml(vendaBase());
    expect(html).toContain('1,0000');
  });

  it('K8. venda cancelada exibe banner de cancelamento', () => {
    const html = gerarComprovanteHtml(vendaBase({ cancelada: true, status: 'cancelada' }));
    expect(html).toContain('VENDA CANCELADA');
    expect(html).toContain('cancelada-banner');
  });

  it('K9. venda ativa não exibe banner de cancelamento', () => {
    const html = gerarComprovanteHtml(vendaBase());
    expect(html).not.toContain('VENDA CANCELADA');
  });

  it('K10. venda sem itens não quebra o HTML (placeholder visível)', () => {
    const html = gerarComprovanteHtml(vendaBase({ itens: [] }));
    expect(html).toContain('Nenhum item');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('K11. escaping: caracteres HTML em campos de texto não geram tags abertas', () => {
    const html = gerarComprovanteHtml(vendaBase({
      destino: '<script>alert(1)</script>',
      // numeroVenda com & para testar &amp;
      numeroVenda: 'VD & TEST',
    }));
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('VD &amp; TEST');
  });

  it('K12. logo injetada via opts aparece no src', () => {
    const fakeLogoUrl = 'data:image/png;base64,AAAA';
    const html = gerarComprovanteHtml(vendaBase(), { logoUrl: fakeLogoUrl });
    expect(html).toContain('data:image/png;base64,AAAA');
  });

  it('K12b. sem logoUrl não quebra o HTML (src vazio)', () => {
    const html = gerarComprovanteHtml(vendaBase());
    expect(html).toContain('<img src=""');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('K13. botão de impressão presente com classe no-print', () => {
    const html = gerarComprovanteHtml(vendaBase());
    expect(html).toContain('window.print()');
    expect(html).toContain('no-print');
  });

  it('K14. valor a receber = total − pago (R$ 4.033,33)', () => {
    // 605000 - 201667 = 403333 centavos = R$ 4.033,33
    const html = gerarComprovanteHtml(vendaBase());
    expect(html).toContain('4.033,33');
  });

  it('K15. valor a receber nunca negativo (pago > total)', () => {
    const html = gerarComprovanteHtml(vendaBase({
      valorTotalCentavos: 100,
      valorPagoCentavos: 9999,
    }));
    // Math.max(0, 100 - 9999) = 0 → R$ 0,00
    // O HTML deve conter "0,00" para o campo "A Receber"
    expect(html).toContain('A Receber');
    // Verifica que não há valor negativo no bloco de totais (R$ -X,XX)
    expect(html).not.toMatch(/R\$\s*-\d/);
  });

  it('K16. @media print presente com page-break-inside:avoid nas tabelas', () => {
    const html = gerarComprovanteHtml(vendaBase());
    expect(html).toContain('@media print');
    expect(html).toContain('page-break-inside: avoid');
  });

  it('K17. destino exibido no corpo do comprovante', () => {
    const html = gerarComprovanteHtml(vendaBase());
    expect(html).toContain('Cancún');
  });

  it('K18. nome da empresa passado via opts aparece no HTML', () => {
    const html = gerarComprovanteHtml(vendaBase(), { nomeEmpresa: 'VTUR São Paulo' });
    expect(html).toContain('VTUR São Paulo');
  });
});
