// ─── Types ─────────────────────────────────────────────────────────────────
export type RotDia = {
  id?: string;
  ordem: number;
  cidade: string;
  cidade_id?: string | null;
  cidade_pendente?: boolean;
  cidade_modo_geografico?: boolean;
  percurso: string;
  data: string;
  descricao: string;
};

export type RotHotel = {
  id?: string;
  ordem: number;
  cidade: string;
  cidade_id?: string | null;
  cidade_pendente?: boolean;
  cidade_modo_geografico?: boolean;
  hotel: string;
  endereco: string;
  data_inicio: string;
  data_fim: string;
  noites: number | null;
  qtd_apto: number | null;
  apto: string;
  categoria: string;
  regime: string;
  tipo_tarifa: string;
  qtd_adultos: number | null;
  qtd_criancas: number | null;
  valor_original: number | null;
  valor_final: number | null;
};

export type RotPasseio = {
  id?: string;
  ordem: number;
  cidade: string;
  cidade_id?: string | null;
  cidade_pendente?: boolean;
  cidade_modo_geografico?: boolean;
  passeio: string;
  fornecedor: string;
  data_inicio: string;
  data_fim: string;
  tipo: string;
  ingressos: string;
  qtd_adultos: number | null;
  qtd_criancas: number | null;
  valor_original: number | null;
  valor_final: number | null;
};

export type RotTransporte = {
  id?: string;
  ordem: number;
  tipo: string;
  fornecedor: string;
  descricao: string;
  data_inicio: string;
  data_fim: string;
  categoria: string;
  observacao: string;
  trecho: string;
  cia_aerea: string;
  data_voo: string;
  classe_reserva: string;
  hora_saida: string;
  aeroporto_saida: string;
  duracao_voo: string;
  tipo_voo: string;
  hora_chegada: string;
  aeroporto_chegada: string;
  tarifa_nome: string;
  reembolso_tipo: string;
  qtd_adultos: number | null;
  qtd_criancas: number | null;
  valor_total: number | null;
  taxas: number | null;
};

export type RotInvestimento = {
  id?: string;
  ordem: number;
  tipo: string;
  valor_por_pessoa: number | null;
  qtd_apto: number | null;
  valor_por_apto: number | null;
};

export type RotPagamento = {
  id?: string;
  ordem: number;
  servico: string;
  forma_pagamento: string;
  valor_total_com_taxas: number | null;
  taxas: number | null;
};

export interface DiaBuscaResult {
  percurso?: string | null;
  cidade?: string | null;
  cidade_id?: string | null;
  data?: string | null;
  descricao?: string | null;
}

// ─── Factory functions ─────────────────────────────────────────────────────
export function newDia(ordem: number): RotDia {
  return { ordem, cidade: '', percurso: '', data: '', descricao: '' };
}
export function newHotel(ordem: number): RotHotel {
  return {
    ordem,
    cidade: '',
    hotel: '',
    endereco: '',
    data_inicio: '',
    data_fim: '',
    noites: null,
    qtd_apto: null,
    apto: '',
    categoria: '',
    regime: '',
    tipo_tarifa: '',
    qtd_adultos: null,
    qtd_criancas: null,
    valor_original: null,
    valor_final: null
  };
}
export function newPasseio(ordem: number): RotPasseio {
  return {
    ordem,
    cidade: '',
    passeio: '',
    fornecedor: '',
    data_inicio: '',
    data_fim: '',
    tipo: 'Passeio',
    ingressos: 'Não incluído',
    qtd_adultos: null,
    qtd_criancas: null,
    valor_original: null,
    valor_final: null
  };
}
export function newTransporte(ordem: number): RotTransporte {
  return {
    ordem,
    tipo: 'Aéreo',
    fornecedor: '',
    descricao: '',
    data_inicio: '',
    data_fim: '',
    categoria: '',
    observacao: '',
    trecho: '',
    cia_aerea: '',
    data_voo: '',
    classe_reserva: '',
    hora_saida: '',
    aeroporto_saida: '',
    duracao_voo: '',
    tipo_voo: 'Internacional',
    hora_chegada: '',
    aeroporto_chegada: '',
    tarifa_nome: '',
    reembolso_tipo: '',
    qtd_adultos: null,
    qtd_criancas: null,
    valor_total: null,
    taxas: null
  };
}
export function newInvestimento(ordem: number): RotInvestimento {
  return { ordem, tipo: '', valor_por_pessoa: null, qtd_apto: null, valor_por_apto: null };
}
export function newPagamento(ordem: number): RotPagamento {
  return { ordem, servico: '', forma_pagamento: '', valor_total_com_taxas: null, taxas: null };
}

// ─── List operations ───────────────────────────────────────────────────────
export function reorder<T extends { ordem: number }>(arr: T[]): T[] {
  return arr.map((item, i) => ({ ...item, ordem: i }));
}

export function addItem<T extends { ordem: number }>(
  list: T[],
  newFn: (o: number) => T,
  afterIndex: number = list.length - 1
): T[] {
  const next = [...list];
  next.splice(afterIndex + 1, 0, newFn(afterIndex + 1));
  return reorder(next);
}

export function removeItem<T extends { ordem: number }>(list: T[], index: number): T[] {
  return reorder(list.filter((_, i) => i !== index));
}

export function moveUp<T extends { ordem: number }>(list: T[], index: number): T[] {
  if (index === 0) return list;
  const next = [...list];
  [next[index - 1], next[index]] = [next[index], next[index - 1]];
  return reorder(next);
}

export function moveDown<T extends { ordem: number }>(list: T[], index: number): T[] {
  if (index === list.length - 1) return list;
  const next = [...list];
  [next[index], next[index + 1]] = [next[index + 1], next[index]];
  return reorder(next);
}

export function updateItem<T>(list: T[], index: number, patch: Partial<T>): T[] {
  return list.map((item, i) => (i === index ? { ...item, ...patch } : item));
}
