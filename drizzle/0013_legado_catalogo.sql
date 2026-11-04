-- Catalogo legado reproduzido em D1.
-- Tabelas fisicas usam o prefixo legado_ para nao colidir com o modelo novo.
-- Chaves primarias e unicidades simples foram preservadas.
-- Bancos novos comecam vazios: nenhum registro historico e importado.

CREATE TABLE IF NOT EXISTS "legado_admin_avisos_templates" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "assunto" TEXT NOT NULL,
  "mensagem" TEXT NOT NULL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "sender_key" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "legado_admin_email_settings" (
  "id" TEXT PRIMARY KEY,
  "singleton" INTEGER NOT NULL DEFAULT 0,
  "smtp_host" TEXT,
  "smtp_port" INTEGER,
  "smtp_secure" INTEGER NOT NULL DEFAULT 0,
  "smtp_user" TEXT,
  "smtp_pass" TEXT,
  "alerta_from_email" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "admin_from_email" TEXT,
  "avisos_from_email" TEXT,
  "financeiro_from_email" TEXT,
  "suporte_from_email" TEXT,
  "resend_api_key" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_admin_system_settings" (
  "id" TEXT PRIMARY KEY,
  "singleton" INTEGER NOT NULL DEFAULT 0,
  "maintenance_enabled" INTEGER NOT NULL DEFAULT 0,
  "maintenance_message" TEXT,
  "updated_by" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_agenda_itens" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT,
  "user_id" TEXT,
  "tipo" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "descricao" TEXT,
  "start_date" TEXT,
  "end_date" TEXT,
  "all_day" INTEGER,
  "status" TEXT,
  "done" INTEGER,
  "created_at" TEXT,
  "updated_at" TEXT,
  "start_at" TEXT,
  "end_at" TEXT,
  "categoria_id" TEXT,
  "prioridade" TEXT,
  "arquivo" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_airline_iata_aliases" (
  "id" TEXT PRIMARY KEY,
  "airline_code_id" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("airline_code_id", "alias")
);

CREATE TABLE IF NOT EXISTS "legado_airline_iata_codes" (
  "id" TEXT PRIMARY KEY,
  "iata_code" TEXT NOT NULL,
  "airline_name" TEXT NOT NULL,
  "active" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("iata_code")
);

CREATE TABLE IF NOT EXISTS "legado_auth_passkey_challenges" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT,
  "type" TEXT NOT NULL,
  "challenge" TEXT NOT NULL,
  "expires_at" TEXT NOT NULL,
  "used_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_auth_passkeys" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "user_email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "credential_id" TEXT NOT NULL,
  "public_key" TEXT NOT NULL,
  "counter" INTEGER NOT NULL DEFAULT 0,
  "transports" TEXT NOT NULL,
  "device_type" TEXT,
  "backed_up" INTEGER NOT NULL DEFAULT 0,
  "aaguid" TEXT,
  "origin" TEXT,
  "rp_id" TEXT,
  "last_used_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("credential_id")
);

CREATE TABLE IF NOT EXISTS "legado_auth_signup_debug" (
  "id" INTEGER PRIMARY KEY,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "auth_user_id" TEXT,
  "auth_email" TEXT,
  "err" TEXT,
  "detail" TEXT,
  "hint" TEXT,
  "context" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_campanhas" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "imagem_url" TEXT,
  "imagem_path" TEXT,
  "link_url" TEXT,
  "link_instagram" TEXT,
  "link_facebook" TEXT,
  "data_campanha" TEXT NOT NULL,
  "validade_ate" TEXT,
  "regras" TEXT,
  "status" TEXT NOT NULL,
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "arquivada_em" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_cidades" (
  "id" TEXT PRIMARY KEY,
  "subdivisao_id" TEXT,
  "nome" TEXT NOT NULL,
  "latitude" REAL,
  "longitude" REAL,
  "populacao" INTEGER,
  "created_at" TEXT,
  "descricao" TEXT,
  "grau_importancia" INTEGER,
  "nome_ptBR" TEXT,
  "estado_nome" TEXT,
  "pais_nome" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_cidades_import_staging" (
  "id" INTEGER PRIMARY KEY,
  "cidade" TEXT NOT NULL,
  "pais" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_cidades_import_targets" (
  "cidade_key" TEXT,
  "pais_id" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_cidades_import_targets_norm" (
  "pais_id" TEXT,
  "cidade_key" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_cidades_norm_cache" (
  "id" TEXT,
  "subdivisao_id" TEXT,
  "pais_id" TEXT,
  "nome_key" TEXT,
  "nome_pt_key" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_circuito_datas" (
  "id" TEXT PRIMARY KEY,
  "circuito_id" TEXT NOT NULL,
  "data_inicio" TEXT NOT NULL,
  "cidade_inicio_id" TEXT,
  "dias_extra_antes" INTEGER NOT NULL DEFAULT 0,
  "dias_extra_depois" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_circuito_dias" (
  "id" TEXT PRIMARY KEY,
  "circuito_id" TEXT NOT NULL,
  "dia_numero" INTEGER NOT NULL DEFAULT 0,
  "titulo" TEXT,
  "descricao" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_circuito_dias_cidades" (
  "id" TEXT PRIMARY KEY,
  "circuito_dia_id" TEXT NOT NULL,
  "cidade_id" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "legado_circuitos" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "codigo" TEXT,
  "operador" TEXT,
  "resumo" TEXT,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_cliente_acompanhantes" (
  "id" TEXT PRIMARY KEY,
  "cliente_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "nome_completo" TEXT NOT NULL,
  "cpf" TEXT,
  "rg" TEXT,
  "telefone" TEXT,
  "grau_parentesco" TEXT,
  "data_nascimento" TEXT,
  "observacoes" TEXT,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_cliente_template_dispatches" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "company_id" TEXT,
  "cliente_id" TEXT NOT NULL,
  "template_id" TEXT,
  "canal" TEXT NOT NULL,
  "categoria" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "recipient_name" TEXT,
  "recipient_contact" TEXT,
  "subject" TEXT,
  "sent_at" TEXT NOT NULL,
  "sent_day" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_clientes" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "nascimento" TEXT,
  "cpf" TEXT,
  "telefone" TEXT,
  "email" TEXT,
  "endereco" TEXT,
  "complemento" TEXT,
  "cidade" TEXT,
  "estado" TEXT,
  "notas" TEXT,
  "created_at" TEXT,
  "updated_at" TEXT,
  "whatsapp" TEXT,
  "rg" TEXT,
  "genero" TEXT,
  "nacionalidade" TEXT,
  "tipo_cliente" TEXT,
  "tags" TEXT,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "company_id" TEXT,
  "cep" TEXT,
  "numero" TEXT,
  "active" INTEGER,
  "classificacao" TEXT,
  "created_by" TEXT,
  "tipo_pessoa" TEXT,
  "lgpd_anonimizado" INTEGER NOT NULL DEFAULT 0,
  "lgpd_anonimizado_em" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_clientes_company" (
  "company_id" TEXT NOT NULL,
  "cliente_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("company_id", "cliente_id")
);

