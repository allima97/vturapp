// Fase 3.5: funções movidas sem alteração de +page.svelte para este módulo.
import { describe, expect, it } from 'vitest';
import { formatBRL } from './formatadores';
import { isImportSectionHeader, normalizeImportLine, parseDiasImportText } from './importacao-dias';
import { addItem, moveDown, newDia, removeItem } from './tipos';

describe('roteiro: importação de dias', () => {
  it('reconhece cabeçalho de seção com ou sem acento', () => {
    expect(isImportSectionHeader('Itinerário')).toBe(true);
    expect(isImportSectionHeader('PROGRAMAÇÃO')).toBe(true);
    expect(isImportSectionHeader('Dia 1')).toBe(false);
  });

  it('normaliza linha', () => {
    expect(typeof normalizeImportLine('  a  ')).toBe('string');
  });

  it('texto colado vira dias na ordem (comportamento atual registrado)', () => {
    const texto = [
      'Itinerário',
      'Dia 1 - Chegada em Lisboa',
      'Traslado ao hotel.',
      'Dia 2 - Sintra',
      'Passeio de dia inteiro.'
    ].join('\n');
    expect(parseDiasImportText(texto)).toEqual([
      {
        cidade: 'Chegada em Lisboa',
        data: '',
        descricao: 'Traslado ao hotel.',
        ordem: 0,
        percurso: ''
      },
      { cidade: 'Sintra', data: '', descricao: 'Passeio de dia inteiro.', ordem: 1, percurso: '' }
    ]);
  });
});

describe('roteiro: listas', () => {
  it('adiciona, remove e move mantendo a ordem', () => {
    let dias = [newDia(0), newDia(1)];
    dias = addItem(dias, newDia, 0);
    expect(dias.map((d) => d.ordem)).toEqual([0, 1, 2]);
    dias = removeItem(dias, 1);
    expect(dias.map((d) => d.ordem)).toEqual([0, 1]);
    expect(moveDown(dias, 1)).toHaveLength(2);
  });

  it('formatBRL', () => {
    expect(formatBRL(1234.5)).toBe('1.234,50');
    expect(formatBRL(null)).toBe('');
  });
});
