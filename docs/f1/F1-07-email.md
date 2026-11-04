# F1-07 — Prova de E-mail Transacional via Resend API HTTP em Workers

**Branch**: `reescrita/f1-prova-stack`  
**Status**: ✅ CONCLUÍDO  
**Data**: 2026-10-26

---

## Objetivo

Provar que e-mail transacional funciona no runtime Cloudflare Workers:

- **Sem nodemailer** (requer Node.js net/tls — não disponível em Workers)
- **Sem SDK Resend** (adiciona dependência desnecessária — fetch nativo é suficiente)
- **Resend API HTTP pura** via `fetch()` — funciona nativamente em Workers
- Retry simples para falhas 5xx
- Template HTML inline (sem engine de template)

---

## Por que não SMTP em Workers

| Abordagem | Funciona em Workers? | Motivo |
|-----------|---------------------|--------|
| `nodemailer` + SMTP | ❌ | Requer `net` e `tls` do Node.js (não disponível) |
| Resend SMTP (smtp.resend.com:465) | ❌ | TCP/465 bloqueado pelo runtime Workers |
| Resend API HTTP REST | ✅ | `fetch()` nativo — funciona perfeitamente |
| AWS SES API HTTP | ✅ | Mesma abordagem, mas mais complexo (auth Sigv4) |
| SendGrid API HTTP | ✅ | Similar ao Resend |

**Conclusão**: em Cloudflare Workers, **somente APIs HTTP** funcionam para e-mail.
Resend é a melhor opção pelo developer experience e deliverability.

---

## Arquitetura

```
Hono Route /api/v1/email-proof/send
   │
   ├── Lê RESEND_API_KEY de env.event?.platform?.env
   ├── Gera template HTML (templateTesteStack)
   └── sendEmail(apiKey, payload)
        │
        └── fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: 'Bearer re_...' },
              body: JSON.stringify({ from, to, subject, html, text })
            })
```

---

## Arquivos criados

| Arquivo | Descrição |
|---------|-----------|
| `src/lib/server/email/client.ts` | `sendEmail()`, `sendEmailWithRetry()`, `ResendApiError`, `hasResendApiKey()` |
| `src/lib/server/email/templates.ts` | `templateTesteStack()`, `templateBoasVindas()` |
| `src/lib/server/email/index.ts` | Re-exportações |
| `src/lib/server/api/routes/email-proof/index.ts` | Rotas GET /status e POST /send |
| `src/lib/server/api/app.ts` | Rota `/email-proof` registrada |

---

## Segurança do cliente HTTP

```typescript
export async function sendEmail(apiKey: string, payload: ResendEmailPayload) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,    // API key nunca exposta na URL
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new ResendApiError(response.status, err.name, err.message);
  }

  return response.json() as Promise<{ id: string }>;
}
```

**Erros diferenciados**: `ResendApiError` distingue erros de validação (4xx — não
retenta) de erros de servidor (5xx — retenta com backoff).

---

## Como testar

```bash
# 1. Adicionar API key ao .dev.vars
echo 'RESEND_API_KEY=re_sua_chave_aqui' >> .dev.vars

# 2. Iniciar wrangler dev
npm run dev:cf

# 3. Verificar status da configuração
curl http://localhost:8787/api/v1/email-proof/status
# Resposta: { "configured": true, "hint": "RESEND_API_KEY presente..." }

# 4. Enviar e-mail de teste
curl -X POST http://localhost:8787/api/v1/email-proof/send \
  -H 'Content-Type: application/json' \
  -d '{"to": "seu@email.com"}'
# Resposta: { "success": true, "id": "re_xxxx", "to": "seu@email.com" }

# 5. Testar sem API key (503 esperado)
# Comentar RESEND_API_KEY em .dev.vars e reiniciar
curl -X POST http://localhost:8787/api/v1/email-proof/send \
  -d '{"to":"teste@teste.com"}'
# Resposta: { "error": "RESEND_API_KEY não configurado..." }
```

---

## Integração futura com Cron (F4-03)

O cron nightly (F1-02, `7 6 * * *`) precisará enviar e-mails de resumo.
Com `sendEmailWithRetry()` disponível, a integração é direta:

```typescript
// src/lib/server/cron/index.ts (F4-03)
async function handleNightly(env: ScheduledEnv, ctx: ExecutionContext) {
  const summary = await buildNightlySummary(env.DB);
  await sendEmailWithRetry(env.RESEND_API_KEY, {
    from: 'Vtur App <noreply@vturapp.com.br>',
    to: summary.adminEmails,
    subject: `Resumo diário — ${summary.date}`,
    html: templateResumoDiario(summary).html,
  });
}
```

O binding `RESEND_API_KEY` já está em `app.d.ts` (F1-02).

---

## Migração do sistema de e-mail atual (F2-04 / F4-03)

O sistema atual (`emailSettings.ts` + `welcome-email/root.ts`) usa:
- SMTP via `nodemailer` (lido de Supabase DB)
- Resend SMTP como provider SMTP (smtp.resend.com)

**Plano de migração:**
1. Substituir `resolveResendApiKey()` por leitura direta de `env.RESEND_API_KEY`
2. Substituir envio SMTP por `sendEmail()` do novo client
3. Manter template engine atual (`emailMarkdown.ts`) ou migrar para React Email

---

## Comparação: client atual vs novo

| Aspecto | emailSettings.ts atual | email/client.ts (F1-07) |
|---------|----------------------|------------------------|
| Runtime | Node.js (nodemailer) | Workers (fetch) |
| Config source | Supabase DB | env binding |
| SMTP | ✅ | ❌ (não funciona em Workers) |
| Resend API | Via SMTP relay | Via API HTTP direta |
| Retry | ❌ | ✅ (1 retry, configurável) |
| TypeScript | ⚠️ parcial | ✅ completo |

---

## Referências

- [Resend API Reference](https://resend.com/docs/api-reference/emails/send-email)
- [Cloudflare Workers — fetch API](https://developers.cloudflare.com/workers/runtime-apis/fetch/)
- `src/lib/server/email/client.ts` — implementação
- `docs/adr/ADR-002-autenticacao.md` — contexto de e-mail de auth (verification)