CREATE TABLE IF NOT EXISTS "legado_comissionamento_geral" (
  "id" TEXT PRIMARY KEY,
  "produto_id" TEXT NOT NULL,
  "meta_nao_atingida" REAL,
  "meta_atingida" REAL,
  "super_meta" REAL,
  "diferenciado" REAL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("produto_id")
);

CREATE TABLE IF NOT EXISTS "legado_comissoes" (
  "id" TEXT PRIMARY KEY,
  "venda_id" TEXT,
  "vendedor_id" TEXT,
  "regra_id" TEXT,
  "valor_venda" REAL NOT NULL DEFAULT 0,
  "valor_comissionavel" REAL NOT NULL DEFAULT 0,
  "percentual_aplicado" REAL NOT NULL DEFAULT 0,
  "valor_comissao" REAL NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL,
  "data_pagamento" TEXT,
  "observacoes_pagamento" TEXT,
  "pago_por" TEXT,
  "mes_referencia" INTEGER,
  "ano_referencia" INTEGER,
  "company_id" TEXT,
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "recibo_id" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_commission_rule" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "descricao" TEXT,
  "tipo" TEXT NOT NULL,
  "meta_nao_atingida" REAL,
  "meta_atingida" REAL,
  "super_meta" REAL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "company_id" TEXT,
  "created_by" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_commission_tier" (
  "id" TEXT PRIMARY KEY,
  "rule_id" TEXT NOT NULL,
  "faixa" TEXT NOT NULL,
  "de_pct" REAL NOT NULL DEFAULT 0,
  "ate_pct" REAL NOT NULL DEFAULT 0,
  "inc_pct_meta" REAL NOT NULL DEFAULT 0,
  "inc_pct_comissao" REAL NOT NULL DEFAULT 0,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_companies" (
  "id" TEXT PRIMARY KEY,
  "nome_empresa" TEXT NOT NULL,
  "nome_fantasia" TEXT NOT NULL,
  "cnpj" TEXT NOT NULL,
  "endereco" TEXT,
  "telefone" TEXT,
  "created_at" TEXT,
  "updated_at" TEXT,
  "cidade" TEXT,
  "estado" TEXT,
  "owner_user_id" TEXT,
  "active" INTEGER NOT NULL DEFAULT 0,
  "logo_url" TEXT,
  UNIQUE ("cnpj")
);

CREATE TABLE IF NOT EXISTS "legado_company_billing" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "plan_id" TEXT,
  "status" TEXT NOT NULL,
  "valor_mensal" REAL,
  "ultimo_pagamento" TEXT,
  "proximo_vencimento" TEXT,
  "inicio_cobranca" TEXT,
  "trial_ends_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_company_billing_events" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "billing_id" TEXT,
  "tipo" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "valor" REAL,
  "moeda" TEXT NOT NULL,
  "referencia" TEXT,
  "vencimento" TEXT,
  "pago_em" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_conciliacao_dias_sem_movimento" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  "marcado_por" TEXT,
  "marcado_em" TEXT NOT NULL,
  "observacao" TEXT,
  UNIQUE ("company_id", "data")
);

CREATE TABLE IF NOT EXISTS "legado_conciliacao_execucoes" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "checked" INTEGER NOT NULL DEFAULT 0,
  "reconciled" INTEGER NOT NULL DEFAULT 0,
  "updated_taxes" INTEGER NOT NULL DEFAULT 0,
  "still_pending" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL,
  "error_message" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_conciliacao_recibo_changes" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "conciliacao_recibo_id" TEXT,
  "venda_id" TEXT,
  "venda_recibo_id" TEXT,
  "numero_recibo" TEXT,
  "field" TEXT NOT NULL,
  "old_value" REAL,
  "new_value" REAL,
  "actor" TEXT NOT NULL,
  "changed_by" TEXT,
  "changed_at" TEXT NOT NULL,
  "reverted_at" TEXT,
  "reverted_by" TEXT,
  "revert_reason" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_conciliacao_recibos" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "documento" TEXT NOT NULL,
  "movimento_data" TEXT,
  "status" TEXT NOT NULL,
  "descricao" TEXT,
  "valor_lancamentos" REAL,
  "valor_taxas" REAL,
  "valor_descontos" REAL,
  "valor_abatimentos" REAL,
  "valor_calculada_loja" REAL,
  "valor_visao_master" REAL,
  "valor_opfax" REAL,
  "valor_saldo" REAL,
  "origem" TEXT,
  "raw" TEXT,
  "conciliado" INTEGER NOT NULL DEFAULT 0,
  "match_total" INTEGER,
  "match_taxas" INTEGER,
  "sistema_valor_total" REAL,
  "sistema_valor_taxas" REAL,
  "diff_total" REAL,
  "diff_taxas" REAL,
  "venda_id" TEXT,
  "venda_recibo_id" TEXT,
  "imported_by" TEXT,
  "last_checked_at" TEXT,
  "conciliado_em" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "ranking_vendedor_id" TEXT,
  "ranking_produto_id" TEXT,
  "ranking_assigned_by" TEXT,
  "ranking_assigned_at" TEXT,
  "descricao_chave" TEXT NOT NULL,
  "valor_venda_real" REAL,
  "valor_comissao_loja" REAL,
  "percentual_comissao_loja" REAL,
  "faixa_comissao" TEXT,
  "is_seguro_viagem" INTEGER NOT NULL DEFAULT 0,
  "is_baixa_rac" INTEGER NOT NULL DEFAULT 0,
  "valor_nao_comissionavel" REAL,
  "numero_reserva" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_consultorias_online" (
  "id" TEXT PRIMARY KEY,
  "cliente_id" TEXT,
  "cliente_nome" TEXT NOT NULL,
  "data_hora" TEXT NOT NULL,
  "lembrete" TEXT NOT NULL,
  "destino" TEXT,
  "quantidade_pessoas" INTEGER NOT NULL DEFAULT 0,
  "orcamento_id" TEXT,
  "taxa_consultoria" REAL NOT NULL DEFAULT 0,
  "notas" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "lembrete_enviado_em" TEXT,
  "lembrete_envios" TEXT NOT NULL,
  "fechada" INTEGER NOT NULL DEFAULT 0,
  "fechada_em" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_crm_message_templates" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT,
  "subject_type" TEXT NOT NULL,
  "message_template" TEXT NOT NULL,
  "theme_key" TEXT NOT NULL,
  "layout_key" TEXT NOT NULL,
  "logo_position" TEXT NOT NULL,
  "is_active" INTEGER NOT NULL DEFAULT 0,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("slug")
);

CREATE TABLE IF NOT EXISTS "legado_crm_template_categories" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "descricao" TEXT,
  "icone" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT,
  "updated_at" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_dashboard_widgets" (
  "id" TEXT PRIMARY KEY,
  "usuario_id" TEXT NOT NULL,
  "widget" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "visivel" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT,
  "updated_at" TEXT,
  "settings" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_documentos_viagens" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "uploaded_by" TEXT,
  "file_name" TEXT NOT NULL,
  "display_name" TEXT,
  "storage_bucket" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "mime_type" TEXT,
  "size_bytes" INTEGER,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT,
  "updated_by" TEXT,
  "title" TEXT,
  "template_text" TEXT,
  "template_fields" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_escala_dia" (
  "id" TEXT PRIMARY KEY,
  "escala_mes_id" TEXT NOT NULL,
  "usuario_id" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "hora_inicio" TEXT,
  "hora_fim" TEXT,
  "observacao" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("escala_mes_id", "usuario_id", "data")
);

