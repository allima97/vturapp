# F7-02 Release Checklist — vturapp v2

**Uso:** preencher antes de cada deploy em staging e produção.  
**Responsável:** Admin técnico.

---

## 0. Pré-requisitos

- [ ] Branch `reescrita/f2-identidade-autorizacao` aprovada em PR
- [ ] CI passa: `npm run test`, `npm run check`, `npm run build`
- [ ] SHA do commit registrado abaixo: `____________________________`
- [ ] Migrations listadas e revisadas: `wrangler d1 migrations list --env <env>`

---

## 1. Migrations

### Staging

```bash
# Verificar quais estão pendentes
wrangler d1 migrations list vturapp-db-staging --env staging

# Aplicar explicitamente (nunca "auto-apply" em produção)
npm run d1:migrate:staging
# equivale a:
# wrangler d1 migrations apply vturapp-db-staging --env staging
```

- [ ] Migrations aplicadas em staging
- [ ] Resultado verificado: `wrangler d1 migrations list vturapp-db-staging --env staging` → nenhuma pendente

### Produção

```bash
wrangler d1 migrations list vturapp-db --env production
npm run d1:migrate:prod
```

- [ ] Migrations aplicadas em produção
- [ ] Resultado verificado: zero pendentes

---

## 2. Secrets e variáveis de ambiente

Verificar via `wrangler secret list --env <env>` que os seguintes secrets estão configurados:

| Secret | Staging | Produção |
|---|---|---|
| `BETTER_AUTH_SECRET` | [ ] | [ ] |
| `RESEND_API_KEY` | [ ] | [ ] |
| `TURNSTILE_SECRET_KEY` | [ ] | [ ] |

Verificar `wrangler.toml` para variáveis públicas:

| Variável | Valor esperado | OK? |
|---|---|---|
| `PUBLIC_ENVIRONMENT` | `staging` / `production` | [ ] |
| `VITE_PUBLIC_TURNSTILE_SITE_KEY` | chave correta do domínio | [ ] |
| `CF_PAGES_URL` | URL real do ambiente | [ ] |

---

## 3. Domínio e DNS

- [ ] Domínio configurado no Cloudflare Pages/Workers
- [ ] HTTPS ativo (certificado provisionado automaticamente)
- [ ] Turnstile: domínio adicionado em dash.cloudflare.com → Turnstile → site key → Allowed Origins
  - Adicionar: `https://<domínio-staging>` e `https://<domínio-produção>`
  - Sem Turnstile configurado → erro 400020 na página de login

---

## 4. E-mail (Resend)

- [ ] Domínio de envio verificado em resend.com (registro SPF/DKIM no DNS)
- [ ] Testar envio de convite em staging:
  ```bash
  # Criar convite via API e confirmar recebimento do e-mail
  curl -X POST https://<staging-url>/api/v2/invites \
    -H "Cookie: session=<token>" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","papel":"operador"}'
  ```
- [ ] E-mail recebido com link de convite válido
- [ ] Link de convite funciona (redireciona para `/invite/accept`)

---

## 5. Passkeys e autenticação (Better Auth)

- [ ] `BETTER_AUTH_SECRET` único por ambiente (nunca reutilizar entre staging e produção)
- [ ] `CF_PAGES_URL` correto (Better Auth usa para construir URLs de callback)
- [ ] Testar fluxo de login com e-mail + senha em staging
- [ ] Testar criação de passkey (se habilitado) em staging
- [ ] Cookie de sessão: `Secure`, `HttpOnly`, `SameSite=Lax` — verificar em DevTools → Application → Cookies

---

## 6. Cron Jobs

Verificar `wrangler.toml` → `[triggers]`:

```toml
[triggers]
crons = ["*/5 * * * *", "0 3 * * *"]
```

- [ ] Crons registrados no Cloudflare (verificar em Workers → Triggers)
- [ ] Testar disparo manual via Dashboard ou:
  ```bash
  wrangler dev --test-scheduled
  # ou via API: POST /cdn-cgi/handler/scheduled
  ```

---

## 7. R2 (armazenamento de arquivos)

- [ ] Bucket criado: `wrangler r2 bucket create vturapp-files --env production`
- [ ] CORS configurado no bucket (se houver upload direto do browser)
- [ ] Testar upload de anexo de cliente em staging

---

## 8. KV (sessões / cache)

- [ ] Namespace criado e ID atualizado no `wrangler.toml`
- [ ] Verificar: `wrangler kv list --namespace-id <ID> --env production`

---

## 9. Deploy

```bash
# Staging
wrangler deploy --env staging

# Produção (após validação em staging)
wrangler deploy --env production
```

- [ ] Deploy staging: sem erros
- [ ] Deploy produção: sem erros
- [ ] SHA do deploy confirmado: `wrangler deployments list` → SHA = `____________`

---

## 10. Smoke test pós-deploy

Executar manualmente em cada ambiente após o deploy:

| Ação | Staging | Produção |
|---|---|---|
| Acessar `/` → redireciona para login | [ ] | [ ] |
| Login com admin | [ ] | [ ] |
| Verificar papel exibido no menu | [ ] | [ ] |
| Criar cliente | [ ] | [ ] |
| Criar venda | [ ] | [ ] |
| Verificar e-mail de confirmação | [ ] | [ ] |
| Upload de anexo | [ ] | [ ] |
| GET `/api/v2/health` → 200 | [ ] | [ ] |

---

## 11. Observabilidade

- [ ] Cloudflare Workers → Logs → verificar ausência de erros nas primeiras requisições
- [ ] Configurar alertas de taxa de erro > 1% no Cloudflare (se disponível no plano)

---

**SHA do commit deployado:** `_______________________`  
**Data do deploy:** `_______________________`  
**Responsável:** `_______________________`
