import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildQuotePreviewHtmlSync,
  openQuotePreview,
  renderQuoteItemsForScreen
} from './exportQuotePdfClient';
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
  it('mantém a cor do cabeçalho das tabelas igual à do título do orçamento', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [],
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: false,
      showItemValues: false
    });
    expect(html).toContain('.orc-title { font-size: 21px; font-weight: 700; color: #243aa3;');
    expect(html).toContain('.orc-city-table thead th { background: #243aa3;');
    expect(html).toContain('.orc-title-row { background: white; border: 1px solid #DDE3EC;');
    expect(html).toContain('.sh { background: #EEF2F7;');
    expect(html).toContain('.sh small { color: #6B7280;');
    expect(html).toContain('.card.tot { background: #EEF2F7;');
    expect(html).toContain('print-color-adjust: exact;');
    expect(html).toContain(
      '.cta { background: #fff; color: #1F2937; border: 1px solid #DDE3EC; border-radius: 10px; padding: 6px 10px; display: flex; gap: 8px; align-items: center; flex: none; max-width: 250px; height: auto; min-height: 0; line-height: 1.35; }'
    );
    expect(html.indexOf('Proposta de viagem')).toBeLessThan(html.indexOf('Reserve com o'));
    expect(html).not.toContain('class="two"');
    expect(html).toContain('-webkit-print-color-adjust: exact;');
  });

  it('mostra ícones decorativos para voos, cidades e resumo financeiro', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [
        {
          item_type: 'passagem',
          title: 'Voo',
          raw: { aereo_import: { segmentos: [{ aeroporto_saida: 'GRU' }] } }
        },
        { item_type: 'hotel', title: 'Hotel', city_name: 'Roma, Itália' },
        {
          item_type: 'circuito',
          title: 'Circuito',
          city_name: 'Paris, França',
          segments: [{ segment_type: 'circuit_day', data: { titulo: 'Dia 1' } }]
        }
      ],
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: true,
      showItemValues: true
    });
    const body = html.slice(
      html.indexOf('<body>'),
      html.indexOf('<div class="card inf orc-footer-card">')
    );
    expect(body).toContain('orc-section-icon--flight');
    expect(body).toContain('M17.8 19.2');
    expect(body).not.toContain('orc-section-icon--city');
    expect(html).toContain('orc-section-icon--financial');
    const icons = Array.from(body.matchAll(/<svg\b[^>]*>/g), (match) => match[0]);
    expect(icons.length).toBeGreaterThan(0);
    expect(icons.every((icon) => icon.includes('aria-hidden="true" focusable="false"'))).toBe(true);
    expect(body).toContain('Total da viagem');
  });

  it('mostra um ícone apropriado junto ao nome de cada serviço no PDF', () => {
    const types = [
      ['hotel', 'hotel'],
      ['hospedagem', 'hotel'],
      ['aluguel_carro', 'car'],
      ['ingresso', 'ticket'],
      ['trem', 'train'],
      ['passagem', 'flight'],
      ['passeio', 'tour'],
      ['transfer', 'transfer'],
      ['show', 'show'],
      ['seguro_viagem', 'insurance'],
      ['pacote', 'package'],
      ['desconhecido', 'service']
    ];
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: types.map(([item_type]) => ({
        item_type,
        title: 'Teste',
        city_name: 'Roma',
        ...(item_type === 'trem' || item_type === 'passagem'
          ? { raw: { aereo_import: { segmentos: [{ aeroporto_saida: 'ROM' }] } } }
          : {})
      })),
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: true,
      showItemValues: false
    });
    expect(html).not.toMatch(/orc-service-label"><svg/);
    const expected = new Map<string, number>();
    for (const [, icon] of types) expected.set(icon, (expected.get(icon) ?? 0) + 1);
    for (const [icon, count] of expected) {
      expect(html.match(new RegExp(`orc-service-icon--${icon}`, 'g'))).toHaveLength(count);
    }
  });

  it('apresenta avisos padrão em cartões, incluindo o aviso infantil somente quando aplicável', () => {
    const options = {
      quote: { id: 'quote-1', client_name: 'Ana', valid_until: '2027-07-15' },
      items: [],
      settings: {},
      qrUrl: null,
      complementUrl: 'https://example.com/image.png',
      showBudgetItems: false,
      showBudgetDetails: false,
      showItemValues: false
    };
    const withoutChildren = buildQuotePreviewHtmlSync(options);
    const withChildren = buildQuotePreviewHtmlSync({
      ...options,
      items: [{ item_type: 'hotel', raw: { detalhes_orcamento: { criancas: 1 } } }]
    });
    const list = (html: string) => html.split('<ul class="orc-footer-list">')[1].split('</ul>')[0];

    expect(list(withoutChildren).match(/<li>/g)).toHaveLength(4);
    expect(list(withChildren).match(/<li>/g)).toHaveLength(5);
    expect(list(withoutChildren)).not.toContain('Valor da criança');
    expect(list(withChildren)).toContain('Valor da criança válido somente quando acompanhada');
    expect(list(withChildren).match(/aria-hidden="true" focusable="false"/g)).toHaveLength(5);
    expect(withChildren).toContain('alt="Imagem complementar"');
    expect(withChildren).toContain('>Ana</b>');
    expect(withChildren).toContain('Tarifas válidas até 15/07/2027');
  });

  it('preserva avisos personalizados escapados e permite quebra de avisos longos', () => {
    const longText = 'a'.repeat(5001);
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [],
      settings: { rodape_texto: `Primeiro <aviso>\n\n${longText}` },
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: false,
      showItemValues: false
    });
    const list = html.split('<ul class="orc-footer-list">')[1].split('</ul>')[0];
    expect(list.match(/<li(?: class="[^"]+")?>/g)).toHaveLength(2);
    expect(list).toContain('<span>Primeiro &lt;aviso&gt;</span>');
    expect(list).toContain(`<li class="orc-footer-item--long">`);
    expect(list).toContain(longText);
    expect(list).not.toContain('Preços em real');
  });

  it('associa ícones aos avisos padrão mesmo quando vêm configurados e reordenados', () => {
    const notices = [
      [
        'Este orçamento foi feito com base na menor tarifa para os serviços solicitados, podendo sofrer alteração devido à disponibilidade de lugares no ato da compra.',
        'orc-info-icon--fares'
      ],
      [
        'Valor da criança válido somente quando acompanhada de dois adultos pagantes no mesmo apartamento.',
        'orc-info-icon--children'
      ],
      [
        'Preços em real (R$) convertido ao câmbio do dia sujeito a alteração e disponibilidade da tarifa.',
        'orc-section-icon--financial'
      ],
      [
        'Os serviços citados não estão reservados; a compra somente poderá ser confirmada após a confirmação dos fornecedores.',
        'orc-info-icon--reservations'
      ],
      ['Este orçamento é apenas uma tomada de preço.', 'orc-info-icon--estimate'],
      ['Outro aviso <personalizado>', 'orc-info-icon--estimate']
    ];
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [],
      settings: { rodape_texto: notices.map(([text]) => text).join('\r\n') },
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: false,
      showItemValues: false
    });
    const list = html.split('<ul class="orc-footer-list">')[1].split('</ul>')[0];
    const rows = Array.from(list.matchAll(/<li>(.*?)<\/li>/g), (match) => match[1]);
    expect(rows).toHaveLength(notices.length);
    for (const [index, [, icon]] of notices.entries()) {
      expect(rows[index]).toContain(icon);
    }
    expect(rows[5]).toContain('Outro aviso &lt;personalizado&gt;');
  });

  it('apresenta itens na tela com os detalhes do PDF e valores unitários, escapando conteúdo', () => {
    const html = renderQuoteItemsForScreen(
      [
        {
          item_type: 'hotel',
          title: '<script>alert(1)</script>',
          city_name: 'Roma',
          quantity: 2,
          unit_price: 150,
          total_amount: 300
        },
        {
          item_type: 'passagem',
          title: 'São Paulo / Roma',
          quantity: 1,
          unit_price: 1000,
          total_amount: 1000,
          raw: {
            aereo_import: {
              segmentos: [{ cia_aerea: 'LATAM', aeroporto_saida: 'GRU', aeroporto_chegada: 'FCO' }]
            }
          }
        },
        {
          item_type: 'circuito',
          title: 'Circuito',
          quantity: 2,
          unit_price: 50,
          total_amount: 100,
          segments: [{ segment_type: 'circuit_day', data: { titulo: 'Roma' } }]
        }
      ],
      'BRL'
    );
    expect(html.indexOf('&lt;script&gt;')).toBeLessThan(html.indexOf('LATAM'));
    expect(html).not.toContain('<script>');
    expect(html).toContain('GRU → FCO');
    expect(html).toContain('data-label="Cidade"');
    expect(html).toContain('>Roma</td>');
    expect(html).toContain('02 apartamentos');
    expect(html).toContain('R$ 150,00');
    expect(html).not.toContain('Subtotal — Roma');
    expect(html).toContain('Dia 1 - Roma');
    expect(html).toContain('>2</td>');
    expect(html).toContain('>R$ 50,00</td>');
  });

  it('apresenta trem como trem com trechos e quantidades de passageiros, sem classificá-lo como aéreo', () => {
    const item = {
      item_type: 'trem',
      title: 'Roma / Milão',
      quantity: 1,
      unit_price: 50,
      total_amount: 150,
      city_name: 'Roma, Itália',
      raw: {
        detalhes_orcamento: { adultos: 2, criancas: 1 },
        aereo_import: {
          segmentos: [
            {
              tipo_voo: 'Internacional',
              cia_aerea: 'Trenitalia',
              numero_voo: 'FR 1000',
              aeroporto_saida: 'ROM',
              aeroporto_chegada: 'MIL',
              classe_reserva: 'Executiva',
              assentos: '12A, 12B',
              tarifa_nome: 'Tarifa antiga'
            }
          ]
        }
      }
    };
    const screen = renderQuoteItemsForScreen([item], 'BRL');
    const pdf = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [item],
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: true,
      showItemValues: true
    });
    expect(screen).toContain('ROM → MIL - FR 1000');
    expect(screen).toContain('03 passagens');
    expect(screen).toContain('Assentos: 12A, 12B');
    expect(pdf).toContain('>TREM<');
    expect(pdf).toContain('ROM');
    expect(pdf).toContain('MIL');
    expect(pdf).toContain('FR 1000');
    expect(pdf).toContain('<div class="q orc-quantity">3</div>');
    expect(pdf).toContain('Assentos 12A, 12B');
    expect(pdf).toContain('Serviços');
    for (const html of [screen, pdf]) {
      expect(html).toContain('Executiva');
      expect(html).not.toContain('Tarifa antiga');
      expect(html).not.toContain('Aéreo Internacional');
    }
    expect(screen).toContain('data-label="Serviço" class="px-3 py-3 text-slate-700">Trem</td>');
    expect(screen).toContain('>Roma</td>');
  });

  it('mostra apenas os nomes das cidades nos trechos de trem, inclusive nos dados legados', () => {
    const item = {
      item_type: 'trem',
      title: 'Trem de Alta Velocidade',
      raw: {
        aereo_import: {
          segmentos: [
            {
              aeroporto_saida: 'Barcelona, Província de Barcelona, Catalunha, Espanha',
              aeroporto_chegada: 'Madrid, Provincia de Madrid, Comunidade de Madrid, Espanha',
              cia_aerea: 'Renfe',
              numero_voo: 'OL 2020',
              data_voo: '2027-08-13',
              data_fim: '2027-08-13',
              hora_saida: '14:00',
              hora_chegada: '15:20',
              assentos: '10A,10B'
            },
            { trecho: 'Madrid, Espanha → Lisboa, Portugal' }
          ]
        }
      }
    };
    const screen = renderQuoteItemsForScreen([item], 'BRL');
    const pdf = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [item],
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: true,
      showItemValues: false
    });
    expect(screen).toContain(
      'Barcelona → Madrid - OL 2020 - 13-08-2027 - 14:00 / 15:20 - Assentos: 10A,10B'
    );
    expect(screen).toContain('Madrid → Lisboa');
    expect(pdf).toContain('TREM · 13/08/2027');
    expect(pdf).toContain('Barcelona');
    expect(pdf).toContain('Madrid');
    expect(pdf).toContain('Renfe · OL 2020');
    expect(pdf).toContain('Barcelona <span class="mu">14:00</span><span class="lni"');
    expect(pdf).toContain('Lisboa');
    for (const html of [screen, pdf]) {
      expect(html).not.toContain('Província de Barcelona');
      expect(html).not.toContain('Comunidade de Madrid');
    }
    expect(item.raw.aereo_import.segmentos[0].aeroporto_saida).toBe(
      'Barcelona, Província de Barcelona, Catalunha, Espanha'
    );
    const flight = {
      item_type: 'passagem',
      raw: { aereo_import: { segmentos: [{ aeroporto_saida: 'GRU, Terminal 3' }] } }
    };
    expect(renderQuoteItemsForScreen([flight], 'BRL')).toContain('GRU, Terminal 3');
  });

  it('inclui o trem na cidade de partida com os demais serviços e no subtotal', () => {
    const items = [
      {
        item_type: 'hotel',
        title: 'Hotel Barcelona',
        city_name: 'Barcelona, Espanha',
        destino_geografico_id: 'geonames:barcelona',
        total_amount: 100
      },
      {
        item_type: 'trem',
        title: 'Trem Barcelona / Madrid',
        city_name: 'Madrid, Espanha',
        destino_geografico_id: 'geonames:madrid',
        total_amount: 50,
        raw: {
          aereo_import: {
            segmentos: [
              {
                aeroporto_saida: 'Barcelona, Espanha',
                cidade_saida_id: 'geonames:barcelona',
                aeroporto_chegada: 'Madrid, Espanha'
              },
              { aeroporto_saida: 'Madrid, Espanha', aeroporto_chegada: 'Lisboa, Portugal' }
            ]
          }
        }
      },
      { item_type: 'hotel', title: 'Hotel Madrid', city_name: 'Madrid, Espanha', total_amount: 80 }
    ];
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items,
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: true,
      showItemValues: true
    });
    const sections = html.match(/<section class="orc-city-section">[\s\S]*?<\/section>/g)!;
    expect(sections).toHaveLength(2);
    expect(sections[0]).toContain('<span class="l">Barcelona');
    expect(sections[0]).toContain('Hotel Barcelona');
    expect(sections[0]).toContain('Trem Barcelona / Madrid');
    expect(sections[0]).toContain('Barcelona');
    expect(sections[0]).toContain('Madrid');
    expect(sections[0]).toContain('Lisboa');
    expect(sections[0]).toContain('Barcelona');
    expect(sections[0]).toContain('R$ 150,00');
    expect(sections[1]).toContain('Hotel Madrid');
    expect(sections[1]).not.toContain('Trem Barcelona / Madrid');
  });

  it('usa a cidade do serviço quando não há origem e agrupa nomes legados iguais', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [
        {
          item_type: 'hotel',
          title: 'Hotel',
          city_name: 'Paris, França',
          destino_geografico_id: 'geonames:paris'
        },
        {
          item_type: 'trem',
          title: 'Trem antigo',
          city_name: 'Paris, França',
          raw: { aereo_import: { segmentos: [{ trecho: '' }] } }
        }
      ],
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: true,
      showItemValues: false
    });
    const sections = html.match(/<section class="orc-city-section">[\s\S]*?<\/section>/g)!;
    expect(sections).toHaveLength(1);
    expect(sections[0]).toContain('<span class="l">Paris');
    expect(sections[0]).toContain('Hotel');
    expect(sections[0]).toContain('Trem antigo');
  });

  it('não agrupa cidades distintas com o mesmo nome quando possuem identificadores diferentes', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [
        {
          item_type: 'hotel',
          title: 'Hotel',
          city_name: 'Paris',
          destino_geografico_id: 'geonames:1'
        },
        {
          item_type: 'trem',
          title: 'Trem',
          raw: {
            aereo_import: {
              segmentos: [{ aeroporto_saida: 'Paris', cidade_saida_id: 'geonames:2' }]
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
    expect(html.match(/<section class="orc-city-section">/g)).toHaveLength(2);
  });

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

  it('destaca cliente e cidades em linhas próprias e permite ocultar o cabeçalho', () => {
    const base = {
      quote: { id: 'quote-1', client_name: 'Neusa de Fátima Xavier' },
      items: [
        { item_type: 'hotel', title: 'Hotel A', city_name: 'Los Angeles', total_amount: 100 },
        { item_type: 'passeio', title: 'Passeio B', city_name: 'Anaheim', total_amount: 50 }
      ],
      settings: { consultor_nome: 'André Lima' },
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: true,
      showItemValues: false
    };

    const comCabecalho = buildQuotePreviewHtmlSync(base);
    expect(comCabecalho).toContain('Para: <b style="color:#1F2937">Neusa de Fátima Xavier</b>');
    expect(comCabecalho).toContain('Cidades: <b style="color:#1F2937">Los Angeles e Anaheim</b>');
    expect(comCabecalho).toContain(VTUR_LOGO_URL);
    expect(comCabecalho).toContain('André Lima');
    expect(comCabecalho.indexOf(VTUR_LOGO_URL)).toBeLessThan(
      comCabecalho.indexOf('Proposta de viagem')
    );

    const semCabecalho = buildQuotePreviewHtmlSync({ ...base, showHeader: false });
    expect(semCabecalho).not.toContain(VTUR_LOGO_URL);
    expect(semCabecalho).not.toContain('André Lima');
    expect(semCabecalho).not.toContain('Consultor de viagens');
    expect(semCabecalho).toContain('Proposta de viagem');
    expect(semCabecalho).toContain('Para: <b style="color:#1F2937">Neusa de Fátima Xavier</b>');
  });

  it('exibe período e detalhes dos produtos no PDF', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [
        {
          item_type: 'hotel',
          title: 'Hollywood Hotel Inn',
          start_date: '2027-08-11',
          end_date: '2027-08-13',
          raw: {
            detalhes_orcamento: {
              categoria: '3 Estrelas',
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
    expect(html).toContain('HOTEL · 11/08 a 13/08/2027 · 2 NOITES');
    expect(html).toContain('Hollywood Hotel Inn');
    expect(html.indexOf('>Hollywood Hotel Inn</b>')).toBeLessThan(
      html.indexOf('HOTEL · 11/08 a 13/08/2027 · 2 NOITES')
    );
    expect(html).toContain('3 estrelas · Duplo');
    expect(html).toContain('Café da manhã');
    expect(html).toContain('min-width: 0');
    expect(html).toContain('overflow-wrap: anywhere');
    expect(html).toContain('2 adultos');
    expect(html).toContain('<div class="q orc-quantity">1</div>');
    expect(html).toContain('>Qtd</span>');
    expect(html).not.toContain('Total de noites:');
    expect(html).not.toContain('Categoria:');
    expect(html).not.toContain('Apartamentos:');
    expect(html).not.toContain('Crianças: 0');
    expect(html).not.toContain('Valor da criança válido');
  });

  it('formata período e incluídos do aluguel de carro sem rótulos redundantes', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [
        {
          item_type: 'aluguel_carro',
          title: 'SUV - Automático',
          city_name: 'Los Angeles',
          start_date: '2027-01-17',
          end_date: '2027-01-20',
          quantity: 1,
          total_amount: 700,
          raw: {
            detalhes_orcamento: {
              cambio: 'Automático',
              locadora: 'Localiza',
              incluidos: ['CDW', 'LDW', 'Tanque Cheio', 'KM Livre'],
              cidade_devolucao: 'Las Vegas',
              hora_retirada: '10:00',
              hora_devolucao: '10:00'
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

    expect(html).toContain('CARRO · 4 DIÁRIAS');
    expect(html).toContain('>SUV automático</b>');
    expect(html).toContain('<b>Los Angeles</b> <span class="mu">· 10:00</span>');
    expect(html).toContain('<b>Las Vegas</b> <span class="mu">· 10:00</span>');
    expect(html).toContain('<span class="ct">Retirada: 17/01/2027</span>');
    expect(html).toContain('<span class="ct">Devolução: 20/01/2027</span>');
    expect(html).toContain('<div class="mu sm">Localiza</div>');
    expect(html).toContain('>Aluguel de carro</span>');
    expect(html).not.toContain('<div class="mu sm">Aluguel de carro</div>');
    expect(html).toContain('KM livre');
    expect(html).toContain('sh--sem-valor');
    expect(html).toContain('orc-row--sem-valor');
    expect(html).toContain('CDW + LDW');
    expect(html).toContain('Tanque cheio');
    expect(html).toContain('<div class="q orc-quantity">1</div>');
    expect(html).not.toContain('SUV - Automático - 17-01-2027');
    expect(html).not.toContain('Câmbio:');
    expect(html).not.toContain('Incluídos:');
  });

  it('identifica apartamentos e carros no singular e plural no resumo e nos detalhes', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [
        {
          item_type: 'hotel',
          title: 'Hotel dois apartamentos',
          quantity: 1,
          raw: { detalhes_orcamento: { quantidade_apartamentos: 2 } }
        },
        { item_type: 'hospedagem', title: 'Hotel antigo', quantity: 1 },
        { item_type: 'aluguel_carro', title: 'Carros', quantity: 2 },
        { item_type: 'aluguel_carro', title: 'Carro', quantity: 1 },
        { item_type: 'hotel', title: 'Hotel sem quantidade' },
        { item_type: 'servico', title: 'Serviço', quantity: 2 }
      ],
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: true,
      showBudgetDetails: true,
      showItemValues: false
    });
    expect(html.match(/<div class="q orc-quantity">1<\/div>/g)).toHaveLength(2);
    expect(html.match(/<div class="q orc-quantity">2<\/div>/g)).toHaveLength(3);
    expect(html).toContain('>Qtd</span>');
    for (const quantity of ['01 apartamento', '02 apartamentos', '01 carro', '02 carros']) {
      expect(html).toContain(`<td class="text-right">${quantity}</td>`);
    }
    expect(html).toContain('<div class="q orc-quantity">-</div>');
    expect(html).toContain('<div class="q orc-quantity">2</div>');
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

    expect(html).toContain('2 adultos');
    expect(html).toContain('1 criança');
    expect(html).toContain('Valor da criança válido');
  });

  it('agrupa serviços consecutivos por cidade sem alterar a ordem dos itens', () => {
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
    expect(body.match(/class="l"/g)).toHaveLength(5);
    expect(body).not.toContain('orc-section-icon--city');
    expect(body).toContain('<span class="l">Aluguel de carro');
    expect(body).toContain('<span class="l">Los Angeles');
    expect(body).not.toContain('Califórnia');
    expect(body).not.toContain('Paris, França');
    expect(body).not.toContain('Não é acomodação');
    expect(body.indexOf('Aluguel de carro')).toBeLessThan(body.indexOf('Hotel Sunset'));
    expect(body.indexOf('Hotel Sunset')).toBeLessThan(body.indexOf('Passeio no Louvre'));
    expect(body.indexOf('Passeio no Louvre')).toBeLessThan(body.indexOf('Ingresso &lt;seguro&gt;'));
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
    expect(body.match(/class="l"/g)).toHaveLength(2);
    expect(body).not.toContain('Texas');
    expect(body).not.toContain('França');
    const hidden = buildQuotePreviewHtmlSync({ ...options, showBudgetDetails: false });
    expect(hidden).not.toContain('Hotel americano');
  });

  it('respeita a ordem manual de passagens e cidades no resumo e detalhes', () => {
    const items = [
      { item_type: 'hotel', title: 'Hotel Paris', city_name: 'Paris', start_date: '2027-08-20' },
      {
        item_type: 'passagem',
        title: 'Voo principal',
        raw: { aereo_import: { segmentos: [{ cia_aerea: 'LATAM', numero_voo: 'LA 8120' }] } }
      },
      { item_type: 'hotel', title: 'Hotel Roma', city_name: 'Roma', start_date: '2027-08-12' },
      {
        item_type: 'servico',
        title: 'Passeio Paris',
        city_name: 'Paris',
        start_date: '2027-08-10'
      },
      { item_type: 'passagem', title: 'Voo sem trechos' },
      { item_type: 'servico', title: 'Serviço sem data', city_name: 'Lisboa' },
      { item_type: 'servico', title: 'Serviço com fim', city_name: 'Madri', end_date: '2027-08-25' }
    ];
    const options = {
      quote: { id: 'quote-1' },
      items,
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showItemValues: false
    };

    for (const showBudgetDetails of [false, true]) {
      const html = buildQuotePreviewHtmlSync({
        ...options,
        showBudgetItems: !showBudgetDetails,
        showBudgetDetails
      });
      const body = html.slice(html.indexOf('<body>'));
      const titles = showBudgetDetails
        ? [
            'Voo Principal',
            'Voo sem Trechos',
            'Passeio Paris',
            'Hotel Roma',
            'Hotel Paris',
            'Serviço sem data',
            'Serviço com fim'
          ]
        : [
            'Hotel Paris',
            'Voo Principal',
            'Hotel Roma',
            'Passeio Paris',
            'Voo sem Trechos',
            'Serviço sem data',
            'Serviço com fim'
          ];
      const positions = titles.map((title) => body.indexOf(title));
      expect(positions.every((position) => position >= 0)).toBe(true);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      if (showBudgetDetails) {
        expect(body.match(/Passagens aéreas/g)).toHaveLength(1);
        expect(body.match(/class="l"/g)).toHaveLength(6);
      }
    }

    expect(items[0].title).toBe('Hotel Paris');
  });

  it('ordena cidades por data e mantém a ordem manual quando a data empata ou falta', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [
        { item_type: 'servico', title: 'Sem data A', city_name: 'A' },
        { item_type: 'hotel', title: 'Cidade B', city_name: 'B', start_date: '2027-08-10' },
        { item_type: 'hotel', title: 'Cidade C', city_name: 'C', start_date: '2027-08-10' },
        { item_type: 'servico', title: 'Sem data D', city_name: 'D' }
      ],
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: true,
      showItemValues: false
    });
    const body = html.slice(html.indexOf('<body>'));
    const positions = ['Cidade B', 'Cidade C', 'Sem data A', 'Sem data D'].map((title) =>
      body.indexOf(title)
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(body).not.toContain('Passagens Aéreas Internacionais e Trechos Internos');
  });

  it('coloca Los Angeles antes de Anaheim pela data inicial e ordena os itens do grupo', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [
        {
          item_type: 'ingresso',
          title: 'Ingresso Disney',
          city_name: 'Anaheim',
          start_date: '2026-11-25',
          end_date: '2026-11-26'
        },
        {
          item_type: 'servico',
          title: 'Extra sem data',
          city_name: 'Los Angeles'
        },
        {
          item_type: 'passeio',
          title: 'Passeio da tarde',
          city_name: 'Los Angeles',
          start_date: '2026-11-24',
          end_date: '2026-11-25'
        },
        {
          item_type: 'passeio',
          title: 'Passeio Hollywood',
          city_name: 'Los Angeles',
          start_date: '2026-11-24',
          end_date: '2026-11-24'
        }
      ],
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: true,
      showItemValues: false
    });
    const body = html.slice(html.indexOf('<body>'));
    const titles = ['Passeio da tarde', 'Passeio Hollywood', 'Extra sem data', 'Ingresso Disney'];
    const positions = titles.map((title) => body.indexOf(title));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(body.indexOf('<span class="l">Los Angeles')).toBeLessThan(
      body.indexOf('<span class="l">Anaheim')
    );
    expect(body).toContain('Los Angeles <small>· 24 a 25/11/2026');
    expect(body).toContain('Anaheim <small>· 25 a 26/11/2026');
    expect(body).toContain('>Qtd</span>');
  });

  it('mantém circuitos e passagens na ordem manual', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [
        { item_type: 'hotel', title: 'Hotel Madri', city_name: 'Madri', start_date: '2027-08-20' },
        { item_type: 'circuito', title: 'Circuito Itália', start_date: '2027-08-10' },
        { item_type: 'passagem', title: 'Passagem internacional' }
      ],
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: true,
      showItemValues: false
    });
    const body = html.slice(html.indexOf('<body>'));
    expect(body.indexOf('Passagem Internacional')).toBeLessThan(body.indexOf('Hotel Madri'));
    expect(body.indexOf('Hotel Madri')).toBeLessThan(body.indexOf('Circuito Itália'));
    expect(body).toContain('<article class="roteiro-card');
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
          raw: {
            detalhes_orcamento: {
              adultos: 2,
              criancas: 0,
              infant: 0
            }
          },
          segments: [
            {
              segment_type: 'flight',
              data: {
                tipo_voo: 'Internacional',
                trecho: 'São Paulo - Roma',
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
                  cia_aerea: 'Azul Linhas Aéreas',
                  numero_voo: 'AD 4455',
                  data_voo: '2027-08-12',
                  aeroporto_saida: 'GRU',
                  aeroporto_chegada: 'GIG'
                }
              ]
            }
          }
        },
        {
          item_type: 'passagem',
          title: 'Roma - Barcelona',
          quantity: 1,
          total_amount: 250,
          raw: {
            detalhes_orcamento: {
              adultos: 2,
              criancas: 0,
              infant: 0
            }
          },
          segments: [
            {
              segment_type: 'flight',
              data: {
                tipo_voo: 'Voo Interno',
                trecho: 'ROMA -> BARCELONA',
                cia_aerea: 'IBERIA',
                numero_voo: 'IB 1554',
                aeroporto_saida: 'ROMA',
                aeroporto_chegada: 'BARCELONA',
                data_voo: '2027-08-11',
                data_fim: '2027-08-11',
                hora_saida: '14:00',
                hora_chegada: '15:20',
                classe_reserva: 'Econômica',
                tarifa_nome: 'Standard'
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
    expect(html).toContain('Passagens aéreas');
    expect(html.indexOf('São Paulo / Roma / São Paulo')).toBeLessThan(html.indexOf('LA 8120'));
    expect(html).toContain('<span class="md"><span>LA 8120</span><span class="lni"');
    expect(html).toContain('<span class="md"><span>LA 8121</span><span class="lni"');
    expect(html).toContain('<span class="md"><span>IB 1554</span><span class="lni"');
    expect(html).toContain('</span><span>LATAM</span></span>');
    expect(html).toContain('</span><span>IBERIA</span></span>');
    expect(html.indexOf('Roma - Barcelona')).toBeLessThan(html.indexOf('IB 1554'));
    expect(html).toContain('<span class="ct">São Paulo – 10/08/2027</span>');
    expect(html).toContain('<span class="ct">Roma – 11/08/2027</span>');
    expect(html).toContain('<span class="ct">Roma – 25/08/2027</span>');
    expect(html).toContain('<span class="ct">São Paulo – 26/08/2027</span>');
    expect(html).toContain('<div class="q orc-quantity">1</div>');
    expect(html.match(/<div class="q orc-quantity">2<\/div>/g)).toHaveLength(2);
    for (const value of [
      'LATAM',
      'GRU',
      'FCO',
      'class="p1">+1',
      'IBERIA',
      'Azul Linhas Aéreas',
      'Econômica',
      'FULL',
      'Standard',
      '2 adultos',
      '1.500,00',
      '120,00'
    ]) {
      expect(html).toContain(value);
    }
    expect(html).not.toContain('São Paulo, São Paulo, Brasil');
    expect(html).not.toContain('Roma, Itália');
    expect(html).toContain('Azul Linhas Aéreas');
    expect(html).toContain('AD 4455');
    expect(html.match(/São Paulo \/ Roma \/ São Paulo/g)).toHaveLength(1);
    expect(html).not.toContain('Classe: Econômica');
    expect(html).not.toContain('Tarifa: FULL');
    expect(html).not.toContain('Chegada no dia seguinte (+1)');
    expect(html).toContain('<span class="p1">+1</span> = Chegada no dia seguinte');
  });

  it('conta passageiros em todos os voos, inclusive sem trechos, e preserva quantidades legadas', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [
        {
          item_type: 'passagem',
          title: 'Ida e volta',
          quantity: 99,
          raw: {
            detalhes_orcamento: { adultos: 1, criancas: 1, infant: 1 },
            aereo_import: { segmentos: [{ tipo_voo: 'Internacional' }] }
          }
        },
        {
          item_type: 'passagem',
          title: 'Voo nacional',
          quantity: 8,
          raw: {
            detalhes_orcamento: { adultos: 1, criancas: 0, infant: 0 },
            aereo_import: { segmentos: [{ tipo_voo: 'Nacional' }] }
          }
        },
        {
          item_type: 'passagem',
          title: 'Voo sem segmentos',
          quantity: 1,
          raw: { detalhes_orcamento: { adultos: 2, criancas: 0, infant: 0 } }
        },
        {
          item_type: 'passagem',
          title: 'Voo antigo',
          quantity: 4,
          raw: { aereo_import: { segmentos: [{ tipo_voo: 'Voo Interno' }] } }
        }
      ],
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: true,
      showBudgetDetails: true,
      showItemValues: false
    });

    for (const quantity of ['3', '1', '2', '4']) {
      expect(html).toContain(`<div class="q orc-quantity">${quantity}</div>`);
    }
    expect(html).not.toContain('01 trecho');
    expect(html).not.toContain('03 passagens (ida e volta)');
    for (const [title, quantity] of [
      ['Ida e Volta', 3],
      ['Voo Nacional', 1],
      ['Voo sem Segmentos', 2],
      ['Voo Antigo', 4]
    ] as const) {
      expect(html).toContain(
        `<td>${title}</td>\n      <td>Passagem Aérea</td>\n      <td class="text-right">${quantity}</td>`
      );
    }
  });

  it('usa Passagem Aérea também para voos legados sem trechos na tela e no PDF', () => {
    const items = [{ item_type: 'voo_interno', title: 'Voo antigo', quantity: 1 }];
    const screen = renderQuoteItemsForScreen(items, 'BRL');
    const pdf = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items,
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: true,
      showBudgetDetails: true,
      showItemValues: false
    });
    expect(screen).toContain('>Passagem Aérea</td>');
    expect(pdf).toContain('Passagens aéreas');
    expect(pdf).toContain('Voo Antigo');
  });

  it('formata somente descrições aéreas no resumo e nos detalhes, inclusive sem trechos', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [
        {
          item_type: 'passagem',
          title: 'SÃO PAULO / ROMA / SÃO PAULO',
          raw: { aereo_import: { segmentos: [{ cia_aerea: 'LATAM' }] } }
        },
        { item_type: 'passagem', title: 'RIO DE JANEIRO / PORTO' },
        { item_type: 'hotel', title: 'HOTEL ROMA', city_name: 'Roma' }
      ],
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: true,
      showBudgetDetails: true,
      showItemValues: false
    });
    expect(html).toContain('São Paulo / Roma / São Paulo');
    expect(html.match(/Rio de Janeiro \/ Porto/g)).toHaveLength(2);
    expect(html).toContain('HOTEL ROMA');
    expect(html).toContain('LATAM');
  });

  it('preserva trajetos legados quando os aeroportos não foram informados', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [
        {
          item_type: 'passagem',
          title: 'Voo antigo',
          raw: {
            aereo_import: {
              segmentos: [
                { trecho: 'GRU -> FCO', numero_voo: 'LA 8120' },
                { trecho: 'FCO - GRU', aeroporto_saida: 'FCO', numero_voo: 'LA 8121' }
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
      showItemValues: false
    });
    expect(html).toContain('GRU');
    expect(html).toContain('FCO');
    expect(html).toContain('<span class="ct">São Paulo</span>');
    expect(html).toContain('<span class="ct">Roma</span>');
    expect(html).toContain('LA 8120');
    expect(html).toContain('LA 8121');
  });

  it('mostra o nome da cidade de cada aeroporto na rota, com o código como reserva', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [
        {
          item_type: 'passagem',
          title: 'Trechos',
          raw: {
            aereo_import: {
              segmentos: [
                { aeroporto_saida: 'GRU', aeroporto_chegada: 'FCO', numero_voo: 'LA 1' },
                { aeroporto_saida: 'FCO', aeroporto_chegada: 'BCN', numero_voo: 'AZ 2' },
                { aeroporto_saida: 'LAX', aeroporto_chegada: 'LAS', numero_voo: 'AA 3' },
                {
                  aeroporto_saida: 'GRU',
                  aeroporto_chegada: 'FCO',
                  cidade_saida: 'Guarulhos, São Paulo',
                  cidade_chegada: 'Roma, Itália',
                  numero_voo: 'LA 4'
                },
                { aeroporto_saida: 'ZZZ', aeroporto_chegada: 'QQQ', numero_voo: 'XX 9' }
              ]
            }
          }
        },
        {
          item_type: 'trem',
          title: 'Trem Roma / Milão',
          city_name: 'Roma',
          raw: {
            aereo_import: {
              segmentos: [{ aeroporto_saida: 'FCO', aeroporto_chegada: 'MXP', numero_voo: 'FR 1' }]
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

    expect(html).toContain('<span class="ct">São Paulo</span>');
    expect(html).toContain('<span class="ct">Roma</span>');
    expect(html).toContain('<span class="ct">Barcelona</span>');
    expect(html).toContain('<span class="ct">Los Angeles</span>');
    expect(html).toContain('<span class="ct">Las Vegas</span>');
    expect(html).toContain('<span class="ct">Guarulhos</span>');
    expect(html).toContain('ZZZ');
    expect(html).toContain('QQQ');
    expect(html).toContain('GRU');
    expect(html).toContain('FCO');
    expect(html).toContain('Roma / Milão');
    expect(html).not.toContain('GRU / FCO');
    expect(html).not.toContain('LAX / LAS');
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
    expect(html).toContain('<span class="l">Paris');
    expect(html).toContain('€ 950,00');
    expect(html).toContain('R$ 300,00');
    expect(html).toContain('16/08 a 21/08/2027');
    expect(html).toContain('Aéreo');
    expect(html).toContain('Serviços');
    expect(html).toContain('R$ 6.850,00');
    expect(html).not.toContain('R$ 7.800,00');
    expect(html).toContain('>01/07/2027</span>');
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
    expect(group).toContain('class="q orc-quantity"');
    expect(group).not.toContain('Subtotal');
    expect(group).not.toContain('500,00');
    expect(html).toContain('<div class="tt"><b>TOTAL</b><span>€ 500,00</span>');
    expect(html).toContain('>Total da viagem</span>');
    expect(html).not.toContain('Produtos');
    expect(html).toContain('€ 500,00</span></div></section>');
    expect(html).not.toContain('Aéreo');
    expect(html).toContain('>01/07/2027</span>');
    expect(html).toContain('>15/07/2027</span>');
    expect(html).toContain('Tarifas válidas até 15/07/2027');
  });

  it('mostra o total geral na faixa mesmo sem valores por item', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1', currency: 'BRL', created_at: '2027-07-01' },
      items: [
        { item_type: 'passagem', title: 'Voo', total_amount: 1000, taxes_amount: 50 },
        {
          item_type: 'hotel',
          title: 'Hotel',
          city_name: 'Roma',
          total_amount: 200,
          currency: 'EUR'
        }
      ],
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: true,
      showItemValues: false,
      discount: 50
    });
    const items = html.slice(
      html.indexOf('<section class="orc-city-section">'),
      html.indexOf('<section class="orc-financial-section">')
    );
    expect(items).not.toContain('1.000,00');
    expect(items).not.toContain('200,00');
    expect(html).toContain('<div class="tt"><b>TOTAL</b><span>R$ 1.000,00 · € 200,00</span>');
    expect(html).toContain('R$ 1.000,00</span></div>');
    expect(html).toContain('€ 200,00</span></div>');
    expect(html).toContain('>Total da viagem</span>');
    expect(html).not.toContain('Produtos');
  });

  it('padroniza a linha do serviço com dias, fornecedor ou categoria', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: { id: 'quote-1' },
      items: [
        {
          item_type: 'seguro',
          title: 'Seguro Europa',
          city_name: 'Roma',
          start_date: '2026-11-24',
          end_date: '2026-12-01',
          raw: { detalhes_orcamento: { fornecedor: 'Assist Card', adultos: 2 } }
        },
        {
          item_type: 'seguro',
          title: 'Seguro sem fornecedor',
          city_name: 'Roma',
          start_date: '2026-11-24',
          end_date: '2026-11-24',
          raw: { detalhes_orcamento: { adultos: 1 } }
        },
        {
          item_type: 'ingresso',
          title: 'Coliseu',
          city_name: 'Roma',
          start_date: '2026-11-25',
          end_date: '2026-11-26',
          raw: { detalhes_orcamento: { categoria: 'Básico', adultos: 2 } }
        },
        {
          item_type: 'passeio',
          title: 'City tour',
          city_name: 'Roma',
          start_date: '2026-11-25',
          end_date: '2026-11-26',
          raw: { detalhes_orcamento: { categoria: 'Serviço Compartilhado', adultos: 2 } }
        },
        {
          item_type: 'show',
          title: 'Ópera',
          city_name: 'Roma',
          start_date: '2026-11-26',
          end_date: '2026-11-26',
          raw: { detalhes_orcamento: { categoria: 'Plateia', adultos: 2 } }
        }
      ],
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: true,
      showItemValues: false
    });

    expect(html).toContain('SEGURO VIAGEM · 24/11 a 01/12/2026 - 08 dias');
    expect(html).toContain('>Seguro Europa</b>');
    expect(html.indexOf('>Seguro Europa</b>')).toBeLessThan(
      html.indexOf('SEGURO VIAGEM · 24/11 a 01/12/2026 - 08 dias')
    );
    expect(html).toContain('>Assist Card</div>');
    expect(html).toContain('SEGURO VIAGEM · 24/11/2026 - 01 dia');
    expect(html).not.toContain('Total de dias');
    expect(html).not.toContain('Adultos:');
    expect(html).toContain('INGRESSO · 25/11 a 26/11/2026 - 02 dias');
    expect(html).toContain('>Básico</div>');
    expect(html).toContain('PASSEIO · 25/11 a 26/11/2026 - 02 dias');
    expect(html).toContain('>Serviço Compartilhado</div>');
    expect(html).toContain('SHOW · 26/11/2026 - 01 dia');
    expect(html).toContain('>Plateia</div>');
    expect(html).not.toContain('Categoria:');
    expect(html).toContain('>2 adultos</span>');
    expect(html.indexOf('>Assist Card</div>')).toBeGreaterThan(html.indexOf('>Seguro Europa</b>'));
    expect(html).not.toContain('Produtos');
  });

  it('mostra somente as datas disponíveis no cabeçalho, sem separador solto', () => {
    const options = {
      items: [],
      settings: {},
      qrUrl: null,
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: false,
      showItemValues: false
    };
    const issueOnly = buildQuotePreviewHtmlSync({
      ...options,
      quote: { id: 'quote-1', created_at: '2027-07-01' }
    });
    const validityOnly = buildQuotePreviewHtmlSync({
      ...options,
      quote: { id: 'quote-1', valid_until: '2027-07-15' }
    });
    const neither = buildQuotePreviewHtmlSync({ ...options, quote: { id: 'quote-1' } });
    expect(issueOnly).toContain('>01/07/2027</span>');
    expect(issueOnly).not.toContain('15/07/2027');
    expect(validityOnly).toContain('>15/07/2027</span>');
    expect(validityOnly).not.toContain('01/07/2027');
    expect(neither).not.toContain('01/07/2027');
    expect(neither).not.toContain('15/07/2027');
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
    expect(html).toContain('TREM');
    expect(html).toContain('€ 90,00');
    expect(html).not.toContain('R$ 90,00');
  });
});

