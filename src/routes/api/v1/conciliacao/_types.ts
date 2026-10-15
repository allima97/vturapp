/**
 * Tipos de Conciliação — vtur-svelte
 *
 * Portabilizado FIELMENTE do vtur-app (src/pages/api/v1/conciliacao/_types.ts).
 * Inclui TODOS os campos usados no processo de conciliação.
 *
 * ⚠️  NÃO remover campos — eles são usados em cálculos de comissão e auditoria.
 */

export type ConciliacaoStatus = 'BAIXA' | 'OPFAX' | 'ESTORNO' | 'OUTRO';
export type ConciliacaoFaixaComissao = string | 'SEM_COMISSAO';

/**
 * Campos de entrada para importação/criação de registros de conciliação.
 * Representa uma linha do arquivo de extrato financeiro.
 */
export type ConciliacaoLinhaInput = {
  documento: string;
  numero_reserva?: string | null;
  movimento_data?: string | null;         // ISO yyyy-mm-dd
  status?: ConciliacaoStatus | null;
  descricao?: string | null;
  descricao_chave?: string | null;

  // Valores financeiros brutos (da loja)
  valor_lancamentos?: number | null;
  valor_taxas?: number | null;
  valor_descontos?: number | null;
  valor_abatimentos?: number | null;
  valor_calculada_loja?: number | null;
  valor_visao_master?: number | null;
  valor_opfax?: number | null;
  valor_saldo?: number | null;

  // Valores calculados
  valor_venda_real?: number | null;       // lancamentos − descontos − abatimentos
  valor_comissao_loja?: number | null;    // cascata: saldo → calculada_loja → visao_master
  percentual_comissao_loja?: number | null;
  faixa_comissao?: ConciliacaoFaixaComissao | null;
  is_seguro_viagem?: boolean | null;
  valor_nao_comissionavel?: number | null;

  // Atribuição de ranking
  ranking_vendedor_id?: string | null;
  ranking_produto_id?: string | null;

  // Metadados
  origem?: string | null;
  raw?: unknown;
};

/**
 * Registro completo de conciliação (conciliacao_recibos).
 * Inclui todos os campos retornados pela API e calculados no frontend.
 */
export type ConciliacaoItem = {
  id: string;
  company_id: string;
  documento: string;
  numero_reserva?: string | null;
  movimento_data: string | null;
  status: ConciliacaoStatus;
  descricao: string | null;

  // Valores financeiros brutos
  valor_lancamentos: number | null;
  valor_taxas: number | null;
  valor_descontos: number | null;
  valor_abatimentos: number | null;
  valor_nao_comissionavel: number | null;
  valor_calculada_loja: number | null;
  valor_visao_master: number | null;
  valor_opfax: number | null;
  valor_saldo: number | null;

  // Valores calculados
  valor_venda_real: number | null;        // lancamentos − descontos − abatimentos (SEM taxas)
  valor_comissao_loja: number | null;
  percentual_comissao_loja: number | null;

  // Faixa de comissão
  faixa_comissao: string | null;          // MENOR_10 | MAIOR_OU_IGUAL_10 | SEGURO_32_35 | SEM_COMISSAO

  // Flags calculadas
  is_seguro_viagem: boolean;
  is_baixa_rac?: boolean | null;
  is_nao_comissionavel?: boolean | null;  // derivado de parametros_pagamentos_nao_comissionaveis

  // Linking com vendas
  venda_id: string | null;
  venda_recibo_id: string | null;

  // Ranking (atribuição manual de vendedor/produto)
  ranking_vendedor_id: string | null;
  ranking_produto_id: string | null;
  ranking_assigned_at: string | null;
  ranking_vendedor?: { id: string; nome_completo: string | null } | null;
  ranking_produto?: { id: string; nome: string | null } | null;

  // Auditoria de matching com vendas_recibos
  conciliado: boolean;
  match_total: boolean | null;
  match_taxas: boolean | null;
  sistema_valor_total: number | null;
  sistema_valor_taxas: number | null;
  diff_total: number | null;
  diff_taxas: number | null;
  last_checked_at: string | null;
  conciliado_em: string | null;

  // Origem
  origem: string | null;

  // Auditoria de criação
  created_at: string;
  updated_at: string;
};

/**
 * Registro de auditoria de alterações em valores de conciliação.
 * Armazenado em conciliacao_recibo_changes.
 */
export type ConciliacaoChange = {
  id: string;
  company_id: string;
  conciliacao_recibo_id: string | null;
  venda_id: string | null;
  venda_recibo_id: string | null;
  numero_recibo: string | null;
  field: string;
  old_value: number | null;
  new_value: number | null;
  actor: 'cron' | 'user';
  changed_by: string | null;   // user_id quando actor = 'user'
  changed_at: string;
  reverted_at: string | null;
  reverted_by: string | null;
  revert_reason: string | null;
};
