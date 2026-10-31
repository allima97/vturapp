# F7-04 Go-Live e Registro de Evidências

**Uso:** preencher durante e após a janela de publicação em produção.  
**Privacidade:** não registrar dados pessoais de usuários reais neste documento.

---

## 1. Janela de Publicação

| Campo | Valor |
|---|---|
| Data/hora planejada | _____________ |
| Data/hora real | _____________ |
| Responsável | _____________ |
| SHA deployado | _____________ |
| Versão anterior (SHA) | _____________ |

---

## 2. Verificações de Go-Live

Execute cada item na ordem. Registre ✓ ou ✗ + observação.

### 2.1 Infraestrutura

| Check | OK? | Observação |
|---|---|---|
| `GET /api/v2/health` → 200 JSON `{status:"ok"}` | | |
| Cloudflare Workers → Status: Active | | |
| D1 migrations: zero pendentes | | |
| Secrets configurados (BETTER_AUTH_SECRET, RESEND_API_KEY, TURNSTILE_SECRET_KEY) | | |
| Turnstile: domínio de produção autorizado | | |

### 2.2 Autenticação e Permissões

| Check | OK? | Observação |
|---|---|---|
| Login com admin funciona | | |
| Login com operador funciona | | |
| Login com visualizador funciona | | |
| Papel exibido corretamente no menu/header | | |
| Sessão persiste após reload (cookie válido) | | |
| Logout limpa sessão | | |

### 2.3 Fluxo Principal

| Check | OK? | Observação |
|---|---|---|
| Criar cliente (admin) | | |
| Criar cliente (operador) | | |
| Criar venda (admin) | | |
| Criar venda (operador) | | |
| Visualizador: botão de criar venda ausente ou bloqueado | | |
| Listar vendas: exibe apenas da empresa do usuário logado | | |
| Resumo de vendas: totais corretos | | |

### 2.4 Arquivos (R2)

| Check | OK? | Observação |
|---|---|---|
| Upload de anexo de cliente | | |
| Download/visualização de anexo | | |
| Anexo de outra empresa inacessível (403) | | |

### 2.5 E-mail

| Check | OK? | Observação |
|---|---|---|
| Envio de convite: e-mail recebido | | |
| Link de convite: válido e funciona | | |
| E-mail de boas-vindas pós-convite-aceito | | |

### 2.6 Cron e Jobs Agendados

| Check | OK? | Observação |
|---|---|---|
| Cron `*/5 * * * *` listado em Workers → Triggers | | |
| Cron `0 3 * * *` listado em Workers → Triggers | | |
| Disparo manual de teste sem erro (Workers Dashboard → Run) | | |

### 2.7 Segurança

| Check | OK? | Observação |
|---|---|---|
| `GET /api/v2/vendas` sem cookie → 401 | | |
| Headers de segurança presentes (x-content-type-options, x-frame-options) | | |
| CSP presente na resposta | | |
| HTTPS ativo (certificado válido) | | |

---

## 3. Observabilidade Pós-deploy (primeiras 2h)

```bash
# Tail de logs em tempo real
wrangler tail --env production

# Verificar taxa de erros no Cloudflare Dashboard:
# Workers & Pages → vturapp → Metrics → Error rate
```

| Métrica | Valor após 30 min | OK? |
|---|---|---|
| Taxa de erro 5xx | < 0.1% | |
| Taxa de erro 4xx (exceto 401/404 esperados) | < 1% | |
| p95 latência health | < 50 ms | |

---

## 4. Decisão Final

- [ ] **GO** — todos os checks críticos passaram; sistema operacional
- [ ] **NO-GO** — reverter (ver F7-03) e reagendar

**Resultado:** ___________  
**Observação:** ___________

---

## 5. Post-Launch (próximas 24–48h)

- [ ] Monitorar Workers Metrics por 24h
- [ ] Verificar e-mails entregues/bounced em Resend Dashboard
- [ ] Confirmar que crons executaram sem erro
- [ ] Registrar custo estimado do período (D1 reads/writes, R2 operações)
- [ ] Comunicar equipe: lançamento concluído

---

*Documento gerado em F7-04. Não inserir dados pessoais de usuários reais.*
