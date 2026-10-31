# F8-03 Destino dos Recursos Supabase

**Decisão necessária:** a desativação do Supabase é uma ação irreversível
que deve ser tomada separadamente do deploy da v2. Não excluir o ambiente
antigo como consequência automática de nenhum deploy.

---

## 1. Inventário do Projeto Supabase

| Recurso | Descrição | Ação recomendada |
|---|---|---|
| **Database** (PostgreSQL) | Dados históricos da v1 | Exportar antes de desativar |
| **Auth** (usuários Supabase) | Usuários migrados para Better Auth | Manter 90 dias após migração confirmada |
| **Storage** (buckets) | Arquivos de clientes, logos | Migrar para R2 antes de desativar |
| **Edge Functions** | Se houver | Inventariar e replicar em Workers |
| **Realtime** | Subscriptions (mural) | Substituído por polling (ADR-008) |
| **API Keys** | Anon key, service role | Revogar após desativação |

---

## 2. Exportação de Dados (Pré-requisito Obrigatório)

### 2.1 Exportar banco PostgreSQL

```bash
# Via Supabase CLI
supabase db dump --db-url "postgresql://..." > backup-supabase-$(date +%Y%m%d).sql

# OU via pg_dump diretamente
pg_dump "postgresql://postgres.<project-ref>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
  > backup-supabase-$(date +%Y%m%d).sql
```

- [ ] Dump realizado e armazenado em local seguro
- [ ] Dump verificado: `psql < backup-supabase-YYYYMMDD.sql` em banco local

### 2.2 Exportar arquivos do Storage

```bash
# Listar buckets
supabase storage list --project-ref <PROJECT_REF>

# Exportar cada bucket com rclone configurado para Supabase Storage
# (Supabase Storage é compatível com S3)
rclone sync s3://supabase-<bucket>/ ./backup-storage-$(date +%Y%m%d)/ \
  --s3-provider Other \
  --s3-access-key-id <SUPABASE_S3_ACCESS_KEY> \
  --s3-secret-access-key <SUPABASE_S3_SECRET> \
  --s3-endpoint https://<project-ref>.supabase.co/storage/v1/s3
```

- [ ] Arquivos exportados
- [ ] Verificar: arquivos críticos existem no R2 também

---

## 3. Checklist de Desativação

Execute **apenas** quando todas as condições forem atendidas:

**Pré-condições:**
- [ ] v2 operacional em produção por ≥ 30 dias sem incidentes críticos
- [ ] Zero tráfego nas rotas v1 por ≥ 7 dias (verificado em Analytics)
- [ ] Todos os arquivos do Supabase Storage migrados para R2 e verificados
- [ ] Dump do banco exportado e armazenado (passo 2.1)
- [ ] Secrets Supabase removidos do Cloudflare (`wrangler secret delete`)

**Desativação no Supabase Dashboard:**
1. Settings → API → Revogar todas as API keys
2. Settings → Database → Desabilitar conexões diretas
3. Settings → General → Pause project (gratuito) OU Delete project (pago)

> **ATENÇÃO:** "Pause" é reversível por 90 dias no plano gratuito.
> "Delete" é irreversível e exclui todos os dados.
> Usar "Pause" primeiro; confirmar "Delete" só após validação completa.

---

## 4. Retenção de Dados Históricos

| Tipo de dado | Decisão recomendada | Prazo |
|---|---|---|
| Registros de vendas históricos | Manter no D1 (migrados em F4) | Permanente |
| Usuários antigos (Supabase Auth) | Já migrados para Better Auth | Deletar do Supabase após 90 dias |
| Arquivos de storage | Manter no R2 | Permanente |
| Logs e audit trail | Exportar antes de desativar | Manter 1 ano |
| Dados de conciliação (M06 ADIADO) | Manter dump SQL | Até decisão sobre M06 |

---

## 5. Custo Estimado Pós-migração

| Serviço | Antes (Supabase) | Depois (Cloudflare) |
|---|---|---|
| Database | Supabase Pro ~$25/mês | D1 Free tier (5M rows/dia) |
| Storage | Supabase Storage ~$0.021/GB | R2 Free (10 GB) |
| Auth | Supabase Auth (incluído) | Better Auth (open-source, sem custo) |
| Functions/Workers | Supabase Edge Functions | Workers Free (100k req/dia) |
| **Total estimado** | **~$25–50/mês** | **$0 no free tier** |

*Estimar custo real após 30 dias em produção com dados reais de uso.*

---

*Documento gerado em F8-03. A decisão de desativação deve ser tomada
conscientemente, não como consequência automática de qualquer deploy.*
