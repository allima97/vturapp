export function chaveDestinoRelatorio(
  nome: string | null | undefined,
  idGeografico: string | null | undefined,
  ativo: boolean
) {
  const destino = String(nome || '').trim() || 'Destino nao informado';
  if (ativo && idGeografico) return { chave: `geo:${idGeografico.toLowerCase()}`, destino };
  return { chave: destino, destino };
}
