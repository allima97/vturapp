import { describe, expect, it } from 'vitest';
import { createFakeDados } from '$lib/server/testing/fakeDados';
import {
  currentMonthStartBrazil,
  markNightlyReadModelMonthsDirty,
  monthEndInstantBrazil,
  monthStartsBack,
  NIGHTLY_READ_MODEL_CRON,
  selectNightlyDirtyMonths,
} from './readModelRebuild';

const EMP = '104037a0-e143-4cb7-ae81-fc31da188ae4';

describe('rodada noturna do read model', () => {
  it('cron noturno às 03:07 de Brasília', () => {
    expect(NIGHTLY_READ_MODEL_CRON).toBe('7 6 * * *');
  });

  it('mês atual em Brasília (virada de mês pelo fuso)', () => {
    expect(currentMonthStartBrazil(new Date('2026-10-01T02:00:00Z'))).toBe('2026-09-01'); // 23h de 30/09 em SP
    expect(currentMonthStartBrazil(new Date('2026-10-01T03:30:00Z'))).toBe('2026-10-01');
  });

  it('lista de meses para trás atravessa o ano', () => {
    expect(monthStartsBack('2026-02-01', 3)).toEqual(['2026-02-01', '2026-01-01', '2025-12-01', '2025-11-01']);
  });

  it('fim do mês é a meia-noite de Brasília do dia 1 seguinte', () => {
    expect(new Date(monthEndInstantBrazil('2026-07-01')).toISOString()).toBe('2026-08-01T03:00:00.000Z');
    expect(new Date(monthEndInstantBrazil('2026-12-01')).toISOString()).toBe('2027-01-01T03:00:00.000Z');
  });

  it('escolhe: 3 meses recentes, meses nunca montados e meses montados antes de terminar', () => {
    const monthStarts = monthStartsBack('2026-09-01', 12);
    const statuses = [
      { company_id: EMP, mes: '2026-09-01', status: 'ready', rebuilt_at: '2026-09-24T22:31:59Z' },
      { company_id: EMP, mes: '2026-08-01', status: 'dirty', rebuilt_at: null },
      { company_id: EMP, mes: '2026-07-01', status: 'ready', rebuilt_at: '2026-07-01T12:46:07Z' }, // montado no dia 1
      { company_id: EMP, mes: '2026-06-01', status: 'ready', rebuilt_at: '2026-09-25T02:57:04Z' }, // ok
      { company_id: EMP, mes: '2026-05-01', status: 'error', rebuilt_at: null },
      { company_id: EMP, mes: '2026-01-01', status: 'ready', rebuilt_at: '2026-09-14T21:13:11Z' }, // ok
      { company_id: EMP, mes: '2025-12-01', status: 'ready', rebuilt_at: '2026-09-14T21:13:09Z' }, // ok
      { company_id: EMP, mes: '2025-11-01', status: 'ready', rebuilt_at: '2025-11-30T10:00:00Z' }, // antes do fim
    ];
    const selected = selectNightlyDirtyMonths({ companyIds: [EMP], monthStarts, statuses }).map((e) => e.mes);
    expect(selected).toEqual([
      '2026-09-01', // sempre (atual)
      // 2026-08 já está dirty; o cron cuida
      '2026-07-01', // sempre (3 recentes) e também montado antes de terminar
      // 2026-06 pronto depois do fim → fica
      // 2026-05 em error → o cron cuida (1x por hora)
      '2026-04-01', // nunca montado
      '2026-03-01',
      '2026-02-01',
      // 2026-01 e 2025-12 prontos → ficam
      '2025-11-01', // montado antes de terminar
      '2025-10-01', // nunca montado
      '2025-09-01',
    ]);
  });

  it('marca como dirty em um único upsert, só para empresas ativas', async () => {
    const db = createFakeDados({
      companies: [
        { id: EMP, active: true },
        { id: 'e3cfd4d6-d533-4629-8f51-22cdf9211d9e', active: false },
      ],
      ranking_read_model_status: [],
    });
    const result = await markNightlyReadModelMonthsDirty(
      db as never,
      new Date('2026-09-25T06:07:00Z'),
    );
    expect(result).toEqual({ companies: 1, marked: 13 });
    const upserts = db.log.filter((entry) => entry.op === 'upsert');
    expect(upserts).toHaveLength(1);
    const values = upserts[0].values as Array<Record<string, unknown>>;
    expect(values).toHaveLength(13);
    expect(values[0]).toMatchObject({ modelo: 'recibo_contribuicoes_v4', company_id: EMP, mes: '2026-09-01', status: 'dirty' });
  });
});
