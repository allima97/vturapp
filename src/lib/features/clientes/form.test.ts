import { describe, expect, it } from 'vitest';

import { sanitizeImportedClienteNome } from '$lib/features/clientes/form';

describe('sanitizeImportedClienteNome', () => {
  it('keeps only the content after // when present', () => {
    expect(sanitizeImportedClienteNome('PASSAGEIRO // Jessica Aparecida Franco Pinto')).toBe(
      'Jessica Aparecida Franco Pinto'
    );
  });

  it('drops everything before the last //', () => {
    expect(
      sanitizeImportedClienteNome('LIXO / TESTE // ACOMPANHANTE // Juan Jose Martinez Parra')
    ).toBe('Juan Jose Martinez Parra');
  });

  it('keeps the original name when // is absent', () => {
    expect(sanitizeImportedClienteNome('Pedro Vinicius de Almeida Lacerda')).toBe(
      'Pedro Vinicius de Almeida Lacerda'
    );
  });
});
