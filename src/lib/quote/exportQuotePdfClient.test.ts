import { describe, expect, it } from 'vitest';
import { buildQuotePreviewHtmlSync } from './exportQuotePdfClient';
import { VTUR_LOGO_URL } from '$lib/brand';

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
    expect(html).toContain('Proposta de viagem');
    expect(html).toContain('Informações importantes');
    expect(html).not.toContain('>SERVIÇO<');
  });

  it('monta os cards do layout aprovado com os dados do orçamento', () => {
    const html = buildQuotePreviewHtmlSync({
      quote: {
        id: 'quote-2',
        client_name: 'Andre Luis de Lima',
        created_at: '2026-11-13T12:00:00Z',
        currency: 'BRL',
        data_embarque: '2027-01-17',
        data_final: '2027-01-27',
        raw_json: { valid_until: '2026-11-14', qtd_adultos: 2 }
      },
      items: [
        {
          item_type: 'Passagem Aérea',
          title: 'São Paulo / Los Angeles',
          quantity: 2,
          total_amount: 6500,
          currency: 'BRL',
          raw: { qtd_adultos: 2, classe: 'Econômica', tarifa_nome: 'Tarifa Full' },
          segments: [
            {
              segment_type: 'flight',
              order_index: 0,
              data: {
                cidade_saida: 'São Paulo',
                aeroporto_saida: 'GRU',
                cidade_chegada: 'Los Angeles',
                aeroporto_chegada: 'LAX',
                data_voo: '2027-01-17',
                data_fim: '2027-01-18',
                hora_saida: '22:30',
                hora_chegada: '7:10',
                cia_aerea: 'LATAM',
                numero_voo: 'LA 8064',
                tipo_voo: 'Ida'
              }
            },
            {
              segment_type: 'flight',
              order_index: 1,
              data: {
                cidade_saida: 'Los Angeles',
                aeroporto_saida: 'LAX',
                cidade_chegada: 'São Paulo',
                aeroporto_chegada: 'GRU',
                data_voo: '2027-01-26',
                data_fim: '2027-01-27',
                hora_saida: '18:00',
                hora_chegada: '07:30',
                cia_aerea: 'LATAM',
                numero_voo: 'LA 8065',
                tipo_voo: 'Volta'
              }
            }
          ]
        },
        {
          item_type: 'Hotel',
          title: 'Hollywood Hotel Inn',
          city_name: 'Los Angeles',
          quantity: 1,
          total_amount: 200,
          start_date: '2027-01-17',
          end_date: '2027-01-20',
          raw: { estrelas: 3, apto: 'Apto duplo', regime: 'Café da manhã', qtd_adultos: 2 }
        },
        {
          item_type: 'Aluguel de Carro',
          title: 'SUV automático',
          city_name: 'Los Angeles',
          quantity: 1,
          total_amount: 700,
          start_date: '2027-01-17',
          end_date: '2027-01-20',
          raw: { km_livre: 'KM livre', seguros: 'CDW + LDW', tanque: 'Tanque cheio' }
        },
        {
          item_type: 'Trem',
          title: 'Trem de alta velocidade',
          city_name: 'Las Vegas',
          quantity: 2,
          total_amount: 400,
          start_date: '2027-01-19',
          raw: {
            trecho: 'Las Vegas - Los Angeles',
            hora_saida: '14:00',
            hora_chegada: '15:20',
            numero_voo: 'OL 2020',
            assentos: '10A e 10B',
            classe: 'Econômica'
          }
        }
      ],
      settings: {
        consultor_nome: 'André Lima',
        telefone: '(11) 94934-7521',
        email: 'andreconsultorviagens@gmail.com'
      },
      qrUrl: 'data:image/png;base64,qr',
      complementUrl: null,
      showBudgetItems: false,
      showBudgetDetails: true,
      showItemValues: true
    });

    expect(html).toContain('Proposta de viagem');
    expect(html).toContain('Andre Luis de Lima');
    expect(html).toContain('Los Angeles e Las Vegas');
    expect(html).toContain('17/01 a 27/01/2027');
    expect(html).toContain('2 adultos');
    expect(html).toContain('13/11/2026');
    expect(html).toContain('14/11/2026');
    expect(html).toContain('class="val"');
    expect(html).toContain('Passagens aéreas');
    expect(html).toContain('AÉREO · IDA · 17/01/2027');
    expect(html).toContain('AÉREO · VOLTA · 26/01/2027');
    expect(html).toContain('class="p1">+1');
    expect(html).toContain('São Paulo / Los Angeles');
    expect(html).toContain('LATAM · LA 8064');
    expect(html).toContain('HOTEL · 17/01 a 20/01/2027 · 3 NOITES');
    expect(html).toContain('3 estrelas · Apto duplo');
    expect(html).toContain('CARRO · 17/01 a 20/01/2027 · 4 DIÁRIAS');
    expect(html).toContain('TREM · 19/01/2027');
    expect(html).toContain('2 passagens');
    expect(html).toContain('1 apartamento');
    expect(html).toContain('1 carro');
    expect(html).toContain('Total da viagem');
    expect(html).toContain('Aéreo');
    expect(html).toContain('Serviços');
    expect(html).toContain('Reserve com o André');
    expect(html).toContain('stroke="#243AA3"');
    expect(html).not.toContain('SERVIÇO');
    expect(html).not.toContain('02 passagens');
  });
});
