# F8-02 Retirada do Legado — Inventário e Plano

**Status:** PLANEJADO  
**Dependência:** Deploy v2 estável em produção (F7-04 concluído)

> **Regra:** nenhum arquivo legado é apagado automaticamente pelo deploy.
> Cada remoção é explícita, revisada e commitada separadamente.

---

## 1. SDKs e Dependências Supabase

### 1.1 Dependências a remover (após desligamento confirmado)

```bash
npm uninstall @supabase/supabase-js @supabase/ssr supabase
```

| Pacote | Versão atual | Status |
|---|---|---|
| `@supabase/supabase-js` | ^2.0.0 | REMOVER após F8-03 |
| `@supabase/ssr` | ^0.8.0 | REMOVER após F8-03 |
| `supabase` (CLI) | ^2.92.1 | REMOVER após F8-03 |

**Pré-requisito:** nenhuma rota v1 ativa em produção (verificar Analytics antes).

### 1.2 Arquivos de tipo Supabase a remover

- `src/app.d.ts` — remover referências a `SupabaseClient` e `Session` do Supabase
  (substituir pelos tipos do Better Auth / contexto próprio)

---

## 2. Stores e Módulos Legado no Cliente

Arquivos com referências Supabase fora do contexto de servidor:

| Arquivo | Referência | Ação |
|---|---|---|
| `src/lib/stores/auth.ts` | `createClient` Supabase | Reescrever com Better Auth client |
| `src/lib/stores/permissoes.ts` | `supabase.from(...)` | Reescrever com fetch `/api/v2/` |
| `src/lib/mural/helpers.ts` | Supabase realtime | Substituir por polling (ADR-008) |
| `src/lib/quote/exportQuotePdfClient.ts` | Supabase storage | Substituir por R2 presigned URL |
| `src/lib/cards/themeAssetMeta.ts` | Supabase storage | Substituir por R2 |
| `src/lib/conciliacao/source.ts` | Supabase query | M06 ADIADO — manter até decisão |
| `src/lib/conciliacao/vendaRanking.ts` | Supabase query | M06 ADIADO |
| `src/lib/conciliacao/baixaRac.ts` | Supabase query | M06 ADIADO |

---

## 3. Módulos Servidor Legado (src/lib/server/*.ts)

Arquivos que usam Supabase no servidor e ainda não têm equivalente v2:

| Arquivo | Função | Ação |
|---|---|---|
| `clientes.ts` | Supabase queries clientes | SUBSTITUÍDO por `clientes/service.ts` — apagar |
| `admin.ts` | Supabase admin SDK | Avaliar migração para Better Auth admin |
| `vendasSave.ts` | Supabase insert vendas | SUBSTITUÍDO por `vendas/service.ts` — apagar |
| `readModelRebuild.ts` | Cron rebuild Supabase | OBSOLETO por ADR-007 — apagar |
| `readModelRowGuard.ts` | Guard do read model | OBSOLETO — apagar com rebuild |
| `conciliacaoReconcile.ts` | Supabase conciliação | M06 ADIADO — manter com aviso |
| `comissoes.ts` | Supabase comissões | M05 EXCLUÍDO — manter como arquivo morto |
| `comissoes-registro.ts` | Supabase comissões | M05 EXCLUÍDO — manter como arquivo morto |
| `fornecedores.ts` | Supabase fornecedores | M03 ADIADO — manter |
| `relatorios.ts` | Supabase relatórios | Avaliar na fase de relatórios |
| `passkeys.ts` | Supabase passkeys | SUBSTITUÍDO por Better Auth — apagar |
| `salesScope.ts` | Helper de escopo Supabase | OBSOLETO — apagar |
| `vendas-kpis.ts` | KPIs via Supabase | Reescrever via D1 em F9+ |

---

## 4. Rotas API v1 a Desativar

Listar rotas v1 ainda ativas e verificar uso via Analytics:

```bash
# Verificar tráfego das rotas v1 nos últimos 30 dias
# Cloudflare Dashboard → Workers → Analytics → por rota
# Filtrar: /api/v1/*
```

Rotas v1 candidatas a desativação (após tráfego = 0 por 7 dias):

- `/api/v1/vendas/*` → equivalente em `/api/v2/vendas/*`
- `/api/v1/clientes/*` → equivalente em `/api/v2/clientes/*`
- `/api/v1/invites/*` → equivalente em `/api/v2/invites/*`

**Procedimento:**
1. Adicionar header de deprecação: `Deprecation: true`, `Sunset: <data>`
2. Aguardar 30 dias (ou acordo com usuários da API)
3. Remover rota do `sveltekit-v1.ts` ou `app-v1.ts`

---

## 5. Secrets e Permissões a Remover

Após desativação confirmada do Supabase:

```bash
# Revogar secrets Supabase no Cloudflare
wrangler secret delete PUBLIC_SUPABASE_URL --env production
wrangler secret delete PUBLIC_SUPABASE_ANON_KEY --env production
wrangler secret delete SUPABASE_SERVICE_ROLE_KEY --env production

# Verificar se foi removido
wrangler secret list --env production
```

No Supabase Dashboard:
- [ ] Revogar API keys do projeto (após dados exportados)
- [ ] Desativar webhooks Supabase apontando para Workers
- [ ] Cancelar plano Supabase (decidir conforme F8-03)

---

## 6. Crons e Webhooks a Remover

| Cron/Webhook | Plataforma | Status |
|---|---|---|
| Rebuild do read model | Workers (cron nightly) | REMOVIDO em F5-02 (ADR-007) |
| Webhook Supabase → Worker | Supabase | Verificar e remover |
| Edge Function Supabase (se houver) | Supabase | Inventariar e remover |

---

## 7. Documentação Obsoleta a Arquivar

- [ ] Mover docs Supabase para `docs/legado/` (não apagar — referência histórica)
- [ ] Atualizar `README.md`: remover referências a Supabase
- [ ] Atualizar `docs/PROGRESSO-MIGRACAO.md`: marcar migração concluída

---

## 8. Ordem de Execução Recomendada

```
1. Confirmar 0 erros v2 em produção por 7 dias
2. Verificar tráfego v1 → zero por 7 dias
3. Remover rotas v1 (commit)
4. Remover arquivos servidor legado que têm substituto v2 (commit por grupo)
5. Remover secrets Supabase do Cloudflare
6. Desativar projeto Supabase (F8-03)
7. npm uninstall @supabase/* (commit)
8. Limpar src/app.d.ts e stores (commit)
9. Verificar: npm run check, npm run build, npm run test
```

*Gerado em F8-02. Cada remoção deve ser um commit atômico e revisado.*
