import type { VendaFormOption, VendaFormParcela } from '$lib/features/vendas/form';
import type { EstadoCidadeGeografica } from '$lib/features/vendas/cidadeGeograficaEstado';

export type Option = VendaFormOption;

export type Cliente = {
  id: string;
  nome: string;
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
};

export type VendaEditForm = {
  vendedor_id: string;
  cliente_id: string;
  destino_id: string;
  destino_cidade_id: string;
  data_lancamento: string;
  data_venda: string;
  data_embarque: string;
  data_final: string;
  desconto_comercial_aplicado: boolean;
  desconto_comercial_valor: string;
  valor_total: string;
  valor_total_bruto: string;
  valor_total_pago: string;
  valor_taxas: string;
  valor_nao_comissionado: string;
  status: string;
  cancelada: boolean;
  notas: string;
};

export type ReciboEditForm = {
  estadoCidade: EstadoCidadeGeografica;
  principal: boolean;
  usar_cidade_padrao: boolean;
  destino_cidade_id: string;
  tipo_produto_id: string;
  produto_id: string;
  produto_resolvido_id: string;
  numero_recibo: string;
  numero_reserva: string;
  tipo_pacote: string;
  valor_total: string;
  valor_taxas: string;
  valor_du: string;
  valor_rav: string;
  data_inicio: string;
  data_fim: string;
  contrato_url: string;
  contrato_path: string;
};

export type PagamentoEditForm = {
  forma_pagamento_id: string;
  forma_nome: string;
  operacao: string;
  plano: string;
  valor_bruto: string;
  desconto_valor: string;
  valor_total: string;
  parcelas_qtd: number;
  parcelas_valor: string;
  vencimento_primeira: string;
  paga_comissao: boolean;
  parcelas: VendaFormParcela[];
};