CREATE TABLE IF NOT EXISTS "legado_escala_horario_usuario" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "usuario_id" TEXT NOT NULL,
  "seg_inicio" TEXT,
  "seg_fim" TEXT,
  "ter_inicio" TEXT,
  "ter_fim" TEXT,
  "qua_inicio" TEXT,
  "qua_fim" TEXT,
  "qui_inicio" TEXT,
  "qui_fim" TEXT,
  "sex_inicio" TEXT,
  "sex_fim" TEXT,
  "sab_inicio" TEXT,
  "sab_fim" TEXT,
  "dom_inicio" TEXT,
  "dom_fim" TEXT,
  "feriado_inicio" TEXT,
  "feriado_fim" TEXT,
  "auto_aplicar" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("usuario_id")
);

CREATE TABLE IF NOT EXISTS "legado_escala_mes" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "gestor_id" TEXT NOT NULL,
  "periodo" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "observacoes" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_estados" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "pais_id" TEXT NOT NULL,
  "created_at" TEXT,
  "updated_at" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_feriados" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "estado" TEXT,
  "cidade" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("company_id", "data", "nome")
);

CREATE TABLE IF NOT EXISTS "legado_financeiro_empresas" (
  "id" TEXT PRIMARY KEY,
  "financeiro_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "approved_at" TEXT,
  "created_by" TEXT,
  UNIQUE ("financeiro_id", "company_id")
);

CREATE TABLE IF NOT EXISTS "legado_formas_pagamento" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "descricao" TEXT,
  "paga_comissao" INTEGER NOT NULL DEFAULT 0,
  "permite_desconto" INTEGER NOT NULL DEFAULT 0,
  "desconto_padrao_pct" REAL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_fornecedores" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "localizacao" TEXT NOT NULL,
  "nome_completo" TEXT NOT NULL,
  "nome_fantasia" TEXT,
  "cnpj" TEXT,
  "cep" TEXT,
  "cidade" TEXT,
  "estado" TEXT,
  "telefone" TEXT,
  "whatsapp" TEXT,
  "telefone_emergencia" TEXT,
  "responsavel" TEXT,
  "tipo_faturamento" TEXT NOT NULL,
  "principais_servicos" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_gestor_equipe_compartilhada" (
  "gestor_id" TEXT PRIMARY KEY,
  "gestor_base_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "created_by" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_gestor_vendedor" (
  "id" TEXT PRIMARY KEY,
  "gestor_id" TEXT,
  "vendedor_id" TEXT,
  "company_id" TEXT,
  "pode_modificar" INTEGER,
  "created_at" TEXT,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  UNIQUE ("gestor_id", "vendedor_id", "company_id")
);

CREATE TABLE IF NOT EXISTS "legado_historico_viagens_real" (
  "id" TEXT PRIMARY KEY,
  "venda_id" TEXT NOT NULL,
  "cliente_id" TEXT NOT NULL,
  "destino_id" TEXT NOT NULL,
  "data_viagem" TEXT,
  "produto" TEXT,
  "valor" REAL,
  "recibos" TEXT,
  "notas" TEXT,
  "created_at" TEXT,
  "updated_at" TEXT,
  "valor_total" REAL
);

