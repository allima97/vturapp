# F2-06 — Proibir Endpoints Debug em Produção, Segredos e Logs Seguros

**Branch:** `reescrita/f2-identidade-autorizacao`
**Status:** ✅ Concluído

---

## Objetivo

Garantir que a API v2 seja segura antes de receber tráfego real em produção:

| Proteção | Implementação |
|---|---|
| Bloquear endpoints de diagnóstico/prova em produção | `productionGuard` middleware |
| Nunca vazar segredos em logs ou respostas | `safe-logger` com `sanitize()` |
| Stack trace omitido em produção | `sanitizeError()` condicional |

---

## Arquivos criados

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/server/api/middleware/production-guard.ts` | Middleware que bloqueia paths de debug em produção |
| `src/lib/server/api/middleware/safe-logger.ts` | `sanitize()`, `safeLog()`, `sanitizeError()` |
| `src/lib/server/api/middleware/production-guard.test.ts` | 23 testes cobrindo guard + logger |

## Arquivo modificado

| Arquivo | Mudança |
|---|---|
| `src/lib/server/api/app-v2.ts` | Wired `productionGuard` |

---

## 1. Production Guard (`productionGuard`)

Bloqueia acesso a paths de diagnóstico/prova quando `PUBLIC_ENVIRONMENT === 'production'`.

**Paths bloqueados (prefixos):**
```
/api/v2/f2-proof/*
/api/v2/debug/*
/api/v2/diagnostics/*
/api/v2/test/*
/api/v2/internal/*
```

**Resposta em produção:** `404 NOT_FOUND` — deliberadamente 404 (não 403) para não revelar que o endpoint existe.

**Em desenvolvimento/staging:** passa direto (nenhum bloqueio).

---

## 2. Safe Logger (`safe-logger`)

### Campos sempre redacted

Qualquer campo cujo nome case-insensitive corresponda a:

```
password, senha, secret, token, access_token, refresh_token,
id_token, api_key, apikey, authorization, cookie, set-cookie,
better_auth_secret, resend_api_key, private_key, cpf, cnpj,
credit_card, card_number
```

### `sanitize(data)` — remoção recursiva

```typescript
import { sanitize } from '$lib/server/api/middleware/safe-logger';

const safe = sanitize({
  userId: '123',
  password: 'super-secret',   // → '[REDACTED]'
  auth: { token: 'tok123' },  // → { token: '[REDACTED]' }
});
```

### `safeLog(level, message, data?)` — log seguro

```typescript
import { safeLog } from '$lib/server/api/middleware/safe-logger';

// ✅ Seguro
safeLog('info', 'Convite criado', { empresaId: 1, email: 'a@b.com' });

// ❌ Nunca logar diretamente (safeLog protege, mas evitar padrão)
// console.log('Auth', { password: req.body.password });
```

### `sanitizeError(err, isProd)` — stack trace condicional

```typescript
const entry = sanitizeError(err, PUBLIC_ENVIRONMENT === 'production');
// isProd=true  → { name, message }          (sem stack)
// isProd=false → { name, message, stack }   (com stack para debug)
```

---

## 3. Auditoria de variáveis de ambiente sensíveis

**Princípio:** segredos entram no sistema via Cloudflare Workers Secrets (`wrangler secret put`), nunca via `.env` commitado ou corpo de resposta HTTP.

**Checklist F2-06:**
- [x] `BETTER_AUTH_SECRET` — injetado via `wrangler secret put BETTER_AUTH_SECRET`
- [x] `RESEND_API_KEY` — injetado via `wrangler secret put RESEND_API_KEY`
- [x] `DB` / `KV_BINDING` — bindings do wrangler.toml (sem segredo em texto)
- [x] `PUBLIC_ENVIRONMENT` e `PUBLIC_APP_URL` — valores públicos, sem segredo

**Nenhum segredo aparece em:**
- Respostas de erro (handleApiError não serializa o objeto original)
- Logs via `safeLog` (campos redacted automaticamente)
- Headers de resposta (nenhum header vaza binding ou secret)

---

## 4. Testes (23 testes — 100% passando)

```
src/lib/server/api/middleware/production-guard.test.ts
  A. isDebugPath          — identifica paths de debug/prova
  B. isProduction         — identifica ambiente corretamente
  C. productionGuard      — bloqueia em prod (404), libera em dev
  D. isSensitiveKey       — detecta chaves sensíveis (case-insensitive)
  E. sanitize             — remove campos recursivamente, preserva original
  F. sanitizeError        — stack trace condicional por ambiente
```

```bash
npx vitest run src/lib/server/api/middleware/production-guard.test.ts
# ✓ 23 tests passed
```

---

## Invariantes F2-06

| ID | Invariante | Testado |
|---|---|---|
| F2-06-A | `/api/v2/f2-proof/*` retorna 404 em produção | ✅ C |
| F2-06-B | `/api/v2/f2-proof/*` retorna 200 em desenvolvimento | ✅ C |
| F2-06-C | Rotas normais não são afetadas pelo guard em produção | ✅ C |
| F2-06-D | `sanitize()` redact campos sensíveis sem modificar original | ✅ E |
| F2-06-E | `isSensitiveKey` é case-insensitive | ✅ D |
| F2-06-F | `sanitizeError` omite stack trace em produção | ✅ F |
| F2-06-G | `BETTER_AUTH_SECRET` e `RESEND_API_KEY` nunca em resposta HTTP | ✅ (handleApiError) |

---

## Decisões de design

**Por que 404 e não 403 para endpoints bloqueados?**
Um 403 revela que o endpoint existe e que o caller não tem permissão.
Um 404 não revela informação sobre a topologia interna da API.
Isso segue o princípio de "security through obscurity" como camada adicional,
não como única defesa.

**Por que `safe-logger` e não uma lib de logging existente?**
O projeto tem política de zero-dependência nova sem aprovação. Um logger
seguro com ~80 linhas de código puro cobre o caso de uso sem adicionar
dependências de terceiros.

**Chave `cnpj` na lista de redacted?**
CNPJ é dado corporativo público no Brasil, mas pode ser usado como identificador
em ataques de engenharia social. Por precaução, é redacted em logs. A validação
no schema (F2-05) ainda o aceita como input.
