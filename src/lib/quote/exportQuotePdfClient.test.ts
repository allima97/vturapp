import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildQuotePreviewHtmlSync,
  openQuotePreview,
  renderQuoteItemsForScreen
} from './exportQuotePdfClient';
import { VTUR_LOGO_URL } from '$lib/brand';
import { compile, preprocess } from 'svelte/compiler';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), open: vi.fn() }));
vi.mock('$lib/services/api', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('$lib/security/url', () => ({ safeOpenNewTab: mocks.open }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('identidade dos orçamentos e circuitos', () => {
  it('aplica os estilos compilados às tabelas de itens renderizadas na tela', async () => {
    const filename = fileURLToPath(
      new URL('../../routes/(app)/orcamentos/[id]/+page.svelte', import.meta.url)
    );
    const source = await preprocess(readFileSync(filename, 'utf8'), vitePreprocess(), { filename });
    const compiled = compile(source.code, { filename, generate: 'client' });
    const css = compiled.css?.code || '';
    const scope = css.match(/\.quote-items\.(svelte-[a-z0-9]+)/)?.[1];
    expect(scope).toBeTruthy();
    expect(compiled.js.code).toContain(`quote-items overflow-x-auto ${scope}`);
    expect(css).toMatch(
      /\.quote-items\.svelte-[a-z0-9]+ \.orc-city-table\s*\{[^}]*table-layout:\s*fixed/s
    );
    expect(css).toMatch(
      /\.quote-items\.svelte-[a-z0-9]+ \.orc-city-table thead th\s*\{[^}]*background:\s*#243aa3/s
    );
  });

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
    expect(html).toContain('<th class="orc-value">Valor Unit.</th>');
    expect(html).toContain('<th>Serviço</th><th>Cidade</th><th>Descrição / Detalhes</th>');
    expect(html).toContain('<td>Roma</td>');
    expect(html).toContain('<th class="orc-value">Total</th>');
    expect(html).toContain('02 apartamentos');
    expect(html).toContain('R$ 150,00');
    expect(html).toContain('Subtotal — Roma');
    expect(html).toContain('Dia 1 - Roma');
    expect(html).toContain('<td class="orc-quantity">2</td>');
    expect(html).toContain('<td class="orc-value">R$ 50,00</td>');
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
              aeroporto_chegada: 'MIL'
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
    for (const html of [screen, pdf]) {
      expect(html).toContain('<td class="orc-service-type">Trem</td>');
      expect(html).toContain('ROM → MIL - FR 1000');
      expect(html).toContain('03 passagens');
      expect(html).not.toContain('Aéreo Internacional');
    }
    expect(screen).toContain('<td>Roma</td>');
    expect(pdf).toContain('<td>Serviços e demais produtos</td><td>BRL</td>');
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
    expect(html).toContain('Hollywood Hotel Inn - 11-08-2027 a 13-08-2027 (02 noites)');
    expect(html).toContain('02 Adultos | 3 Estrelas | Duplo | Café da manhã');
    expect(html).toContain('<td class="orc-quantity">01 apartamento</td>');
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
              incluidos: ['CDW', 'LDW', 'Tanque Cheio', 'KM Livre']
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

    expect(html).toContain('SUV - 17-01-2027 a 20-01-2027 (04 dias)');
    expect(html).toContain('Automático | KM Livre | CDW | LDW | Tanque Cheio');
    expect(html).toContain('<td class="orc-quantity">01 carro</td>');
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
    for (const quantity of ['01 apartamento', '02 apartamentos', '01 carro', '02 carros']) {
      expect(html).toContain(`<td class="orc-quantity">${quantity}</td>`);
      expect(html).toContain(`<td class="text-right">${quantity}</td>`);
    }
    expect(html).toContain('<td class="orc-quantity">-</td>');
    expect(html).toContain('<td class="orc-quantity">2</td>');
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

    expect(html).toContain('02 Adultos | 01 Criança');
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
    expect(body.match(/class="roteiro-card-city"/g)).toHaveLength(4);
    expect(body).toContain(
      'focusable="false" style="vertical-align: -0.125em; margin-right: 0.3em"'
    );
    expect(body).toContain('</svg>Los Angeles</div>');
    expect(body).not.toContain('Califórnia');
    expect(body).not.toContain('Paris, França');
    expect(body).not.toContain('Não é acomodação');
    expect(body.indexOf('Hotel Sunset')).toBeLessThan(body.indexOf('Passeio no Louvre'));
    expect(body.indexOf('Passeio no Louvre')).toBeLessThan(body.indexOf('Aluguel'));
    expect(body.indexOf('Aluguel')).toBeLessThan(body.indexOf('Ingresso &lt;seguro&gt;'));
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
      const titles = [
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
        expect(body.match(/Passagens Aéreas Internacionais e Trechos Internos/g)).toHaveLength(2);
        expect(body.match(/class="roteiro-card-city"/g)).toHaveLength(5);
      }
    }

    expect(items[0].title).toBe('Hotel Paris');
  });

  it('mantém a ordem manual independentemente das datas', () => {
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
    const positions = ['Sem data A', 'Cidade B', 'Cidade C', 'Sem data D'].map((title) =>
      body.indexOf(title)
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(body).not.toContain('Passagens Aéreas Internacionais e Trechos Internos');
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
    expect(body.indexOf('Hotel Madri')).toBeLessThan(body.indexOf('Circuito Itália'));
    expect(body.indexOf('Circuito Itália')).toBeLessThan(body.indexOf('Passagem Internacional'));
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
    expect(html).toContain('Passagens Aéreas Internacionais e Trechos Internos');
    expect(html).toContain('<th>Serviço</th>');
    expect(html).toContain('<th>Descrição / Detalhes</th>');
    expect(html).toContain('<th>Qtd.</th>');
    expect(html).toContain('<td class="orc-service-type">Aéreo Internacional</td>');
    expect(html).toContain('<td class="orc-service-type">Voo Interno</td>');
    expect(html).toContain('<td class="orc-quantity">01 passagem</td>');
    expect(html.match(/<td class="orc-quantity">02 passagens<\/td>/g)).toHaveLength(2);
    for (const value of [
      'LATAM',
      'LA 8120',
      'GRU',
      'FCO',
      'São Paulo / Roma / São Paulo',
      'GRU → FCO - LA 8120 - 10-08-2027 - 10:50 / 10:15 (+1)',
      '10:50 / 10:15 (+1)',
      'FCO → GRU - LA 8121 - 25-08-2027 - 19:50 / 09:50 (+1)',
      'ROMA → BARCELONA - IB 1554 - 11-08-2027 - 14:00 / 15:20',
      'GRU → GIG - AD 4455',
      'Econômica',
      '02 Adultos | Econômica | FULL',
      '02 Adultos | Econômica | Standard',
      'IBERIA',
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
    expect(html.match(/São Paulo \/ Roma \/ São Paulo/g)).toHaveLength(1);
    expect(html).not.toContain('Classe: Econômica');
    expect(html).not.toContain('Tarifa: FULL');
    expect(html).not.toContain('Chegada no dia seguinte');
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
    for (const quantity of ['03 passagens', '01 passagem', '02 passagens', '04 passagens']) {
      expect(html).toContain(`<td class="orc-quantity">${quantity}</td>`);
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
        `<td>${title}</td>\n      <td>passagem</td>\n      <td class="text-right">${quantity}</td>`
      );
    }
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
    expect(html.match(/São Paulo \/ Roma \/ São Paulo/g)).toHaveLength(2);
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
    expect(html).toContain('GRU → FCO - LA 8120');
    expect(html).toContain('FCO → GRU - LA 8121');
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
    expect(html).toContain(
      '<div class="orc-title-meta orc-title-dates"><strong>Emissão:</strong> 01/07/2027 <span>·</span> <strong>Validade:</strong> 15-07-2027</div>'
    );
    expect(html).toContain('Válido até: 15-07-2027');
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
    expect(issueOnly).toContain(
      '<div class="orc-title-meta orc-title-dates"><strong>Emissão:</strong> 01/07/2027</div>'
    );
    expect(validityOnly).toContain(
      '<div class="orc-title-meta orc-title-dates"><strong>Validade:</strong> 15-07-2027</div>'
    );
    expect(neither).not.toContain('class="orc-title-meta orc-title-dates"');
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
