# F2-01 — Schema por Domínio, Constraints, Índices e Seeds

**Status:** ✅ Implementado  
**Branch:** `reescrita/f2-identidade-autorizacao`  
**Migration:** `drizzle/0002_f2_schema_dominio.sql`

---

## Objetivo

Estabelecer o schema de domínio de identidade e autorização, expandindo
a estrutura F1-03 com:

- Campos adicionais em `empresas` (slug, plano, limiteUsuarios)
- `empresa_id` na tabela `user` do Better Auth (link tenant)
- Nova tabela `membros_empresa` (RBAC: usuário ↔ empresa + papel)
- Nova tabela `convites` (tokens de convite — fluxo em F2-02)
- Índices de performance e constraints CHECK para papéis

---

## Estrutura de Domínios

```
identity/
  empresas          — tenants (agências de viagem)
  user              — usuários do Better Auth + empresa_id
  membros_empresa   — associação usuário ↔ empresa com papel

invites/
  convites          — tokens de convite pendentes

auth/ (Better Auth — ADR-005 exception)
  session
  account
  verification
```

---

## Tabelas

### `empresas` (expandida de F1-03)

| Coluna           | Tipo           | Notas                                      |
|------------------|----------------|--------------------------------------------|
| id               | INTEGER PK     | Auto-increment                             |
| nome             | TEXT(200)      | Nome fantasia                              |
| cnpj             | TEXT(14)       | Sem formatação; UNIQUE index               |
| **slug**         | TEXT(80)       | ✨ novo — URL-safe; UNIQUE index            |
| **plano**        | TEXT(20)       | ✨ novo — 'trial'\|'starter'\|'pro'\|'enterprise' |
| **limite_usuarios** | INTEGER     | ✨ novo — 0 = ilimitado; default 5         |
| timezone         | TEXT(64)       | Default 'America/Sao_Paulo'                |
| ativo            | INTEGER (bool) | 0/1                                        |
| criado_em        | TEXT           | ISO 8601                                   |
| atualizado_em    | TEXT           | ISO 8601                                   |

Índices: `idx_empresas_cnpj` (UNIQUE), `idx_empresas_slug` (UNIQUE)

---

### `user` (Better Auth + empresa_id)

| Coluna           | Tipo           | Notas                                      |
|------------------|----------------|--------------------------------------------|
| id               | TEXT PK        | UUID gerado pelo Better Auth               |
| name             | TEXT           |                                            |
| email            | TEXT           | UNIQUE (`idx_user_email`)                  |
| email_verified   | INTEGER (bool) |                                            |
| image            | TEXT           |                                            |
| **empresa_id**   | INTEGER FK     | ✨ novo — FK→empresas; NULL = super-admin   |
| created_at       | INTEGER        | timestamp_ms (ADR-005 exception)           |
| updated_at       | INTEGER        | timestamp_ms (ADR-005 exception)           |

Índices: `idx_user_email` (UNIQUE), `idx_user_empresa_id`

---

### `membros_empresa` (nova)

| Coluna         | Tipo           | Notas                                      |
|----------------|----------------|--------------------------------------------|
| id             | INTEGER PK     | Auto-increment                             |
| empresa_id     | INTEGER FK     | → empresas(id) ON DELETE CASCADE           |
| user_id        | TEXT(36) FK    | → user(id) ON DELETE CASCADE               |
| papel          | TEXT(20)       | CHECK IN ('admin','operador','visualizador') |
| ativo          | INTEGER (bool) | false = revogado (sem excluir o registro)  |
| criado_em      | TEXT           | ISO 8601                                   |
| atualizado_em  | TEXT           | ISO 8601                                   |

Constraint: `idx_membros_user_id` UNIQUE — usuário em ≤ 1 empresa  
Índices: `idx_membros_empresa_id`, `idx_membros_empresa_papel`

**Papéis e capabilities** (matriz completa em F2-03):

| Papel         | Lê | Cria | Edita | Exclui | Configura empresa | Convida |
|---------------|----|------|-------|--------|-------------------|---------|
| admin         | ✅ | ✅   | ✅    | ✅     | ✅                | ✅      |
| operador      | ✅ | ✅   | ✅    | ❌     | ❌                | ❌      |
| visualizador  | ✅ | ❌   | ❌    | ❌     | ❌                | ❌      |

