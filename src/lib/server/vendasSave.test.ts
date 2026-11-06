import type { DataClient } from '$lib/server/data';
import { describe, expect, it } from 'vitest';

import { ensureReciboReservaUnicos } from '$lib/server/vendasSave';

type QueryResult = { data: unknown[]; error?: unknown };

class QueryMock {
  private table: string;
  private results: Record<string, QueryResult>;

  constructor(table: string, results: Record<string, QueryResult>) {
    this.table = table;
    this.results = results;
  }

  select() {
    return this;
  }

  eq() {
    return this;
  }

  neq() {
    return this;
  }

  in() {
    return this;
  }

  limit() {
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve(this.results[this.table] || { data: [], error: null }).then(
      onfulfilled,
      onrejected
    );
  }
}

function createClientMock(results: Record<string, QueryResult>) {
  return {
    from(table: string) {
      return new QueryMock(table, results);
    }
  } as unknown as Pick<DataClient, 'from'>;
}

describe('ensureReciboReservaUnicos', () => {
  it('ignores duplicate receipt numbers attached to cancelled sales', async () => {
    const client = createClientMock({
      vendas: { data: [{ id: 'venda-cancelada' }], error: null },
      vendas_recibos: {
        data: [
          {
            id: 'recibo-existente',
            numero_recibo: '5630-0000084181',
            numero_recibo_normalizado: '56300000084181',
            venda_id: 'venda-cancelada'
          }
        ],
        error: null
      }
    });

    await expect(
      ensureReciboReservaUnicos({
        client,
        companyId: 'empresa-1',
        clienteId: 'cliente-1',
        recibos: [{ numero_recibo: '5630-0000084181' }]
      })
    ).resolves.toBeUndefined();
  });

  it('keeps blocking duplicate receipt numbers attached to active sales', async () => {
    const client = createClientMock({
      vendas: { data: [{ id: 'venda-cancelada' }], error: null },
      vendas_recibos: {
        data: [
          {
            id: 'recibo-existente',
            numero_recibo: '5630-0000084181',
            numero_recibo_normalizado: '56300000084181',
            venda_id: 'venda-ativa'
          }
        ],
        error: null
      }
    });

    await expect(
      ensureReciboReservaUnicos({
        client,
        companyId: 'empresa-1',
        clienteId: 'cliente-1',
        recibos: [{ numero_recibo: '5630-0000084181' }]
      })
    ).rejects.toThrow('RECIBO_DUPLICADO');
  });
});
