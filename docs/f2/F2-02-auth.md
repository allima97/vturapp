# F2-02 — Auth Completa: Convites, Verificação, Recuperação, Sessões

**Branch:** `reescrita/f2-identidade-autorizacao`  
**Status:** Implementado

## O que foi feito

Implementação completa da camada de autenticação e convites sobre Better Auth + D1, paralela à camada Supabase existente.

### 1. Email de verificação e recuperação de senha

`src/lib/auth.ts` atualizado com:

```typescript
createAuth(d1, secret, baseURL?, resendApiKey?)
```

- `sendVerificationEmail` via Resend quando `resendApiKey` fornecido
- `sendResetPassword` via Resend
- `requireEmailVerification: true` apenas quando `resendApiKey` presente
- Em dev (sem key): log para console, sem envio real

### 2. Serviço de convites

`src/lib/server/invites/service.ts`:

| Função | O que faz |
|--------|-----------|
| `criarConvite()` | Gera token UUID, salva em `convites`, envia e-mail via Resend |
| `getConvite()` | Valida token (expirado? aceito?), retorna info da empresa |
| `aceitarConvite()` | Cria conta Better Auth → vincula empresa → cria membro |

**Tipo de erro:** `ConviteError` com `code: ConviteErrorCode` para respostas precisas.

### 3. Contexto de auth para handlers Hono

`src/lib/server/auth/context.ts`:

```typescript
const ctx = await resolveAuthContext(headers, d1, secret, baseURL);
// ctx: { userId, userEmail, empresaId, papel } | null
```

Fluxo: sessão Better Auth → `user.empresa_id` → `membros_empresa.papel`.

### 4. API v2 — Hono `/api/v2`

Nova app Hono paralela em `src/lib/server/api/app-v2.ts`.

#### Rotas

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/api/v2/health` | — | Health check |
| POST | `/api/v2/invites` | admin | Criar convite |
| GET | `/api/v2/invites/:token` | — | Consultar convite |
| POST | `/api/v2/invites/:token/accept` | — | Aceitar convite |

#### Catch-all SvelteKit

`src/routes/api/v2/[...path]/+server.ts` → `apiHandlerV2` → `app-v2.ts`

### 5. Tipos atualizados

`src/app.d.ts` — `App.Locals` agora inclui:
- `betterAuthUser?: {...} | null`
- `betterAuthSession?: {...} | null`
- `empresaId?: number | null`
- `papel?: Papel | null`

`src/lib/server/api/types.ts` — `ApiEnv.Bindings` agora inclui:
- `BETTER_AUTH_SECRET: string`
- `RESEND_API_KEY: string`
- `PUBLIC_APP_URL?: string`

## Testar localmente

```bash
# Iniciar com wrangler (D1 local disponível)
npm run dev:cf

# Health check v2
curl http://localhost:8787/api/v2/health

# Criar convite (requer sessão admin)
curl -X POST http://localhost:8787/api/v2/invites \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=<token>" \
  -d '{"email":"novo@example.com","papel":"operador"}'

# Consultar convite (público)
curl http://localhost:8787/api/v2/invites/<token>

# Aceitar convite (público)
curl -X POST http://localhost:8787/api/v2/invites/<token>/accept \
  -H "Content-Type: application/json" \
  -d '{"nome":"João Silva","senha":"senha123"}'
```

## Aplicar migração D1

Migração F2-01 (`drizzle/0002_f2_schema_dominio.sql`) já criou as tabelas `membros_empresa` e `convites`. Nenhuma nova migração de schema em F2-02.

## Decisões de design

1. **API v2 separada**: `/api/v2` criada paralela ao `/api/v1` para não quebrar as 400+ rotas existentes. F3+ migrará domínios um a um para v2.
2. **Sem modificação do hooks.server.ts**: O hooks existente é complexo e depende de Supabase. O contexto de auth Better Auth é resolvido dentro dos handlers Hono via `resolveAuthContext()`.
3. **requireEmailVerification condicional**: Em dev (sem Resend key), a verificação é desativada para facilitar o ciclo de desenvolvimento.
4. **ConviteError tipado**: Erros de negócio têm `code` explícito para que a camada de API possa retornar status HTTP precisos (404, 409, 422).
