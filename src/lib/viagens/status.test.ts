// Testes de caracterização: status de viagem (Fase 1).
import { describe, expect, it } from 'vitest';
import { formatViagemStatus, normalizeViagemStatus, resolveViagemStatus } from './status';

const HOJE = '2026-09-24';

describe('normalizeViagemStatus', () => {
  it('aceita aliases, acentos e hífen/espaço', () => {
    expect(normalizeViagemStatus('Planejada')).toBe('pendente');
    expect(normalizeViagemStatus('programado')).toBe('confirmada');
    expect(normalizeViagemStatus('Em andamento')).toBe('em_viagem');
    expect(normalizeViagemStatus('em-viagem')).toBe('em_viagem');
    expect(normalizeViagemStatus('Concluído')).toBe('concluida');
    expect(normalizeViagemStatus('xyz')).toBe('pendente');
  });
});

describe('resolveViagemStatus (datas mandam, exceto cancelada)', () => {
  it.each([
    [{ status: 'cancelada', data_inicio: '2026-09-01', data_fim: '2026-09-10' }, 'cancelada'],
    [{ status: 'pendente', data_inicio: '2026-09-01', data_fim: '2026-09-10' }, 'concluida'],
    [{ status: 'pendente', data_inicio: '2026-10-01', data_fim: '2026-10-10' }, 'confirmada'],
    [{ status: 'confirmada', data_inicio: '2026-09-20', data_fim: '2026-09-30' }, 'em_viagem'],
    [{ status: 'confirmada', data_inicio: HOJE, data_fim: HOJE }, 'em_viagem'],
    [{ status: 'confirmada', data_inicio: '2026-09-20', data_fim: null }, 'em_viagem'],
    [{ status: 'confirmada', data_inicio: null, data_fim: null }, 'pendente']
  ])('%o → %s', (input, esperado) => {
    expect(resolveViagemStatus({ ...input, hoje: HOJE })).toBe(esperado);
  });
});

describe('formatViagemStatus', () => {
  it('rótulos em português', () => {
    expect(formatViagemStatus('em_viagem')).toBe('Em viagem');
    expect(formatViagemStatus('concluida')).toBe('Concluída');
  });
});
