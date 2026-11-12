import { describe, expect, it } from 'vitest';
import { createInitialClienteForm, validateClienteForm } from '$lib/features/clientes/form';
import { validateCPF, validateCNPJ, validateOptionalCPF, validateOptionalCNPJ } from './validation';

describe('validação de documentos', () => {
  it.each([
    ['52998224725', true],
    ['529.982.247-25', true],
    ['52998224724', false],
    ['11111111111', false],
    ['5299822472', false],
    ['x52998224725', false]
  ])('CPF %s: %s', (value, valid) => {
    expect(validateCPF(value)).toBe(valid);
    expect(
      validateClienteForm({ ...createInitialClienteForm(), cpf: value }).errors.cpf === undefined
    ).toBe(valid);
  });

  it.each([
    ['04252011000110', true],
    ['04.252.011/0001-10', true],
    ['04252011000111', false],
    ['11111111111111', false],
    ['0425201100011', false],
    ['x04252011000110', false]
  ])('CNPJ %s: %s', (value, valid) => {
    expect(validateCNPJ(value)).toBe(valid);
    expect(
      validateClienteForm({ ...createInitialClienteForm(), tipo_pessoa: 'PJ', cpf: value }).errors
        .cpf === undefined
    ).toBe(valid);
  });

  it('mantém opcionais vazios mas rejeita tipos e valores inválidos', () => {
    for (const validate of [validateOptionalCPF, validateOptionalCNPJ]) {
      expect(validate(null)).toBe(true);
      expect(validate('  ')).toBe(true);
      expect(validate({})).toBe(false);
      expect(validate('abc')).toBe(false);
    }
  });
});