CREATE TABLE IF NOT EXISTS "legado_inquiry" (
  "id" TEXT PRIMARY KEY,
  "origin" TEXT NOT NULL,
  "client_id" TEXT,
  "assigned_seller_id" TEXT,
  "country_id" TEXT,
  "city_id" TEXT,
  "destination_id" TEXT,
  "checkin" TEXT,
  "checkout" TEXT,
  "adults" INTEGER NOT NULL DEFAULT 0,
  "children" INTEGER NOT NULL DEFAULT 0,
  "currency_preference" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "notes" TEXT,
  "assigned_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_inquiry_preference" (
  "id" TEXT PRIMARY KEY,
  "inquiry_id" TEXT NOT NULL,
  "preference_key" TEXT NOT NULL,
  "preference_value" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "legado_lgpd_atividades_tratamento" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "finalidade" TEXT NOT NULL,
  "base_legal" TEXT NOT NULL,
  "dados_tratados" TEXT NOT NULL,
  "titulares" TEXT NOT NULL,
  "compartilhamento" TEXT,
  "retencao_meses" INTEGER,
  "medidas_seguranca" TEXT,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_lgpd_consentimentos" (
  "id" TEXT PRIMARY KEY,
  "cliente_id" TEXT,
  "titular_email" TEXT,
  "titular_cpf" TEXT,
  "finalidade" TEXT NOT NULL,
  "consentido" INTEGER NOT NULL DEFAULT 0,
  "origem" TEXT NOT NULL,
  "ip_origem" TEXT,
  "user_agent" TEXT,
  "versao_politica" TEXT,
  "revogado_em" TEXT,
  "revogado_motivo" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_lgpd_solicitacoes" (
  "id" TEXT PRIMARY KEY,
  "tipo" TEXT NOT NULL,
  "titular_nome" TEXT NOT NULL,
  "titular_email" TEXT NOT NULL,
  "titular_cpf" TEXT,
  "company_id" TEXT,
  "cliente_id" TEXT,
  "user_id" TEXT,
  "descricao" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "resposta" TEXT,
  "respondido_por" TEXT,
  "respondido_em" TEXT,
  "prazo_legal" TEXT NOT NULL,
  "ip_origem" TEXT,
  "user_agent" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_logs" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT,
  "modulo" TEXT NOT NULL,
  "acao" TEXT NOT NULL,
  "detalhes" TEXT,
  "ip" TEXT,
  "user_agent" TEXT,
  "created_at" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_master_documents" (
  "id" TEXT PRIMARY KEY,
  "master_id" TEXT NOT NULL,
  "uploaded_by" TEXT NOT NULL,
  "doc_type" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "storage_bucket" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "mime_type" TEXT,
  "size_bytes" INTEGER,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_master_empresas" (
  "id" TEXT PRIMARY KEY,
  "master_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "approved_at" TEXT,
  "approved_by" TEXT,
  UNIQUE ("master_id", "company_id")
);

CREATE TABLE IF NOT EXISTS "legado_menu_prefs" (
  "user_id" TEXT PRIMARY KEY,
  "prefs" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_message_templates_v2" (
  "id" TEXT PRIMARY KEY,
  "created_at" TEXT,
  "updated_at" TEXT,
  "created_by" TEXT,
  "scope" TEXT NOT NULL,
  "company_id" TEXT,
  "gestor_id" TEXT,
  "nome" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "categoria" TEXT NOT NULL,
  "ocasiao" TEXT,
  "description" TEXT,
  "tags" TEXT,
  "theme_id" TEXT,
  "assunto" TEXT,
  "titulo" TEXT NOT NULL,
  "corpo" TEXT NOT NULL,
  "assinatura_padrao" TEXT,
  "required_vars" TEXT,
  "optional_vars" TEXT,
  "title_style_override" TEXT,
  "greeting_style_override" TEXT,
  "body_style_override" TEXT,
  "signature_style_override" TEXT,
  "ativo" INTEGER,
  "is_default" INTEGER,
  "is_favorite" INTEGER,
  "usage_count" INTEGER,
  "last_used_at" TEXT,
  "metadata" TEXT,
  "version" INTEGER
);

CREATE TABLE IF NOT EXISTS "legado_metas_vendedor" (
  "id" TEXT PRIMARY KEY,
  "vendedor_id" TEXT NOT NULL,
  "periodo" TEXT NOT NULL,
  "meta_geral" REAL NOT NULL DEFAULT 0,
  "meta_diferenciada" REAL NOT NULL DEFAULT 0,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "template_id" TEXT,
  "scope" TEXT NOT NULL,
  UNIQUE ("vendedor_id", "periodo", "scope")
);

CREATE TABLE IF NOT EXISTS "legado_metas_vendedor_produto" (
  "id" TEXT PRIMARY KEY,
  "meta_vendedor_id" TEXT NOT NULL,
  "produto_id" TEXT NOT NULL,
  "valor" REAL NOT NULL DEFAULT 0,
  "created_at" TEXT,
  "updated_at" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_minhas_preferencias" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "tipo_produto_id" TEXT,
  "cidade_id" TEXT,
  "nome" TEXT NOT NULL,
  "localizacao" TEXT,
  "classificacao" TEXT,
  "observacao" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT,
  "updated_by" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_minhas_preferencias_shares" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "preferencia_id" TEXT NOT NULL,
  "shared_by" TEXT NOT NULL,
  "shared_with" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "accepted_at" TEXT,
  "revoked_at" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_modulo_acesso" (
  "id" TEXT PRIMARY KEY,
  "usuario_id" TEXT NOT NULL,
  "modulo" TEXT NOT NULL,
  "permissao" TEXT NOT NULL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("usuario_id", "modulo")
);

CREATE TABLE IF NOT EXISTS "legado_modulo_acesso_backup" (
  "id" TEXT,
  "usuario_id" TEXT,
  "modulo" TEXT,
  "permissao" TEXT,
  "ativo" INTEGER,
  "created_at" TEXT,
  "updated_at" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_mural_recado_respostas" (
  "id" TEXT PRIMARY KEY,
  "recado_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "sender_id" TEXT NOT NULL,
  "conteudo" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_mural_recados" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "sender_id" TEXT NOT NULL,
  "receiver_id" TEXT,
  "assunto" TEXT,
  "conteudo" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "sender_deleted" INTEGER NOT NULL DEFAULT 0,
  "receiver_deleted" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "legado_mural_recados_arquivos" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "recado_id" TEXT NOT NULL,
  "uploaded_by" TEXT,
  "file_name" TEXT NOT NULL,
  "storage_bucket" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "mime_type" TEXT,
  "size_bytes" INTEGER,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_mural_recados_leituras" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "recado_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "read_at" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_paises" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "codigo_iso" TEXT NOT NULL,
  "continente" TEXT,
  "created_at" TEXT,
  UNIQUE ("codigo_iso")
);

CREATE TABLE IF NOT EXISTS "legado_parametros_cambios" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "owner_user_id" TEXT,
  "moeda" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  "valor" REAL NOT NULL DEFAULT 0,
  "observacoes" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_parametros_comissao" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT,
  "owner_user_id" TEXT,
  "usar_taxas_na_meta" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT,
  "updated_at" TEXT,
  "foco_valor" TEXT NOT NULL,
  "modo_corporativo" INTEGER NOT NULL DEFAULT 0,
  "politica_cancelamento" TEXT NOT NULL,
  "foco_faturamento" TEXT,
  "exportacao_pdf" INTEGER,
  "exportacao_excel" INTEGER,
  "conciliacao_sobrepoe_vendas" INTEGER NOT NULL DEFAULT 0,
  "mfa_obrigatorio" INTEGER NOT NULL DEFAULT 0,
  "conciliacao_regra_ativa" INTEGER NOT NULL DEFAULT 0,
  "conciliacao_meta_nao_atingida" REAL,
  "conciliacao_meta_atingida" REAL,
  "conciliacao_super_meta" REAL,
  "conciliacao_tipo" TEXT NOT NULL,
  "conciliacao_tiers" TEXT NOT NULL,
  "conciliacao_faixas_loja" TEXT NOT NULL,
  UNIQUE ("company_id")
);

CREATE TABLE IF NOT EXISTS "legado_parametros_pagamentos_nao_comissionaveis" (
  "id" TEXT PRIMARY KEY,
  "termo" TEXT NOT NULL,
  "termo_normalizado" TEXT NOT NULL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "created_by" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_by" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_parametros_sistema" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT,
  "usar_taxas_na_meta" INTEGER NOT NULL DEFAULT 0,
  "foco_valor" TEXT NOT NULL,
  "modo_corporativo" INTEGER NOT NULL DEFAULT 0,
  "politica_cancelamento" TEXT NOT NULL,
  "created_at" TEXT,
  "updated_at" TEXT,
  UNIQUE ("company_id")
);

CREATE TABLE IF NOT EXISTS "legado_plans" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "descricao" TEXT,
  "valor_mensal" REAL NOT NULL DEFAULT 0,
  "moeda" TEXT NOT NULL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_product_commission_rule" (
  "id" TEXT PRIMARY KEY,
  "produto_id" TEXT NOT NULL,
  "rule_id" TEXT NOT NULL,
  "fix_meta_nao_atingida" REAL,
  "fix_meta_atingida" REAL,
  "fix_super_meta" REAL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("produto_id")
);

