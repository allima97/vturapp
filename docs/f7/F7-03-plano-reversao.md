# F7-03 Plano de Reversão e Correção Pós-deploy

**Contexto:** após o primeiro deploy com gravações reais, retornar ao sistema
antigo não recupera os dados novos. A estratégia padrão é **correção
compatível**, não rollback cego.

---

## 1. Decisão de Reversão

### Critérios para reverter

| Situação | Ação recomendada |
|---|---|
| Bug cosmético ou de UX sem perda de dados | Correção rápida (hotfix) |
| Bug que impede login de todos os usuários | Reverter aplicação + comunicar |
| Bug que causa dados incorretos sem perda | Correção + script de reparo de dados |
| Perda de dados confirmada | Time Travel D1 (ver F6-03 runbook) |
| Indisponibilidade total (503 em todas as rotas) | Reverter aplicação imediatamente |

**Regra geral:** reverter a aplicação (código) é sempre reversível.
Reverter o banco (dados) é destrutivo e deve ser o último recurso.

---

## 2. Reverter a Aplicação (Código)

### 2.1 Cloudflare Workers — rollback para versão anterior

```bash
# Listar deployments recentes
wrangler deployments list --env production

# Reverter para o deployment anterior por ID
wrangler rollback <DEPLOYMENT_ID> --env production

# Confirmar versão ativa
wrangler deployments list --env production
```

O rollback é instantâneo. Novos requests já caem na versão anterior.

### 2.2 Verificar depois do rollback

```bash
# Health check
curl https://<domínio>/api/v2/health

# Testar login
# (manual, em staging ou produção)
```

---

## 3. Migrations — Sem Rollback Automático

As migrations D1 **não têm rollback automático**. Se uma migration causar
problema, as opções são:

### 3.1 Correção compatível (preferida)

Criar uma nova migration que desfaz a mudança problemática:

```sql
-- drizzle/XXXX_fix_rollback_<descricao>.sql

-- Exemplo: desfazer coluna adicionada por engano
ALTER TABLE vendas DROP COLUMN coluna_incorreta;

-- Exemplo: restaurar constraint removida
CREATE UNIQUE INDEX idx_vendas_chave ON vendas(chave_idempotencia);
```

```bash
# Aplicar a migration de correção
npm run d1:migrate:prod
```

### 3.2 Time Travel (dados corrompidos)

Ver runbook `docs/runbooks/F6-03-backup-restore.md`, seção 1.
**Só usar se a correção compatível não for viável** — Time Travel descarta
todos os dados gravados após o ponto de restauração.

---

## 4. Dados Incorretos Sem Perda (Reparo Cirúrgico)

Se uma migration ou bug gerou dados errados mas não os apagou:

```bash
# Identificar registros afetados
wrangler d1 execute vturapp-db \
  --command "SELECT id, campo_errado FROM tabela WHERE condicao_do_bug LIMIT 20;" \
  --env production

# Aplicar correção pontual
wrangler d1 execute vturapp-db \
  --command "UPDATE tabela SET campo_errado = valor_correto WHERE condicao_do_bug;" \
  --env production
  
# Confirmar
wrangler d1 execute vturapp-db \
  --command "SELECT COUNT(*) FROM tabela WHERE condicao_do_bug;" \
  --env production
```

---

## 5. Comunicação Durante Incidente

### Template de status (interno)

```
[INCIDENTE] vturapp — <data/hora>

Sintoma: <descrição do problema>
Impacto: <quem é afetado e como>
Ação tomada: <o que foi feito>
Status atual: <investigando / revertendo / resolvido>
Próximo update: <horário>
```

### Sequência de ações

1. Identificar → replicar em staging
2. Decidir: hotfix ou rollback (ver tabela acima)
3. Aplicar e verificar
4. Comunicar resolução
5. Post-mortem se impacto > 30 min ou dados afetados

---

## 6. Contatos e Acesso de Emergência

| Recurso | Como acessar |
|---|---|
| Cloudflare Dashboard | dash.cloudflare.com → Workers & Pages |
| D1 Time Travel | dash.cloudflare.com → Workers → D1 → <banco> → Time Travel |
| Logs em tempo real | `wrangler tail --env production` |
| Rollback imediato | `wrangler rollback <id> --env production` |

---

*Documento gerado em F7-03 como parte do ensaio de lançamento.*
