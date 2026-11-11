import { ApiError } from '$lib/services/api';

export function mensagemErroCep(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) return 'CEP não encontrado.';
  if (error instanceof ApiError && error.status === 429) {
    return 'Muitas consultas de CEP. Tente novamente em instantes.';
  }
  return 'Não foi possível consultar o CEP. Tente novamente.';
}