CREATE TABLE IF NOT EXISTS "legado_product_commission_rule_pacote" (
  "id" TEXT PRIMARY KEY,
  "produto_id" TEXT NOT NULL,
  "tipo_pacote" TEXT NOT NULL,
  "rule_id" TEXT,
  "fix_meta_nao_atingida" REAL,
  "fix_meta_atingida" REAL,
  "fix_super_meta" REAL,
  "ativo" INTEGER,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_produtos" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "cidade_id" TEXT,
  "informacoes_importantes" TEXT,
  "atracao_principal" TEXT,
  "melhor_epoca" TEXT,
  "duracao_sugerida" TEXT,
  "nivel_preco" TEXT,
  "imagem_url" TEXT,
  "ativo" INTEGER,
  "created_at" TEXT,
  "updated_at" TEXT,
  "tipo_produto" TEXT,
  "destino" TEXT,
  "fornecedor_id" TEXT,
  "todas_as_cidades" INTEGER NOT NULL DEFAULT 0,
  "valor_neto" REAL,
  "margem" REAL,
  "valor_venda" REAL,
  "moeda" TEXT,
  "cambio" REAL,
  "valor_em_reais" REAL,
  "circuito_id" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_produtos_tarifas" (
  "id" TEXT PRIMARY KEY,
  "produto_id" TEXT NOT NULL,
  "acomodacao" TEXT NOT NULL,
  "qte_pax" INTEGER NOT NULL DEFAULT 0,
  "tipo" TEXT,
  "validade_de" TEXT NOT NULL,
  "validade_ate" TEXT NOT NULL,
  "valor_neto" REAL NOT NULL DEFAULT 0,
  "padrao" TEXT NOT NULL,
  "margem" REAL,
  "valor_venda" REAL NOT NULL DEFAULT 0,
  "moeda" TEXT NOT NULL,
  "cambio" REAL NOT NULL DEFAULT 0,
  "valor_em_reais" REAL NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_quote" (
  "id" TEXT PRIMARY KEY,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "created_by" TEXT NOT NULL,
  "client_id" TEXT,
  "status" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "total" REAL NOT NULL DEFAULT 0,
  "average_confidence" REAL,
  "source_file_path" TEXT,
  "source_file_url" TEXT,
  "raw_json" TEXT NOT NULL,
  "status_negociacao" TEXT NOT NULL,
  "subtotal" REAL,
  "taxes" REAL,
  "client_name" TEXT,
  "client_whatsapp" TEXT,
  "client_email" TEXT,
  "destino_cidade_id" TEXT,
  "data_embarque" TEXT,
  "data_final" TEXT,
  "last_interaction_at" TEXT,
  "last_interaction_notes" TEXT,
  "roteiro_id" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_quote_import_log" (
  "id" TEXT PRIMARY KEY,
  "quote_id" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "message" TEXT,
  "payload" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_quote_item" (
  "id" TEXT PRIMARY KEY,
  "quote_id" TEXT NOT NULL,
  "item_type" TEXT NOT NULL,
  "title" TEXT,
  "product_name" TEXT,
  "city_name" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "unit_price" REAL NOT NULL DEFAULT 0,
  "total_amount" REAL NOT NULL DEFAULT 0,
  "start_date" TEXT,
  "end_date" TEXT,
  "currency" TEXT NOT NULL,
  "confidence" REAL,
  "raw" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "order_index" INTEGER NOT NULL DEFAULT 0,
  "taxes_amount" REAL NOT NULL DEFAULT 0,
  "cidade_id" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_quote_item_segment" (
  "id" TEXT PRIMARY KEY,
  "quote_item_id" TEXT NOT NULL,
  "segment_type" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  "order_index" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_quote_print_settings" (
  "id" TEXT PRIMARY KEY,
  "owner_user_id" TEXT NOT NULL,
  "company_id" TEXT,
  "logo_url" TEXT,
  "consultor_nome" TEXT,
  "filial_nome" TEXT,
  "endereco_linha1" TEXT,
  "endereco_linha2" TEXT,
  "endereco_linha3" TEXT,
  "telefone" TEXT,
  "whatsapp" TEXT,
  "email" TEXT,
  "rodape_texto" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "logo_path" TEXT,
  "imagem_complementar_url" TEXT,
  "imagem_complementar_path" TEXT,
  "whatsapp_codigo_pais" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_ranking_read_model_status" (
  "id" TEXT PRIMARY KEY,
  "modelo" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "mes" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "dirty_at" TEXT,
  "rebuilt_at" TEXT,
  "last_error" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("modelo", "company_id", "mes")
);

CREATE TABLE IF NOT EXISTS "legado_ranking_recibo_contribuicoes" (
  "id" TEXT PRIMARY KEY,
  "source_key" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "mes" TEXT NOT NULL,
  "data_recibo" TEXT NOT NULL,
  "vendedor_id" TEXT NOT NULL,
  "cliente_id" TEXT,
  "venda_id" TEXT,
  "recibo_id" TEXT,
  "venda_key" TEXT NOT NULL,
  "recibo_numero" TEXT,
  "produto_id" TEXT,
  "produto_nome" TEXT,
  "destino_nome" TEXT,
  "valor_bruto" REAL NOT NULL DEFAULT 0,
  "valor_taxas" REAL NOT NULL DEFAULT 0,
  "valor_seguro" REAL NOT NULL DEFAULT 0,
  "is_seguro" INTEGER NOT NULL DEFAULT 0,
  "fator" REAL NOT NULL DEFAULT 0,
  "source_bruto" REAL NOT NULL DEFAULT 0,
  "source_taxas" REAL NOT NULL DEFAULT 0,
  "origem" TEXT NOT NULL,
  "built_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("source_key")
);

CREATE TABLE IF NOT EXISTS "legado_recibos" (
  "id" TEXT PRIMARY KEY,
  "venda_id" TEXT NOT NULL,
  "produto_id" TEXT NOT NULL,
  "valor" REAL NOT NULL DEFAULT 0,
  "descricao" TEXT,
  "created_at" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_roteiro_dia" (
  "id" TEXT PRIMARY KEY,
  "created_by" TEXT NOT NULL,
  "company_id" TEXT,
  "roteiro_id" TEXT,
  "cidade" TEXT NOT NULL,
  "data" TEXT,
  "ordem" INTEGER,
  "descricao" TEXT NOT NULL,
  "created_at" TEXT,
  "percurso" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_roteiro_hotel" (
  "id" TEXT PRIMARY KEY,
  "roteiro_id" TEXT NOT NULL,
  "cidade" TEXT,
  "hotel" TEXT,
  "data_inicio" TEXT,
  "data_fim" TEXT,
  "noites" INTEGER,
  "apto" TEXT,
  "categoria" TEXT,
  "regime" TEXT,
  "ordem" INTEGER,
  "endereco" TEXT,
  "qtd_apto" INTEGER,
  "tipo_tarifa" TEXT,
  "qtd_adultos" INTEGER,
  "qtd_criancas" INTEGER,
  "valor_original" REAL,
  "valor_final" REAL
);

CREATE TABLE IF NOT EXISTS "legado_roteiro_investimento" (
  "id" TEXT PRIMARY KEY,
  "roteiro_id" TEXT NOT NULL,
  "tipo" TEXT,
  "valor_por_pessoa" REAL,
  "qtd_apto" INTEGER,
  "valor_por_apto" REAL,
  "ordem" INTEGER
);

CREATE TABLE IF NOT EXISTS "legado_roteiro_pagamento" (
  "id" TEXT PRIMARY KEY,
  "roteiro_id" TEXT NOT NULL,
  "servico" TEXT,
  "valor_total_com_taxas" REAL,
  "taxas" REAL,
  "forma_pagamento" TEXT,
  "ordem" INTEGER
);

CREATE TABLE IF NOT EXISTS "legado_roteiro_passeio" (
  "id" TEXT PRIMARY KEY,
  "roteiro_id" TEXT NOT NULL,
  "cidade" TEXT,
  "passeio" TEXT,
  "data_inicio" TEXT,
  "tipo" TEXT,
  "ingressos" TEXT,
  "ordem" INTEGER,
  "data_fim" TEXT,
  "fornecedor" TEXT,
  "qtd_adultos" INTEGER,
  "qtd_criancas" INTEGER,
  "valor_original" REAL,
  "valor_final" REAL
);

