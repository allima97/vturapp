export const VERSAO_ROTEIRO_IDENTIDADE = 2;

export function explicitarIdentidadeCidade<T extends { cidade_id?: string | null }>(item: T) {
  return { ...item, cidade_id: item.cidade_id ?? null };
}