---

### `convites` (nova)

| Coluna        | Tipo       | Notas                                          |
|---------------|------------|------------------------------------------------|
| id            | INTEGER PK | Auto-increment                                 |
| empresa_id    | INTEGER FK | → empresas(id) ON DELETE CASCADE               |
| email         | TEXT(320)  |                                                |
| papel         | TEXT(20)   | CHECK IN ('admin','operador','visualizador')    |
| token         | TEXT(36)   | UUID — UNIQUE index                            |
| expires_at    | TEXT       | ISO 8601 — padrão 7 dias                       |
| aceito_em     | TEXT       | NULL enquanto pendente                         |
| convidado_por | TEXT(36)   | → user(id) ON DELETE SET NULL                  |
| criado_em     | TEXT       | ISO 8601                                       |

Índices: `idx_convites_token` (UNIQUE), `idx_convites_empresa_id`, `idx_convites_email`

---

## Migration

**Arquivo:** `drizzle/0002_f2_schema_dominio.sql`

Operações em ordem:
1. `ALTER TABLE empresas ADD` — slug, plano, limite_usuarios
2. `DROP INDEX empresas_cnpj_unique` → `CREATE UNIQUE INDEX idx_empresas_cnpj`
3. `CREATE UNIQUE INDEX idx_empresas_slug`
4. `ALTER TABLE user ADD empresa_id`
5. `CREATE INDEX idx_user_empresa_id`
6. `CREATE TABLE membros_empresa` + 3 índices
7. `CREATE TABLE convites` + 3 índices

Todos os `CREATE INDEX/TABLE` usam `IF NOT EXISTS` para idempotência.

### Aplicar migration local

```bash
# Aplicar migrations
npx wrangler d1 migrations apply vturapp-dev --local

# Seed de teste
npx wrangler d1 execute vturapp-dev --local \
  --file=src/lib/server/db/seeds/f2-seed.sql

# Verificar
npx wrangler d1 execute vturapp-dev --local \
  --command="SELECT e.slug, m.papel, u.email FROM membros_empresa m JOIN empresas e ON e.id=m.empresa_id JOIN user u ON u.id=m.user_id ORDER BY e.id, m.papel"
```

---

## Seed de Teste (F2-01)

**Empresa 1 — Alfa Viagens Ltda** (`slug: alfa-viagens`, plano: starter)

| Usuário                        | Papel        |
|--------------------------------|--------------|
| admin@alfa-viagens.test        | admin        |
| operador@alfa-viagens.test     | operador     |
| view@alfa-viagens.test         | visualizador |

**Empresa 2 — Beta Turismo ME** (`slug: beta-turismo`, plano: trial)

| Usuário                        | Papel        |
|--------------------------------|--------------|
| admin@beta-turismo.test        | admin        |
| operador@beta-turismo.test     | operador     |
| view@beta-turismo.test         | visualizador |

O seed demonstra isolamento entre empresas — um usuário de Alfa
não aparece como membro de Beta e vice-versa.

---

## Decisões de Design

### Usuário em ≤ 1 empresa (UNIQUE user_id)

Opção escolhida: um usuário pertence a exatamente uma empresa.
Simplifica as queries de autorização (sem "qual empresa estou agora?")
e elimina IDOR entre tenants na API.

Alternativa rejeitada: multi-empresa por usuário (ex.: consultores). 
Pode ser adicionada em F3+ via tabela `vinculo_usuario_empresa` se necessário.

### Constraint CHECK em `papel`

Enforçado tanto no SQL (`CHECK papel IN (...)`) quanto no TypeScript
(`PAPEIS` union type). Garante integridade mesmo com inserções diretas no DB.

### `empresa_id` em `user` E em `membros_empresa`

Redundância intencional:
- `user.empresa_id`: identidade principal — lookup O(1) sem JOIN
- `membros_empresa`: detalha o papel + ativo/inativo + auditoria

F2-03 usa `user.empresa_id` no middleware de acesso.

---

## Próximo — F2-02

- Fluxo completo de convite: gerar token → enviar e-mail (Resend) → aceitar → criar conta + membro
- Verificação de e-mail no registro
- Recuperação de senha (Better Auth built-in)
- Sessões válidas ligadas ao tenant

