import { describe, expect, it } from 'vitest';
import {
  renderPreviewCarros,
  renderPreviewFlights,
  renderPreviewSeguros,
  renderPreviewTrens
} from './preview-cards';
import { newPasseio, newTransporte } from './tipos';

const formatDate = (date: string | null | undefined) => date || '';

describe('trechos aéreos no PDF do roteiro', () => {
  it('mostra cada trecho como a linha do orçamento, com aeroportos, horários e chips', () => {
    const html = renderPreviewFlights(
      [
        {
          ...newTransporte(0),
          trecho: 'São Paulo → Lisboa',
          aeroporto_saida: 'gru',
          aeroporto_chegada: 'lis',
          cia_aerea: 'TAP',
          descricao: 'TP 123',
          data_voo: '2027-01-02',
          data_fim: '2027-01-03',
          hora_saida: '23:30',
          hora_chegada: '12:00',
          duracao_voo: '9h30',
          classe_reserva: 'Econômica',
          tarifa_nome: 'Light'
        },
        { ...newTransporte(1), trecho: 'Lisboa - Roma', cia_aerea: 'LATAM', data_voo: '2027-01-03' }
      ],
      (date) => date || ''
    );
    const rows = html.split('class="row rot-row').slice(1);
    const [first, second] = rows;
    expect(first).toContain('class="rtf"');
    expect(first).toContain('<b>GRU</b>');
    expect(first).toContain('<b>LIS</b>');
    expect(first).toContain('São Paulo – 02/01/2027');
    expect(first).toContain('Lisboa – 03/01/2027');
    expect(first).toContain('· 23:30');
    expect(first).toContain('· 12:00');
    expect(first).toContain('<span class="p1">+1</span>');
    expect(first).toContain('>TP 123</span>');
    expect(first).toContain('>TAP</span>');
    expect(first).toContain('style="width:50px"');
    expect(first).toContain('>Econômica</span>');
    expect(first).toContain('>Light</span>');
    expect(first).toContain('orc-service-icon--flight');
    expect(second).toContain('Lisboa');
    expect(second).toContain('Roma');
    expect(second).toContain('>LATAM</span>');
    expect(second).not.toContain('CLASSE');
    expect(second).not.toContain('LA — LATAM');
    expect(html).not.toContain('TRECHO 1');
    expect(html).not.toContain('DURAÇÃO');
  });

  it('mostra classe e tarifa como chips, e omite a classe quando ela não existe', () => {
    const html = renderPreviewFlights(
      [{ ...newTransporte(0), cia_aerea: 'LATAM', tarifa_nome: 'FULL', trecho: 'Roma - Madrid' }],
      (date) => date || ''
    );
    expect(html).toContain('>LATAM</span>');
    expect(html).toContain('>FULL</span>');
    expect(html).not.toContain('roteiro-flight-detail-classe');
    expect(html).not.toContain('>CLASSE<');
  });

  it('usa a data de início quando a data do voo não está preenchida', () => {
    const html = renderPreviewFlights(
      [{ ...newTransporte(0), data_inicio: '2027-01-03', trecho: 'Roma - Madrid' }],
      (date) => date || ''
    );
    expect(html).toContain('03/01/2027');
    expect(renderPreviewFlights([newTransporte(0)], (date) => date || '')).not.toContain(
      'Não informada'
    );
  });

  it('escapa texto dos trechos e não repete o código como cidade', () => {
    const html = renderPreviewFlights(
      [
        {
          ...newTransporte(0),
          trecho: 'GRU - <Roma>',
          aeroporto_saida: 'GRU',
          cia_aerea: '<cia>',
          descricao: '<voo>'
        }
      ],
      (date) => date || ''
    );
    expect(html.match(/GRU/g)).toHaveLength(1);
    expect(html).toContain('&lt;Roma&gt;');
    expect(html).not.toContain('<Roma>');
    expect(html).not.toContain('<cia>');
    expect(html).toContain('&lt;voo&gt;');
    expect(html).not.toContain('<voo>');
  });

  it.each([
    ['2028-02-28', '2028-02-29', '+1'],
    ['2027-12-31', '2028-01-02', '+2']
  ])('marca a chegada %s / %s com %s', (saida, chegada, aviso) => {
    const html = renderPreviewFlights(
      [
        {
          ...newTransporte(0),
          trecho: 'São Paulo - Roma',
          data_voo: saida,
          data_fim: chegada
        }
      ],
      (date) => date || ''
    );
    expect(html).toContain(`<span class="p1">${aviso}</span>`);
  });

  it('não marca mudança de dia para datas iguais, anteriores, ausentes ou inválidas', () => {
    for (const chegada of ['2027-01-02', '2027-01-01', '', '2027-02-30']) {
      const html = renderPreviewFlights(
        [{ ...newTransporte(0), data_voo: '2027-01-02', data_fim: chegada, trecho: 'A - B' }],
        (date) => date || ''
      );
      expect(html).not.toContain('class="p1"');
    }
  });
});

