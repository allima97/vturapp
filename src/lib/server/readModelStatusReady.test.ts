import { describe, expect, it } from 'vitest';
import { isStatusReady } from './reciboContribuicoesReadModel';

const EMP = 'e';
const now = Date.parse('2026-09-25T12:00:00Z');
const row = (mes: string, rebuilt_at: string | null, extra: Record<string, unknown> = {}) => ({
  company_id: EMP,
  mes,
  status: 'ready',
  rebuilt_at,
  dirty_at: null,
  ...extra
});

describe('isStatusReady', () => {
  it('mês encerrado montado antes de terminar (julho em 01/07) não conta como pronto', () => {
    expect(isStatusReady(row('2026-07-01', '2026-07-01T12:46:07Z'), now)).toBe(false);
  });
  it('mês encerrado montado depois de terminar continua pronto', () => {
    expect(isStatusReady(row('2026-02-01', '2026-09-25T10:45:19Z'), now)).toBe(true);
    // limite: meia-noite de Brasília do dia 1 (03:00 UTC)
    expect(isStatusReady(row('2026-08-01', '2026-09-01T03:00:00Z'), now)).toBe(true);
    expect(isStatusReady(row('2026-08-01', '2026-09-01T02:59:59Z'), now)).toBe(false);
  });
  it('mês atual segue a regra de antes (dirty_at)', () => {
    expect(isStatusReady(row('2026-09-01', '2026-09-24T22:31:59Z'), now)).toBe(true);
    expect(
      isStatusReady(
        row('2026-09-01', '2026-09-24T22:31:59Z', { dirty_at: '2026-09-25T01:00:00Z' }),
        now
      )
    ).toBe(false);
  });
  it('status diferente de ready ou sem rebuilt_at: não pronto', () => {
    expect(isStatusReady(row('2026-05-01', null), now)).toBe(false);
    expect(
      isStatusReady({ ...row('2026-05-01', '2026-09-25T10:00:00Z'), status: 'error' }, now)
    ).toBe(false);
  });
});
