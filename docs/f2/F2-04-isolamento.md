# F2-04 — Isolamento entre Empresas (Tenant Isolation)

## Objetivo

Provar que dados de um tenant (empresa) são completamente isolados de outros tenants, em três dimensões:

| Dimensão | Mecanismo | Proof |
|---|---|---|
| **Leitura** | `assertTenantOwnership(authEmpresaId, row.empresaId)` | test suite + rota proof |
| **Gravação** | `injectTenantId(body, authEmpresaId)` + `validateTenantWrite()` | test suite |
| **Revogação** | soft-delete `ativo = false` em `membros_empresa` | test suite |

## Contexto: D1 não tem Row-Level Security

O D1 (SQLite) não possui RLS nativo como o PostgreSQL. O isolamento é garantido inteiramente na camada de aplicação (TypeScript/Hono).

---

## Arquitetura do Isolamento

```
Request → resolveAuthContext() → { userId, empresaId, papel }
                                        │
                                        ▼
                              assertHasEmpresaId(empresaId)
                              [lança se null/undefined]
                                        │
                                        ▼
                    SELECT * FROM membros_empresa WHERE id = ?
                                        │
                                        ▼
                    assertTenantOwnership(authEmpresaId, row.empresaId)
                    [lança TenantError se diferente → 403]
                                        │
                                        ▼
                          UPDATE / return / delete
```

### Padrão de leitura (getMembro)

```typescript
const row = await db.select()
  .from(membrosEmpresa)
  .where(eq(membrosEmpresa.id, membroId))
  .limit(1);

// Guarda OBRIGATÓRIA antes de retornar
assertTenantOwnership(authEmpresaId, row[0].empresaId);
// → lança TenantError('CROSS_TENANT_READ') se diferente
```

### Padrão de escrita (INSERT)

```typescript
// Força empresa_id do auth context — body é descartado
const dadosSeguro = injectTenantId(body, ctx.empresaId);
await db.insert(vendas).values(dadosSeguro);
```

### Padrão de escrita (UPDATE/DELETE)

```typescript
// Valida antes de modificar
assertTenantOwnership(ctx.empresaId, row.empresaId);
await db.update(membrosEmpresa)
  .set({ ativo: false })
  .where(eq(membrosEmpresa.id, membroId));
```

---

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/lib/server/tenant/guard.ts` | Funções puras: assertTenantOwnership, injectTenantId, validateTenantWrite, assertHasEmpresaId |
| `src/lib/server/tenant/members.ts` | Serviço: listarMembros, getMembro, revogarMembro (usa guard internamente) |
| `src/lib/server/tenant/index.ts` | Re-exports |
| `src/lib/server/tenant/tenant.test.ts` | 37 testes, 100% passando |
| `src/lib/server/api/routes/tenant-proof/index.ts` | Rotas de prova HTTP (non-production) |
| `src/lib/server/db/seeds/f2-seed.sql` | Seed: 2 empresas × 3 papéis = 6 usuários sintéticos |

---

## Testes

```bash
npx vitest run src/lib/server/tenant/tenant.test.ts
# → 37 tests passed (0 failed)
```

### Invariantes provadas

| Invariante | Test |
|---|---|
| A. Leitura: Alfa não lê registro de Beta | `assertTenantOwnership(1, 2)` → TenantError |
| A. Leitura: Beta não lê registro de Alfa | `assertTenantOwnership(2, 1)` → TenantError |
| B. Escrita: body injection descartado | `injectTenantId({ empresaId: 2 }, 1).empresaId === 1` |
| C. Escrita: cross-tenant explícito rejeitado | `validateTenantWrite(2, 1)` → TenantError |
| D. Sem empresa: usuário sem empresa bloqueado | `assertHasEmpresaId(null)` → TenantError |
| E. Revogação: membro revogado tem ativo=false | simulateRevogarMembro → `ativo === false` |

### Testes de integração com D1 real

Para executar contra D1 local com os seeds:

```bash
# 1. Aplicar seed
npx wrangler d1 execute vturapp-dev --local \
  --file=src/lib/server/db/seeds/f2-seed.sql

# 2. Iniciar servidor local
npm run dev

# 3. Testar isolamento via HTTP (requer sessão Better Auth ativa)
# Obter token: POST /api/auth/sign-in/email

# Ler membros do próprio tenant (esperado: 200 + allSameTenant: true)
curl -H "Cookie: better-auth-session=<token>" \
  http://localhost:5173/api/v2/f2-proof/tenant-isolation

# Tentar acessar membro de outro tenant (esperado: 403 + CROSS_TENANT)
curl -X POST \
  -H "Cookie: better-auth-session=<token>" \
  -H "Content-Type: application/json" \
  -d '{"membroId": 4}' \
  http://localhost:5173/api/v2/f2-proof/tenant-isolation/cross-tenant
```

---

## Rotas de Prova HTTP

> ⚠️ Somente disponíveis quando `PUBLIC_ENVIRONMENT !== 'production'`

### `GET /api/v2/f2-proof/tenant-isolation`

Retorna os membros do tenant autenticado. Prova que o filtro `WHERE empresa_id = ?` funciona.

```json
{
  "proof": "F2-04-READ-ISOLATION",
  "authContext": { "userId": "...", "empresaId": 1, "papel": "admin" },
  "membros": [
    { "id": 1, "empresaId": 1, "papel": "admin", "ativo": true },
    { "id": 2, "empresaId": 1, "papel": "operador", "ativo": true }
  ],
  "allSameTenant": true
}
```

### `POST /api/v2/f2-proof/tenant-isolation/cross-tenant`

Tenta acessar um membro pelo `membroId`. Se pertencer a outro tenant, retorna 403.

```json
// Body
{ "membroId": 4 }

// Response 403 (membro de outro tenant)
{
  "proof": "F2-04-CROSS-TENANT-BLOCKED",
  "ok": false,
  "code": "CROSS_TENANT",
  "description": "ISOLAMENTO FUNCIONANDO: acesso ao membro 4 de outro tenant foi BLOQUEADO."
}
```

---

## Decisões de Design

### Por que soft-delete em revogação?

- Preserva histórico de auditoria (quem foi membro, quando)
- Permite reativação sem perder dados
- `resolveAuthContext()` (F2-02) filtra `WHERE ativo = 1` ao buscar papel

### Por que injectTenantId() e não validar empresa_id do body?

Validar `body.empresaId === auth.empresaId` ainda permite bugs acidentais onde o body não inclui empresaId (ficaria null). `injectTenantId()` garante que o auth context é a fonte de verdade, independente do que chegou no body.

### Por que não usar D1 Row-Level Security?

D1/SQLite não tem RLS. A alternativa seria PostgreSQL (que o Supabase usa, com RLS nativo). Na migração para D1, o isolamento é garantido pela camada de serviço, auditada por testes e guardas explícitas no código.

---

## Referências

- F2-02: `src/lib/server/auth/context.ts` — `resolveAuthContext()`
- F2-03: `src/lib/server/policy/authorize.ts` — `requireCan()` Hono middleware
- Seed: `src/lib/server/db/seeds/f2-seed.sql`
- Schema: `src/lib/server/db/schema.ts` — `membrosEmpresa.ativo`
