import { describe, expect, it } from 'vitest';

import {
  getReceiptCidadeNome,
  getVendaDestino,
  type ReportReceiptRow,
  type ReportVendaRow
} from '$lib/server/relatorios';

function venda(overrides: Partial<ReportVendaRow> = {}): ReportVendaRow {
  return {
    id: 'venda-1',
    numero_venda: null,
    cliente_id: null,
    vendedor_id: null,
    company_id: null,
    data_venda: null,
    data_embarque: null,
    data_final: null,
    valor_total: 0,
    valor_nao_comissionado: 0,
    valor_taxas: 0,
    cancelada: false,
    ...overrides
  };
}

function recibo(
  overrides: Partial<NonNullable<ReportReceiptRow>> = {}
): NonNullable<ReportReceiptRow> {
  return {
    id: 'recibo-1',
    numero_recibo: null,
    numero_reserva: null,
    data_venda: null,
    produto_id: null,
    valor_total: 0,
    valor_taxas: 0,
    valor_du: 0,
    valor_rav: 0,
    tipo_pacote: null,
    ...overrides
  };
}

describe('destino em relatorios', () => {
  it('usa a cidade do produto operacional do recibo antes do destino/produto da venda', () => {
    const cityNames = new Map([
      ['cidade-bue', 'Buenos Aires'],
      ['cidade-venda', 'Sao Paulo']
    ]);
    const row = venda({
      destinos: {
        id: 'produto-venda',
        nome: 'Seguro Viagem',
        cidade_id: 'cidade-venda'
      },
      recibos: [
        recibo({
          produto_resolvido: {
            id: 'produto-recibo',
            nome: 'Aereo + Hotel',
            cidade_id: 'cidade-bue'
          }
        })
      ]
    });

    expect(getVendaDestino(row, cityNames)).toBe('Buenos Aires');
  });

  it('nao usa nome de produto como fallback de destino', () => {
    const row = venda({
      destinos: { id: 'produto-venda', nome: 'Seguro Viagem', cidade_id: null }
    });

    expect(getVendaDestino(row)).toBe('Destino nao informado');
  });

  it('resolve cidade do recibo por destino_cidade_id quando o nome veio ausente', () => {
    const cityNames = new Map([['cidade-mia', 'Miami']]);
    const row = venda();
    const item = recibo({
      destino_cidade: { id: 'cidade-mia', nome: null }
    });

    expect(getReceiptCidadeNome(item, row, cityNames)).toBe('Miami');
  });
});
