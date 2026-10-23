-- ============================================================
-- LGPD INFRASTRUCTURE — Lei 13.709/2018
-- Criado em: 2023-10-23
-- Requisitos: Arts. 18, 37, 41, 46, 48
-- ============================================================

-- ┌─────────────────────────────────────────────────────────┐
-- │ 1. Registro de Atividades de Tratamento (Art. 37)       │
-- └─────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS lgpd_atividades_tratamento (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,
  finalidade      text NOT NULL,
  base_legal      text NOT NULL,  -- ex: 'contrato', 'consentimento', 'interesse_legitimo'
  dados_tratados  text[] NOT NULL DEFAULT '{}',
  titulares       text[] NOT NULL DEFAULT '{}',
  compartilhamento text,
  retencao_meses  integer,
  medidas_seguranca text,
  ativo           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Dados iniciais: atividades já existentes no sistema
INSERT INTO lgpd_atividades_tratamento
  (nome, finalidade, base_legal, dados_tratados, titulares, retencao_meses, medidas_seguranca)
VALUES
  (
    'Cadastro de Clientes',
    'Gerenciamento de clientes da agência de viagens, emissão de vouchers e orçamentos',
    'contrato',
    ARRAY['nome','cpf','cnpj','email','telefone','endereco','data_nascimento','rg'],
    ARRAY['clientes'],
    60,
    'Armazenamento criptografado em Supabase (PostgreSQL), controle de acesso por empresa, trilha de auditoria'
  ),
  (
    'Cadastro de Acompanhantes',
    'Registro de acompanhantes de viagem para emissão de documentos e vouchers',
    'contrato',
    ARRAY['nome','cpf','rg','data_nascimento','passaporte'],
    ARRAY['acompanhantes_dos_clientes'],
    60,
    'Armazenamento criptografado em Supabase (PostgreSQL), acesso restrito à empresa do cliente'
  ),
  (
    'Dados de Viagem e Vendas',
    'Registro de vendas, itinerários, documentos de viagem e gestão operacional',
    'contrato',
    ARRAY['dados_viagem','documentos','pagamentos','destinos','datas'],
    ARRAY['clientes'],
    84,
    'Armazenamento criptografado, controle de acesso RBAC, trilha de auditoria'
  ),
  (
    'Gestão de Usuários da Plataforma',
    'Controle de acesso, autenticação e permissões dos usuários internos',
    'contrato',
    ARRAY['nome','email','telefone','cargo','empresa','logs_acesso'],
    ARRAY['colaboradores','gestores','vendedores'],
    24,
    'Autenticação via Supabase Auth, MFA opcional, trilha de auditoria, cookies seguros'
  ),
  (
    'Comunicações e Avisos',
    'Envio de avisos, aniversários e comunicados aos clientes',
    'consentimento',
    ARRAY['nome','email','data_nascimento'],
    ARRAY['clientes'],
    60,
    'Opt-out disponível; dados usados apenas para comunicações acordadas'
  )
ON CONFLICT DO NOTHING;

-- ┌─────────────────────────────────────────────────────────┐
-- │ 2. Solicitações de Titulares (Art. 18)                  │
-- └─────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS lgpd_solicitacoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            text NOT NULL CHECK (tipo IN (
                    'acesso',         -- Art. 18, I: confirmação de tratamento / acesso
                    'portabilidade',  -- Art. 18, V: portabilidade a outro fornecedor
                    'retificacao',    -- Art. 18, III: correção de dados
                    'eliminacao',     -- Art. 18, VI: eliminação de dados pessoais
                    'revogacao',      -- Art. 18, IX: revogação de consentimento
                    'oposicao',       -- Art. 18, § 2: oposição a decisão automatizada
                    'informacao'      -- Art. 18, VII: informação sobre compartilhamento
                  )),
  -- Titular que fez a solicitação
  titular_nome    text NOT NULL,
  titular_email   text NOT NULL,
  titular_cpf     text,             -- opcional, para identificação
  -- Contexto: pode ser cliente externo ou usuário interno
  company_id      uuid,             -- empresa relacionada (se identificável)
  cliente_id      uuid,             -- cliente referenciado (se aplicável)
  user_id         uuid,             -- usuário do sistema (se aplicável)
  -- Conteúdo da solicitação
  descricao       text NOT NULL,
  -- Status de atendimento
  status          text NOT NULL DEFAULT 'recebida' CHECK (status IN (
                    'recebida',       -- aguardando análise
                    'em_analise',     -- DPO/admin analisando
                    'concluida',      -- solicitação atendida
                    'recusada'        -- recusada com justificativa legal
                  )),
  resposta        text,
  respondido_por  uuid,
  respondido_em   timestamptz,
  -- Prazo legal: 15 dias corridos (Art. 18, § 4)
  prazo_legal     timestamptz NOT NULL DEFAULT (now() + interval '15 days'),
  ip_origem       text,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lgpd_solicitacoes_status_idx ON lgpd_solicitacoes (status);
CREATE INDEX IF NOT EXISTS lgpd_solicitacoes_email_idx ON lgpd_solicitacoes (titular_email);
CREATE INDEX IF NOT EXISTS lgpd_solicitacoes_prazo_idx ON lgpd_solicitacoes (prazo_legal) WHERE status IN ('recebida','em_analise');

-- ┌─────────────────────────────────────────────────────────┐
-- │ 3. Registro de Consentimentos (Art. 8)                  │
-- └─────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS lgpd_consentimentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Titular
  cliente_id      uuid,
  titular_email   text,
  titular_cpf     text,
  -- Finalidade específica do consentimento
  finalidade      text NOT NULL,   -- ex: 'comunicacoes_marketing', 'compartilhamento_parceiros'
  -- Status
  consentido      boolean NOT NULL DEFAULT true,
  -- Prova do consentimento (Art. 8, § 5: ônus da prova recai sobre o controlador)
  origem          text NOT NULL,   -- ex: 'cadastro_web', 'termo_assinado', 'opt_in_email'
  ip_origem       text,
  user_agent      text,
  versao_politica text,            -- versão da política de privacidade vigente
  -- Revogação
  revogado_em     timestamptz,
  revogado_motivo text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lgpd_consentimentos_cliente_idx ON lgpd_consentimentos (cliente_id);
CREATE INDEX IF NOT EXISTS lgpd_consentimentos_email_idx ON lgpd_consentimentos (titular_email);
CREATE INDEX IF NOT EXISTS lgpd_consentimentos_finalidade_idx ON lgpd_consentimentos (finalidade, consentido);

-- ┌─────────────────────────────────────────────────────────┐
-- │ 4. Anonimização de dados de cliente (Art. 18, § 3)      │
-- └─────────────────────────────────────────────────────────┘
-- Quando o direito de eliminação for exercido, os dados pessoais identificáveis
-- são anonimizados (não deletados, para preservar integridade de registros de vendas)
ALTER TABLE IF EXISTS clientes
  ADD COLUMN IF NOT EXISTS lgpd_anonimizado    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lgpd_anonimizado_em timestamptz;

ALTER TABLE IF EXISTS acompanhantes
  ADD COLUMN IF NOT EXISTS lgpd_anonimizado    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lgpd_anonimizado_em timestamptz;

-- ┌─────────────────────────────────────────────────────────┐
-- │ 5. RLS: Solicitações e Consentimentos                   │
-- └─────────────────────────────────────────────────────────┘
-- Apenas o service_role (backend) acessa essas tabelas
ALTER TABLE lgpd_solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lgpd_consentimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE lgpd_atividades_tratamento ENABLE ROW LEVEL SECURITY;

-- Bloqueia acesso anon (apenas service_role passa por RLS bypass)
CREATE POLICY "lgpd_solicitacoes_deny_anon"
  ON lgpd_solicitacoes FOR ALL TO anon USING (false);

CREATE POLICY "lgpd_consentimentos_deny_anon"
  ON lgpd_consentimentos FOR ALL TO anon USING (false);

CREATE POLICY "lgpd_atividades_deny_anon"
  ON lgpd_atividades_tratamento FOR ALL TO anon USING (false);

-- ┌─────────────────────────────────────────────────────────┐
-- │ 6. Função updated_at automático                         │
-- └─────────────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lgpd_solicitacoes_updated_at
  BEFORE UPDATE ON lgpd_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER lgpd_consentimentos_updated_at
  BEFORE UPDATE ON lgpd_consentimentos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE lgpd_solicitacoes IS 'Solicitações de exercício de direitos dos titulares - LGPD Art. 18';
COMMENT ON TABLE lgpd_consentimentos IS 'Registro de consentimentos dos titulares - LGPD Art. 8';
COMMENT ON TABLE lgpd_atividades_tratamento IS 'Registro das Atividades de Tratamento (ROPA) - LGPD Art. 37';
