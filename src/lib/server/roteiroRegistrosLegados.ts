import { registroOpcionalIdValido } from '$lib/roteiroOpcionais';

export type ColecaoRegistro = 'dias' | 'hoteis' | 'passeios';

const ROTULOS: Record<ColecaoRegistro, string> = {
  dias: 'dia',
  hoteis: 'hotel',
  passeios: 'passeio'
};

export class IdentificacaoRegistroError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdentificacaoRegistroError';
  }
}

async function idParaRegistro(
  colecao: ColecaoRegistro,
  roteiroId: string,
  revisao: string,
  indice: number,
  tentativa: number
) {
  const entrada = JSON.stringify([
    'roteiro-registro',
    colecao,
    roteiroId,
    revisao,
    indice,
    tentativa
  ]);
  const hash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(entrada))
  );
  hash[6] = (hash[6] & 0x0f) | 0x40;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = Array.from(hash.slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function rotuloRegistro(colecao: ColecaoRegistro) {
  return ROTULOS[colecao];
}

/** Atribui ids determinísticos só aos registros ainda sem id. Não grava e não altera a lista recebida. */
export async function identificarRegistrosLegados<
  T extends { registro_id?: string; cidade_id: string | null }
>(
  itens: readonly T[],
  colecao: ColecaoRegistro,
  roteiroId: string,
  revisao: string
): Promise<(T & { registro_id: string })[]> {
  const ids = new Set<string>();
  const rotulo = rotuloRegistro(colecao);
  const identificados = itens.map((item) => {
    if (!item.registro_id) return { ...item };
    if (!registroOpcionalIdValido(item.registro_id))
      throw new IdentificacaoRegistroError(`Identificação do ${rotulo} inválida.`);
    const id = item.registro_id.toLowerCase();
    if (ids.has(id)) throw new IdentificacaoRegistroError(`Identificação do ${rotulo} duplicada.`);
    ids.add(id);
    return { ...item, registro_id: id };
  });
  for (const [indice, item] of identificados.entries()) {
    if (item.registro_id) continue;
    let tentativa = 0;
    let id = await idParaRegistro(colecao, roteiroId, revisao, indice, tentativa);
    while (ids.has(id)) id = await idParaRegistro(colecao, roteiroId, revisao, indice, ++tentativa);
    ids.add(id);
    item.registro_id = id;
  }
  return identificados as (T & { registro_id: string })[];
}
