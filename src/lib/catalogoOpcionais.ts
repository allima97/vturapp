export type OpcionalCatalogo = {
  id: string;
  cidade: string;
  cidade_id?: string | null;
  nome: string;
  descricao: string;
};

export function chaveCidadeOpcional(cidade: string | null | undefined) {
  return String(cidade ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFC')
    .toLocaleLowerCase('pt-BR');
}

export function chaveIdentidadeCidade(cidade: string, cidadeId?: string | null) {
  return cidadeId ? `id:${cidadeId.toLowerCase()}` : `texto:${chaveCidadeOpcional(cidade)}`;
}