describe('cards de passeio no PDF do roteiro (paridade com orçamento)', () => {
  it('carro mostra selo, rota e incluídos sem quantidade', () => {
    const html = renderPreviewCarros(
      [
        {
          ...newPasseio(0, 'Aluguel de Carro'),
          cidade: 'Paris',
          passeio: 'Carro intermediário',
          data_inicio: '2027-01-10',
          data_fim: '2027-01-15',
          detalhes: {
            incluidos: ['KM Livre', 'CDW', 'LDW'],
            segmentos: [],
            cambio: 'Automático',
            locadora: 'Europcar',
            cidade_devolucao: 'Lyon',
            quantidade: 2
          }
        }
      ],
      formatDate
    );
    expect(html).toContain('CARRO · 6 DIÁRIAS');
    expect(html).toContain('Retirada:');
    expect(html).toContain('Devolução:');
    expect(html).toContain('Europcar');
    expect(html).toContain('KM livre');
    expect(html).toContain('CDW + LDW');
    expect(html).not.toContain('carros');
  });

  it('trem mostra trecho como no orçamento, sem linha extra de cidade/data nem período', () => {
    const html = renderPreviewTrens(
      [
        {
          ...newPasseio(0, 'Trem'),
          cidade: 'Paris',
          passeio: 'TGV Paris - Lyon',
          data_inicio: '2027-01-10',
          data_fim: '2027-01-10',
          detalhes: {
            incluidos: [],
            segmentos: [
              {
                ...newTransporte(0),
                trecho: 'Paris - Lyon',
                cia_aerea: 'TGV',
                numero_voo: '6123',
                data_voo: '2027-01-10',
                hora_saida: '08:19',
                hora_chegada: '10:37',
                aeroporto_saida: 'Paris Gare de Lyon',
                aeroporto_chegada: 'Lyon Part-Dieu',
                classe_reserva: 'Executiva',
                assentos: '12A',
                cidade_saida_id: '',
                cidade_chegada_id: ''
              }
            ]
          }
        }
      ],
      formatDate
    );
    expect(html).toContain('TREM ·');
    expect(html).toContain('Paris Gare de Lyon');
    expect(html).toContain('Lyon Part-Dieu');
    expect(html).toContain('TGV · 6123');
    expect(html).toContain('Executiva');
    expect(html).toContain('Assentos 12A');
    expect(html).not.toContain('class="ct"');
    expect(html).not.toContain('class="meta"');
  });

  it('seguro mostra selo com período e dias, fornecedor e passageiros', () => {
    const html = renderPreviewSeguros(
      [
        {
          ...newPasseio(0, 'Seguro Viagem'),
          cidade: 'Paris',
          passeio: 'Seguro Europa',
          fornecedor: 'Assist Card',
          data_inicio: '2027-01-10',
          data_fim: '2027-01-15',
          qtd_adultos: 2,
          qtd_criancas: 1,
          detalhes: { incluidos: [], segmentos: [], infant: 1, senior: 1 }
        }
      ],
      formatDate
    );
    expect(html).toContain('SEGURO VIAGEM ·');
    expect(html).toContain('- 06 dias');
    expect(html).toContain('Assist Card');
    expect(html).toContain('2 adultos e 1 criança e 1 infant');
    expect(html).not.toContain('Total de dias');
    expect(html).not.toContain('sênior');
    expect(html).not.toContain('senior');
    expect(html).not.toContain('Não incluído');
  });
});
