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

  it('exibe período e detalhes dos produtos no PDF', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [
        {
          item_type: 'hotel',
          title: 'Hotel',
          start_date: '2027-08-11',
          end_date: '2027-08-13',
          raw: {
            detalhes_orcamento: {
              categoria: '4 estrelas',
              adultos: 2,
              criancas: 0,
              tipo_apartamento: 'Duplo',
              quantidade_apartamentos: 1,
              regime: 'Café da manhã'
            }
          }
        }
      ],
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: true,
      showItemValues: false
    });
    expect(html).toContain('11-08-2027 a 13-08-2027');
    expect(html).toContain('<strong>Categoria:</strong> 4 estrelas');
    expect(html).toContain('<strong>Crianças:</strong> 0');
    expect(html).toContain('Acomodação: <strong>Duplo</strong>');
    expect(html).toContain('Regime: <strong>Café da manhã</strong>');
  });

  it('agrupa serviços por cidade, usa o nome curto e mantém a ordem dos grupos e itens', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [
        {
          item_type: 'hotel',
          title: 'Hotel Sunset',
          city_name: 'Los Angeles, Califórnia, EUA',
          destino_geografico_id: 'la'
        },
        {
          item_type: 'passeio',
          title: 'Passeio no Louvre',
          city_name: 'Paris, França',
          destino_geografico_id: 'paris'
        },
        {
          item_type: 'aluguel_carro',
          title: 'Aluguel',
          city_name: 'LOS ANGELES, Califórnia, EUA',
          destino_geografico_id: 'la',
          raw: { detalhes_orcamento: { tipo_apartamento: 'Não é acomodação' } }
        },
        {
          item_type: 'ingresso',
          title: 'Ingresso <seguro>',
          city_name: 'Los Angeles, Califórnia, EUA',
          destino_geografico_id: 'la'
        },
        { item_type: 'servico', title: 'Serviço sem cidade' }
      ],
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: true,
      showItemValues: false
    });
    const body = html.slice(html.indexOf('<body>'));
    expect(body.match(/class="roteiro-card-city"/g)).toHaveLength(3);
    expect(body).toContain(
      'focusable="false" style="vertical-align: -0.125em; margin-right: 0.3em"'
    );
    expect(body).toContain('</svg>Los Angeles</div>');
    expect(body).not.toContain('Califórnia');
    expect(body).not.toContain('Paris, França');
    expect(body).not.toContain('Não é acomodação');
    expect(body.indexOf('Hotel Sunset')).toBeLessThan(body.indexOf('Aluguel'));
    expect(body.indexOf('Aluguel')).toBeLessThan(body.indexOf('Ingresso &lt;seguro&gt;'));
    expect(body.indexOf('Ingresso &lt;seguro&gt;')).toBeLessThan(body.indexOf('Passeio no Louvre'));
    expect(body).toContain('Cidade não informada');
  });

  it('não reúne cidades diferentes que têm o mesmo nome curto e mantém as opções de exibição', () => {
    const items = [
      { item_type: 'hotel', title: 'Hotel americano', city_name: 'Paris, Texas, EUA' },
      { item_type: 'hotel', title: 'Hotel francês', city_name: 'Paris, França' }
    ];
    const options = {
      quote: { id: 'quote-1' },
      items,
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showItemValues: false
    };
    const html = buildQuotePreviewHtmlSync({ ...options, showBudgetDetails: true });
    const body = html.slice(html.indexOf('<body>'));
    expect(body.match(/class="roteiro-card-city"/g)).toHaveLength(2);
    expect(body).not.toContain('Texas');
    expect(body).not.toContain('França');
    const hidden = buildQuotePreviewHtmlSync({ ...options, showBudgetDetails: false });
    expect(hidden).not.toContain('Hotel americano');
  });

  it('apresenta trechos aéreos no mesmo cartão dos roteiros, sem perder dados e valores', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [
        {
          item_type: 'passagem',
          total_amount: 1500,
          taxes_amount: 120,
          segments: [
            {
              segment_type: 'flight',
              data: {
                trecho: 'São Paulo - Roma',
                cidade_saida: 'São Paulo, São Paulo, Brasil',
                cidade_chegada: 'Roma, Itália',
                cia_aerea: 'LATAM',
                numero_voo: 'LA123',
                aeroporto_saida: 'GRU',
                aeroporto_chegada: 'FCO',
                data_voo: '2027-08-10',
                data_fim: '2027-08-11',
                hora_saida: '22:10',
                hora_chegada: '13:00',
                classe_reserva: 'Econômica'
              }
            }
          ]
        }
      ],
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: true,
      showItemValues: true
    });
    expect(html).toContain('roteiro-flight-header');
    for (const value of [
      'São Paulo',
      'Roma',
      'LATAM',
      'LA123',
      'GRU',
      'FCO',
      '22:10',
      '13:00',
      'Econômica',
      'Chegada no dia seguinte (+1)',
      '1.500,00',
      '120,00'
    ]) {
      expect(html).toContain(value);
    }
    expect(html).not.toContain('São Paulo, São Paulo, Brasil');
    expect(html).not.toContain('Roma, Itália');
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
