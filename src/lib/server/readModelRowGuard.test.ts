import { describe, expect, it } from 'vitest';
import { createFakeDados } from '$lib/server/testing/fakeDados';
import {
  findBrokenReceiptCountKey,
  guardContributionRowsForeignKeys,
  type GuardedContributionRow
} from './readModelRowGuard';

const REAL = '11111111-1111-4111-8111-111111111111';
const CONC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function row(
  p: Partial<GuardedContributionRow> & { extra?: string }
): GuardedContributionRow & { extra?: string } {
  return {
    venda_key: 'venda-1',
    recibo_id: null,
    recibo_numero: null,
    data_recibo: '2026-03-10',
    ...p
  };
}

const client = () =>
  createFakeDados({ vendas_recibos: [{ id: REAL }] }) as unknown as Parameters<
    typeof guardContributionRowsForeignKeys
  >[0];

describe('guardContributionRowsForeignKeys', () => {
  it('recibo_id inexistente (id da conciliação) vira null; recibo real fica', async () => {
    const rows = [
      row({ recibo_id: REAL, recibo_numero: '100' }),
      row({ venda_key: CONC_A, recibo_id: CONC_A, recibo_numero: 'REXTUR' })
    ];
    const result = await guardContributionRowsForeignKeys(client(), rows);
    expect(result.nulledReciboIds).toBe(1);
    expect(result.rows[0].recibo_id).toBe(REAL);
    expect(result.rows[1].recibo_id).toBeNull();
    expect(result.rows[1].recibo_numero).toBe('REXTUR');
  });

  it('um recibo com rateio (várias linhas, mesmo id) continua contando 1', async () => {
    const rows = [
      row({ venda_key: CONC_A, recibo_id: CONC_A, recibo_numero: '200', extra: 'vendedor 1' }),
      row({ venda_key: CONC_A, recibo_id: CONC_A, recibo_numero: '200', extra: 'vendedor 2' })
    ];
    const result = await guardContributionRowsForeignKeys(client(), rows);
    expect(result.rows.every((r) => r.recibo_id === null)).toBe(true);
    expect(result.rows[0].extra).toBe('vendedor 1');
  });

  it('nada a corrigir → devolve as mesmas linhas', async () => {
    const rows = [row({ recibo_id: REAL }), row({ recibo_numero: 'X' })];
    const result = await guardContributionRowsForeignKeys(client(), rows);
    expect(result.nulledReciboIds).toBe(0);
    expect(result.rows).toBe(rows);
  });

  it('TRAVA: dois recibos Rextur da conciliação na mesma venda e data viraria 1 → não grava', async () => {
    const rows = [
      row({ venda_key: 'venda-real', recibo_id: CONC_A, recibo_numero: 'REXTUR' }),
      row({ venda_key: 'venda-real', recibo_id: CONC_B, recibo_numero: 'REXTUR' })
    ];
    await expect(guardContributionRowsForeignKeys(client(), rows)).rejects.toThrow(
      /mudaria a contagem/
    );
  });

  it('TRAVA: recibo da conciliação colidindo com recibo sem id de mesmo número → não grava', async () => {
    const rows = [
      row({ venda_key: 'venda-real', recibo_id: CONC_A, recibo_numero: '300' }),
      row({ venda_key: 'venda-real', recibo_id: null, recibo_numero: '300' })
    ];
    await expect(guardContributionRowsForeignKeys(client(), rows)).rejects.toThrow(
      /mudaria a contagem/
    );
  });
});

describe('findBrokenReceiptCountKey', () => {
  it('troca um-para-um em todas as chaves → null', () => {
    const before = [row({ venda_key: CONC_A, recibo_id: CONC_A, recibo_numero: '1' })];
    const after = [row({ venda_key: CONC_A, recibo_id: null, recibo_numero: '1' })];
    expect(findBrokenReceiptCountKey(before, after)).toBeNull();
  });

  it('ranking não usa a data: mesma venda e número em datas diferentes colide só no ranking', () => {
    const before = [
      row({ venda_key: 'v', recibo_id: CONC_A, recibo_numero: '9', data_recibo: '2026-03-01' }),
      row({ venda_key: 'v', recibo_id: CONC_B, recibo_numero: '9', data_recibo: '2026-03-02' })
    ];
    const after = before.map((r) => ({ ...r, recibo_id: null }));
    expect(findBrokenReceiptCountKey(before, after)).toBe('ranking');
  });
});