it('explica o badge de chegada só no card de passagens aéreas', () => {
  const html = buildQuotePreviewHtmlSync({
    quote: { id: 'quote-1' },
    items: [
      {
        item_type: 'passagem',
        title: 'Com pernoite',
        segments: [
          {
            segment_type: 'flight',
            data: {
              data_voo: '2027-08-10',
              data_fim: '2027-08-11',
              aeroporto_saida: 'GRU',
              aeroporto_chegada: 'FCO'
            }
          }
        ]
      },
      {
        item_type: 'passagem',
        title: 'Dois dias',
        segments: [
          {
            segment_type: 'flight',
            data: {
              data_voo: '2027-08-12',
              data_fim: '2027-08-14',
              aeroporto_saida: 'FCO',
              aeroporto_chegada: 'GRU'
            }
          }
        ]
      },
      {
        item_type: 'trem',
        title: 'Trem noturno',
        city_name: 'Roma',
        raw: {
          aereo_import: {
            segmentos: [
              {
                aeroporto_saida: 'Roma',
                aeroporto_chegada: 'Milão',
                data_voo: '2027-08-15',
                data_fim: '2027-08-16'
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
    showItemValues: false
  });
  const air = html.slice(html.indexOf('Passagens aéreas'), html.indexOf('<span class="l">Roma'));
  const legend = '<p class="orc-arrival-legend">';
  expect(air).toContain(
    `${legend}<span><span class="p1">+1</span> = Chegada no dia seguinte</span>`
  );
  expect(air).toContain('<span><span class="p1">+2</span> = Chegada dois dias depois</span>');
  expect(air.indexOf(legend)).toBeGreaterThan(air.lastIndexOf('class="row'));
  expect(html.slice(html.indexOf('<span class="l">Roma'))).not.toContain('Chegada no dia seguinte');
  expect(html.slice(html.indexOf('<span class="l">Roma'))).not.toContain(
    'Chegada dois dias depois'
  );

  const semAtraso = buildQuotePreviewHtmlSync({
    quote: { id: 'quote-1' },
    items: [
      {
        item_type: 'passagem',
        title: 'No mesmo dia',
        segments: [
          {
            segment_type: 'flight',
            data: {
              data_voo: '2027-08-10',
              data_fim: '2027-08-10',
              aeroporto_saida: 'GRU',
              aeroporto_chegada: 'GIG'
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
    showItemValues: false
  });
  expect(semAtraso).not.toContain('class="orc-arrival-legend"');
  expect(semAtraso).not.toContain('Chegada no dia seguinte');
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
