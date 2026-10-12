import { describe, expect, it } from 'vitest';
import { buildQuotePreviewHtmlSync } from './exportQuotePdfClient';
import { VTUR_LOGO_URL } from '$lib/brand';

describe('identidade dos orçamentos e circuitos', () => {
  it('usa VTur mesmo quando as configurações antigas incluem outro logo', () => {
    const settings = { logo_url: 'https://example.com/old-logo.png', logo_path: 'old/logo.png', consultor_nome: 'Ana' };
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1', client_name: 'Cliente Teste' },
      items: [{ item_type: 'circuito', title: 'Circuito de viagem', total_amount: 1500 }],
      settings,
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: true,
      showBudgetDetails: true,
      showItemValues: true,
    });
    expect(html).toContain(VTUR_LOGO_URL);
    expect(html).toContain('alt="VTur"');
    expect(html).toContain('Circuito de viagem');
    expect(html).not.toContain('old-logo');
    expect(html).not.toContain('old/logo');
  });
});