CREATE TABLE IF NOT EXISTS "legado_roteiro_personalizado" (
  "id" TEXT PRIMARY KEY,
  "created_by" TEXT NOT NULL,
  "company_id" TEXT,
  "nome" TEXT NOT NULL,
  "duracao" INTEGER,
  "inicio_cidade" TEXT,
  "fim_cidade" TEXT,
  "created_at" TEXT,
  "updated_at" TEXT,
  "inclui_texto" TEXT,
  "nao_inclui_texto" TEXT,
  "informacoes_importantes" TEXT,
  "mostrar_pagamento_pdf" INTEGER NOT NULL DEFAULT 0,
  "mostrar_informacoes_pdf" INTEGER NOT NULL DEFAULT 0,
  "mostrar_rodape_pdf" INTEGER NOT NULL DEFAULT 0,
  "opcionais" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "legado_roteiro_sugestoes" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT,
  "tipo" TEXT NOT NULL,
  "valor" TEXT NOT NULL,
  "uso_count" INTEGER,
  "created_at" TEXT,
  "updated_at" TEXT,
  UNIQUE ("company_id", "tipo", "valor")
);

CREATE TABLE IF NOT EXISTS "legado_roteiro_transporte" (
  "id" TEXT PRIMARY KEY,
  "roteiro_id" TEXT NOT NULL,
  "tipo" TEXT,
  "fornecedor" TEXT,
  "descricao" TEXT,
  "data_inicio" TEXT,
  "data_fim" TEXT,
  "categoria" TEXT,
  "observacao" TEXT,
  "ordem" INTEGER,
  "trecho" TEXT,
  "cia_aerea" TEXT,
  "data_voo" TEXT,
  "classe_reserva" TEXT,
  "hora_saida" TEXT,
  "aeroporto_saida" TEXT,
  "duracao_voo" TEXT,
  "tipo_voo" TEXT,
  "hora_chegada" TEXT,
  "aeroporto_chegada" TEXT,
  "tarifa_nome" TEXT,
  "reembolso_tipo" TEXT,
  "qtd_adultos" INTEGER,
  "qtd_criancas" INTEGER,
  "valor_total" REAL,
  "taxas" REAL
);

CREATE TABLE IF NOT EXISTS "legado_sac_controle" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "recibo" TEXT,
  "tour" TEXT,
  "data_solicitacao" TEXT,
  "motivo" TEXT,
  "contratante_pax" TEXT,
  "ok_quando" TEXT,
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "status" TEXT,
  "responsavel" TEXT,
  "prazo" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_sac_interacoes" (
  "id" TEXT PRIMARY KEY,
  "sac_id" TEXT NOT NULL,
  "data_interacao" TEXT,
  "descricao" TEXT NOT NULL,
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_security_audit_weekly_runs" (
  "id" TEXT PRIMARY KEY,
  "ran_at" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "missing_policy_count" INTEGER NOT NULL DEFAULT 0,
  "broad_policy_count" INTEGER NOT NULL DEFAULT 0,
  "overlapping_table_count" INTEGER NOT NULL DEFAULT 0,
  "unforced_critical_count" INTEGER NOT NULL DEFAULT 0,
  "pagamentos_company_mismatch" INTEGER NOT NULL DEFAULT 0,
  "bucket_public" INTEGER NOT NULL DEFAULT 0,
  "details" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "legado_security_rate_limits" (
  "scope" TEXT NOT NULL,
  "key_hash" TEXT NOT NULL,
  "window_start" TEXT NOT NULL,
  "expires_at" TEXT NOT NULL,
  "hits" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("scope", "key_hash")
);

CREATE TABLE IF NOT EXISTS "legado_servico_fornecedor_price" (
  "id" TEXT PRIMARY KEY,
  "servico_fornecedor_id" TEXT NOT NULL,
  "moeda" TEXT NOT NULL,
  "valor_base" REAL NOT NULL DEFAULT 0,
  "tipo_valor" TEXT NOT NULL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT,
  "updated_at" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_servico_fornecedor_price_period" (
  "id" TEXT PRIMARY KEY,
  "servico_fornecedor_price_id" TEXT NOT NULL,
  "data_inicio" TEXT NOT NULL,
  "data_fim" TEXT NOT NULL,
  "ajuste_tipo" TEXT NOT NULL,
  "ajuste_valor" REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "legado_servico_price" (
  "id" TEXT PRIMARY KEY,
  "servico_id" TEXT NOT NULL,
  "moeda" TEXT NOT NULL,
  "valor_base" REAL NOT NULL DEFAULT 0,
  "tipo_valor" TEXT NOT NULL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT,
  "updated_at" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_servico_price_period" (
  "id" TEXT PRIMARY KEY,
  "servico_price_id" TEXT NOT NULL,
  "data_inicio" TEXT NOT NULL,
  "data_fim" TEXT NOT NULL,
  "ajuste_tipo" TEXT NOT NULL,
  "ajuste_valor" REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "legado_servicos" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "descricao" TEXT,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT,
  "updated_at" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_servicos_fornecedor" (
  "id" TEXT PRIMARY KEY,
  "fornecedor_id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "descricao" TEXT,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT,
  "updated_at" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_subdivisoes" (
  "id" TEXT PRIMARY KEY,
  "pais_id" TEXT NOT NULL,
  "codigo_admin1" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "tipo" TEXT,
  "created_at" TEXT,
  UNIQUE ("pais_id", "codigo_admin1")
);

CREATE TABLE IF NOT EXISTS "legado_system_documentation" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL,
  "markdown" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_by" TEXT,
  UNIQUE ("slug")
);

CREATE TABLE IF NOT EXISTS "legado_system_documentation_section_versions" (
  "id" TEXT PRIMARY KEY,
  "section_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "role_scope" TEXT NOT NULL,
  "module_key" TEXT NOT NULL,
  "route_pattern" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "content_markdown" TEXT NOT NULL,
  "tone" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" INTEGER NOT NULL DEFAULT 0,
  "action" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "created_by" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_system_documentation_sections" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL,
  "role_scope" TEXT NOT NULL,
  "module_key" TEXT NOT NULL,
  "route_pattern" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "content_markdown" TEXT NOT NULL,
  "tone" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "created_by" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_by" TEXT,
  UNIQUE ("slug", "role_scope", "module_key")
);

