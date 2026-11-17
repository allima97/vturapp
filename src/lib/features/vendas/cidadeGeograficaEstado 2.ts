export type EstadoCidadeGeografica = {
  texto: string;
  pendente: boolean;
};

export function criarEstadoCidadeGeografica(): EstadoCidadeGeografica {
  return { texto: '', pendente: false };
}
