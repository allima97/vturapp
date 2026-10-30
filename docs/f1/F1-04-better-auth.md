# F1-04 — Prova Better Auth em D1/Workers

**Branch**: `reescrita/f1-prova-stack`  
**Status**: ✅ CONCLUÍDO  
**Data**: 2026-10-26

---

## Objetivo

Provar que Better Auth funciona no runtime Cloudflare Workers com D1:

- Auth instance criada por request (factory pattern — Workers stateless)
- Schema Drizzle compatível com Better Auth (user, session, account, verification)
- Rota `GET|POST /api/auth/[...auth]` captura todos os handlers Better Auth
- Plugin `twoFactor()` configurado (TOTP — prova que plugins D1-dependent funcionam)
- Cliente Svelte (`authClient`) com tipagem correta

---

## Versão instalada

| Pacote | Versão |
|--------|--------|
| `better-auth` | `^1.7.13` |

O adaptador Drizzle está embutido em `better-auth/adapters/drizzle` (não precisa de pacote separado).

---

## Decisão de design: factory pattern para Workers

### Problema

Em Cloudflare Workers, o D1 binding (`env.DB`) só existe dentro de handlers
de request. Não há `process.env` nem `globalThis.DB` — o binding é injetado
pelo runtime no contexto de cada request.

Better Auth tradicional cria a instância no nível de módulo:
```ts
const db = new Database('./sqlite.db');   // ❌ Node.js — não funciona em Workers
export const auth = betterAuth({ database: db });
```

### Solução: factory por request

```ts
// src/lib/auth.ts
export function createAuth(d1: D1Database, secret: string): AuthInstance {
  const db = drizzle(d1, { schema });
  return betterAuth({
    secret,
    database: drizzleAdapter(db, { provider: 'sqlite' }),
    // ...
  });
}
```

```ts
// Em qualquer handler SvelteKit:
const auth = createAuth(event.platform?.env?.DB!, env.BETTER_AUTH_SECRET);
```

**Trade-off**: nova instância por request (overhead mínimo — Better Auth é lazy).
**Alternativa futura**: cache da instância com WeakMap por D1 binding se necessário.

---

## Arquivos criados

| Arquivo | Descrição |
|---------|-----------|
| `src/lib/auth.ts` | Factory `createAuth(d1, secret)` |
| `src/lib/auth-client.ts` | `authClient` Svelte com plugin twoFactorClient |
| `src/routes/api/auth/[...auth]/+server.ts` | Handler GET/POST para todas as rotas Better Auth |
| `drizzle/0001_auth_schema.sql` | Migration: tabelas user/session/account/verification |
| `src/lib/server/db/schema.ts` | Tabelas Better Auth adicionadas ao schema Drizzle |

---

## Schema Better Auth (Drizzle/SQLite)

Datas usam `integer({ mode: 'timestamp_ms' })` — convenção do Better Auth para
SQLite. **Exceção intencional ao ADR-005** (que se aplica a tabelas de negócio).

```typescript
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
// + session, account, verification (ver schema.ts)
```

---

## Plugins configurados

| Plugin | Fase de implementação de UI |
|--------|---------------------------|
| `twoFactor()` (servidor) | F2-02 |
| `twoFactorClient()` (cliente) | F2-02 |
| `passkey()` (WebAuthn) | A avaliar em F2-02 |
| `sveltekitCookies()` | F2-02 — requer SvelteKit 2.20+ |

---

## Endpoints Better Auth disponíveis

Após `npm run dev:cf` e migração D1:

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/api/auth/sign-up/email` | Criar conta |
| `POST` | `/api/auth/sign-in/email` | Login |
| `POST` | `/api/auth/sign-out` | Logout |
| `GET`  | `/api/auth/session` | Sessão atual |
| `POST` | `/api/auth/two-factor/enable` | Ativar TOTP |
| `POST` | `/api/auth/two-factor/verify-totp` | Verificar código TOTP |

---

## Como testar

```bash
# 1. Configurar secret em .dev.vars
echo 'BETTER_AUTH_SECRET=sua-chave-com-pelo-menos-32-chars' >> .dev.vars

# 2. Aplicar migrations D1 local
npm run d1:migrate:local

# 3. Iniciar wrangler dev
npm run dev:cf

# 4. Testar cadastro
curl -X POST http://localhost:8787/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"name":"Teste","email":"teste@exemplo.com","password":"senha123"}'

# 5. Testar login
curl -X POST http://localhost:8787/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"teste@exemplo.com","password":"senha123"}'

# 6. Verificar sessão
curl http://localhost:8787/api/auth/session \
  -H 'Cookie: <cookie-do-login>'
```

---

## Integração com hooks.server.ts (F2-02)

Em F2-02, o `hooks.server.ts` será atualizado para:
1. Remover a auth Supabase
2. Adicionar Better Auth via `svelteKitHandler`
3. Popular `event.locals.user` e `event.locals.session`

```typescript
// F2-02: hooks.server.ts
import { createAuth } from '$lib/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';

export const handle: Handle = async ({ event, resolve }) => {
  const auth = createAuth(
    event.platform?.env?.DB!,
    event.platform?.env?.BETTER_AUTH_SECRET!
  );

  const session = await auth.api.getSession({ headers: event.request.headers });
  if (session) {
    event.locals.session = session.session;
    event.locals.user = session.user;
  }

  return svelteKitHandler({ event, resolve, auth, building });
};
```

---

## Próximos passos

- **F1-05**: Provar upload/download privado R2
- **F2-02**: Migrar autenticação de Supabase → Better Auth
- **F2-02**: Adicionar `empresa_id` à tabela `user` para isolamento multi-tenant

---

## Referências

- `docs/adr/ADR-002-autenticacao.md` — decisão de autenticação
- [Better Auth — SvelteKit](https://www.better-auth.com/docs/integrations/svelte-kit)
- [Better Auth — Drizzle Adapter](https://www.better-auth.com/docs/adapters/drizzle)
- [Better Auth — Two Factor](https://www.better-auth.com/docs/plugins/two-factor)
