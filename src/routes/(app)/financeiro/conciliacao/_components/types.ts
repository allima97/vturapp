export type ConciliacaoItem = {
  id: string;
  company_id?: string;
  documento: string;
  numero_reserva?: string | null;
  movimento_data: string | null;
  status: string;
  descricao: string | null;
  valor_lancamentos: number | null;
  valor_taxas: number | null;
  valor_descontos: number | null;
  valor_abatimentos: number | null;
  valor_nao_comissionavel: number | null;
  valor_calculada_loja: number | null;
  valor_visao_master: number | null;
  valor_opfax: number | null;
  valor_saldo: number | null;
  valor_venda_real: number | null;
  valor_comissao_loja: number | null;
  percentual_comissao_loja: number | null;
  faixa_comissao: string | null;
  is_seguro_viagem: boolean;
  origem: string | null;
  conciliado: boolean;
  match_total: boolean | null;
  match_taxas: boolean | null;
  sistema_valor_total: number | null;
  sistema_valor_taxas: number | null;
  diff_total: number | null;
  diff_taxas: number | null;
  venda_id: string | null;
  venda_recibo_id: string | null;
  venda_numero?: string | null;
  venda_cliente_nome?: string | null;
  venda_vendedor_nome?: string | null;
  recibo_numero?: string | null;
  ranking_vendedor_id: string | null;
  ranking_produto_id: string | null;
  ranking_assigned_at: string | null;
  ranking_vendedor?: { id: string; nome_completo: string | null } | null;
  ranking_produto?: { id: string; nome: string | null } | null;
  is_baixa_rac?: boolean | null;
  is_nao_comissionavel?: boolean | null;
  last_checked_at: string | null;
  conciliado_em?: string | null;
  status_display?: string;
  status_label?: string;
};

export type ConciliacaoSummary = {
  total: number;
  efetivados: number;
  pendentes: number;
  semRanking: number;
  baixaRac: number;
  totalValor: number;
  timeline: Array<{ date: string; value: number }>;
  lacunaCronologica?: {
    fronteira: string | null;
    dias_faltantes: string[];
    dias_bloqueados: string[];
    registros_bloqueados: number;
    aviso: string;
  } | null;
};

export type ConciliacaoChange = {
  id: string;
  numero_recibo: string | null;
  field: string;
  old_value: number | null;
  new_value: number | null;
  changed_at: string;
  reverted_at: string | null;
  actor: string;
  changed_by_user?: { nome_completo?: string | null; email?: string | null } | null;
};

export type ConciliacaoExecution = {
  id: string;
  actor: string;
  checked: number;
  reconciled: number;
  updated_taxes: number;
  still_pending: number;
  status: string;
  error_message: string | null;
  created_at: string;
  actor_user?: { nome_completo?: string | null; email?: string | null } | null;
};

export type ConciliacaoOperationLog = {
  id: string;
  created_at: string;
  action: string;
  status: 'success' | 'error';
  message: string;
  month: string;
  checked: number;
  reconciled: number;
  recalculated: number;
  recalculatedChecked: number;
  updatedTaxes: number;
  duplicateGroups: number;
  duplicatesRemoved: number;
  updateErrors: number;
};

export type VendedorOption = { id: string; nome_completo: string };
export type ProdutoOption = { id: string; nome: string };
export type EmpresaOption = { id: string; nome: string };
export type DetalheRateioInfo = {
  vendedor_destino_nome: string;
  percentual_destino: number;
};
export type VinculoAuditIssue = {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  expected?: string | number | null;
  actual?: string | number | null;
};
export type VinculoAuditDetail = {
  id: string;
  documento: string;
  movimento_data: string | null;
  status: string | null;
  severity: 'ok' | 'info' | 'warning' | 'critical';
  fixable: boolean;
  issues: VinculoAuditIssue[];
  conciliacao?: {
    venda_id?: string | null;
    venda_recibo_id?: string | null;
    ranking_vendedor_nome?: string | null;
    valor_venda_real?: number | null;
    valor_taxas?: number | null;
  };
  sistema?: {
    numero_recibo?: string | null;
    vendedor_nome?: string | null;
    data_venda?: string | null;
    data_lancamento?: string | null;
    valor_ranking?: number | null;
    valor_taxas?: number | null;
    rateio?: {
      vendedor_origem_nome?: string | null;
      vendedor_destino_nome?: string | null;
      percentual_origem?: number | null;
      percentual_destino?: number | null;
    } | null;
  } | null;
  candidatos?: Array<{
    numero_recibo: string;
    vendedor_nome?: string | null;
    data_venda?: string | null;
    valor_total?: number | null;
    valor_taxas?: number | null;
  }>;
};
export type VinculoAuditResult = {
  checked: number;
  critical: number;
  warnings: number;
  infos: number;
  issues: number;
  corrigiveis: number;
  corrigidos: number;
  dryRun: boolean;
  detalhes: VinculoAuditDetail[];
};
export type ImportPreviewRow = {
  documento: string;
  numero_reserva?: string | null;
  movimento_data: string | null;
  status: string | null | undefined;
  descricao: string | null | undefined;
  vendedor_ranking: string;
  meta_dif: string;
  valor_lancamentos: number | null | undefined;
  valor_taxas: number | null | undefined;
  valor_descontos: number | null | undefined;
  valor_abatimentos: number | null | undefined;
  valor_nao_comissionavel: number | null | undefined;
  valor_venda_real: number | null | undefined;
  valor_comissao_loja: number | null | undefined;
  valor_saldo: number | null | undefined;
  percentual_comissao_loja: number | null | undefined;
  faixa_comissao: string | null | undefined;
  ranking_vendedor_id?: string | null;
  ranking_produto_id?: string | null;
  venda_id?: string | null;
  venda_recibo_id?: string | null;
  sistema_valor_total?: number | null;
  sistema_valor_taxas?: number | null;
  tem_diferenca?: boolean;
  diff_total?: number | null;
  diff_taxas?: number | null;
  origem?: string | null;
};

export type ImportLookupMatch = {
  vendedor_id: string;
  venda_id: string;
  venda_recibo_id: string;
  sistema_valor_total: number | null;
  sistema_valor_taxas: number | null;
  diff_total: number | null;
  diff_taxas: number | null;
};
