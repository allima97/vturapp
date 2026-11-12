import type { TrechoPassagem } from './importacao';

export type TrechoRota = Pick<
  TrechoPassagem,
  'origem' | 'destino' | 'cidadeOrigem' | 'cidadeDestino'
>;

export function resumoRotas(
  trechos: TrechoRota[],
  aeroporto: (codigo: string, cidade?: string) => string
): string {
  const grupos: TrechoRota[][] = [];
  for (const trecho of trechos) {
    const grupo = grupos[grupos.length - 1];
    if (
      !grupo ||
      grupo[grupo.length - 1].destino.trim().toUpperCase() !== trecho.origem.trim().toUpperCase()
    ) {
      grupos.push([trecho]);
    } else {
      grupo.push(trecho);
    }
  }
  return grupos
    .map((grupo) => {
      const primeiro = grupo[0];
      const ultimo = grupo[grupo.length - 1];
      const retorno =
        grupo.length > 1 &&
        ultimo.destino.trim().toUpperCase() === primeiro.origem.trim().toUpperCase();
      const destino = retorno ? grupo[grupo.length - 2] : ultimo;
      return `${aeroporto(primeiro.origem, primeiro.cidadeOrigem)} / ${aeroporto(destino.destino, destino.cidadeDestino)}`;
    })
    .join(' e ');
}
