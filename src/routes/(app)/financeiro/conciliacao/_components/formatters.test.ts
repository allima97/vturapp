// Fase 3.5: funções movidas sem alteração de +page.svelte para este módulo.
// Os valores esperados registram o comportamento atual da tela.
import { describe, expect, it } from 'vitest';
import {
  exigeRanking,
  formatCurrency,
  formatDocumentoConciliacao,
  formatMoney,
  getDiffRatio,
  isCriticalDiff,
  resolveMetaDifLabel,
  statusImportLabel,
} from './formatters';

const nbsp = (s: string) => s.replace(/ /g, ' ');

describe('conciliação: formatadores', () => {
  it('status da importação', () => {
    expect(statusImportLabel('baixa')).toBe('Efetivado');
    expect(statusImportLabel('OPFAX')).toBe('Pendente em OPFAX');
    expect(statusImportLabel('estorno')).toBe('Estorno');
    expect(statusImportLabel('')).toBe('OUTRO');
    expect(statusImportLabel('xyz')).toBe('XYZ');
  });

  it('ranking é exigido só em BAIXA e OPFAX', () => {
    expect(exigeRanking('baixa')).toBe(true);
    expect(exigeRanking('OPFAX')).toBe(true);
    expect(exigeRanking('ESTORNO')).toBe(false);
  });

  it('documento com e sem reserva', () => {
    expect(formatDocumentoConciliacao({ documento: 'REXTUR', numero_reserva: '123' })).toBe('REXTUR / 123');
    expect(formatDocumentoConciliacao({ documento: ' 456 ' })).toBe('456');
    expect(formatDocumentoConciliacao({})).toBe('-');
  });

  it('meta diferenciada: 31% ou mais é Seguro Viagem', () => {
    expect(resolveMetaDifLabel(31)).toBe('Seguro Viagem');
    expect(resolveMetaDifLabel(10, 'Sim')).toBe('Sim');
    expect(resolveMetaDifLabel(null)).toBe('Não');
  });

  it('valores em pt-BR', () => {
    expect(formatMoney(1234.5)).toBe('1.234,50');
    expect(formatMoney(null)).toBe('0,00');
    expect(nbsp(formatCurrency(1234.5))).toBe('R$ 1.234,50');
  });

  it('diferença crítica a partir de 10% do valor do sistema', () => {
    expect(getDiffRatio(0.005, 100)).toBe(0);
    expect(getDiffRatio(5, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(isCriticalDiff(9.99, 100)).toBe(false);
    expect(isCriticalDiff(10, 100)).toBe(true);
  });
});
