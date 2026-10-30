# F1-03 — Prova Drizzle + D1: migrations, CRUD, tipos e transações

**Branch**: `reescrita/f1-prova-stack`  
**Status**: ✅ CONCLUÍDO  
**Data**: 2026-10-26

---

## Objetivo

Provar que Drizzle ORM + D1 funciona no runtime Cloudflare Workers com:

- Schema TypeScript correto (tipos ADR-005: centavos, datas ISO 8601, boolean)
- Migrations aplicáveis via wrangler (local e staging)
- CRUD completo (create/read/update/delete) via Drizzle query builders
- Transações D1
- Testes TypeScript validando tipos em Node (sem D1 real)

---

## Versões instaladas

| Pacote | Versão |
|--------|--------|
| `drizzle-orm` | `^0.45.4` |
| `drizzle-kit` | `^0.31.11` |

---

## Arquivos criados

| Arquivo | Descrição |
|---------|-----------|
| `drizzle.config.ts` | Configuração do Drizzle Kit |
| `src/lib/server/db/schema.ts` | Schema Drizzle: tabela `empresas` |
| `src/lib/server/db/client.ts` | Factory `getDb(d1)` e `getDbFromPlatform()` |
| `src/lib/server/db/index.ts` | Re-exporta schema + client |
| `src/lib/server/db/__tests__/schema.test.ts` | Testes de tipos Vitest |
| `drizzle/0000_initial_schema.sql` | Migration SQL inicial |
| `drizzle/meta/_journal.json` | Journal de migrations Drizzle |
| `drizzle/meta/0000_snapshot.json` | Snapshot do schema |

---

## Convenções ADR-005 no schema

```typescript
// ✅ Correto — centavos como integer
valorBruto: integer('valor_bruto', { mode: 'number' })  // ex.: R$10,50 → 1050

// ✅ Correto — datas como text ISO 8601
criadoEm: text('criado_em')  // ex.: "2026-10-26T17:00:00.000Z"

// ✅ Correto — boolean como integer mode boolean
ativo: integer('ativo', { mode: 'boolean' })  // → true/false em TS, 0/1 no SQLite

// ✅ Correto — percentual × 100
pctComissao: integer('pct_comissao', { mode: 'number' })  // ex.: 12,5% → 1250
```

---

## Como usar o client

### Em handlers SvelteKit (`+server.ts`)

```typescript
import { getDbFromPlatform } from '$lib/server/db/client';
import { empresas } from '$lib/server/db/schema';

export const GET: RequestHandler = async ({ platform }) => {
  const db = getDbFromPlatform(platform);
  
  // SELECT com Drizzle
  const rows = await db.select().from(empresas).all();
  return json(rows);
};
```

### Em handlers Hono

```typescript
import { getDb } from '$lib/server/db/client';
import { empresas } from '$lib/server/db/schema';
import type { ApiEnv } from '$lib/server/api/types';

app.get('/empresas', async (c: HonoContext<ApiEnv>) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(empresas).all();
  return c.json(rows);
});
```

### Exemplos de CRUD

```typescript
// INSERT
const novaEmpresa = await db.insert(empresas).values({
  nome: 'Agência Teste LTDA',
  cnpj: '12345678000100',
  criadoEm: new Date().toISOString(),
  atualizadoEm: new Date().toISOString(),
}).returning();

// SELECT
const ativas = await db.select()
  .from(empresas)
  .where(eq(empresas.ativo, true))
  .all();

// UPDATE
await db.update(empresas)
  .set({ nome: 'Novo Nome', atualizadoEm: new Date().toISOString() })
  .where(eq(empresas.id, 1));

// DELETE
await db.delete(empresas).where(eq(empresas.id, 1));

// TRANSAÇÃO
await db.transaction(async (tx) => {
  await tx.insert(empresas).values({ ... });
  // Se algum step lançar, tudo é revertido
});
```

---

## Migrations

### Estrutura

```
drizzle/
  0000_initial_schema.sql   ← SQL da migration
  meta/
    _journal.json            ← Controle de versão das migrations
    0000_snapshot.json       ← Snapshot do schema em 0000
```

### Aplicar migrations

```bash
# Local (Miniflare/D1 local)
npm run d1:migrate:local
# → wrangler d1 migrations apply vturapp-db --local

# Staging
npm run d1:migrate:staging
# → wrangler d1 migrations apply vturapp-db-staging --env staging

# Produção
npm run d1:migrate:prod
# → wrangler d1 migrations apply vturapp-db --env production
```

### Gerar nova migration após alterar schema

```bash
npm run drizzle:generate
# → drizzle-kit generate
# Cria nova arquivo em drizzle/ com o diff do schema
```

---

## Testes

```bash
# Testes de tipos (sem D1 real)
npm test
# → valida schema.ts, Empresa, NovaEmpresa, convenções ADR-005

# Para testes de integração com D1 real:
# TODO F1-03b: configurar @cloudflare/vitest-pool-workers
```

---

## Próximos passos

- **F1-04**: Adicionar schema Better Auth sobre o mesmo D1
- **F2-01**: Expandir schema `empresas` com campos completos (CRM)
- **F1-03b** (opcional): Testes de integração com `@cloudflare/vitest-pool-workers`

---

## Referências

- `docs/adr/ADR-005-dinheiro-datas.md` — convenções de tipos
- [Drizzle ORM + D1](https://orm.drizzle.team/docs/connect-cloudflare-d1)
- [Drizzle Kit — Migrations](https://orm.drizzle.team/docs/kit-overview)
