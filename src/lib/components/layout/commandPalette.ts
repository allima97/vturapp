import type { ItemNavegacao } from '$lib/stores/navegacao';

/** Minúsculas e sem acentos: "Conciliação" → "conciliacao". */
export function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Remove itens repetidos (mesmo endereço), mantendo o primeiro. */
export function semRepetidos(itens: ItemNavegacao[]): ItemNavegacao[] {
  const vistos = new Set<string>();
  return itens.filter((item) => {
    if (vistos.has(item.href)) return false;
    vistos.add(item.href);
    return true;
  });
}

/**
 * Filtra os itens pelo texto digitado. Cada palavra precisa aparecer no nome ou na seção.
 * Ordem: nome que começa com a busca, depois nome que contém, depois só a seção;
 * dentro de cada grupo, a ordem do menu.
 */
export function filtrarItens(itens: ItemNavegacao[], busca: string): ItemNavegacao[] {
  const lista = semRepetidos(itens);
  const termo = normalizarBusca(busca);
  if (!termo) return lista;
  const palavras = termo.split(/\s+/).filter(Boolean);

  const pontuados: Array<{ item: ItemNavegacao; nota: number; ordem: number }> = [];
  lista.forEach((item, ordem) => {
    const nome = normalizarBusca(item.nome);
    const secao = normalizarBusca(item.secao);
    const texto = `${nome} ${secao}`;
    if (!palavras.every((p) => texto.includes(p))) return;
    const nota = nome.startsWith(termo) ? 0 : palavras.every((p) => nome.includes(p)) ? 1 : 2;
    pontuados.push({ item, nota, ordem });
  });

  return pontuados.sort((a, b) => a.nota - b.nota || a.ordem - b.ordem).map((p) => p.item);
}

/** Ctrl+K (Windows/Linux) ou ⌘K (Mac). */
export function isAtalhoBusca(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>
): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'k'
  );
}
