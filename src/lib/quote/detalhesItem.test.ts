import { describe, expect, it } from 'vitest';
import {
  diasItem,
  lerDetalhes,
  novoItemOrcamento,
  rawDetalhes,
  recalcularTotaisItem,
  resumoDetalhes,
  resumoItemOrcamento
} from './detalhesItem';

describe('cálculos por tipo de item do orçamento', () => {
  it('calcula noites e total do hotel pela quantidade de apartamentos', () => {
    const item = novoItemOrcamento(0);
    item.item_type = 'hotel';
    item.start_date = '2027-01-20';
    item.end_date = '2027-01-23';
    item.quantidade_apartamentos = 2;
    item.unit_price = 750;

    recalcularTotaisItem(item);

    expect(diasItem(item.item_type, item.start_date, item.end_date)).toBe(3);
    expect(item.quantity).toBe(2);
    expect(item.total_amount).toBe(1500);
  });

  it('calcula dias inclusivos do carro sem multiplicar a diária pelo período', () => {
    const item = novoItemOrcamento(0);
    item.item_type = 'aluguel_carro';
    item.start_date = '2027-01-20';
    item.end_date = '2027-01-23';
    item.quantity = 2;
    item.unit_price = 300;

    recalcularTotaisItem(item);

    expect(diasItem(item.item_type, item.start_date, item.end_date)).toBe(4);
    expect(item.total_amount).toBe(600);
    item.locadora = ' Hertz ';
    item.cidade_devolucao = ' Las Vegas ';
    item.hora_retirada = '10:00';
    item.hora_devolucao = '18:30';
    expect(rawDetalhes(item)).toMatchObject({
      locadora: 'Hertz',
      cidade_devolucao: 'Las Vegas',
      hora_retirada: '10:00',
      hora_devolucao: '18:30'
    });
    expect(
      lerDetalhes({ item_type: 'aluguel_carro', raw: { detalhes_orcamento: rawDetalhes(item) } })
    ).toMatchObject({
      locadora: 'Hertz',
      cidade_devolucao: 'Las Vegas',
      hora_retirada: '10:00',
      hora_devolucao: '18:30'
    });
  });

  it('aplica horários padrão de check-in e check-out no hotel quando não informados', () => {
    const padrao = lerDetalhes({ item_type: 'hotel', raw: { detalhes_orcamento: {} } });
    expect(padrao.hora_checkin).toBe('15:00');
    expect(padrao.hora_checkout).toBe('11:00');
    const custom = lerDetalhes({
      item_type: 'hotel',
      raw: { detalhes_orcamento: { hora_checkin: '14:00', hora_checkout: '12:00' } }
    });
    expect(custom.hora_checkin).toBe('14:00');
    expect(custom.hora_checkout).toBe('12:00');
  });

  it('soma valores de adultos, crianças e infants por passagem', () => {
    const item = novoItemOrcamento(0);
    item.item_type = 'passagem';
    item.adultos = 2;
    item.adultos_valor = 200;
    item.criancas = 1;
    item.criancas_valor = 100;
    item.infant = 0;
    item.infant_valor = 50;

    recalcularTotaisItem(item);

    expect(item.quantity).toBe(3);
    expect(item.total_amount).toBe(500);
  });

  it('cobra o seguro por passageiro pelo período, sem multiplicar pelos dias', () => {
    const item = novoItemOrcamento(0);
    item.item_type = 'seguro';
    item.start_date = '2027-01-20';
    item.end_date = '2027-01-23';
    item.adultos = 1;
    item.adultos_valor = 100;
    item.senior = 1;
    item.senior_valor = 80;

    recalcularTotaisItem(item);

    expect(diasItem(item.item_type, item.start_date, item.end_date)).toBe(4);
    expect(item.total_amount).toBe(180);
    item.fornecedor = ' Assist Card ';
    expect(rawDetalhes(item)).toMatchObject({
      adultos_valor: 100,
      senior_valor: 80,
      fornecedor: 'Assist Card'
    });
    expect(
      lerDetalhes({ item_type: 'seguro', raw: { detalhes_orcamento: rawDetalhes(item) } })
        .fornecedor
    ).toBe('Assist Card');
  });

  it('omite categorias de passageiros sem quantidade no resumo', () => {
    expect(
      resumoDetalhes({
        item_type: 'passagem',
        raw: { detalhes_orcamento: { adultos: 1, criancas: 0, infant: 0 } }
      })
    ).toEqual(['Adultos: 1']);
  });

  it('resume tipo, destino, descrição, datas e duração antes de abrir o item', () => {
    const hotel = novoItemOrcamento(0);
    hotel.item_type = 'hotel';
    hotel.city_name = 'Los Angeles';
    hotel.title = 'Hollywood Hotel Inn';
    hotel.start_date = '2027-01-17';
    hotel.end_date = '2027-01-20';

    const carro = novoItemOrcamento(1);
    carro.item_type = 'aluguel_carro';
    carro.city_name = 'Los Angeles';
    carro.title = 'SUV - Automático';
    carro.start_date = '2027-01-17';
    carro.end_date = '2027-01-20';

    const passagemIdaEVolta = novoItemOrcamento(2);
    passagemIdaEVolta.item_type = 'passagem';
    passagemIdaEVolta.city_name = 'Roma, Città metropolitana di Roma Capitale, Lácio, Itália';
    passagemIdaEVolta.title = 'SÃO PAULO / ROMA / SÃO PAULO';
    passagemIdaEVolta.start_date = '2027-08-10';
    passagemIdaEVolta.end_date = '2027-08-25';

    const passagemSomenteSaida = novoItemOrcamento(3);
    passagemSomenteSaida.item_type = 'passagem';
    passagemSomenteSaida.city_name = 'Barcelona';
    passagemSomenteSaida.title = 'Roma - Barcelona';
    passagemSomenteSaida.start_date = '2027-08-11';

    expect(resumoItemOrcamento(hotel)).toBe(
      'Hotel · Los Angeles · Hollywood Hotel Inn · 17-01-2027 a 20-01-2027 (3 noites)'
    );
    expect(resumoItemOrcamento(carro)).toBe(
      'Aluguel de Carro · Los Angeles · SUV - Automático · 17-01-2027 a 20-01-2027 (04 dias)'
    );
    expect(resumoItemOrcamento(passagemIdaEVolta)).toBe(
      'Passagem Aérea · Roma · São Paulo / Roma / São Paulo · 10-08-2027 a 25-08-2027'
    );
    expect(resumoItemOrcamento(passagemSomenteSaida)).toBe(
      'Passagem Aérea · Barcelona · Roma - Barcelona · 11-08-2027'
    );
  });
});
