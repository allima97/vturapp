import { expect, it } from 'vitest';
import { ApiError } from '$lib/services/api';
import { mensagemErroCep } from './cep';

it('distingue CEP inexistente de indisponibilidade e limite de consultas', () => {
  expect(mensagemErroCep(new ApiError('não encontrado', 404))).toBe('CEP não encontrado.');
  expect(mensagemErroCep(new ApiError('limite', 429))).toContain('Muitas consultas');
  expect(mensagemErroCep(new ApiError('indisponível', 502))).toContain(
    'Não foi possível consultar o CEP'
  );
});
