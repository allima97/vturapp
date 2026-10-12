export type ContratanteDraft = {
  nome: string;
  cpf: string;
  rg?: string | null;
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  nascimento?: string | null; // ISO yyyy-mm-dd
};

export type PassageiroDraft = {
  nome: string;
  cpf: string;
  nascimento?: string | null; // ISO yyyy-mm-dd
};

export type PagamentoParcelaDraft = {
  numero: string;
  valor: number;
  vencimento?: string | null; // ISO yyyy-mm-dd
};

export type PagamentoDraft = {
  forma: string;
  operacao?: string | null;
  plano?: string | null;
  valor_bruto?: number | null;
  desconto?: number | null;
  total?: number | null;
  parcelas?: PagamentoParcelaDraft[];
};

export type ContratoDraft = {
  contrato_numero: string;
  reserva_numero?: string | null;
  excursao_numero?: string | null;
  destino?: string | null;
  data_saida?: string | null; // ISO yyyy-mm-dd
  data_retorno?: string | null; // ISO yyyy-mm-dd
  produto_principal?: string | null;
  produto_tipo?: string | null;
  produto_detalhes?: string | null;
  contratante?: ContratanteDraft | null;
  passageiros?: PassageiroDraft[];
  pagamentos?: PagamentoDraft[];
  total_bruto?: number | null;
  total_pago?: number | null;
  taxas_embarque?: number | null;
  taxa_du?: number | null;
  rc?: number | null;
  desconto_comercial?: number | null;
  raw_text?: string;
  tipo_pacote?: string | null;
};

