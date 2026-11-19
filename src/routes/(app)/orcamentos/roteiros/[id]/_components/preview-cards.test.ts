import { describe, expect, it } from 'vitest';
import { renderPreviewFlights } from './preview-cards';
import { newTransporte } from './tipos';

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
