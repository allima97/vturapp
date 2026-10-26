# F1-01 — Branch isolada e configuração de ambientes

**Fase:** F1 — Prova de stack  
**Criado em:** 2026-10-26  
**Branch:** `reescrita/f1-prova-stack`  
**Estado:** CONCLUÍDA  

## O que foi feito

### Branch

```bash
git checkout -b reescrita/f1-prova-stack
```

Branch criada a partir do commit `8aeaa5e0` (F0 concluída).

### Bindings adicionados ao wrangler.toml

| Binding | Tipo | Local | Staging | Produção |
|---------|------|-------|---------|----------|
| `DB` | D1 | SQLite local (automático com `--local`) | `vturapp-db-staging` | `vturapp-db` |
| `R2` | R2 | simulação local (automático com `--local`) | `vturapp-files-staging` | `vturapp-files` |
| `KV_BINDING` | KV | simulação local | PLACEHOLDER_STAGING_KV_ID | `60fa423718914712bec4f489d41c3dd6` (existente) |
| `ASSETS` | Assets | `.svelte-kit/cloudflare` | idem | idem |

**IDs de D1 e KV de staging são placeholders** — preencher após criar os recursos:

```bash
# Criar banco de staging
npx wrangler d1 create vturapp-db-staging
# → retorna database_id — substituir PLACEHOLDER_STAGING_D1_ID em wrangler.toml

# Criar banco de produção
npx wrangler d1 create vturapp-db
# → retorna database_id — substituir PLACEHOLDER_PROD_D1_ID em wrangler.toml

# Criar KV de staging (opcional — só se staging usar KV)
npx wrangler kv namespace create vturapp-kv --env staging
# → retorna id — substituir PLACEHOLDER_STAGING_KV_ID em wrangler.toml

# Criar bucket R2 de produção
npx wrangler r2 bucket create vturapp-files

# Criar bucket R2 de staging
npx wrangler r2 bucket create vturapp-files-staging
```

### Arquivos criados/atualizados

| Arquivo | Mudança |
|---------|---------|
| `wrangler.toml` | Adicionados bindings D1, R2 e ambiente staging |
| `.env.example` | Removidas variáveis Supabase desnecessárias; mantidas como legado |
| `.dev.vars.example` | Criado com secrets para wrangler dev |
| `.gitignore` | Adicionado `.dev.vars` (ignorado); `.dev.vars.example` versionado |
| `package.json` | Adicionados scripts: `d1:migrate:local`, `d1:migrate:staging`, `dev:cf`, `cf:deploy:staging` |

### Desenvolvimento local

```bash
# Copiar o template de secrets
cp .dev.vars.example .dev.vars
# preencher BETTER_AUTH_SECRET, RESEND_API_KEY etc.

# Rodar o app com D1/R2 local (Miniflare)
npm run dev:cf

# Aplicar migrations ao banco local
npm run d1:migrate:local
```

## Decisão sobre placement

O placement `aws:us-west-2` (Oregon) foi mantido por enquanto — necessário para a aplicação legada Supabase que ainda está ativa em produção. **Avaliar remoção em F1-02** após medir latência D1 sem placement fixo.

## Nota sobre cron

O `scripts/patch-worker-scheduled.js` **não será portado** para a nova aplicação. Em F1-02, o handler `scheduled()` será implementado diretamente no código SvelteKit/Worker sem necessidade de patch pós-build.

## Pendências (preencher pelo usuário)

- [ ] Executar `wrangler d1 create vturapp-db` e atualizar `PLACEHOLDER_PROD_D1_ID`
- [ ] Executar `wrangler d1 create vturapp-db-staging` e atualizar `PLACEHOLDER_STAGING_D1_ID`
- [ ] Executar `wrangler r2 bucket create vturapp-files`
- [ ] Executar `wrangler r2 bucket create vturapp-files-staging`
- [ ] Preencher `.dev.vars` com secrets reais para desenvolvimento
