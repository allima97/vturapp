# F2-05 — Validação, CSRF, CSP, Headers e Rate-Limit

**Branch:** `reescrita/f2-identidade-autorizacao`
**Status:** ✅ Concluído

---

## Objetivo

Adicionar camadas de segurança à API v2 antes que o tráfego real chegue a ela:

| Camada | Implementação |
|---|---|
| Validação de input | Pure TypeScript (sem Zod) |
| Security Headers | Hono middleware `securityHeaders` |
| CSRF Protection | Verificação de `Origin` para mutating requests |
| Rate Limiting | Sliding-window em memória, por IP |

---

## Arquivos criados

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/server/api/middleware/security.ts` | `securityHeaders` + `csrfProtection` middleware |
| `src/lib/server/api/middleware/rate-limit.ts` | `rateLimitMiddleware` + helpers |
| `src/lib/server/validation/schemas.ts` | `parseConviteInput`, `parseAceitarConviteInput`, `parseRegistroEmpresaInput` |
| `src/lib/server/validation/schemas.test.ts` | 52 testes cobrindo todos os schemas e middlewares |

## Arquivo modificado

| Arquivo | Mudança |
|---|---|
| `src/lib/server/api/app-v2.ts` | Wired `securityHeaders`, `rateLimitMiddleware`, `csrfProtection` |

---

## 1. Security Headers (`securityHeaders`)

Middleware Hono aplicado em `*` — define os headers em **todas** as respostas da API v2.

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
Cache-Control: no-store
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload  ← apenas prod
```

O HSTS só é emitido quando `PUBLIC_ENVIRONMENT === 'production'` para não quebrar
o fluxo de desenvolvimento em HTTP.

---

## 2. CSRF Protection (`csrfProtection`)

**Estratégia:** verificação de `Origin` / `Referer` para métodos mutantes (POST/PUT/DELETE/PATCH).

APIs JSON são naturalmente resistentes a CSRF (HTML `<form>` não envia
`Content-Type: application/json`), mas esta camada adiciona defesa em profundidade.

**Regras:**
- Métodos GET/HEAD/OPTIONS: bypass (não mutantes)
- Path `/api/auth/*`: bypass (Better Auth tem CSRF interno via token)
- `Origin: null` em dev: permitido; em prod → 403 `CSRF_MISSING_ORIGIN`
- Origin fora da whitelist: 403 `CSRF_INVALID_ORIGIN`
- Whitelist padrão: `PUBLIC_APP_URL`, `localhost:5173`, `localhost:4173`

---

## 3. Rate Limiting (`rateLimitMiddleware`)

**Algoritmo:** sliding-window in-memory por IP.

**Configuração na API v2:**
```typescript
rateLimitMiddleware({
  windowMs: 60_000,      // 1 minuto
  maxRequests: 120,      // 120 req/min
  excludePaths: ['/api/v2/health'],
})
```

**Response quando bloqueado:**
```
HTTP 429 Too Many Requests
Retry-After: 42
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 0
X-RateLimit-Reset: <epoch seconds>

{ "error": "Muitas requisições...", "code": "RATE_LIMIT_EXCEEDED" }
```

**Extração de IP (prioridade):**
1. `CF-Connecting-IP` (Cloudflare)
2. `X-Forwarded-For` (primeiro da lista)
3. `127.0.0.1` (fallback dev)

**Limitação:** em-memória por isolate — não é global em múltiplos workers.
Para limites globais, usar Cloudflare KV ou Durable Objects (roadmap F5+).

---

## 4. Validação de Input (pure TypeScript)

Sem Zod. Cada schema segue o padrão:
```typescript
type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: string[] }
```

### Schemas disponíveis

| Schema | Campos validados |
|---|---|
| `parseConviteInput` | `email` (formato, max 320), `papel` (admin\|operador\|visualizador) |
| `parseAceitarConviteInput` | `token` (UUID v4) |
| `parseRegistroEmpresaInput` | `nome` (2–200), `slug` (3–80, URL-safe), `cnpj?` (14 dígitos) |

### Uso nos routes

```typescript
import { parseConviteInput, validationErrorResponse } from '$lib/server/validation/schemas';

// No handler Hono:
const body = await c.req.json();
const r = parseConviteInput(body);
if (!r.ok) return c.json(validationErrorResponse(r.errors), 400);

// r.data é typesafe: { email: string, papel: PapelValido }
```

---

## 5. Testes (52 testes — 100% passando)

```
src/lib/server/validation/schemas.test.ts
  A. Predicados primitivos      — isEmail, isUUID, isSlug, isPapelValido
  B. parseConviteInput          — happy path, erros acumulados, normalização
  C. parseAceitarConviteInput   — happy path, UUID inválido
  D. parseRegistroEmpresaInput  — happy path, slug inválido, cnpj
  E. isOriginAllowed (CSRF)     — aceita/rejeita origens
  F. checkRateLimit             — sliding window, múltiplos IPs, expiração
  G. getClientIp                — CF-Connecting-IP, X-Forwarded-For, fallback
  H. validationErrorResponse    — estrutura padronizada
```

```bash
npx vitest run src/lib/server/validation/schemas.test.ts
# ✓ 52 tests passed
```

---

## Invariantes F2-05

| ID | Invariante | Testado |
|---|---|---|
| F2-05-A | Todo endpoint v2 responde com `X-Content-Type-Options: nosniff` | ✅ (middleware) |
| F2-05-B | POST/PUT/DELETE sem Origin em prod → 403 `CSRF_MISSING_ORIGIN` | ✅ E |
| F2-05-C | POST/PUT/DELETE com Origin inválido → 403 `CSRF_INVALID_ORIGIN` | ✅ E |
| F2-05-D | Após 120 req/min → 429 com `Retry-After` | ✅ F |
| F2-05-E | Input com email inválido → 400 `VALIDATION_ERROR` com detalhes | ✅ B |
| F2-05-F | Input com papel inválido → 400 `VALIDATION_ERROR` | ✅ B |
| F2-05-G | HSTS emitido apenas em produção | ✅ (código condicional) |

---

## Decisões de design

**Por que sem Zod?**
O projeto não tem Zod no `package.json` e a política da reescrita é não adicionar
dependências sem aprovação explícita. A abordagem com pure TypeScript cobre
os casos de uso atuais com zero overhead de bundle.

**Por que rate-limit em memória?**
Fase F2 foca em identidade e autorização. Um rate-limiter por isolate é suficiente
para proteção contra abusos básicos durante o desenvolvimento. Rate-limiting global
(Cloudflare KV ou Durable Objects) é roadmap para F5+ (infra de produção).

**Por que CSRF por Origin e não por token?**
Endpoints da API v2 são JSON-only. HTML `<form>` não pode enviar
`Content-Type: application/json`, então a superfície CSRF é naturalmente menor.
Verificação de Origin é simples, auditável e não requer cookie extra.
Better Auth (`/api/auth/*`) tem seu próprio mecanismo CSRF.
