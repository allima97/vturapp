# F8-04 Guia de Operação — vturapp v2

**Público:** desenvolvedor que retoma o projeto após uma pausa.  
**Pré-requisito:** ambiente Cloudflare configurado com IDs reais (não PLACEHOLDERs).

---

## 1. Visão Rápida da Stack

| Camada | Tecnologia | Config |
|---|---|---|
| Frontend | SvelteKit | `src/routes/` |
| API | Hono em Cloudflare Workers | `src/lib/server/api/app-v2.ts` |
| Banco | Cloudflare D1 (SQLite) | `wrangler.toml` → `[[d1_databases]]` |
| Arquivos | Cloudflare R2 | `wrangler.toml` → `[[r2_buckets]]` |
| Cache/KV | Cloudflare KV | `wrangler.toml` → `[[kv_namespaces]]` |
| Auth | Better Auth | `src/lib/server/auth/` |
| E-mail | Resend | `RESEND_API_KEY` secret |
| Captcha | Cloudflare Turnstile | `TURNSTILE_SECRET_KEY` secret |

---

## 2. Rodar Localmente

```bash
# Instalar dependências
npm install

# Dev com D1 local (Miniflare)
npm run dev
# Acesse: http://localhost:5173

# Rodar testes
npm run test          # todos os testes (vitest)
npm run check         # svelte-check + tsc

# Build de produção
npm run build
```

### Banco local

```bash
# Aplicar migrations no banco local
npm run d1:migrate:local

# Inspecionar banco local
wrangler d1 execute vturapp-db --local \
  --command "SELECT * FROM empresas LIMIT 5;"
```

---

## 3. Deploy

```bash
# Staging
npm run d1:migrate:staging   # migrations primeiro
wrangler deploy --env staging

# Produção
npm run d1:migrate:prod
wrangler deploy --env production
```

**Antes de qualquer deploy:** preencher `docs/f7/F7-02-release-checklist.md`.

---

## 4. Acesso de Emergência

### 4.1 Tail de logs em tempo real

```bash
wrangler tail --env production
# Filtrar erros: wrangler tail --env production --status error
```

### 4.2 Rollback imediato

```bash
wrangler deployments list --env production
wrangler rollback <DEPLOYMENT_ID> --env production
```

### 4.3 Executar SQL de emergência

```bash
wrangler d1 execute vturapp-db \
  --command "SELECT * FROM vendas ORDER BY criado_em DESC LIMIT 10;" \
  --env production
```

### 4.4 Verificar secrets ativos

```bash
wrangler secret list --env production
```

---

## 5. Atualização de Dependências

```bash
# Ver desatualizações
npm outdated

# Atualizar com cautela (testar antes de produção)
npm update

# Dependências críticas a monitorar
# - better-auth (auth; changelog em betterauth.dev)
# - hono (API framework; changelog em hono.dev)
# - @cloudflare/workers-types (types do Workers runtime)
# - drizzle-orm (ORM; migrations podem mudar)

# Após atualização: sempre rodar
npm run test && npm run check && npm run build
```

---

## 6. Adicionar uma Nova Rota v2

1. Criar `src/lib/server/api/routes/<domínio>-v2/index.ts`
2. Seguir padrão de `vendas-v2/index.ts`:
   - Extrair `empresaId` do contexto de auth
   - Validar input com Zod
   - Delegar para `<domínio>/service.ts`
   - Retornar JSON com status explícito
3. Montar em `app-v2.ts`: `app.route('/<domínio>', <domínio>V2Routes);`
4. Adicionar teste em `<domínio>/<domínio>.workers.test.ts`
5. Rodar `npm run test` e `npm run check`

---

## 7. Adicionar Migration D1

```bash
# Gerar migration vazia
wrangler d1 migrations create vturapp-db "<descricao>"
# Cria: drizzle/XXXX_<descricao>.sql

# Editar o arquivo SQL gerado
# Aplicar localmente para testar
npm run d1:migrate:local

# Verificar com drizzle-kit (opcional)
npx drizzle-kit check
```

---

## 8. Próximo Backlog Priorizado

| Prioridade | Item | Módulo | Dependência |
|---|---|---|---|
| 🔴 Alta | Mural/recados com polling cursor (ADR-008) | M09 | — |
| 🔴 Alta | Produtos e tarifas (cadastro global) | M03 | — |
| 🟡 Média | Orçamentos e roteiros | M07 | M03 |
| 🟡 Média | Agenda de compromissos | M08 | — |
| 🟡 Média | Destinos (cadastro de destinos de viagem) | M10 | — |
| 🟢 Baixa | Relatórios v2 (substituir relatorios.ts) | — | M04 |
| 🟢 Baixa | Conciliação (M06 — decisão pendente) | M06 | M04 |
| 🟢 Baixa | Comissões (M05 — excluído; revisar se necessário) | M05 | M04 |

**Módulos CONCLUÍDOS:** M01 (identidade/auth), M02 (clientes/anexos), M04 (vendas/recebimentos).  
**Módulos EXCLUÍDOS:** M05 (comissões), M06 (conciliação) — ver ADR-009.  
**Módulos ADIADOS:** M03, M07, M08, M09 (código pronto), M10 — ver ADR-009.

---

## 9. Documentos de Referência

| Documento | Conteúdo |
|---|---|
| `docs/REESCRITA-REVISAO-E-ROTEIRO.md` | Roteiro completo F0–F8 com status |
| `docs/adr/` | Todas as ADRs de decisão de arquitetura |
| `docs/runbooks/F6-03-backup-restore.md` | Backup e restauração D1 + R2 |
| `docs/f7/F7-02-release-checklist.md` | Checklist de release |
| `docs/f7/F7-03-plano-reversao.md` | Plano de rollback |
| `docs/f7/F7-04-go-live-evidencias.md` | Evidências de go-live |
| `docs/f8/F8-02-retirada-legado.md` | Inventário e plano de retirada do Supabase |
| `docs/f8/F8-03-supabase-destino.md` | Decisão sobre recursos Supabase |

---

*Guia gerado em F8-04. Manter atualizado conforme novos módulos forem entregues.*
