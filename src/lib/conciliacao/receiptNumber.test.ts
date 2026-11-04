// Testes de caracterização: normalização de número de recibo (Fase 1).
// Estas funções decidem se um recibo da conciliação "casa" com um recibo da venda.
import { describe, expect, it } from 'vitest';
import {
  normalizeReceiptNumber,
  normalizeReceiptNumberLoose,
  receiptNumberCore
} from './receiptNumber';
import { normalizeReceiptDisplay, normalizeReceiptKey } from './receiptNormalize';

describe('normalizeReceiptNumber', () => {
  it('remove tudo que não é [a-z0-9] e deixa minúsculo', () => {
    expect(normalizeReceiptNumber('5630-0000083861')).toBe('56300000083861');
    expect(normalizeReceiptNumber(' AB-12 / 3 ')).toBe('ab123');
    expect(normalizeReceiptNumber(null)).toBe('');
  });
});

describe('normalizeReceiptNumberLoose', () => {
  it('prefixo de 4 dígitos + sufixo sem zeros à esquerda', () => {
    expect(normalizeReceiptNumberLoose('5630-0000083861')).toBe('563083861');
    expect(normalizeReceiptNumberLoose('83861')).toBe('83861');
    expect(normalizeReceiptNumberLoose('123')).toBe('123');
  });
});

describe('receiptNumberCore', () => {
  it('últimos 10 dígitos sem zeros à esquerda', () => {
    expect(receiptNumberCore('5630-0000083861')).toBe('83861');
    expect(receiptNumberCore('83861')).toBe('83861');
    expect(receiptNumberCore('0000000000')).toBe('0000000000');
    expect(receiptNumberCore('')).toBe('');
  });

  it('formatos diferentes do mesmo recibo têm o mesmo core', () => {
    const formatos = ['5630-0000083861', '56300000083861', '5630 0000083861', '0000083861'];
    expect(new Set(formatos.map(receiptNumberCore)).size).toBe(1);
  });
});

describe('normalizeReceiptDisplay / normalizeReceiptKey', () => {
  it('máscara NNNN-NNNNNNNNNN só para 14 dígitos numéricos', () => {
    expect(normalizeReceiptDisplay('56300000083861')).toBe('5630-0000083861');
    expect(normalizeReceiptDisplay('5630 0000083861')).toBe('5630-0000083861');
    expect(normalizeReceiptDisplay('12345')).toBe('12345');
    expect(normalizeReceiptDisplay('AB-56300000083861')).toBe('AB-56300000083861');
  });

  it('chave técnica: [A-Z0-9] maiúsculo', () => {
    expect(normalizeReceiptKey('5630-0000083899')).toBe('56300000083899');
    expect(normalizeReceiptKey('ab-12')).toBe('AB12');
  });
});
