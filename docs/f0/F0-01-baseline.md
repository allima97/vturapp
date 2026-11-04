# F0-01 — Baseline do repositório

**Estado:** CONCLUÍDA  
**Responsável / data:** 2026-10-26  
**SHA:** 8bb9f19d537adf7b3b2a9d36c80436c5301a5934  
**Branch:** main (up to date with origin/main)  

## Alterações não rastreadas

- `docs/REESCRITA-REVISAO-E-ROTEIRO.md` — adicionado como arquivo não rastreado (roteiro da reescrita, referência histórica)

## Versões resolvidas (package-lock.json)

| Pacote | Versão resolvida |
|---|---|
| `@sveltejs/kit` | 2.59.0 |
| `svelte` | 5.55.1 |
| `vite` | 5.4.21 |
| `@sveltejs/adapter-cloudflare` | 7.2.8 |
| `wrangler` | 4.87.0 |
| `hono` | 4.12.16 |
| `tailwindcss` | 4.3.3 |
| `flowbite` | 3.1.2 |
| `vitest` | 2.1.9 |
| `typescript` | 5.9.3 |
| Node.js | 22.23.4 |
| npm | 10.9.9 |

> **Nota:** `@sveltejs/kit` latest em npm aponta para 3.x (breaking changes em config e Cloudflare). Manter 2.59.0 até F1 provar o upgrade com evidências.

## Inventário de arquivos (fotografia)

| Tipo | Quantidade |
|---|---|
| `+server.ts` em `src/routes` | 259 |
| `+page.svelte` em `src/routes` | 139 |
| Arquivos TypeScript totais em `src/` | 829 |
| Arquivos `*.test.ts` | 102 |
| Componentes Svelte | 405 |
| Migrações SQL (`supabase/migrations/`) | 10 |

## Inventário de API (`docs/api-inventory.json`)

| Métrica | Valor |
|---|---|
| Total de entradas | 258 |
| Endpoints via Hono | 249 |
| Endpoints só SvelteKit | 9 |
| `GET` | 175 |
| `POST` | 135 |
| `DELETE` | 46 |
| `PATCH` | 27 |
| `PUT` | 5 |
| Tabelas únicas referenciadas | 95 |
| RPCs únicas | 4 (`buscar_cidades`, `gestor_equipe_base_id`, `rpc_dashboard_consultorias`, `set_gestor_vendedor_relacao`) |
| Endpoints debug-only | 5 |
| Endpoints com cron-secret | 3 |

> Nota: 258 entradas no inventário vs 259 arquivos `+server.ts` — há uma discrepância de 1. Reconciliar em F0-02.

## Infraestrutura declarada (wrangler.toml)

- Worker: `vturapp`; deployment atual via `wrangler deploy`
- `placement.region = "aws:us-west-2"` (Oregon — motivo: Supabase em us-west-2)
- Assets binding: `.svelte-kit/cloudflare`
- KV binding: `KV_BINDING` (id: `60fa423718914712bec4f489d41c3dd6`) — usado para invalidação de cache cross-instance
- Crons: `*/5 * * * *` (rebuild read model) e `7 6 * * *` (noturno)
- **Sem bindings D1 ou R2** — estes são objetivos da reescrita

## Dependências de autenticação

- Supabase: 57 arquivos em `src/lib/` referenciam `supabase` ou `createClient`
- Passkeys: implementação própria em `src/lib/server/passkeys`
- MFA: existente, verificar implementação
- Sessão atual: via Supabase auth

## Conciliação / importadores (X02 — EXCLUSÃO PLANEJADA)

Arquivos com referências a conciliação/CVC/REXTUR:
`src/lib/conciliacao/` (pasta inteira), `src/lib/server/conciliacaoReconcile.ts`,
`src/lib/server/readModelRebuild.ts`, `src/lib/server/relatorios.ts`, e outros.
Ver F0-04 para mapeamento completo de exclusão deliberada.

## Scripts disponíveis

```
dev             vite dev
build           vite build
preview         vite preview
cf:build        npm run build && node scripts/patch-worker-scheduled.js
cf:deploy       npm run cf:build && npx wrangler deploy
check           svelte-kit sync && svelte-check --tsconfig ./tsconfig.json
test            vitest --dir src        ← não usa --run; não encerra (ver F0-05)
api:inventory   node scripts/api-inventory.mjs
api:inventory:check  node scripts/api-inventory.mjs --check
lint            prettier --check . && eslint .
format          prettier --write .
```

## Problemas preexistentes identificados

| ID | Problema | Destino |
|---|---|---|
| P01 | `npm test` chama `vitest` sem `--run`; não encerra em CI | F0-05: adaptar para `vitest run` |
| P02 | `cf:build` inclui `scripts/patch-worker-scheduled.js` para cron | F1-02: provar cron nativo `scheduled()` antes de remover o patch |
| P03 | Placement em Oregon ligado ao Supabase (us-west-2) | F1-01: ambiente novo com D1; rever placement para São Paulo |
| P04 | `docs/api-inventory.json` tem 258 entradas vs 259 arquivos `+server.ts` | F0-02: reconciliar por rota + método |
| P05 | KV usado para invalidação de cache (consistência eventual) | F4-04: rever estratégia de read model sem KV como autoridade |
| P06 | 57 arquivos em `src/lib/` acoplados ao Supabase | Mapeamento completo em F0-02/F0-03 |

## Vitest workspace

Dois grupos: `unit` (Node) e `dom` (jsdom + `.dom.test.ts`). Nenhum grupo para Workers/D1.
O terceiro grupo para `@cloudflare/vitest-pool-workers` será criado em F0-05.

## Ponte SvelteKit → Hono

`src/lib/server/api/sveltekit.ts` repassa `event.request` ao Hono com `{ event }` no env.
`c.env.DB` (D1) **não existe** nesse contrato atualmente — será criado em F1/F2.

## Aceite verificado

- [x] SHA registrado: `8bb9f19d537adf7b3b2a9d36c80436c5301a5934`
- [x] Versões resolvidas confirmadas via `package-lock.json`
- [x] Alterações não rastreadas listadas
- [x] Falhas preexistentes identificadas com destino (P01–P06)
- [x] Nenhum dado antigo alterado