CREATE TABLE IF NOT EXISTS "legado_system_documentation_versions" (
  "id" TEXT PRIMARY KEY,
  "doc_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "markdown" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "created_by" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_system_module_settings" (
  "module_key" TEXT PRIMARY KEY,
  "enabled" INTEGER NOT NULL DEFAULT 0,
  "reason" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_by" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_tipo_pacotes" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "rule_id" TEXT,
  "fix_meta_nao_atingida" REAL,
  "fix_meta_atingida" REAL,
  "fix_super_meta" REAL,
  "ativo" INTEGER,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_tipo_produtos" (
  "id" TEXT PRIMARY KEY,
  "tipo" TEXT NOT NULL,
  "regra_comissionamento" TEXT NOT NULL,
  "soma_na_meta" INTEGER NOT NULL DEFAULT 0,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "nome" TEXT,
  "usa_meta_produto" INTEGER NOT NULL DEFAULT 0,
  "meta_produto_valor" REAL,
  "comissao_produto_meta_pct" REAL,
  "descontar_meta_geral" INTEGER NOT NULL DEFAULT 0,
  "exibe_kpi_comissao" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "legado_todo_categorias" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT,
  "user_id" TEXT,
  "nome" TEXT NOT NULL,
  "cor" TEXT NOT NULL,
  "created_at" TEXT,
  "updated_at" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_user_convites" (
  "id" TEXT PRIMARY KEY,
  "invited_user_id" TEXT,
  "invited_email" TEXT NOT NULL,
  "company_id" TEXT,
  "user_type_id" TEXT,
  "invited_by" TEXT NOT NULL,
  "invited_by_role" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "accepted_at" TEXT,
  "cancelled_at" TEXT,
  "expires_at" TEXT NOT NULL,
  "uso_individual" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "legado_user_crm_assinaturas" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "company_id" TEXT,
  "nome" TEXT NOT NULL,
  "linha1" TEXT,
  "linha1_font_size" INTEGER NOT NULL DEFAULT 0,
  "linha1_italic" INTEGER NOT NULL DEFAULT 0,
  "linha2" TEXT,
  "linha2_font_size" INTEGER NOT NULL DEFAULT 0,
  "linha2_italic" INTEGER NOT NULL DEFAULT 0,
  "linha3" TEXT,
  "linha3_font_size" INTEGER NOT NULL DEFAULT 0,
  "linha3_italic" INTEGER NOT NULL DEFAULT 0,
  "is_default" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT,
  "updated_at" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_user_message_template_themes" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "company_id" TEXT,
  "categoria" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "asset_url" TEXT NOT NULL,
  "storage_path" TEXT,
  "width_px" INTEGER NOT NULL DEFAULT 0,
  "height_px" INTEGER NOT NULL DEFAULT 0,
  "title_style" TEXT NOT NULL,
  "body_style" TEXT NOT NULL,
  "signature_style" TEXT NOT NULL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "categoria_id" TEXT,
  "scope" TEXT NOT NULL,
  "greeting_text" TEXT,
  "mensagem_max_linhas" INTEGER NOT NULL DEFAULT 0,
  "mensagem_max_palavras" INTEGER NOT NULL DEFAULT 0,
  "assinatura_max_linhas" INTEGER NOT NULL DEFAULT 0,
  "assinatura_max_palavras" INTEGER NOT NULL DEFAULT 0,
  "logo_url" TEXT,
  "logo_path" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_user_message_templates" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "company_id" TEXT,
  "nome" TEXT NOT NULL,
  "categoria" TEXT,
  "assunto" TEXT,
  "titulo" TEXT NOT NULL,
  "corpo" TEXT NOT NULL,
  "assinatura" TEXT,
  "template_base_url" TEXT,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "theme_id" TEXT,
  "title_style" TEXT NOT NULL,
  "body_style" TEXT NOT NULL,
  "signature_style" TEXT NOT NULL,
  "layout_key" TEXT NOT NULL,
  "scope" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "legado_user_type_default_perms" (
  "id" TEXT PRIMARY KEY,
  "user_type_id" TEXT NOT NULL,
  "modulo" TEXT NOT NULL,
  "permissao" TEXT NOT NULL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_user_types" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TEXT,
  UNIQUE ("name")
);

CREATE TABLE IF NOT EXISTS "legado_users" (
  "id" TEXT PRIMARY KEY,
  "nome_completo" TEXT,
  "cpf" TEXT,
  "data_nascimento" TEXT,
  "telefone" TEXT,
  "cidade" TEXT,
  "estado" TEXT,
  "user_type_id" TEXT,
  "uso_individual" INTEGER,
  "company_id" TEXT,
  "created_at" TEXT,
  "updated_at" TEXT,
  "active" INTEGER NOT NULL DEFAULT 0,
  "email" TEXT,
  "rg" TEXT,
  "whatsapp" TEXT,
  "cep" TEXT,
  "endereco" TEXT,
  "numero" TEXT,
  "complemento" TEXT,
  "created_by_gestor" INTEGER NOT NULL DEFAULT 0,
  "welcome_email_sent" INTEGER NOT NULL DEFAULT 0,
  "participa_ranking" INTEGER NOT NULL DEFAULT 0,
  "must_change_password" INTEGER NOT NULL DEFAULT 0,
  "password_changed_at" TEXT,
  "avatar_url" TEXT,
  UNIQUE ("cpf"),
  UNIQUE ("email")
);

CREATE TABLE IF NOT EXISTS "legado_v_gestor_vendedor_details" (
  "id" TEXT,
  "gestor_nome" TEXT,
  "gestor_cpf" TEXT,
  "vendedor_nome" TEXT,
  "vendedor_cpf" TEXT,
  "company_name" TEXT,
  "pode_modificar" INTEGER,
  "created_at" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_v_users_complete" (
  "id" TEXT,
  "nome_completo" TEXT,
  "cpf" TEXT,
  "data_nascimento" TEXT,
  "telefone" TEXT,
  "cidade" TEXT,
  "estado" TEXT,
  "user_type" TEXT,
  "user_type_description" TEXT,
  "uso_individual" INTEGER,
  "company_name" TEXT,
  "company_cnpj" TEXT,
  "created_at" TEXT,
  "updated_at" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_vendas" (
  "id" TEXT PRIMARY KEY,
  "cliente_id" TEXT NOT NULL,
  "destino_id" TEXT NOT NULL,
  "data_lancamento" TEXT NOT NULL,
  "data_embarque" TEXT,
  "created_at" TEXT,
  "updated_at" TEXT,
  "produto_id" TEXT,
  "valor_total" REAL,
  "status" TEXT,
  "notas" TEXT,
  "numero_venda" TEXT,
  "cancelada" INTEGER NOT NULL DEFAULT 0,
  "vendedor_id" TEXT,
  "destino_cidade_id" TEXT,
  "data_final" TEXT,
  "desconto_comercial_aplicado" INTEGER,
  "desconto_comercial_valor" REAL,
  "valor_total_bruto" REAL,
  "valor_total_pago" REAL,
  "valor_taxas" REAL,
  "valor_nao_comissionado" REAL,
  "company_id" TEXT,
  "data_venda" TEXT NOT NULL,
  UNIQUE ("numero_venda")
);

CREATE TABLE IF NOT EXISTS "legado_vendas_pagamentos" (
  "id" TEXT PRIMARY KEY,
  "venda_id" TEXT NOT NULL,
  "forma_pagamento_id" TEXT,
  "company_id" TEXT NOT NULL,
  "forma_nome" TEXT,
  "operacao" TEXT,
  "plano" TEXT,
  "valor_bruto" REAL,
  "desconto_valor" REAL,
  "valor_total" REAL,
  "parcelas" TEXT,
  "parcelas_qtd" INTEGER,
  "parcelas_valor" REAL,
  "vencimento_primeira" TEXT,
  "paga_comissao" INTEGER,
  "observacoes" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "venda_recibo_id" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_vendas_recibos" (
  "id" TEXT PRIMARY KEY,
  "venda_id" TEXT NOT NULL,
  "produto_id" TEXT,
  "numero_recibo" TEXT,
  "valor_total" REAL,
  "valor_taxas" REAL,
  "created_at" TEXT,
  "updated_at" TEXT,
  "data_inicio" TEXT,
  "data_fim" TEXT,
  "produto_resolvido_id" TEXT,
  "numero_reserva" TEXT,
  "contrato_path" TEXT,
  "contrato_url" TEXT,
  "tipo_pacote" TEXT,
  "valor_rav" REAL,
  "valor_du" REAL,
  "data_venda" TEXT,
  "cancelado_por_conciliacao_em" TEXT,
  "cancelado_por_conciliacao_observacao" TEXT,
  "numero_recibo_normalizado" TEXT,
  "destino_cidade_id" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_vendas_recibos_complementares" (
  "id" TEXT PRIMARY KEY,
  "venda_id" TEXT NOT NULL,
  "recibo_id" TEXT NOT NULL,
  "created_at" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_vendas_recibos_notas" (
  "id" TEXT PRIMARY KEY,
  "venda_id" TEXT NOT NULL,
  "recibo_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "notas" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_vendas_recibos_rateio" (
  "id" TEXT PRIMARY KEY,
  "venda_recibo_id" TEXT,
  "company_id" TEXT NOT NULL,
  "vendedor_origem_id" TEXT NOT NULL,
  "vendedor_destino_id" TEXT NOT NULL,
  "percentual_origem" REAL NOT NULL DEFAULT 0,
  "percentual_destino" REAL NOT NULL DEFAULT 0,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "observacao" TEXT,
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "conciliacao_recibo_id" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_viagem_acompanhantes" (
  "id" TEXT PRIMARY KEY,
  "viagem_id" TEXT NOT NULL,
  "acompanhante_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "papel" TEXT,
  "documento_url" TEXT,
  "observacoes" TEXT,
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_viagem_documentos" (
  "id" TEXT PRIMARY KEY,
  "viagem_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "tipo" TEXT,
  "url" TEXT,
  "mime_type" TEXT,
  "size_bytes" INTEGER,
  "expires_at" TEXT,
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_viagem_passageiros" (
  "id" TEXT PRIMARY KEY,
  "viagem_id" TEXT NOT NULL,
  "cliente_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "papel" TEXT NOT NULL,
  "observacoes" TEXT,
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_viagem_servicos" (
  "id" TEXT PRIMARY KEY,
  "viagem_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "tipo" TEXT,
  "fornecedor" TEXT,
  "descricao" TEXT,
  "status" TEXT,
  "data_inicio" TEXT,
  "data_fim" TEXT,
  "valor" REAL,
  "moeda" TEXT,
  "voucher_url" TEXT,
  "observacoes" TEXT,
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_viagens" (
  "id" TEXT PRIMARY KEY,
  "venda_id" TEXT,
  "orcamento_id" TEXT,
  "company_id" TEXT NOT NULL,
  "responsavel_user_id" TEXT,
  "origem" TEXT,
  "destino" TEXT,
  "data_inicio" TEXT,
  "data_fim" TEXT,
  "status" TEXT NOT NULL,
  "observacoes" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "cliente_id" TEXT,
  "recibo_id" TEXT,
  "follow_up_text" TEXT,
  "follow_up_fechado" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "legado_voucher_assets" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "created_by" TEXT,
  "updated_by" TEXT,
  "provider" TEXT NOT NULL,
  "asset_kind" TEXT NOT NULL,
  "label" TEXT,
  "storage_bucket" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "mime_type" TEXT,
  "size_bytes" INTEGER,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_voucher_dias" (
  "id" TEXT PRIMARY KEY,
  "voucher_id" TEXT NOT NULL,
  "dia_numero" INTEGER NOT NULL DEFAULT 0,
  "titulo" TEXT,
  "descricao" TEXT NOT NULL,
  "data_referencia" TEXT,
  "cidade" TEXT,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_voucher_hoteis" (
  "id" TEXT PRIMARY KEY,
  "voucher_id" TEXT NOT NULL,
  "cidade" TEXT NOT NULL,
  "hotel" TEXT NOT NULL,
  "endereco" TEXT,
  "data_inicio" TEXT,
  "data_fim" TEXT,
  "noites" INTEGER,
  "telefone" TEXT,
  "contato" TEXT,
  "status" TEXT,
  "observacao" TEXT,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "legado_vouchers" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "created_by" TEXT,
  "updated_by" TEXT,
  "provider" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "codigo_sistema" TEXT,
  "codigo_fornecedor" TEXT,
  "reserva_online" TEXT,
  "operador" TEXT,
  "resumo" TEXT,
  "data_inicio" TEXT,
  "data_fim" TEXT,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "passageiros" TEXT,
  "tipo_acomodacao" TEXT,
  "extra_data" TEXT NOT NULL,
  "viagem_id" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_vw_cidades_localizacao" (
  "cidade_id" TEXT,
  "cidade_nome" TEXT,
  "subdivisao_id" TEXT,
  "subdivisao_nome" TEXT,
  "subdivisao_codigo" TEXT,
  "subdivisao_tipo" TEXT,
  "pais_id" TEXT,
  "pais_nome" TEXT,
  "pais_codigo_iso" TEXT,
  "continente" TEXT,
  "latitude" REAL,
  "longitude" REAL,
  "populacao" INTEGER,
  "descricao" TEXT,
  "created_at" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_vw_cidades_localizacao_busca" (
  "cidade_id" TEXT,
  "cidade_nome" TEXT,
  "subdivisao_id" TEXT,
  "subdivisao_nome" TEXT,
  "subdivisao_codigo" TEXT,
  "subdivisao_tipo" TEXT,
  "pais_id" TEXT,
  "pais_nome" TEXT,
  "pais_codigo_iso" TEXT,
  "continente" TEXT,
  "latitude" REAL,
  "longitude" REAL,
  "populacao" INTEGER,
  "descricao" TEXT,
  "created_at" TEXT,
  "label" TEXT,
  "search_text" TEXT
);

CREATE TABLE IF NOT EXISTS "legado_vw_produtos_comissionamento" (
  "produto_id" TEXT,
  "tipo" TEXT,
  "regra_comissionamento" TEXT,
  "soma_na_meta" INTEGER,
  "meta_nao_atingida" REAL,
  "meta_atingida" REAL,
  "super_meta" REAL,
  "diferenciado" REAL,
  "comissionamento_ativo" INTEGER
);

CREATE TABLE IF NOT EXISTS "legado_vw_soma_meta_placeholder" (
  "produto_id" TEXT,
  "tipo" TEXT,
  "soma_na_meta" INTEGER,
  "regra_comissionamento" TEXT
);

CREATE TABLE IF NOT EXISTS "mfa_fatores" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "secret" TEXT NOT NULL,
  "friendly_name" TEXT,
  "status" TEXT NOT NULL DEFAULT 'unverified',
  "created_at" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_mfa_fatores_user" ON "mfa_fatores" ("user_id");

