import { registroOpcionalIdValido } from '$lib/roteiroOpcionais';

export function atribuirIdsRegistros<T extends { id?: string }>(itens: T[]): T[] {
  return itens.map((item) =>
    item.id && registroOpcionalIdValido(item.id)
      ? { ...item, id: item.id.toLowerCase() }
      : { ...item, id: crypto.randomUUID() }
  );
}

export function renovarIdsRegistros<T extends { id?: string }>(itens: T[]): T[] {
  return itens.map((item) => ({ ...item, id: crypto.randomUUID() }));
}
