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
    expect(html).toContain('Categoria: 4 estrelas');
    expect(html).toContain('Adultos: 2');
    expect(html).not.toContain('Crianças: 0');
    expect(html).not.toContain('Valor da criança válido');
    expect(html).toContain('Acomodação: Duplo');
    expect(html).toContain('Regime: Café da manhã');
  });

  it('omite categorias de passageiros sem quantidade no PDF', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [
        {
          item_type: 'servico',
          title: 'Transfer',
          raw: {
            detalhes_orcamento: {
              adultos: 0,
              criancas: 0
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

    expect(html).not.toContain('Adultos: 0');
    expect(html).not.toContain('Crianças: 0');
  });

  it('mantém a observação de criança quando há crianças no orçamento', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [
        {
          item_type: 'hotel',
          title: 'Hotel',
          raw: {
            detalhes_orcamento: {
              adultos: 2,
              criancas: 1
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

    expect(html).toContain('Crianças: 1');
    expect(html).toContain('Valor da criança válido');
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

  it('apresenta passagens na tabela padrão de serviços sem perder dados e valores', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [
        {
          item_type: 'passagem',
          title: 'SÃO PAULO / ROMA / SÃO PAULO',
          quantity: 1,
          total_amount: 1500,
          taxes_amount: 120,
          segments: [
            {
              segment_type: 'flight',
              data: {
                tipo_voo: 'Internacional',
                trecho: 'GRU - FCO',
                cidade_saida: 'São Paulo, São Paulo, Brasil',
                cidade_chegada: 'Roma, Itália',
                cia_aerea: 'LATAM',
                numero_voo: 'LA 8120',
                aeroporto_saida: 'GRU',
                aeroporto_chegada: 'FCO',
                data_voo: '2027-08-10',
                data_fim: '2027-08-11',
                hora_saida: '10:50',
                hora_chegada: '10:15',
                classe_reserva: 'Econômica',
                tarifa_nome: 'FULL'
              }
            },
            {
              segment_type: 'flight',
              data: {
                tipo_voo: 'Internacional',
                trecho: 'FCO - GRU',
                cia_aerea: 'LATAM',
                numero_voo: 'LA 8121',
                aeroporto_saida: 'FCO',
                aeroporto_chegada: 'GRU',
                data_voo: '2027-08-25',
                data_fim: '2027-08-26',
                hora_saida: '19:50',
                hora_chegada: '09:50',
                classe_reserva: 'Econômica',
                tarifa_nome: 'FULL'
              }
            }
          ]
        },
        {
          item_type: 'passagem',
          title: 'Voo doméstico',
          quantity: 1,
          total_amount: 180,
          raw: {
            aereo_import: {
              segmentos: [
                {
                  tipo_voo: 'Nacional',
                  trecho: 'GRU → GIG',
                  cia_aerea: 'Azul Linhas Aéreas',
                  numero_voo: 'AD 4455',
                  data_voo: '2027-08-12',
                  aeroporto_saida: 'GRU',
                  aeroporto_chegada: 'GIG'
                }
              ]
            }
          }
        }
      ],
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: true,
      showItemValues: true
    });
    expect(html).toContain('Passagens Aéreas Internacionais e Trechos Internos');
    expect(html).toContain('<th>Serviço</th>');
    expect(html).toContain('<th>Descrição / Detalhes</th>');
    expect(html).toContain('<th>Qtd.</th>');
    expect(html).toContain('<td class="orc-service-type">Aéreo Internacional</td>');
    expect(html).toContain('<td class="orc-service-type">Voo Interno</td>');
    expect(html).toContain('<td class="orc-quantity">01 passagem</td>');
    expect(html).toContain('<td class="orc-quantity">01 trecho</td>');
    for (const value of [
      'LATAM',
      'LA 8120',
      'GRU',
      'FCO',
      'SÃO PAULO / ROMA / SÃO PAULO',
      'GRU -&gt; FCO - LA 8120 - 10-08-2027 - 10:50 / 10:15 (+1)',
      '10:50 / 10:15 (+1)',
      'FCO -&gt; GRU - LA 8121 - 25-08-2027 - 19:50 / 09:50 (+1)',
      'Econômica',
      '1.500,00',
      '120,00'
    ]) {
      expect(html).toContain(value);
    }
    expect(html).not.toContain('São Paulo, São Paulo, Brasil');
    expect(html).not.toContain('Roma, Itália');
    expect(html).toContain('Azul Linhas Aéreas');
    expect(html).toContain('AD 4455');
    expect(html.match(/<strong>LATAM<\/strong>/g)).toHaveLength(1);
    expect(html.match(/SÃO PAULO \/ ROMA \/ SÃO PAULO/g)).toHaveLength(1);
    expect(html.match(/Classe: Econômica \| Tarifa: FULL/g)).toHaveLength(1);
    expect(html).not.toContain('Chegada no dia seguinte');
  });

  it('apresenta tabelas por cidade, subtotais por moeda e resumo sem somar moedas diferentes', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1', currency: 'BRL', created_at: '2027-07-01' },
      items: [
        {
          item_type: 'hotel',
          title: 'Hotel',
          city_name: 'Paris, França',
          currency: 'EUR',
          quantity: 1,
          total_amount: 750,
          start_date: '2027-08-16',
          end_date: '2027-08-21'
        },
        {
          item_type: 'passeio',
          title: 'Passeio',
          city_name: 'Paris, França',
          currency: 'EUR',
          quantity: 2,
          total_amount: 200,
          start_date: '2027-08-19',
          end_date: '2027-08-19'
        },
        {
          item_type: 'servico',
          title: 'Transfer',
          city_name: 'Paris, França',
          currency: 'BRL',
          quantity: 1,
          total_amount: 300
        },
        {
          item_type: 'passagem',
          title: 'Passagem',
          currency: 'BRL',
          total_amount: 6500,
          taxes_amount: 100
        }
      ],
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: true,
      showItemValues: true,
      discount: 50
    });
    expect(html).toContain('Descrição / Detalhes');
    expect(html).toContain('Subtotal — Paris');
    expect(html).toContain('€ 950,00');
    expect(html).toContain('R$ 300,00');
    expect(html).toContain('16-08-2027 a 21-08-2027');
    expect(html).toContain('<td>Passagens aéreas</td><td>BRL</td>');
    expect(html).toContain('<td>Serviços e demais produtos</td><td>EUR</td>');
    expect(html).toContain('R$ 6.850,00');
    expect(html).not.toContain('R$ 7.800,00');
    expect(html).toContain('<strong>Emissão:</strong> 01/07/2027');
    expect(html).not.toContain('Validade somente para');
  });

  it('oculta valores e subtotais de itens quando selecionado e não inventa validade', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: {
        id: 'quote-1',
        currency: 'EUR',
        created_at: '2027-07-01',
        valid_until: '2027-07-15'
      },
      items: [
        {
          item_type: 'hotel',
          title: 'Hotel',
          city_name: 'Roma, Itália',
          quantity: 2,
          total_amount: 500
        }
      ],
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: true,
      showItemValues: false
    });
    const group = html.slice(
      html.indexOf('<section class="orc-city-section">'),
      html.indexOf('<section class="orc-financial-section">')
    );
    expect(group).toContain('<th>Qtd.</th>');
    expect(group).not.toContain('Subtotal');
    expect(group).not.toContain('500,00');
    expect(html).toContain('<td>Produtos</td><td>EUR</td>');
    expect(html).not.toContain('<td>Serviços e demais produtos</td><td>EUR</td>');
    expect(html).toContain('<strong>Validade:</strong> 15-07-2027');
    expect(html).toContain('Válido até: 15-07-2027');
  });

  it('mantém o tipo informado em serviços importados e a moeda padrão do orçamento', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1', currency: 'EUR' },
      items: [
        {
          item_type: 'Trem',
          title: 'Viagem de trem',
          city_name: 'Paris',
          quantity: 1,
          total_amount: 90
        }
      ],
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: true,
      showItemValues: true
    });
    expect(html).toContain('class="orc-service-type">Trem</td>');
    expect(html).toContain('€ 90,00');
    expect(html).not.toContain('R$ 90,00');
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
