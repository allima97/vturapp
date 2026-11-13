import { describe, expect, it } from 'vitest';
import { renderPreviewFlights } from './preview-cards';
import { newTransporte } from './tipos';

describe('trechos aéreos no PDF do roteiro', () => {
  it('mostra cada trecho em ordem, com aeroportos, horários e detalhes disponíveis', () => {
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
    const [first, second] = html.split('</article>');
    expect(first).toContain('TRECHO 1 — sábado, 02 de janeiro de 2027');
    expect(first).toContain('<span>Voo <span aria-hidden="true">✈</span> TP 123</span>');
    expect(second).toContain('TRECHO 2 — domingo, 03 de janeiro de 2027');
    expect(second).toContain('<span>Voo <span aria-hidden="true">✈</span> Não informado</span>');
    for (const value of [
      'TRECHO 1',
      'GRU',
      'São Paulo',
      'LIS',
      'Lisboa',
      '2027-01-02',
      '23:30',
      '2027-01-03',
      '12:00',
      '9h30',
      'TAP',
      'Econômica',
      'Light'
    ]) {
      expect(first).toContain(value);
    }
    expect(second).toContain('TRECHO 2');
    expect(second).toContain('Lisboa');
    expect(second).toContain('Roma');
    expect(second).toContain('Não informada');
    expect(second).not.toContain('CLASSE');
    expect(second).toContain('<span>COMPANHIA</span><strong>LATAM</strong>');
    expect(second).not.toContain('LA — LATAM');
  });

  it('usa a data de início quando a data do voo não está preenchida', () => {
    const html = renderPreviewFlights(
      [{ ...newTransporte(0), data_inicio: '2027-01-03' }],
      (date) => date || ''
    );
    expect(html).toContain('TRECHO 1 — domingo, 03 de janeiro de 2027');
    expect(renderPreviewFlights([newTransporte(0)], (date) => date || '')).toContain(
      'TRECHO 1 — Não informada'
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
    expect(html).toContain('Voo <span aria-hidden="true">✈</span> &lt;voo&gt;');
    expect(html).not.toContain('<voo>');
  });

  it.each([
    ['2028-02-28', '2028-02-29', 'Chegada no dia seguinte (+1)'],
    ['2027-12-31', '2028-01-02', 'Chegada 2 dias depois (+2)'],
    ['2027-01-02', '2027-01-01', 'Chegada no dia anterior (-1)'],
    ['2027-01-03', '2027-01-01', 'Chegada 2 dias antes (-2)']
  ])('avisa quando a chegada %s / %s ocorre em outro dia', (saida, chegada, aviso) => {
    const html = renderPreviewFlights(
      [{ ...newTransporte(0), data_voo: saida, data_fim: chegada }],
      (date) => date || ''
    );
    expect(html).toContain(aviso);
  });

  it('não presume mudança de dia para datas iguais, ausentes ou inválidas', () => {
    for (const chegada of ['2027-01-02', '', '2027-02-30']) {
      const html = renderPreviewFlights(
        [{ ...newTransporte(0), data_voo: '2027-01-02', data_fim: chegada }],
        (date) => date || ''
      );
      expect(html).not.toContain('roteiro-flight-arrival-notice');
    }
    const html = renderPreviewFlights(
      [{ ...newTransporte(0), data_inicio: '2027-01-02', data_fim: '2027-01-03' }],
      (date) => date || ''
    );
    expect(html).toContain('Chegada no dia seguinte (+1)');
  });
});
