import { describe, expect, it } from 'vitest';
import {
  diasItem,
  novoItemOrcamento,
  rawDetalhes,
  recalcularTotaisItem,
  resumoDetalhes
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
    expect(rawDetalhes(item)).toMatchObject({ adultos_valor: 100, senior_valor: 80 });
  });

  it('omite categorias de passageiros sem quantidade no resumo', () => {
    expect(
      resumoDetalhes({
        item_type: 'passagem',
        raw: { detalhes_orcamento: { adultos: 1, criancas: 0, infant: 0 } }
      })
    ).toEqual(['Adultos: 1']);
  });
});
