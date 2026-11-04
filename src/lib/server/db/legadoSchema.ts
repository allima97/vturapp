/**
 * Espelho Drizzle do catalogo legado. Gerado por scripts/gerar-catalogo-legado.mjs.
 * A migration SQL em drizzle/0013_legado_catalogo.sql e a fonte aplicada no D1.
 */
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const legadoAdminAvisosTemplates = sqliteTable('legado_admin_avisos_templates', {
  id: text('id').primaryKey(),
  nome: text('nome'),
  assunto: text('assunto'),
  mensagem: text('mensagem'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  senderKey: text('sender_key'),
});

export const legadoAdminEmailSettings = sqliteTable('legado_admin_email_settings', {
  id: text('id').primaryKey(),
  singleton: integer('singleton', { mode: 'boolean' }),
  smtpHost: text('smtp_host'),
  smtpPort: integer('smtp_port', { mode: 'number' }),
  smtpSecure: integer('smtp_secure', { mode: 'boolean' }),
  smtpUser: text('smtp_user'),
  smtpPass: text('smtp_pass'),
  alertaFromEmail: text('alerta_from_email'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  adminFromEmail: text('admin_from_email'),
  avisosFromEmail: text('avisos_from_email'),
  financeiroFromEmail: text('financeiro_from_email'),
  suporteFromEmail: text('suporte_from_email'),
  resendApiKey: text('resend_api_key'),
});

export const legadoAdminSystemSettings = sqliteTable('legado_admin_system_settings', {
  id: text('id').primaryKey(),
  singleton: integer('singleton', { mode: 'boolean' }),
  maintenanceEnabled: integer('maintenance_enabled', { mode: 'boolean' }),
  maintenanceMessage: text('maintenance_message'),
  updatedBy: text('updated_by'),
  updatedAt: text('updated_at'),
  createdAt: text('created_at'),
});

export const legadoAgendaItens = sqliteTable('legado_agenda_itens', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  userId: text('user_id'),
  tipo: text('tipo'),
  titulo: text('titulo'),
  descricao: text('descricao'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  allDay: integer('all_day', { mode: 'boolean' }),
  status: text('status'),
  done: integer('done', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  startAt: text('start_at'),
  endAt: text('end_at'),
  categoriaId: text('categoria_id'),
  prioridade: text('prioridade'),
  arquivo: text('arquivo'),
});

export const legadoAirlineIataAliases = sqliteTable('legado_airline_iata_aliases', {
  id: text('id').primaryKey(),
  airlineCodeId: text('airline_code_id'),
  alias: text('alias'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoAirlineIataCodes = sqliteTable('legado_airline_iata_codes', {
  id: text('id').primaryKey(),
  iataCode: text('iata_code'),
  airlineName: text('airline_name'),
  active: integer('active', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoAuthPasskeyChallenges = sqliteTable('legado_auth_passkey_challenges', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  type: text('type'),
  challenge: text('challenge'),
  expiresAt: text('expires_at'),
  usedAt: text('used_at'),
  createdAt: text('created_at'),
});

export const legadoAuthPasskeys = sqliteTable('legado_auth_passkeys', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  userEmail: text('user_email'),
  name: text('name'),
  credentialId: text('credential_id'),
  publicKey: text('public_key'),
  counter: integer('counter', { mode: 'number' }),
  transports: text('transports'),
  deviceType: text('device_type'),
  backedUp: integer('backed_up', { mode: 'boolean' }),
  aaguid: text('aaguid'),
  origin: text('origin'),
  rpId: text('rp_id'),
  lastUsedAt: text('last_used_at'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoAuthSignupDebug = sqliteTable('legado_auth_signup_debug', {
  id: integer('id', { mode: 'number' }).primaryKey(),
  createdAt: text('created_at'),
  authUserId: text('auth_user_id'),
  authEmail: text('auth_email'),
  err: text('err'),
  detail: text('detail'),
  hint: text('hint'),
  context: text('context'),
});

export const legadoCampanhas = sqliteTable('legado_campanhas', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  titulo: text('titulo'),
  imagemUrl: text('imagem_url'),
  imagemPath: text('imagem_path'),
  linkUrl: text('link_url'),
  linkInstagram: text('link_instagram'),
  linkFacebook: text('link_facebook'),
  dataCampanha: text('data_campanha'),
  validadeAte: text('validade_ate'),
  regras: text('regras'),
  status: text('status'),
  createdBy: text('created_by'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  arquivadaEm: text('arquivada_em'),
});

export const legadoCidades = sqliteTable('legado_cidades', {
  id: text('id').primaryKey(),
  subdivisaoId: text('subdivisao_id'),
  nome: text('nome'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  populacao: integer('populacao', { mode: 'number' }),
  createdAt: text('created_at'),
  descricao: text('descricao'),
  grauImportancia: integer('grau_importancia', { mode: 'number' }),
  nomePtBR: text('nome_ptBR'),
  estadoNome: text('estado_nome'),
  paisNome: text('pais_nome'),
});

export const legadoCidadesImportStaging = sqliteTable('legado_cidades_import_staging', {
  id: integer('id', { mode: 'number' }).primaryKey(),
  cidade: text('cidade'),
  pais: text('pais'),
  createdAt: text('created_at'),
});

export const legadoCidadesImportTargets = sqliteTable('legado_cidades_import_targets', {
  cidadeKey: text('cidade_key'),
  paisId: text('pais_id'),
});

export const legadoCidadesImportTargetsNorm = sqliteTable('legado_cidades_import_targets_norm', {
  paisId: text('pais_id'),
  cidadeKey: text('cidade_key'),
});

export const legadoCidadesNormCache = sqliteTable('legado_cidades_norm_cache', {
  id: text('id'),
  subdivisaoId: text('subdivisao_id'),
  paisId: text('pais_id'),
  nomeKey: text('nome_key'),
  nomePtKey: text('nome_pt_key'),
});

export const legadoCircuitoDatas = sqliteTable('legado_circuito_datas', {
  id: text('id').primaryKey(),
  circuitoId: text('circuito_id'),
  dataInicio: text('data_inicio'),
  cidadeInicioId: text('cidade_inicio_id'),
  diasExtraAntes: integer('dias_extra_antes', { mode: 'number' }),
  diasExtraDepois: integer('dias_extra_depois', { mode: 'number' }),
  createdAt: text('created_at'),
});

export const legadoCircuitoDias = sqliteTable('legado_circuito_dias', {
  id: text('id').primaryKey(),
  circuitoId: text('circuito_id'),
  diaNumero: integer('dia_numero', { mode: 'number' }),
  titulo: text('titulo'),
  descricao: text('descricao'),
  createdAt: text('created_at'),
});

export const legadoCircuitoDiasCidades = sqliteTable('legado_circuito_dias_cidades', {
  id: text('id').primaryKey(),
  circuitoDiaId: text('circuito_dia_id'),
  cidadeId: text('cidade_id'),
  ordem: integer('ordem', { mode: 'number' }),
});

export const legadoCircuitos = sqliteTable('legado_circuitos', {
  id: text('id').primaryKey(),
  nome: text('nome'),
  codigo: text('codigo'),
  operador: text('operador'),
  resumo: text('resumo'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
});

export const legadoClienteAcompanhantes = sqliteTable('legado_cliente_acompanhantes', {
  id: text('id').primaryKey(),
  clienteId: text('cliente_id'),
  companyId: text('company_id'),
  nomeCompleto: text('nome_completo'),
  cpf: text('cpf'),
  rg: text('rg'),
  telefone: text('telefone'),
  grauParentesco: text('grau_parentesco'),
  dataNascimento: text('data_nascimento'),
  observacoes: text('observacoes'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdBy: text('created_by'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoClienteTemplateDispatches = sqliteTable('legado_cliente_template_dispatches', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  companyId: text('company_id'),
  clienteId: text('cliente_id'),
  templateId: text('template_id'),
  canal: text('canal'),
  categoria: text('categoria'),
  status: text('status'),
  recipientName: text('recipient_name'),
  recipientContact: text('recipient_contact'),
  subject: text('subject'),
  sentAt: text('sent_at'),
  sentDay: text('sent_day'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoClientes = sqliteTable('legado_clientes', {
  id: text('id').primaryKey(),
  nome: text('nome'),
  nascimento: text('nascimento'),
  cpf: text('cpf'),
  telefone: text('telefone'),
  email: text('email'),
  endereco: text('endereco'),
  complemento: text('complemento'),
  cidade: text('cidade'),
  estado: text('estado'),
  notas: text('notas'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  whatsapp: text('whatsapp'),
  rg: text('rg'),
  genero: text('genero'),
  nacionalidade: text('nacionalidade'),
  tipoCliente: text('tipo_cliente'),
  tags: text('tags'),
  ativo: integer('ativo', { mode: 'boolean' }),
  companyId: text('company_id'),
  cep: text('cep'),
  numero: text('numero'),
  active: integer('active', { mode: 'boolean' }),
  classificacao: text('classificacao'),
  createdBy: text('created_by'),
  tipoPessoa: text('tipo_pessoa'),
  lgpdAnonimizado: integer('lgpd_anonimizado', { mode: 'boolean' }),
  lgpdAnonimizadoEm: text('lgpd_anonimizado_em'),
});

export const legadoClientesCompany = sqliteTable('legado_clientes_company', {
  companyId: text('company_id'),
  clienteId: text('cliente_id'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoComissionamentoGeral = sqliteTable('legado_comissionamento_geral', {
  id: text('id').primaryKey(),
  produtoId: text('produto_id'),
  metaNaoAtingida: real('meta_nao_atingida'),
  metaAtingida: real('meta_atingida'),
  superMeta: real('super_meta'),
  diferenciado: real('diferenciado'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoComissoes = sqliteTable('legado_comissoes', {
  id: text('id').primaryKey(),
  vendaId: text('venda_id'),
  vendedorId: text('vendedor_id'),
  regraId: text('regra_id'),
  valorVenda: real('valor_venda'),
  valorComissionavel: real('valor_comissionavel'),
  percentualAplicado: real('percentual_aplicado'),
  valorComissao: real('valor_comissao'),
  status: text('status'),
  dataPagamento: text('data_pagamento'),
  observacoesPagamento: text('observacoes_pagamento'),
  pagoPor: text('pago_por'),
  mesReferencia: integer('mes_referencia', { mode: 'number' }),
  anoReferencia: integer('ano_referencia', { mode: 'number' }),
  companyId: text('company_id'),
  createdBy: text('created_by'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  reciboId: text('recibo_id'),
});

export const legadoCommissionRule = sqliteTable('legado_commission_rule', {
  id: text('id').primaryKey(),
  nome: text('nome'),
  descricao: text('descricao'),
  tipo: text('tipo'),
  metaNaoAtingida: real('meta_nao_atingida'),
  metaAtingida: real('meta_atingida'),
  superMeta: real('super_meta'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  companyId: text('company_id'),
  createdBy: text('created_by'),
});

export const legadoCommissionTier = sqliteTable('legado_commission_tier', {
  id: text('id').primaryKey(),
  ruleId: text('rule_id'),
  faixa: text('faixa'),
  dePct: real('de_pct'),
  atePct: real('ate_pct'),
  incPctMeta: real('inc_pct_meta'),
  incPctComissao: real('inc_pct_comissao'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoCompanies = sqliteTable('legado_companies', {
  id: text('id').primaryKey(),
  nomeEmpresa: text('nome_empresa'),
  nomeFantasia: text('nome_fantasia'),
  cnpj: text('cnpj'),
  endereco: text('endereco'),
  telefone: text('telefone'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  cidade: text('cidade'),
  estado: text('estado'),
  ownerUserId: text('owner_user_id'),
  active: integer('active', { mode: 'boolean' }),
  logoUrl: text('logo_url'),
});

export const legadoCompanyBilling = sqliteTable('legado_company_billing', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  planId: text('plan_id'),
  status: text('status'),
  valorMensal: real('valor_mensal'),
  ultimoPagamento: text('ultimo_pagamento'),
  proximoVencimento: text('proximo_vencimento'),
  inicioCobranca: text('inicio_cobranca'),
  trialEndsAt: text('trial_ends_at'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoCompanyBillingEvents = sqliteTable('legado_company_billing_events', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  billingId: text('billing_id'),
  tipo: text('tipo'),
  status: text('status'),
  valor: real('valor'),
  moeda: text('moeda'),
  referencia: text('referencia'),
  vencimento: text('vencimento'),
  pagoEm: text('pago_em'),
  createdAt: text('created_at'),
});

export const legadoConciliacaoDiasSemMovimento = sqliteTable('legado_conciliacao_dias_sem_movimento', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  data: text('data'),
  marcadoPor: text('marcado_por'),
  marcadoEm: text('marcado_em'),
  observacao: text('observacao'),
});

export const legadoConciliacaoExecucoes = sqliteTable('legado_conciliacao_execucoes', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  actor: text('actor'),
  actorUserId: text('actor_user_id'),
  checked: integer('checked', { mode: 'number' }),
  reconciled: integer('reconciled', { mode: 'number' }),
  updatedTaxes: integer('updated_taxes', { mode: 'number' }),
  stillPending: integer('still_pending', { mode: 'number' }),
  status: text('status'),
  errorMessage: text('error_message'),
  createdAt: text('created_at'),
});

export const legadoConciliacaoReciboChanges = sqliteTable('legado_conciliacao_recibo_changes', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  conciliacaoReciboId: text('conciliacao_recibo_id'),
  vendaId: text('venda_id'),
  vendaReciboId: text('venda_recibo_id'),
  numeroRecibo: text('numero_recibo'),
  field: text('field'),
  oldValue: real('old_value'),
  newValue: real('new_value'),
  actor: text('actor'),
  changedBy: text('changed_by'),
  changedAt: text('changed_at'),
  revertedAt: text('reverted_at'),
  revertedBy: text('reverted_by'),
  revertReason: text('revert_reason'),
});

export const legadoConciliacaoRecibos = sqliteTable('legado_conciliacao_recibos', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  documento: text('documento'),
  movimentoData: text('movimento_data'),
  status: text('status'),
  descricao: text('descricao'),
  valorLancamentos: real('valor_lancamentos'),
  valorTaxas: real('valor_taxas'),
  valorDescontos: real('valor_descontos'),
  valorAbatimentos: real('valor_abatimentos'),
  valorCalculadaLoja: real('valor_calculada_loja'),
  valorVisaoMaster: real('valor_visao_master'),
  valorOpfax: real('valor_opfax'),
  valorSaldo: real('valor_saldo'),
  origem: text('origem'),
  raw: text('raw'),
  conciliado: integer('conciliado', { mode: 'boolean' }),
  matchTotal: integer('match_total', { mode: 'boolean' }),
  matchTaxas: integer('match_taxas', { mode: 'boolean' }),
  sistemaValorTotal: real('sistema_valor_total'),
  sistemaValorTaxas: real('sistema_valor_taxas'),
  diffTotal: real('diff_total'),
  diffTaxas: real('diff_taxas'),
  vendaId: text('venda_id'),
  vendaReciboId: text('venda_recibo_id'),
  importedBy: text('imported_by'),
  lastCheckedAt: text('last_checked_at'),
  conciliadoEm: text('conciliado_em'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  rankingVendedorId: text('ranking_vendedor_id'),
  rankingProdutoId: text('ranking_produto_id'),
  rankingAssignedBy: text('ranking_assigned_by'),
  rankingAssignedAt: text('ranking_assigned_at'),
  descricaoChave: text('descricao_chave'),
  valorVendaReal: real('valor_venda_real'),
  valorComissaoLoja: real('valor_comissao_loja'),
  percentualComissaoLoja: real('percentual_comissao_loja'),
  faixaComissao: text('faixa_comissao'),
  isSeguroViagem: integer('is_seguro_viagem', { mode: 'boolean' }),
  isBaixaRac: integer('is_baixa_rac', { mode: 'boolean' }),
  valorNaoComissionavel: real('valor_nao_comissionavel'),
  numeroReserva: text('numero_reserva'),
});

export const legadoConsultoriasOnline = sqliteTable('legado_consultorias_online', {
  id: text('id').primaryKey(),
  clienteId: text('cliente_id'),
  clienteNome: text('cliente_nome'),
  dataHora: text('data_hora'),
  lembrete: text('lembrete'),
  destino: text('destino'),
  quantidadePessoas: integer('quantidade_pessoas', { mode: 'number' }),
  orcamentoId: text('orcamento_id'),
  taxaConsultoria: real('taxa_consultoria'),
  notas: text('notas'),
  createdBy: text('created_by'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  lembreteEnviadoEm: text('lembrete_enviado_em'),
  lembreteEnvios: text('lembrete_envios'),
  fechada: integer('fechada', { mode: 'boolean' }),
  fechadaEm: text('fechada_em'),
});

export const legadoCrmMessageTemplates = sqliteTable('legado_crm_message_templates', {
  id: text('id').primaryKey(),
  slug: text('slug'),
  title: text('title'),
  category: text('category'),
  description: text('description'),
  subjectType: text('subject_type'),
  messageTemplate: text('message_template'),
  themeKey: text('theme_key'),
  layoutKey: text('layout_key'),
  logoPosition: text('logo_position'),
  isActive: integer('is_active', { mode: 'boolean' }),
  sortOrder: integer('sort_order', { mode: 'number' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoCrmTemplateCategories = sqliteTable('legado_crm_template_categories', {
  id: text('id').primaryKey(),
  nome: text('nome'),
  descricao: text('descricao'),
  icone: text('icone'),
  sortOrder: integer('sort_order', { mode: 'number' }),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoDashboardWidgets = sqliteTable('legado_dashboard_widgets', {
  id: text('id').primaryKey(),
  usuarioId: text('usuario_id'),
  widget: text('widget'),
  ordem: integer('ordem', { mode: 'number' }),
  visivel: integer('visivel', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  settings: text('settings'),
});

export const legadoDocumentosViagens = sqliteTable('legado_documentos_viagens', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  uploadedBy: text('uploaded_by'),
  fileName: text('file_name'),
  displayName: text('display_name'),
  storageBucket: text('storage_bucket'),
  storagePath: text('storage_path'),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes', { mode: 'number' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  updatedBy: text('updated_by'),
  title: text('title'),
  templateText: text('template_text'),
  templateFields: text('template_fields'),
});

export const legadoEscalaDia = sqliteTable('legado_escala_dia', {
  id: text('id').primaryKey(),
  escalaMesId: text('escala_mes_id'),
  usuarioId: text('usuario_id'),
  data: text('data'),
  tipo: text('tipo'),
  horaInicio: text('hora_inicio'),
  horaFim: text('hora_fim'),
  observacao: text('observacao'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoEscalaHorarioUsuario = sqliteTable('legado_escala_horario_usuario', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  usuarioId: text('usuario_id'),
  segInicio: text('seg_inicio'),
  segFim: text('seg_fim'),
  terInicio: text('ter_inicio'),
  terFim: text('ter_fim'),
  quaInicio: text('qua_inicio'),
  quaFim: text('qua_fim'),
  quiInicio: text('qui_inicio'),
  quiFim: text('qui_fim'),
  sexInicio: text('sex_inicio'),
  sexFim: text('sex_fim'),
  sabInicio: text('sab_inicio'),
  sabFim: text('sab_fim'),
  domInicio: text('dom_inicio'),
  domFim: text('dom_fim'),
  feriadoInicio: text('feriado_inicio'),
  feriadoFim: text('feriado_fim'),
  autoAplicar: integer('auto_aplicar', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoEscalaMes = sqliteTable('legado_escala_mes', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  gestorId: text('gestor_id'),
  periodo: text('periodo'),
  status: text('status'),
  observacoes: text('observacoes'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoEstados = sqliteTable('legado_estados', {
  id: text('id').primaryKey(),
  nome: text('nome'),
  paisId: text('pais_id'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoFeriados = sqliteTable('legado_feriados', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  data: text('data'),
  nome: text('nome'),
  tipo: text('tipo'),
  estado: text('estado'),
  cidade: text('cidade'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoFinanceiroEmpresas = sqliteTable('legado_financeiro_empresas', {
  id: text('id').primaryKey(),
  financeiroId: text('financeiro_id'),
  companyId: text('company_id'),
  status: text('status'),
  createdAt: text('created_at'),
  approvedAt: text('approved_at'),
  createdBy: text('created_by'),
});

export const legadoFormasPagamento = sqliteTable('legado_formas_pagamento', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  nome: text('nome'),
  descricao: text('descricao'),
  pagaComissao: integer('paga_comissao', { mode: 'boolean' }),
  permiteDesconto: integer('permite_desconto', { mode: 'boolean' }),
  descontoPadraoPct: real('desconto_padrao_pct'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoFornecedores = sqliteTable('legado_fornecedores', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  localizacao: text('localizacao'),
  nomeCompleto: text('nome_completo'),
  nomeFantasia: text('nome_fantasia'),
  cnpj: text('cnpj'),
  cep: text('cep'),
  cidade: text('cidade'),
  estado: text('estado'),
  telefone: text('telefone'),
  whatsapp: text('whatsapp'),
  telefoneEmergencia: text('telefone_emergencia'),
  responsavel: text('responsavel'),
  tipoFaturamento: text('tipo_faturamento'),
  principaisServicos: text('principais_servicos'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoGestorEquipeCompartilhada = sqliteTable('legado_gestor_equipe_compartilhada', {
  gestorId: text('gestor_id').primaryKey(),
  gestorBaseId: text('gestor_base_id'),
  createdAt: text('created_at'),
  createdBy: text('created_by'),
});

export const legadoGestorVendedor = sqliteTable('legado_gestor_vendedor', {
  id: text('id').primaryKey(),
  gestorId: text('gestor_id'),
  vendedorId: text('vendedor_id'),
  companyId: text('company_id'),
  podeModificar: integer('pode_modificar', { mode: 'boolean' }),
  createdAt: text('created_at'),
  ativo: integer('ativo', { mode: 'boolean' }),
});

export const legadoHistoricoViagensReal = sqliteTable('legado_historico_viagens_real', {
  id: text('id').primaryKey(),
  vendaId: text('venda_id'),
  clienteId: text('cliente_id'),
  destinoId: text('destino_id'),
  dataViagem: text('data_viagem'),
  produto: text('produto'),
  valor: real('valor'),
  recibos: text('recibos'),
  notas: text('notas'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  valorTotal: real('valor_total'),
});

export const legadoInquiry = sqliteTable('legado_inquiry', {
  id: text('id').primaryKey(),
  origin: text('origin'),
  clientId: text('client_id'),
  assignedSellerId: text('assigned_seller_id'),
  countryId: text('country_id'),
  cityId: text('city_id'),
  destinationId: text('destination_id'),
  checkin: text('checkin'),
  checkout: text('checkout'),
  adults: integer('adults', { mode: 'number' }),
  children: integer('children', { mode: 'number' }),
  currencyPreference: text('currency_preference'),
  status: text('status'),
  notes: text('notes'),
  assignedAt: text('assigned_at'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoInquiryPreference = sqliteTable('legado_inquiry_preference', {
  id: text('id').primaryKey(),
  inquiryId: text('inquiry_id'),
  preferenceKey: text('preference_key'),
  preferenceValue: text('preference_value'),
});

export const legadoLgpdAtividadesTratamento = sqliteTable('legado_lgpd_atividades_tratamento', {
  id: text('id').primaryKey(),
  nome: text('nome'),
  finalidade: text('finalidade'),
  baseLegal: text('base_legal'),
  dadosTratados: text('dados_tratados'),
  titulares: text('titulares'),
  compartilhamento: text('compartilhamento'),
  retencaoMeses: integer('retencao_meses', { mode: 'number' }),
  medidasSeguranca: text('medidas_seguranca'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoLgpdConsentimentos = sqliteTable('legado_lgpd_consentimentos', {
  id: text('id').primaryKey(),
  clienteId: text('cliente_id'),
  titularEmail: text('titular_email'),
  titularCpf: text('titular_cpf'),
  finalidade: text('finalidade'),
  consentido: integer('consentido', { mode: 'boolean' }),
  origem: text('origem'),
  ipOrigem: text('ip_origem'),
  userAgent: text('user_agent'),
  versaoPolitica: text('versao_politica'),
  revogadoEm: text('revogado_em'),
  revogadoMotivo: text('revogado_motivo'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoLgpdSolicitacoes = sqliteTable('legado_lgpd_solicitacoes', {
  id: text('id').primaryKey(),
  tipo: text('tipo'),
  titularNome: text('titular_nome'),
  titularEmail: text('titular_email'),
  titularCpf: text('titular_cpf'),
  companyId: text('company_id'),
  clienteId: text('cliente_id'),
  userId: text('user_id'),
  descricao: text('descricao'),
  status: text('status'),
  resposta: text('resposta'),
  respondidoPor: text('respondido_por'),
  respondidoEm: text('respondido_em'),
  prazoLegal: text('prazo_legal'),
  ipOrigem: text('ip_origem'),
  userAgent: text('user_agent'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoLogs = sqliteTable('legado_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  modulo: text('modulo'),
  acao: text('acao'),
  detalhes: text('detalhes'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: text('created_at'),
});

export const legadoMasterDocuments = sqliteTable('legado_master_documents', {
  id: text('id').primaryKey(),
  masterId: text('master_id'),
  uploadedBy: text('uploaded_by'),
  docType: text('doc_type'),
  fileName: text('file_name'),
  storageBucket: text('storage_bucket'),
  storagePath: text('storage_path'),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes', { mode: 'number' }),
  createdAt: text('created_at'),
});

export const legadoMasterEmpresas = sqliteTable('legado_master_empresas', {
  id: text('id').primaryKey(),
  masterId: text('master_id'),
  companyId: text('company_id'),
  status: text('status'),
  createdAt: text('created_at'),
  approvedAt: text('approved_at'),
  approvedBy: text('approved_by'),
});

export const legadoMenuPrefs = sqliteTable('legado_menu_prefs', {
  userId: text('user_id').primaryKey(),
  prefs: text('prefs'),
  updatedAt: text('updated_at'),
});

export const legadoMessageTemplatesV2 = sqliteTable('legado_message_templates_v2', {
  id: text('id').primaryKey(),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  createdBy: text('created_by'),
  scope: text('scope'),
  companyId: text('company_id'),
  gestorId: text('gestor_id'),
  nome: text('nome'),
  slug: text('slug'),
  categoria: text('categoria'),
  ocasiao: text('ocasiao'),
  description: text('description'),
  tags: text('tags'),
  themeId: text('theme_id'),
  assunto: text('assunto'),
  titulo: text('titulo'),
  corpo: text('corpo'),
  assinaturaPadrao: text('assinatura_padrao'),
  requiredVars: text('required_vars'),
  optionalVars: text('optional_vars'),
  titleStyleOverride: text('title_style_override'),
  greetingStyleOverride: text('greeting_style_override'),
  bodyStyleOverride: text('body_style_override'),
  signatureStyleOverride: text('signature_style_override'),
  ativo: integer('ativo', { mode: 'boolean' }),
  isDefault: integer('is_default', { mode: 'boolean' }),
  isFavorite: integer('is_favorite', { mode: 'boolean' }),
  usageCount: integer('usage_count', { mode: 'number' }),
  lastUsedAt: text('last_used_at'),
  metadata: text('metadata'),
  version: integer('version', { mode: 'number' }),
});

export const legadoMetasVendedor = sqliteTable('legado_metas_vendedor', {
  id: text('id').primaryKey(),
  vendedorId: text('vendedor_id'),
  periodo: text('periodo'),
  metaGeral: real('meta_geral'),
  metaDiferenciada: real('meta_diferenciada'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  templateId: text('template_id'),
  scope: text('scope'),
});

export const legadoMetasVendedorProduto = sqliteTable('legado_metas_vendedor_produto', {
  id: text('id').primaryKey(),
  metaVendedorId: text('meta_vendedor_id'),
  produtoId: text('produto_id'),
  valor: real('valor'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoMinhasPreferencias = sqliteTable('legado_minhas_preferencias', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  createdBy: text('created_by'),
  tipoProdutoId: text('tipo_produto_id'),
  cidadeId: text('cidade_id'),
  nome: text('nome'),
  localizacao: text('localizacao'),
  classificacao: text('classificacao'),
  observacao: text('observacao'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  updatedBy: text('updated_by'),
});

export const legadoMinhasPreferenciasShares = sqliteTable('legado_minhas_preferencias_shares', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  preferenciaId: text('preferencia_id'),
  sharedBy: text('shared_by'),
  sharedWith: text('shared_with'),
  status: text('status'),
  createdAt: text('created_at'),
  acceptedAt: text('accepted_at'),
  revokedAt: text('revoked_at'),
});

export const legadoModuloAcesso = sqliteTable('legado_modulo_acesso', {
  id: text('id').primaryKey(),
  usuarioId: text('usuario_id'),
  modulo: text('modulo'),
  permissao: text('permissao'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoModuloAcessoBackup = sqliteTable('legado_modulo_acesso_backup', {
  id: text('id'),
  usuarioId: text('usuario_id'),
  modulo: text('modulo'),
  permissao: text('permissao'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoMuralRecadoRespostas = sqliteTable('legado_mural_recado_respostas', {
  id: text('id').primaryKey(),
  recadoId: text('recado_id'),
  companyId: text('company_id'),
  senderId: text('sender_id'),
  conteudo: text('conteudo'),
  createdAt: text('created_at'),
});

export const legadoMuralRecados = sqliteTable('legado_mural_recados', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  senderId: text('sender_id'),
  receiverId: text('receiver_id'),
  assunto: text('assunto'),
  conteudo: text('conteudo'),
  createdAt: text('created_at'),
  senderDeleted: integer('sender_deleted', { mode: 'boolean' }),
  receiverDeleted: integer('receiver_deleted', { mode: 'boolean' }),
});

export const legadoMuralRecadosArquivos = sqliteTable('legado_mural_recados_arquivos', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  recadoId: text('recado_id'),
  uploadedBy: text('uploaded_by'),
  fileName: text('file_name'),
  storageBucket: text('storage_bucket'),
  storagePath: text('storage_path'),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes', { mode: 'number' }),
  createdAt: text('created_at'),
});

export const legadoMuralRecadosLeituras = sqliteTable('legado_mural_recados_leituras', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  recadoId: text('recado_id'),
  userId: text('user_id'),
  readAt: text('read_at'),
  createdAt: text('created_at'),
});

export const legadoPaises = sqliteTable('legado_paises', {
  id: text('id').primaryKey(),
  nome: text('nome'),
  codigoIso: text('codigo_iso'),
  continente: text('continente'),
  createdAt: text('created_at'),
});

export const legadoParametrosCambios = sqliteTable('legado_parametros_cambios', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  ownerUserId: text('owner_user_id'),
  moeda: text('moeda'),
  data: text('data'),
  valor: real('valor'),
  observacoes: text('observacoes'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoParametrosComissao = sqliteTable('legado_parametros_comissao', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  ownerUserId: text('owner_user_id'),
  usarTaxasNaMeta: integer('usar_taxas_na_meta', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  focoValor: text('foco_valor'),
  modoCorporativo: integer('modo_corporativo', { mode: 'boolean' }),
  politicaCancelamento: text('politica_cancelamento'),
  focoFaturamento: text('foco_faturamento'),
  exportacaoPdf: integer('exportacao_pdf', { mode: 'boolean' }),
  exportacaoExcel: integer('exportacao_excel', { mode: 'boolean' }),
  conciliacaoSobrepoeVendas: integer('conciliacao_sobrepoe_vendas', { mode: 'boolean' }),
  mfaObrigatorio: integer('mfa_obrigatorio', { mode: 'boolean' }),
  conciliacaoRegraAtiva: integer('conciliacao_regra_ativa', { mode: 'boolean' }),
  conciliacaoMetaNaoAtingida: real('conciliacao_meta_nao_atingida'),
  conciliacaoMetaAtingida: real('conciliacao_meta_atingida'),
  conciliacaoSuperMeta: real('conciliacao_super_meta'),
  conciliacaoTipo: text('conciliacao_tipo'),
  conciliacaoTiers: text('conciliacao_tiers'),
  conciliacaoFaixasLoja: text('conciliacao_faixas_loja'),
});

export const legadoParametrosPagamentosNaoComissionaveis = sqliteTable('legado_parametros_pagamentos_nao_comissionaveis', {
  id: text('id').primaryKey(),
  termo: text('termo'),
  termoNormalizado: text('termo_normalizado'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  createdBy: text('created_by'),
  updatedAt: text('updated_at'),
  updatedBy: text('updated_by'),
});

export const legadoParametrosSistema = sqliteTable('legado_parametros_sistema', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  usarTaxasNaMeta: integer('usar_taxas_na_meta', { mode: 'boolean' }),
  focoValor: text('foco_valor'),
  modoCorporativo: integer('modo_corporativo', { mode: 'boolean' }),
  politicaCancelamento: text('politica_cancelamento'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoPlans = sqliteTable('legado_plans', {
  id: text('id').primaryKey(),
  nome: text('nome'),
  descricao: text('descricao'),
  valorMensal: real('valor_mensal'),
  moeda: text('moeda'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoProductCommissionRule = sqliteTable('legado_product_commission_rule', {
  id: text('id').primaryKey(),
  produtoId: text('produto_id'),
  ruleId: text('rule_id'),
  fixMetaNaoAtingida: real('fix_meta_nao_atingida'),
  fixMetaAtingida: real('fix_meta_atingida'),
  fixSuperMeta: real('fix_super_meta'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoProductCommissionRulePacote = sqliteTable('legado_product_commission_rule_pacote', {
  id: text('id').primaryKey(),
  produtoId: text('produto_id'),
  tipoPacote: text('tipo_pacote'),
  ruleId: text('rule_id'),
  fixMetaNaoAtingida: real('fix_meta_nao_atingida'),
  fixMetaAtingida: real('fix_meta_atingida'),
  fixSuperMeta: real('fix_super_meta'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoProdutos = sqliteTable('legado_produtos', {
  id: text('id').primaryKey(),
  nome: text('nome'),
  cidadeId: text('cidade_id'),
  informacoesImportantes: text('informacoes_importantes'),
  atracaoPrincipal: text('atracao_principal'),
  melhorEpoca: text('melhor_epoca'),
  duracaoSugerida: text('duracao_sugerida'),
  nivelPreco: text('nivel_preco'),
  imagemUrl: text('imagem_url'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  tipoProduto: text('tipo_produto'),
  destino: text('destino'),
  fornecedorId: text('fornecedor_id'),
  todasAsCidades: integer('todas_as_cidades', { mode: 'boolean' }),
  valorNeto: real('valor_neto'),
  margem: real('margem'),
  valorVenda: real('valor_venda'),
  moeda: text('moeda'),
  cambio: real('cambio'),
  valorEmReais: real('valor_em_reais'),
  circuitoId: text('circuito_id'),
});

export const legadoProdutosTarifas = sqliteTable('legado_produtos_tarifas', {
  id: text('id').primaryKey(),
  produtoId: text('produto_id'),
  acomodacao: text('acomodacao'),
  qtePax: integer('qte_pax', { mode: 'number' }),
  tipo: text('tipo'),
  validadeDe: text('validade_de'),
  validadeAte: text('validade_ate'),
  valorNeto: real('valor_neto'),
  padrao: text('padrao'),
  margem: real('margem'),
  valorVenda: real('valor_venda'),
  moeda: text('moeda'),
  cambio: real('cambio'),
  valorEmReais: real('valor_em_reais'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoQuote = sqliteTable('legado_quote', {
  id: text('id').primaryKey(),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  createdBy: text('created_by'),
  clientId: text('client_id'),
  status: text('status'),
  currency: text('currency'),
  total: real('total'),
  averageConfidence: real('average_confidence'),
  sourceFilePath: text('source_file_path'),
  sourceFileUrl: text('source_file_url'),
  rawJson: text('raw_json'),
  statusNegociacao: text('status_negociacao'),
  subtotal: real('subtotal'),
  taxes: real('taxes'),
  clientName: text('client_name'),
  clientWhatsapp: text('client_whatsapp'),
  clientEmail: text('client_email'),
  destinoCidadeId: text('destino_cidade_id'),
  dataEmbarque: text('data_embarque'),
  dataFinal: text('data_final'),
  lastInteractionAt: text('last_interaction_at'),
  lastInteractionNotes: text('last_interaction_notes'),
  roteiroId: text('roteiro_id'),
});

export const legadoQuoteImportLog = sqliteTable('legado_quote_import_log', {
  id: text('id').primaryKey(),
  quoteId: text('quote_id'),
  level: text('level'),
  message: text('message'),
  payload: text('payload'),
  createdAt: text('created_at'),
});

export const legadoQuoteItem = sqliteTable('legado_quote_item', {
  id: text('id').primaryKey(),
  quoteId: text('quote_id'),
  itemType: text('item_type'),
  title: text('title'),
  productName: text('product_name'),
  cityName: text('city_name'),
  quantity: integer('quantity', { mode: 'number' }),
  unitPrice: real('unit_price'),
  totalAmount: real('total_amount'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  currency: text('currency'),
  confidence: real('confidence'),
  raw: text('raw'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  orderIndex: integer('order_index', { mode: 'number' }),
  taxesAmount: real('taxes_amount'),
  cidadeId: text('cidade_id'),
});

export const legadoQuoteItemSegment = sqliteTable('legado_quote_item_segment', {
  id: text('id').primaryKey(),
  quoteItemId: text('quote_item_id'),
  segmentType: text('segment_type'),
  data: text('data'),
  orderIndex: integer('order_index', { mode: 'number' }),
  createdAt: text('created_at'),
});

export const legadoQuotePrintSettings = sqliteTable('legado_quote_print_settings', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id'),
  companyId: text('company_id'),
  logoUrl: text('logo_url'),
  consultorNome: text('consultor_nome'),
  filialNome: text('filial_nome'),
  enderecoLinha1: text('endereco_linha1'),
  enderecoLinha2: text('endereco_linha2'),
  enderecoLinha3: text('endereco_linha3'),
  telefone: text('telefone'),
  whatsapp: text('whatsapp'),
  email: text('email'),
  rodapeTexto: text('rodape_texto'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  logoPath: text('logo_path'),
  imagemComplementarUrl: text('imagem_complementar_url'),
  imagemComplementarPath: text('imagem_complementar_path'),
  whatsappCodigoPais: text('whatsapp_codigo_pais'),
});

export const legadoRankingReadModelStatus = sqliteTable('legado_ranking_read_model_status', {
  id: text('id').primaryKey(),
  modelo: text('modelo'),
  companyId: text('company_id'),
  mes: text('mes'),
  status: text('status'),
  dirtyAt: text('dirty_at'),
  rebuiltAt: text('rebuilt_at'),
  lastError: text('last_error'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoRankingReciboContribuicoes = sqliteTable('legado_ranking_recibo_contribuicoes', {
  id: text('id').primaryKey(),
  sourceKey: text('source_key'),
  companyId: text('company_id'),
  mes: text('mes'),
  dataRecibo: text('data_recibo'),
  vendedorId: text('vendedor_id'),
  clienteId: text('cliente_id'),
  vendaId: text('venda_id'),
  reciboId: text('recibo_id'),
  vendaKey: text('venda_key'),
  reciboNumero: text('recibo_numero'),
  produtoId: text('produto_id'),
  produtoNome: text('produto_nome'),
  destinoNome: text('destino_nome'),
  valorBruto: real('valor_bruto'),
  valorTaxas: real('valor_taxas'),
  valorSeguro: real('valor_seguro'),
  isSeguro: integer('is_seguro', { mode: 'boolean' }),
  fator: real('fator'),
  sourceBruto: real('source_bruto'),
  sourceTaxas: real('source_taxas'),
  origem: text('origem'),
  builtAt: text('built_at'),
  updatedAt: text('updated_at'),
});

export const legadoRecibos = sqliteTable('legado_recibos', {
  id: text('id').primaryKey(),
  vendaId: text('venda_id'),
  produtoId: text('produto_id'),
  valor: real('valor'),
  descricao: text('descricao'),
  createdAt: text('created_at'),
});

export const legadoRoteiroDia = sqliteTable('legado_roteiro_dia', {
  id: text('id').primaryKey(),
  createdBy: text('created_by'),
  companyId: text('company_id'),
  roteiroId: text('roteiro_id'),
  cidade: text('cidade'),
  data: text('data'),
  ordem: integer('ordem', { mode: 'number' }),
  descricao: text('descricao'),
  createdAt: text('created_at'),
  percurso: text('percurso'),
});

export const legadoRoteiroHotel = sqliteTable('legado_roteiro_hotel', {
  id: text('id').primaryKey(),
  roteiroId: text('roteiro_id'),
  cidade: text('cidade'),
  hotel: text('hotel'),
  dataInicio: text('data_inicio'),
  dataFim: text('data_fim'),
  noites: integer('noites', { mode: 'number' }),
  apto: text('apto'),
  categoria: text('categoria'),
  regime: text('regime'),
  ordem: integer('ordem', { mode: 'number' }),
  endereco: text('endereco'),
  qtdApto: integer('qtd_apto', { mode: 'number' }),
  tipoTarifa: text('tipo_tarifa'),
  qtdAdultos: integer('qtd_adultos', { mode: 'number' }),
  qtdCriancas: integer('qtd_criancas', { mode: 'number' }),
  valorOriginal: real('valor_original'),
  valorFinal: real('valor_final'),
});

export const legadoRoteiroInvestimento = sqliteTable('legado_roteiro_investimento', {
  id: text('id').primaryKey(),
  roteiroId: text('roteiro_id'),
  tipo: text('tipo'),
  valorPorPessoa: real('valor_por_pessoa'),
  qtdApto: integer('qtd_apto', { mode: 'number' }),
  valorPorApto: real('valor_por_apto'),
  ordem: integer('ordem', { mode: 'number' }),
});

export const legadoRoteiroPagamento = sqliteTable('legado_roteiro_pagamento', {
  id: text('id').primaryKey(),
  roteiroId: text('roteiro_id'),
  servico: text('servico'),
  valorTotalComTaxas: real('valor_total_com_taxas'),
  taxas: real('taxas'),
  formaPagamento: text('forma_pagamento'),
  ordem: integer('ordem', { mode: 'number' }),
});

export const legadoRoteiroPasseio = sqliteTable('legado_roteiro_passeio', {
  id: text('id').primaryKey(),
  roteiroId: text('roteiro_id'),
  cidade: text('cidade'),
  passeio: text('passeio'),
  dataInicio: text('data_inicio'),
  tipo: text('tipo'),
  ingressos: text('ingressos'),
  ordem: integer('ordem', { mode: 'number' }),
  dataFim: text('data_fim'),
  fornecedor: text('fornecedor'),
  qtdAdultos: integer('qtd_adultos', { mode: 'number' }),
  qtdCriancas: integer('qtd_criancas', { mode: 'number' }),
  valorOriginal: real('valor_original'),
  valorFinal: real('valor_final'),
});

export const legadoRoteiroPersonalizado = sqliteTable('legado_roteiro_personalizado', {
  id: text('id').primaryKey(),
  createdBy: text('created_by'),
  companyId: text('company_id'),
  nome: text('nome'),
  duracao: integer('duracao', { mode: 'number' }),
  inicioCidade: text('inicio_cidade'),
  fimCidade: text('fim_cidade'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  incluiTexto: text('inclui_texto'),
  naoIncluiTexto: text('nao_inclui_texto'),
  informacoesImportantes: text('informacoes_importantes'),
  mostrarPagamentoPdf: integer('mostrar_pagamento_pdf', { mode: 'boolean' }),
  mostrarInformacoesPdf: integer('mostrar_informacoes_pdf', { mode: 'boolean' }),
  mostrarRodapePdf: integer('mostrar_rodape_pdf', { mode: 'boolean' }),
  opcionais: text('opcionais'),
});

export const legadoRoteiroSugestoes = sqliteTable('legado_roteiro_sugestoes', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  tipo: text('tipo'),
  valor: text('valor'),
  usoCount: integer('uso_count', { mode: 'number' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoRoteiroTransporte = sqliteTable('legado_roteiro_transporte', {
  id: text('id').primaryKey(),
  roteiroId: text('roteiro_id'),
  tipo: text('tipo'),
  fornecedor: text('fornecedor'),
  descricao: text('descricao'),
  dataInicio: text('data_inicio'),
  dataFim: text('data_fim'),
  categoria: text('categoria'),
  observacao: text('observacao'),
  ordem: integer('ordem', { mode: 'number' }),
  trecho: text('trecho'),
  ciaAerea: text('cia_aerea'),
  dataVoo: text('data_voo'),
  classeReserva: text('classe_reserva'),
  horaSaida: text('hora_saida'),
  aeroportoSaida: text('aeroporto_saida'),
  duracaoVoo: text('duracao_voo'),
  tipoVoo: text('tipo_voo'),
  horaChegada: text('hora_chegada'),
  aeroportoChegada: text('aeroporto_chegada'),
  tarifaNome: text('tarifa_nome'),
  reembolsoTipo: text('reembolso_tipo'),
  qtdAdultos: integer('qtd_adultos', { mode: 'number' }),
  qtdCriancas: integer('qtd_criancas', { mode: 'number' }),
  valorTotal: real('valor_total'),
  taxas: real('taxas'),
});

export const legadoSacControle = sqliteTable('legado_sac_controle', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  recibo: text('recibo'),
  tour: text('tour'),
  dataSolicitacao: text('data_solicitacao'),
  motivo: text('motivo'),
  contratantePax: text('contratante_pax'),
  okQuando: text('ok_quando'),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  status: text('status'),
  responsavel: text('responsavel'),
  prazo: text('prazo'),
});

export const legadoSacInteracoes = sqliteTable('legado_sac_interacoes', {
  id: text('id').primaryKey(),
  sacId: text('sac_id'),
  dataInteracao: text('data_interacao'),
  descricao: text('descricao'),
  createdBy: text('created_by'),
  createdAt: text('created_at'),
});

export const legadoSecurityAuditWeeklyRuns = sqliteTable('legado_security_audit_weekly_runs', {
  id: text('id').primaryKey(),
  ranAt: text('ran_at'),
  status: text('status'),
  missingPolicyCount: integer('missing_policy_count', { mode: 'number' }),
  broadPolicyCount: integer('broad_policy_count', { mode: 'number' }),
  overlappingTableCount: integer('overlapping_table_count', { mode: 'number' }),
  unforcedCriticalCount: integer('unforced_critical_count', { mode: 'number' }),
  pagamentosCompanyMismatch: integer('pagamentos_company_mismatch', { mode: 'number' }),
  bucketPublic: integer('bucket_public', { mode: 'boolean' }),
  details: text('details'),
});

export const legadoSecurityRateLimits = sqliteTable('legado_security_rate_limits', {
  scope: text('scope'),
  keyHash: text('key_hash'),
  windowStart: text('window_start'),
  expiresAt: text('expires_at'),
  hits: integer('hits', { mode: 'number' }),
});

export const legadoServicoFornecedorPrice = sqliteTable('legado_servico_fornecedor_price', {
  id: text('id').primaryKey(),
  servicoFornecedorId: text('servico_fornecedor_id'),
  moeda: text('moeda'),
  valorBase: real('valor_base'),
  tipoValor: text('tipo_valor'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoServicoFornecedorPricePeriod = sqliteTable('legado_servico_fornecedor_price_period', {
  id: text('id').primaryKey(),
  servicoFornecedorPriceId: text('servico_fornecedor_price_id'),
  dataInicio: text('data_inicio'),
  dataFim: text('data_fim'),
  ajusteTipo: text('ajuste_tipo'),
  ajusteValor: real('ajuste_valor'),
});

export const legadoServicoPrice = sqliteTable('legado_servico_price', {
  id: text('id').primaryKey(),
  servicoId: text('servico_id'),
  moeda: text('moeda'),
  valorBase: real('valor_base'),
  tipoValor: text('tipo_valor'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoServicoPricePeriod = sqliteTable('legado_servico_price_period', {
  id: text('id').primaryKey(),
  servicoPriceId: text('servico_price_id'),
  dataInicio: text('data_inicio'),
  dataFim: text('data_fim'),
  ajusteTipo: text('ajuste_tipo'),
  ajusteValor: real('ajuste_valor'),
});

export const legadoServicos = sqliteTable('legado_servicos', {
  id: text('id').primaryKey(),
  nome: text('nome'),
  tipo: text('tipo'),
  descricao: text('descricao'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoServicosFornecedor = sqliteTable('legado_servicos_fornecedor', {
  id: text('id').primaryKey(),
  fornecedorId: text('fornecedor_id'),
  nome: text('nome'),
  tipo: text('tipo'),
  descricao: text('descricao'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoSubdivisoes = sqliteTable('legado_subdivisoes', {
  id: text('id').primaryKey(),
  paisId: text('pais_id'),
  codigoAdmin1: text('codigo_admin1'),
  nome: text('nome'),
  tipo: text('tipo'),
  createdAt: text('created_at'),
});

export const legadoSystemDocumentation = sqliteTable('legado_system_documentation', {
  id: text('id').primaryKey(),
  slug: text('slug'),
  markdown: text('markdown'),
  updatedAt: text('updated_at'),
  updatedBy: text('updated_by'),
});

export const legadoSystemDocumentationSectionVersions = sqliteTable('legado_system_documentation_section_versions', {
  id: text('id').primaryKey(),
  sectionId: text('section_id'),
  slug: text('slug'),
  roleScope: text('role_scope'),
  moduleKey: text('module_key'),
  routePattern: text('route_pattern'),
  title: text('title'),
  summary: text('summary'),
  contentMarkdown: text('content_markdown'),
  tone: text('tone'),
  sortOrder: integer('sort_order', { mode: 'number' }),
  isActive: integer('is_active', { mode: 'boolean' }),
  action: text('action'),
  createdAt: text('created_at'),
  createdBy: text('created_by'),
});

export const legadoSystemDocumentationSections = sqliteTable('legado_system_documentation_sections', {
  id: text('id').primaryKey(),
  slug: text('slug'),
  roleScope: text('role_scope'),
  moduleKey: text('module_key'),
  routePattern: text('route_pattern'),
  title: text('title'),
  summary: text('summary'),
  contentMarkdown: text('content_markdown'),
  tone: text('tone'),
  sortOrder: integer('sort_order', { mode: 'number' }),
  isActive: integer('is_active', { mode: 'boolean' }),
  createdAt: text('created_at'),
  createdBy: text('created_by'),
  updatedAt: text('updated_at'),
  updatedBy: text('updated_by'),
});

export const legadoSystemDocumentationVersions = sqliteTable('legado_system_documentation_versions', {
  id: text('id').primaryKey(),
  docId: text('doc_id'),
  slug: text('slug'),
  markdown: text('markdown'),
  action: text('action'),
  createdAt: text('created_at'),
  createdBy: text('created_by'),
});

export const legadoSystemModuleSettings = sqliteTable('legado_system_module_settings', {
  moduleKey: text('module_key').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }),
  reason: text('reason'),
  updatedAt: text('updated_at'),
  updatedBy: text('updated_by'),
});

export const legadoTipoPacotes = sqliteTable('legado_tipo_pacotes', {
  id: text('id').primaryKey(),
  nome: text('nome'),
  ruleId: text('rule_id'),
  fixMetaNaoAtingida: real('fix_meta_nao_atingida'),
  fixMetaAtingida: real('fix_meta_atingida'),
  fixSuperMeta: real('fix_super_meta'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoTipoProdutos = sqliteTable('legado_tipo_produtos', {
  id: text('id').primaryKey(),
  tipo: text('tipo'),
  regraComissionamento: text('regra_comissionamento'),
  somaNaMeta: integer('soma_na_meta', { mode: 'boolean' }),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  nome: text('nome'),
  usaMetaProduto: integer('usa_meta_produto', { mode: 'boolean' }),
  metaProdutoValor: real('meta_produto_valor'),
  comissaoProdutoMetaPct: real('comissao_produto_meta_pct'),
  descontarMetaGeral: integer('descontar_meta_geral', { mode: 'boolean' }),
  exibeKpiComissao: integer('exibe_kpi_comissao', { mode: 'boolean' }),
});

export const legadoTodoCategorias = sqliteTable('legado_todo_categorias', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  userId: text('user_id'),
  nome: text('nome'),
  cor: text('cor'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoUserConvites = sqliteTable('legado_user_convites', {
  id: text('id').primaryKey(),
  invitedUserId: text('invited_user_id'),
  invitedEmail: text('invited_email'),
  companyId: text('company_id'),
  userTypeId: text('user_type_id'),
  invitedBy: text('invited_by'),
  invitedByRole: text('invited_by_role'),
  status: text('status'),
  createdAt: text('created_at'),
  acceptedAt: text('accepted_at'),
  cancelledAt: text('cancelled_at'),
  expiresAt: text('expires_at'),
  usoIndividual: integer('uso_individual', { mode: 'boolean' }),
});

export const legadoUserCrmAssinaturas = sqliteTable('legado_user_crm_assinaturas', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  companyId: text('company_id'),
  nome: text('nome'),
  linha1: text('linha1'),
  linha1FontSize: integer('linha1_font_size', { mode: 'number' }),
  linha1Italic: integer('linha1_italic', { mode: 'boolean' }),
  linha2: text('linha2'),
  linha2FontSize: integer('linha2_font_size', { mode: 'number' }),
  linha2Italic: integer('linha2_italic', { mode: 'boolean' }),
  linha3: text('linha3'),
  linha3FontSize: integer('linha3_font_size', { mode: 'number' }),
  linha3Italic: integer('linha3_italic', { mode: 'boolean' }),
  isDefault: integer('is_default', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoUserMessageTemplateThemes = sqliteTable('legado_user_message_template_themes', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  companyId: text('company_id'),
  categoria: text('categoria'),
  nome: text('nome'),
  assetUrl: text('asset_url'),
  storagePath: text('storage_path'),
  widthPx: integer('width_px', { mode: 'number' }),
  heightPx: integer('height_px', { mode: 'number' }),
  titleStyle: text('title_style'),
  bodyStyle: text('body_style'),
  signatureStyle: text('signature_style'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  categoriaId: text('categoria_id'),
  scope: text('scope'),
  greetingText: text('greeting_text'),
  mensagemMaxLinhas: integer('mensagem_max_linhas', { mode: 'number' }),
  mensagemMaxPalavras: integer('mensagem_max_palavras', { mode: 'number' }),
  assinaturaMaxLinhas: integer('assinatura_max_linhas', { mode: 'number' }),
  assinaturaMaxPalavras: integer('assinatura_max_palavras', { mode: 'number' }),
  logoUrl: text('logo_url'),
  logoPath: text('logo_path'),
});

export const legadoUserMessageTemplates = sqliteTable('legado_user_message_templates', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  companyId: text('company_id'),
  nome: text('nome'),
  categoria: text('categoria'),
  assunto: text('assunto'),
  titulo: text('titulo'),
  corpo: text('corpo'),
  assinatura: text('assinatura'),
  templateBaseUrl: text('template_base_url'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  themeId: text('theme_id'),
  titleStyle: text('title_style'),
  bodyStyle: text('body_style'),
  signatureStyle: text('signature_style'),
  layoutKey: text('layout_key'),
  scope: text('scope'),
});

export const legadoUserTypeDefaultPerms = sqliteTable('legado_user_type_default_perms', {
  id: text('id').primaryKey(),
  userTypeId: text('user_type_id'),
  modulo: text('modulo'),
  permissao: text('permissao'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoUserTypes = sqliteTable('legado_user_types', {
  id: text('id').primaryKey(),
  name: text('name'),
  description: text('description'),
  createdAt: text('created_at'),
});

export const legadoUsers = sqliteTable('legado_users', {
  id: text('id').primaryKey(),
  nomeCompleto: text('nome_completo'),
  cpf: text('cpf'),
  dataNascimento: text('data_nascimento'),
  telefone: text('telefone'),
  cidade: text('cidade'),
  estado: text('estado'),
  userTypeId: text('user_type_id'),
  usoIndividual: integer('uso_individual', { mode: 'boolean' }),
  companyId: text('company_id'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  active: integer('active', { mode: 'boolean' }),
  email: text('email'),
  rg: text('rg'),
  whatsapp: text('whatsapp'),
  cep: text('cep'),
  endereco: text('endereco'),
  numero: text('numero'),
  complemento: text('complemento'),
  createdByGestor: integer('created_by_gestor', { mode: 'boolean' }),
  welcomeEmailSent: integer('welcome_email_sent', { mode: 'boolean' }),
  participaRanking: integer('participa_ranking', { mode: 'boolean' }),
  mustChangePassword: integer('must_change_password', { mode: 'boolean' }),
  passwordChangedAt: text('password_changed_at'),
  avatarUrl: text('avatar_url'),
});

export const legadoVGestorVendedorDetails = sqliteTable('legado_v_gestor_vendedor_details', {
  id: text('id'),
  gestorNome: text('gestor_nome'),
  gestorCpf: text('gestor_cpf'),
  vendedorNome: text('vendedor_nome'),
  vendedorCpf: text('vendedor_cpf'),
  companyName: text('company_name'),
  podeModificar: integer('pode_modificar', { mode: 'boolean' }),
  createdAt: text('created_at'),
});

export const legadoVUsersComplete = sqliteTable('legado_v_users_complete', {
  id: text('id'),
  nomeCompleto: text('nome_completo'),
  cpf: text('cpf'),
  dataNascimento: text('data_nascimento'),
  telefone: text('telefone'),
  cidade: text('cidade'),
  estado: text('estado'),
  userType: text('user_type'),
  userTypeDescription: text('user_type_description'),
  usoIndividual: integer('uso_individual', { mode: 'boolean' }),
  companyName: text('company_name'),
  companyCnpj: text('company_cnpj'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoVendas = sqliteTable('legado_vendas', {
  id: text('id').primaryKey(),
  clienteId: text('cliente_id'),
  destinoId: text('destino_id'),
  dataLancamento: text('data_lancamento'),
  dataEmbarque: text('data_embarque'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  produtoId: text('produto_id'),
  valorTotal: real('valor_total'),
  status: text('status'),
  notas: text('notas'),
  numeroVenda: text('numero_venda'),
  cancelada: integer('cancelada', { mode: 'boolean' }),
  vendedorId: text('vendedor_id'),
  destinoCidadeId: text('destino_cidade_id'),
  dataFinal: text('data_final'),
  descontoComercialAplicado: integer('desconto_comercial_aplicado', { mode: 'boolean' }),
  descontoComercialValor: real('desconto_comercial_valor'),
  valorTotalBruto: real('valor_total_bruto'),
  valorTotalPago: real('valor_total_pago'),
  valorTaxas: real('valor_taxas'),
  valorNaoComissionado: real('valor_nao_comissionado'),
  companyId: text('company_id'),
  dataVenda: text('data_venda'),
});

export const legadoVendasPagamentos = sqliteTable('legado_vendas_pagamentos', {
  id: text('id').primaryKey(),
  vendaId: text('venda_id'),
  formaPagamentoId: text('forma_pagamento_id'),
  companyId: text('company_id'),
  formaNome: text('forma_nome'),
  operacao: text('operacao'),
  plano: text('plano'),
  valorBruto: real('valor_bruto'),
  descontoValor: real('desconto_valor'),
  valorTotal: real('valor_total'),
  parcelas: text('parcelas'),
  parcelasQtd: integer('parcelas_qtd', { mode: 'number' }),
  parcelasValor: real('parcelas_valor'),
  vencimentoPrimeira: text('vencimento_primeira'),
  pagaComissao: integer('paga_comissao', { mode: 'boolean' }),
  observacoes: text('observacoes'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  vendaReciboId: text('venda_recibo_id'),
});

export const legadoVendasRecibos = sqliteTable('legado_vendas_recibos', {
  id: text('id').primaryKey(),
  vendaId: text('venda_id'),
  produtoId: text('produto_id'),
  numeroRecibo: text('numero_recibo'),
  valorTotal: real('valor_total'),
  valorTaxas: real('valor_taxas'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  dataInicio: text('data_inicio'),
  dataFim: text('data_fim'),
  produtoResolvidoId: text('produto_resolvido_id'),
  numeroReserva: text('numero_reserva'),
  contratoPath: text('contrato_path'),
  contratoUrl: text('contrato_url'),
  tipoPacote: text('tipo_pacote'),
  valorRav: real('valor_rav'),
  valorDu: real('valor_du'),
  dataVenda: text('data_venda'),
  canceladoPorConciliacaoEm: text('cancelado_por_conciliacao_em'),
  canceladoPorConciliacaoObservacao: text('cancelado_por_conciliacao_observacao'),
  numeroReciboNormalizado: text('numero_recibo_normalizado'),
  destinoCidadeId: text('destino_cidade_id'),
});

export const legadoVendasRecibosComplementares = sqliteTable('legado_vendas_recibos_complementares', {
  id: text('id').primaryKey(),
  vendaId: text('venda_id'),
  reciboId: text('recibo_id'),
  createdAt: text('created_at'),
});

export const legadoVendasRecibosNotas = sqliteTable('legado_vendas_recibos_notas', {
  id: text('id').primaryKey(),
  vendaId: text('venda_id'),
  reciboId: text('recibo_id'),
  companyId: text('company_id'),
  notas: text('notas'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoVendasRecibosRateio = sqliteTable('legado_vendas_recibos_rateio', {
  id: text('id').primaryKey(),
  vendaReciboId: text('venda_recibo_id'),
  companyId: text('company_id'),
  vendedorOrigemId: text('vendedor_origem_id'),
  vendedorDestinoId: text('vendedor_destino_id'),
  percentualOrigem: real('percentual_origem'),
  percentualDestino: real('percentual_destino'),
  ativo: integer('ativo', { mode: 'boolean' }),
  observacao: text('observacao'),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  conciliacaoReciboId: text('conciliacao_recibo_id'),
});

export const legadoViagemAcompanhantes = sqliteTable('legado_viagem_acompanhantes', {
  id: text('id').primaryKey(),
  viagemId: text('viagem_id'),
  acompanhanteId: text('acompanhante_id'),
  companyId: text('company_id'),
  papel: text('papel'),
  documentoUrl: text('documento_url'),
  observacoes: text('observacoes'),
  createdBy: text('created_by'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoViagemDocumentos = sqliteTable('legado_viagem_documentos', {
  id: text('id').primaryKey(),
  viagemId: text('viagem_id'),
  companyId: text('company_id'),
  titulo: text('titulo'),
  tipo: text('tipo'),
  url: text('url'),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes', { mode: 'number' }),
  expiresAt: text('expires_at'),
  createdBy: text('created_by'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoViagemPassageiros = sqliteTable('legado_viagem_passageiros', {
  id: text('id').primaryKey(),
  viagemId: text('viagem_id'),
  clienteId: text('cliente_id'),
  companyId: text('company_id'),
  papel: text('papel'),
  observacoes: text('observacoes'),
  createdBy: text('created_by'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoViagemServicos = sqliteTable('legado_viagem_servicos', {
  id: text('id').primaryKey(),
  viagemId: text('viagem_id'),
  companyId: text('company_id'),
  tipo: text('tipo'),
  fornecedor: text('fornecedor'),
  descricao: text('descricao'),
  status: text('status'),
  dataInicio: text('data_inicio'),
  dataFim: text('data_fim'),
  valor: real('valor'),
  moeda: text('moeda'),
  voucherUrl: text('voucher_url'),
  observacoes: text('observacoes'),
  createdBy: text('created_by'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoViagens = sqliteTable('legado_viagens', {
  id: text('id').primaryKey(),
  vendaId: text('venda_id'),
  orcamentoId: text('orcamento_id'),
  companyId: text('company_id'),
  responsavelUserId: text('responsavel_user_id'),
  origem: text('origem'),
  destino: text('destino'),
  dataInicio: text('data_inicio'),
  dataFim: text('data_fim'),
  status: text('status'),
  observacoes: text('observacoes'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  clienteId: text('cliente_id'),
  reciboId: text('recibo_id'),
  followUpText: text('follow_up_text'),
  followUpFechado: integer('follow_up_fechado', { mode: 'boolean' }),
});

export const legadoVoucherAssets = sqliteTable('legado_voucher_assets', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
  provider: text('provider'),
  assetKind: text('asset_kind'),
  label: text('label'),
  storageBucket: text('storage_bucket'),
  storagePath: text('storage_path'),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes', { mode: 'number' }),
  ativo: integer('ativo', { mode: 'boolean' }),
  ordem: integer('ordem', { mode: 'number' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const legadoVoucherDias = sqliteTable('legado_voucher_dias', {
  id: text('id').primaryKey(),
  voucherId: text('voucher_id'),
  diaNumero: integer('dia_numero', { mode: 'number' }),
  titulo: text('titulo'),
  descricao: text('descricao'),
  dataReferencia: text('data_referencia'),
  cidade: text('cidade'),
  ordem: integer('ordem', { mode: 'number' }),
  createdAt: text('created_at'),
});

export const legadoVoucherHoteis = sqliteTable('legado_voucher_hoteis', {
  id: text('id').primaryKey(),
  voucherId: text('voucher_id'),
  cidade: text('cidade'),
  hotel: text('hotel'),
  endereco: text('endereco'),
  dataInicio: text('data_inicio'),
  dataFim: text('data_fim'),
  noites: integer('noites', { mode: 'number' }),
  telefone: text('telefone'),
  contato: text('contato'),
  status: text('status'),
  observacao: text('observacao'),
  ordem: integer('ordem', { mode: 'number' }),
  createdAt: text('created_at'),
});

export const legadoVouchers = sqliteTable('legado_vouchers', {
  id: text('id').primaryKey(),
  companyId: text('company_id'),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
  provider: text('provider'),
  nome: text('nome'),
  codigoSistema: text('codigo_sistema'),
  codigoFornecedor: text('codigo_fornecedor'),
  reservaOnline: text('reserva_online'),
  operador: text('operador'),
  resumo: text('resumo'),
  dataInicio: text('data_inicio'),
  dataFim: text('data_fim'),
  ativo: integer('ativo', { mode: 'boolean' }),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  passageiros: text('passageiros'),
  tipoAcomodacao: text('tipo_acomodacao'),
  extraData: text('extra_data'),
  viagemId: text('viagem_id'),
});

export const legadoVwCidadesLocalizacao = sqliteTable('legado_vw_cidades_localizacao', {
  cidadeId: text('cidade_id'),
  cidadeNome: text('cidade_nome'),
  subdivisaoId: text('subdivisao_id'),
  subdivisaoNome: text('subdivisao_nome'),
  subdivisaoCodigo: text('subdivisao_codigo'),
  subdivisaoTipo: text('subdivisao_tipo'),
  paisId: text('pais_id'),
  paisNome: text('pais_nome'),
  paisCodigoIso: text('pais_codigo_iso'),
  continente: text('continente'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  populacao: integer('populacao', { mode: 'number' }),
  descricao: text('descricao'),
  createdAt: text('created_at'),
});

export const legadoVwCidadesLocalizacaoBusca = sqliteTable('legado_vw_cidades_localizacao_busca', {
  cidadeId: text('cidade_id'),
  cidadeNome: text('cidade_nome'),
  subdivisaoId: text('subdivisao_id'),
  subdivisaoNome: text('subdivisao_nome'),
  subdivisaoCodigo: text('subdivisao_codigo'),
  subdivisaoTipo: text('subdivisao_tipo'),
  paisId: text('pais_id'),
  paisNome: text('pais_nome'),
  paisCodigoIso: text('pais_codigo_iso'),
  continente: text('continente'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  populacao: integer('populacao', { mode: 'number' }),
  descricao: text('descricao'),
  createdAt: text('created_at'),
  label: text('label'),
  searchText: text('search_text'),
});

export const legadoVwProdutosComissionamento = sqliteTable('legado_vw_produtos_comissionamento', {
  produtoId: text('produto_id'),
  tipo: text('tipo'),
  regraComissionamento: text('regra_comissionamento'),
  somaNaMeta: integer('soma_na_meta', { mode: 'boolean' }),
  metaNaoAtingida: real('meta_nao_atingida'),
  metaAtingida: real('meta_atingida'),
  superMeta: real('super_meta'),
  diferenciado: real('diferenciado'),
  comissionamentoAtivo: integer('comissionamento_ativo', { mode: 'boolean' }),
});

export const legadoVwSomaMetaPlaceholder = sqliteTable('legado_vw_soma_meta_placeholder', {
  produtoId: text('produto_id'),
  tipo: text('tipo'),
  somaNaMeta: integer('soma_na_meta', { mode: 'boolean' }),
  regraComissionamento: text('regra_comissionamento'),
});

export const mfaFatores = sqliteTable('mfa_fatores', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  secret: text('secret').notNull(),
  friendlyName: text('friendly_name'),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
});

