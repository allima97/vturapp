import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildQuotePreviewHtmlSync, openQuotePreview } from './exportQuotePdfClient';
import { VTUR_LOGO_URL } from '$lib/brand';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), open: vi.fn() }));
vi.mock('$lib/services/api', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('$lib/security/url', () => ({ safeOpenNewTab: mocks.open }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('identidade dos orçamentos e circuitos', () => {
  it('usa VTur mesmo quando as configurações antigas incluem outro logo', () => {
    const settings = {
      logo_url: 'https://example.com/old-logo.png',
      logo_path: 'old/logo.png',
      consultor_nome: 'Ana'
    };
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1', client_name: 'Cliente Teste' },
      items: [{ item_type: 'circuito', title: 'Circuito de viagem', total_amount: 1500 }],
      settings,
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: true,
      showBudgetDetails: true,
      showItemValues: true
    });
    expect(html).toContain(VTUR_LOGO_URL);
    expect(html).toContain('alt="VTur"');
    expect(html).toContain('Circuito de viagem');
    expect(html).not.toContain('old-logo');
    expect(html).not.toContain('old/logo');
  });
});

describe('prévia do orçamento', () => {
  it('carrega a API autorizada e inclui itens, segmentos e configurações no PDF', async () => {
    vi.useFakeTimers();
    mocks.apiFetch.mockResolvedValue({
      id: 'quote-1',
      client_name: 'Cliente',
      currency: 'BRL',
      itens: [
        {
          item_type: 'circuito',
          title: 'Viagem',
          segments: [{ segment_type: 'circuit_day', data: { titulo: 'Roma' } }]
        }
      ],
      pdf_settings: { consultor_nome: 'Consultor' }
    });
    mocks.open.mockReturnValue(true);
    let blob: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
      if (!(value instanceof Blob)) throw new Error('Conteúdo da prévia inválido.');
      blob = value;
      return 'blob:preview';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    await openQuotePreview({
      quoteId: 'quote-1',
      dados: { storage: { from: vi.fn() } },
      showBudgetDetails: true
    });

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      '/api/v1/orcamentos/quote-1',
      expect.objectContaining({ query: { preview_pdf: 1 }, noCache: true })
    );
    const html = await blob!.text();
    expect(html).toContain('Cliente');
    expect(html).toContain('Consultor');
    expect(html).toContain('Viagem');
    expect(html).toContain('Dia 1 - Roma');
    expect(mocks.open).toHaveBeenCalledWith('blob:preview', ['blob:']);
  });

  it('propaga erros da API sem apresentar orçamento não encontrado indevidamente', async () => {
    const error = new Error('Sem acesso ao orçamento.');
    mocks.apiFetch.mockRejectedValue(error);
    await expect(
      openQuotePreview({ quoteId: 'quote-1', dados: { storage: { from: vi.fn() } } })
    ).rejects.toBe(error);
    expect(mocks.open).not.toHaveBeenCalled();
  });
});
