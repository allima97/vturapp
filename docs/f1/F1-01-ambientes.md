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
| `KV_BINDING` | KV | simulação local | `10586afa5db14a7ab8d2e406ba98d5da` (`vturapp-kv-staging`) | `60fa423718914712bec4f489d41c3dd6` (existente) |
| `ASSETS` | Assets | `.svelte-kit/cloudflare` | idem | idem |

**Provisionamento real atualizado em 31/10/2026:** D1, R2 e KV de staging/prod estão criados e vinculados; IDs e migrations aplicadas estão registrados em `docs/migracao/REANALISE-BASE-D1-R2.md`. O Worker de staging ainda não existe; o Worker atual de produção segue legado com secrets Supabase. Nenhum Worker com a nova configuração foi publicado.

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

## Provisionamento dos recursos

- [x] Criar D1 de produção e staging, atualizar `wrangler.toml` e aplicar migrations
- [x] Confirmar os buckets R2 de produção e staging
- [x] Criar KV isolado de staging e atualizar `wrangler.toml`
- [ ] Preencher `.dev.vars` com secrets reais para desenvolvimento
- [ ] Configurar secrets de staging e validar o Worker sem encaminhar tráfego de produção
