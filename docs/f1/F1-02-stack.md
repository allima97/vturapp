# F1-02 — Validação do conjunto SvelteKit / Hono / Wrangler

**Branch**: `reescrita/f1-prova-stack`  
**Status**: ✅ CONCLUÍDO  
**Data**: 2026-10-26

---

## Objetivo

Provar que os três componentes centrais do stack — SvelteKit 2.x, Hono e
Wrangler/Workers — funcionam integrados com:

- Bindings D1 / R2 / KV propagados do `event.platform.env` para o contexto Hono
- Handler `scheduled()` nativo do Cloudflare Workers (sem endpoint HTTP público)
- TypeScript válido em toda a camada de tipos (`app.d.ts` → `ApiEnv` → `sveltekit.ts`)

---

## Decisão: adapter-cloudflare não suporta `customWorkerEntry`

### Contexto

`@sveltejs/adapter-cloudflare@7.2.8` expõe somente as opções `config`,
`fallback`, `routes` e `platformProxy`. **Não existe** `customWorkerEntry`
nesta versão.

O adapter gera `.svelte-kit/cloudflare/_worker.js` com:

```js
export default {
  async fetch(request, env, ctx) { /* SvelteKit SSR */ }
};
```

Para adicionar o handler `scheduled`, o Cloudflare Workers runtime espera
um **named export** `scheduled` no mesmo módulo ESM:

```js
export const scheduled = async (event, env, ctx) => { ... };
```

### Solução adotada: `scripts/inject-scheduled.mjs`

Script pós-build que appenda o export `scheduled` ao `_worker.js` gerado.

**Por que não um Vite plugin?**  
Um plugin `closeBundle` precisaria empacotar o TypeScript do cron em runtime
usando a API do esbuild — acoplamento desnecessário para o que são stubs de
F1-02. O script pós-build é mais direto, fácil de depurar e espelha
exatamente o comportamento da fase F4-04.

**Diferença da abordagem legada:**

| | Legado (`patch-worker-scheduled.js`) | Novo (`inject-scheduled.mjs`) |
|---|---|---|
| Lógica | Chama endpoint HTTP `/api/v1/read-model/rebuild` | Roda diretamente no Worker |
| Secrets | Requer `CRON_SECRET` + `WORKER_BASE_URL` | Não usa secrets de cron |
| Override | Sobrescreve o default export | Adiciona named export `scheduled` |
| TypeScript | Sem correspondente TS | Espelhado de `src/lib/server/cron/index.ts` |

---

## Arquitetura da ponte SvelteKit → Hono

```
Request → SvelteKit (event.platform.env) ──► apiHandler(event)
                                                     │
                                          apiApp.fetch(request, {
                                            event,       // legado
                                            DB,          // D1Database
                                            R2,          // R2Bucket
                                            KV_BINDING,  // KVNamespace
                                          })
                                                     │
                                          c.env.DB / c.env.R2 / c.env.KV_BINDING
                                          (nos handlers Hono)
```

**Arquivo**: `src/lib/server/api/sveltekit.ts`  
**Tipo do contexto Hono**: `src/lib/server/api/types.ts` (`ApiEnv`)

---

## Handler scheduled() nativo

```
[triggers] crons = ["*/5 * * * *", "7 6 * * *"]   ← wrangler.toml
       │
       ▼
_worker.js (após inject-scheduled.mjs)
  export const scheduled = __handleScheduled
       │
       ▼
switch (event.cron):
  "*/5 * * * *"  → handleFiveMin()   — F4-04: rebuild incremental
  "7 6 * * *"    → handleNightly()   — F4-04: marcar meses p/ rebuild
```

**Source of truth**: `src/lib/server/cron/index.ts`  
**Código injetado**: `scripts/inject-scheduled.mjs`

> **Nota F4-04**: quando a lógica real de rebuild for implementada,
> o `inject-scheduled.mjs` passará a empacotar `src/lib/server/cron/index.ts`
> com esbuild antes de injetar, eliminando a duplicação. Por ora os stubs são
> suficientes para a prova de stack.

---

## Scripts atualizados (package.json)

| Script | Comando |
|--------|---------|
| `cf:build` | `npm run build && node scripts/inject-scheduled.mjs` |
| `cf:deploy` | `npm run cf:build && npx wrangler deploy` |
| `cf:deploy:staging` | `npm run cf:build && npx wrangler deploy --env staging` |
| `legacy:patch-scheduled` | `node scripts/patch-worker-scheduled.js` (mantido p/ referência) |

---

## Tipos declarados

### `src/app.d.ts` — Platform.env

```typescript
interface Platform {
  env?: {
    DB: D1Database;           // ← @cloudflare/workers-types@4.20260504.1
    R2: R2Bucket;
    KV_BINDING: KVNamespace;
    ASSETS: Fetcher;
    BETTER_AUTH_SECRET: string;
    RESEND_API_KEY: string;
    // ... secrets e legado Supabase
  };
  context?: ExecutionContext;
}
```

### `src/lib/server/api/types.ts` — ApiEnv (Hono)

```typescript
export type ApiEnv = {
  Bindings: {
    event: RequestEvent;    // legado — remover em F2-03
    DB: D1Database;
    R2: R2Bucket;
    KV_BINDING: KVNamespace;
  };
  Variables: { requestId: string };
};
```

### `src/lib/server/cron/index.ts` — ScheduledEnv

```typescript
export interface ScheduledEnv {
  DB: D1Database;
  KV_BINDING: KVNamespace;
}
export async function handleScheduled(
  event: ScheduledEvent,
  env: ScheduledEnv,
  ctx: ExecutionContext
): Promise<void>
```

---

## Validação

```bash
# TypeScript check (requer npm install)
npm run check

# Build completo com injeção do scheduled handler
npm run cf:build

# Verificar que o export scheduled foi injetado
grep -c '__scheduled_injected_v2__' .svelte-kit/cloudflare/_worker.js
# → deve retornar 1

# Dev local com Miniflare (bindings D1/R2 simulados)
npm run dev:cf

# Ver que o scheduled handler existe no worker gerado
grep 'export const scheduled' .svelte-kit/cloudflare/_worker.js
```

---

## Próximos passos

- **F1-03**: Provar Drizzle + D1 — migrations, CRUD, tipos e transações
- **F4-04**: Implementar lógica real de rebuild no `handleScheduled`

---

## Referências

- `wrangler.toml` — configuração de bindings e cron triggers
- `docs/adr/ADR-001-stack-principal.md` — decisão de stack
- [adapter-cloudflare docs](https://svelte.dev/docs/kit/adapter-cloudflare)
- [Cloudflare Workers — Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
