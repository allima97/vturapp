import { destinoIdValido } from '$lib/destinoIdentidade';

export type ColecaoIdentidade = 'dias' | 'hoteis' | 'passeios' | 'opcionais';
export type IdentidadeRemovida = {
  colecao: ColecaoIdentidade;
  cidade_id: string;
  quantidade: number;
};

const colecoes: readonly ColecaoIdentidade[] = ['dias', 'hoteis', 'passeios', 'opcionais'];

export function identificarRemocoes(
  anteriores: Partial<Record<ColecaoIdentidade, readonly (string | null)[]>>,
  atuais: Partial<Record<ColecaoIdentidade, readonly (string | null)[]>>
): IdentidadeRemovida[] {
  const removidas: IdentidadeRemovida[] = [];
  for (const colecao of colecoes) {
    if (!(colecao in atuais)) continue;
    const contagem = new Map<string, number>();
    for (const id of anteriores[colecao] ?? []) {
      if (id) contagem.set(id, (contagem.get(id) ?? 0) + 1);
    }
    for (const id of atuais[colecao] ?? []) {
      if (id && contagem.has(id)) contagem.set(id, (contagem.get(id) ?? 0) - 1);
    }
    for (const [cidade_id, quantidade] of contagem) {
      if (quantidade > 0) removidas.push({ colecao, cidade_id, quantidade });
    }
  }
  return removidas.sort((a, b) =>
    a.colecao === b.colecao
      ? a.cidade_id.localeCompare(b.cidade_id, 'en')
      : a.colecao.localeCompare(b.colecao, 'en')
  );
}

export type RegistroCidade = {
  registro_id?: string;
  cidade_id: string | null;
};

/** Compara cada registro pelo id estável. Registros sem id continuam por contagem e não encobrem uma troca já identificada. */
export function identificarRemocoesRegistros(
  colecao: ColecaoIdentidade,
  anteriores: readonly RegistroCidade[],
  atuais: readonly RegistroCidade[]
): IdentidadeRemovida[] {
  const anterioresComId = new Map(
    anteriores.filter((item) => item.registro_id).map((item) => [item.registro_id, item.cidade_id])
  );
  const atuaisComId = new Map(
    atuais.filter((item) => item.registro_id).map((item) => [item.registro_id, item.cidade_id])
  );
  const perdidas = anteriores
    .filter(
      (item) =>
        item.registro_id && item.cidade_id && atuaisComId.get(item.registro_id) !== item.cidade_id
    )
    .map((item) => item.cidade_id);
  const legadas = anteriores.filter((item) => !item.registro_id).map((item) => item.cidade_id);
  const candidatas = atuais
    .filter((item) => !item.registro_id || !anterioresComId.has(item.registro_id))
    .map((item) => item.cidade_id);
  const legadasRemovidas = identificarRemocoes({ [colecao]: legadas }, { [colecao]: candidatas });
  const contagem = new Map<string, number>();
  for (const id of perdidas) {
    if (id) contagem.set(id, (contagem.get(id) ?? 0) + 1);
  }
  for (const item of legadasRemovidas)
    contagem.set(item.cidade_id, (contagem.get(item.cidade_id) ?? 0) + item.quantidade);
  return [...contagem]
    .map(([cidade_id, quantidade]) => ({ colecao, cidade_id, quantidade }))
    .sort((a, b) => a.cidade_id.localeCompare(b.cidade_id, 'en'));
}

export function identificarRemocoesOpcionais(
  anteriores: readonly RegistroCidade[],
  atuais: readonly RegistroCidade[]
): IdentidadeRemovida[] {
  return identificarRemocoesRegistros('opcionais', anteriores, atuais);
}

export function isIdentidadesRemovidas(value: unknown): value is IdentidadeRemovida[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 400 &&
    value.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        colecoes.includes(item.colecao) &&
        destinoIdValido(item.cidade_id) &&
        Number.isSafeInteger(item.quantidade) &&
        item.quantidade > 0 &&
        item.quantidade <= 100
    )
  );
}

export function confirmacaoCorresponde(value: unknown, removidas: IdentidadeRemovida[]) {
  if (!isIdentidadesRemovidas(value) || value.length !== removidas.length) return false;
  return removidas.every(
    (item, index) =>
      item.colecao === value[index].colecao &&
      item.cidade_id === value[index].cidade_id &&
      item.quantidade === value[index].quantidade
  );
}
