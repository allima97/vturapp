# F0-04 — Regras, papéis e funções existentes

**Estado:** CONCLUÍDA  
**Responsável / data:** 2026-10-26  
**Dependência:** F0-03  

> Mapeamento das regras de negócio, papéis de usuário e funções server-side existentes. Para cada função: decisão de **MANTER**, **REDESENHAR** ou **EXCLUIR**.

---

## 1. Papéis de usuário (Papel)

Definidos em `src/lib/server/v1.ts`:

```ts
type Papel = "ADMIN" | "MASTER" | "FINANCEIRO" | "GESTOR" | "VENDEDOR" | "OUTRO"
```

### Hierarquia e escopo

| Papel | Acesso | Empresa(s) | Notas |
|---|---|---|---|
| `ADMIN` | Global irrestrito | Todas | Plataforma Anthropic; ignora isolamento de empresa |
| `MASTER` | Multi-empresa | `companyIds` via `master_empresas` | Gerencia N empresas; acesso sem filtro de empresa se lista vazia + `companyId` |
| `FINANCEIRO` | Multi-empresa | `companyIds` via `financeiro_empresas` | Acesso financeiro; semelhante ao MASTER nos filtros |
| `GESTOR` | Empresa única | `companyId` + equipe própria | Acesso à equipe que gerencia via `gestor_equipe` |
| `VENDEDOR` | Empresa única | `companyId` | Filtrado pelo próprio `vendedor_id` por padrão |
| `OUTRO` | Configurável | `companyId` | Sem privilégios; acesso via `modulo_acesso` |

**`usoIndividual`** — campo em `users`. Quando `true` e papel é OUTRO: promove para `VENDEDOR` em `resolvePapel()`. NÃO afeta ADMIN/MASTER/FINANCEIRO/GESTOR.

**Decisão:** MANTER estrutura; `resolvePapel()` é portável. Substituir `users.uso_individual` (boolean no PostgreSQL) por `INTEGER 0/1` no D1.

---

## 2. Permissões por módulo (PermissaoNivel + modulo_acesso)

### Níveis de permissão

```ts
type PermissaoNivel = "none" | "view" | "create" | "edit" | "delete" | "admin"
```

Ordenados por `permLevel()`: none=0, view=1, create=2, edit=3, delete=4, admin=5.

### Herança de módulos (MODULO_HERANCA)

Permissão em módulo pai concede acesso ao filho:

| Filho | Pais |
|---|---|
| Agenda | Operacao |
| Todo / Tarefas | Operacao |
| Mural de Recados | Operacao |
| Minhas Preferências | Operacao |
| Documentos Viagens | Operacao |
| Vouchers | Operacao, Viagens |
| Controle de SAC | Operacao |
| Campanhas | Operacao |
| CRM | Parametros |
| ParametrosAvisos / Avisos | Parametros |
| Formas de Pagamento | Financeiro |

### Seções de permissão (para UI de gerenciamento)

`trial`, `basica`, `relatorios`, `financeiro`, `gestor`, `master`, `cadastro`, `parametros`, `admin`

**Decisão:** MANTER toda a lógica de permissões; `modulo_acesso` vira tabela D1. `MAPA_MODULOS`, `MODULO_HERANCA`, `SECOES_PERMISSOES`, `listarModulosComHeranca()`, `hasModuloAccess()`, `ensureModuloAccess()` são portáveis sem alteração.

---

## 3. Guards / middlewares de autenticação e autorização

| Função | Arquivo | Decisão | Observação |
|---|---|---|---|
| `requireAuthenticatedUser(event)` | `v1.ts` | **REDESENHAR** | Trocar `supabase.auth.getUser()` por Better Auth session check |
| `resolveUserScope(client, userId)` | `v1.ts` | **REDESENHAR** | Trocar Supabase client por Drizzle queries; lógica de resolução mantida |
| `resolveUserScopeUncached(...)` | `v1.ts` | **REDESENHAR** | Mesma lógica; trocar queries |
| `fetchPermissions(client, userId)` | `v1.ts` | **REDESENHAR** | Query em `modulo_acesso` → Drizzle |
| `fetchMasterEmpresas(client, userId)` | `v1.ts` | **REDESENHAR** | Query em `master_empresas` → Drizzle |
| `fetchFinanceiroEmpresas(client, userId)` | `v1.ts` | **REDESENHAR** | Query em `financeiro_empresas` → Drizzle |
| `fetchGestorEquipeIdsComGestor(...)` | `v1.ts` | **REDESENHAR** | RPC + queries → Drizzle |
| `fetchVendedorIdsByCompanyIds(...)` | `v1.ts` | **REDESENHAR** | Query → Drizzle |

**Nota:** O caching de scope (`resolveUserScope` usa KV ou similar) precisa ser mantido; D1 não tem latência zero. Avaliar se Better Auth session já carrega o papel para evitar round-trip extra.

---

## 4. Funções de escopo de empresa e vendedor

| Função | Arquivo | Decisão |
|---|---|---|
| `resolveScopedCompanyIds(scope, requestedId)` | `v1.ts` | **MANTER** (lógica pura) |
| `resolveScopedCompanyId(scope, requestedId)` | `v1.ts` | **MANTER** (lógica pura) |
| `resolveScopedVendedorIds(client, scope, ...)` | `v1.ts` | **REDESENHAR** (RPC → Drizzle) |
| `resolveAccessibleClientIds(client, scope, ...)` | `v1.ts` | **REDESENHAR** (RPC `accessible_client_ids` → Drizzle) |
| `getAccessibleCompanyIds(scope)` | `admin.ts` | **MANTER** (lógica pura) |
| `shouldApplySellerScope(scope)` | `salesScope.ts` | **MANTER** (lógica pura) |
| `isSaleInScope(sale, params)` | `salesScope.ts` | **MANTER** (lógica pura) |
| `fetchSaleForScope(params)` | `salesScope.ts` | **REDESENHAR** (Supabase → Drizzle) |

---

## 5. Funções de gerenciamento de usuários e empresas

| Função | Arquivo | Decisão |
|---|---|---|
| `listManagedUsers(client, scope)` | `admin.ts` | **REDESENHAR** |
| `loadManagedUser(client, scope, userId)` | `admin.ts` | **REDESENHAR** |
| `loadManagedUserTypes(client, scope)` | `admin.ts` | **REDESENHAR** |
| `loadManagedCompanies(client, scope)` | `admin.ts` | **REDESENHAR** |
| `loadFinanceiroCompanyIds(...)` | `admin.ts` | **REDESENHAR** |
| `syncFinanceiroCompanyLinks(...)` | `admin.ts` | **REDESENHAR** |
| `canManageUsers(scope)` | `admin.ts` | **MANTER** (lógica pura) |
| `canManagePermissions(scope)` | `admin.ts` | **MANTER** (lógica pura) |
| `canManageCompanies(scope)` | `admin.ts` | **MANTER** (lógica pura) |
| `ensureCanManageUsers(scope)` | `admin.ts` | **MANTER** (lógica pura) |
| `ensureCanManagePermissions(scope)` | `admin.ts` | **MANTER** (lógica pura) |
| `ensureCanManageCompanies(scope)` | `admin.ts` | **MANTER** (lógica pura) |
| `isUserInScope(scope, row)` | `admin.ts` | **MANTER** (lógica pura) |
| `ensureTargetUserScope(scope, row)` | `admin.ts` | **MANTER** (lógica pura) |
| `ensureAssignableCompany(scope, companyId)` | `admin.ts` | **MANTER** (lógica pura) |
| `ensureAssignableUserType(scope, typeName)` | `admin.ts` | **MANTER** (lógica pura) |
| `ensureAssignablePermissionSet(...)` | `admin.ts` | **MANTER** (lógica pura) |
| `saveUserPermissions(...)` | `admin.ts` | **REDESENHAR** |
| `saveDefaultPermissions(...)` | `admin.ts` | **REDESENHAR** |
| `syncUserTypeDefaultPermissions(...)` | `admin.ts` | **REDESENHAR** |
| `buildPermissionMatrix(...)` | `admin.ts` | **MANTER** (lógica pura) |
| `loadUserPermissions(...)` | `admin.ts` | **REDESENHAR** |
| `loadUserTypeDefaultPermissions(...)` | `admin.ts` | **REDESENHAR** |
| `findAuthUserIdByEmail(...)` | `admin.ts` | **REDESENHAR** (Supabase Auth → Better Auth) |
| `createOrReuseAuthUser(...)` | `admin.ts` | **REDESENHAR** (Supabase Auth → Better Auth) |
| `loadSystemModuleSettings(...)` | `admin.ts` | **REDESENHAR** |
| `saveSystemModuleSettings(...)` | `admin.ts` | **REDESENHAR** |
| `isSystemAdminRole/isMasterRole/etc` | `admin.ts` | **MANTER** (lógica pura) |

---

## 6. Funções de vendas e recibos

| Função | Arquivo | Decisão |
|---|---|---|
| `buildVendaPayload(...)` | `vendasSave.ts` | **REDESENHAR** (tipos monetários → centavos) |
| `calcularStatusPeriodo(...)` | `vendasSave.ts` | **MANTER** (lógica pura) |
| `ensureAssignableActiveSeller(...)` | `vendasSave.ts` | **REDESENHAR** |
| `ensureReciboReservaUnicos(...)` | `vendasSave.ts` | **REDESENHAR** |
| `resolveVendaDestinoProduto(...)` | `vendasSave.ts` | **REDESENHAR** |
| `markRankingReadModelDirty(...)` | `vendasSave.ts` | **REDESENHAR** (RPC → D1 upsert) |
| `syncVendaChildren(...)` | `vendasSave.ts` | **REDESENHAR** (RPC → operações Drizzle) |
| `closeQuoteIfNeeded(...)` | `vendasSave.ts` | **REDESENHAR** |
| `normalizeReceiptDisplay/Key(...)` | `vendasSave.ts` | **MANTER** (strings) |
| `toNumber/toNullableNumber/etc` | `vendasSave.ts` | **MANTER** (utilitários) |

---

## 7. Funções de comissões

### `src/lib/server/comissoes.ts`

| Função | Decisão |
|---|---|
| `fetchCommissionContext(...)` | **REDESENHAR** |
| `calcularComissaoRows(...)` | **REDESENHAR** (valores monetários: numeric → centavos) |
| `resolveReceiptCommissions(...)` | **REDESENHAR** |
| `resolveVendaCommissions(...)` | **REDESENHAR** |
| `resolveGroupedVendaCommissions(...)` | **REDESENHAR** |
| `resolveGroupedReceiptCommissions(...)` | **REDESENHAR** |
| `resolveVendaCommission(...)` | **REDESENHAR** |

### `src/lib/utils/comissao.ts`

Contém lógica pura de cálculo de regras de comissão (escalonamento, conciliação, etc):

| Função | Decisão | Notas |
|---|---|---|
| `calcularPctEscalonavel(...)` | **MANTER** | Lógica pura |
| `calcularPctPorRegra(...)` | **MANTER** | Lógica pura |
| `calcularValorComissao(...)` | **REDESENHAR** | Adaptar para centavos |
| `calcularValorComissionavel(...)` | **REDESENHAR** | Adaptar para centavos |
| `determinarPercentualComissao(...)` | **MANTER** | Lógica pura |
| `buildConciliacaoRule(...)` | **EXCLUIR** | Parte do X02 (conciliação) |
| `buildLegacyConciliacaoRule(...)` | **EXCLUIR** | Parte do X02 |
| `sanitizeConciliacaoBandRules(...)` | **EXCLUIR** | Parte do X02 |
| `resolveConciliacaoBandRule(...)` | **EXCLUIR** | Parte do X02 |
| `resolveConciliacaoCommissionSelection(...)` | **EXCLUIR** | Parte do X02 |
| `hasConciliacaoBandRules(...)` | **EXCLUIR** | Parte do X02 |
| `calcularPctConciliacao(...)` | **EXCLUIR** | Parte do X02 |
| `calcularResumoComissoes(...)` | **MANTER** | Lógica pura |
| `agruparComissoesPorVendedor(...)` | **MANTER** | Lógica pura |
| `formatarMoeda(valor)` | **REDESENHAR** | Centavos → formatação |
| `isRegraValida(...)` | **MANTER** | Lógica pura |

### `src/lib/server/comissoes-registro.ts`

| Função | Decisão |
|---|---|
| `fetchPersistedComissoes(...)` | **REDESENHAR** |
| `persistPaidComissoes(...)` | **REDESENHAR** |
| `persistPaidReceiptComissoes(...)` | **REDESENHAR** |
| `applyPersistedComissao(...)` | **MANTER** (lógica pura) |
| `buildPersistedComissaoKey(...)` | **MANTER** (string util) |

---

## 8. Rate limit persistente

| Função / tabela | Arquivo | Decisão |
|---|---|---|
| `security_rate_limits` (tabela) | Migration | **MANTER** → D1 |
| `check_security_rate_limit` (RPC) | Supabase | **REDESENHAR** → lógica em aplicação com Drizzle |
| `src/lib/server/persistentRateLimit.ts` | Server | **REDESENHAR** (Supabase RPC → Drizzle + lógica de limpeza) |

---

## 9. Módulo de conciliação — EXCLUSÃO PLANEJADA (X02)

Tudo abaixo é **EXCLUÍDO** na reescrita. Não criar equivalentes D1.

- Rotas API: 18 endpoints em `src/routes/api/v1/conciliacao/` (mapeados em F0-02)
- Tabelas: `conciliacao_recibos`, `conciliacao_execucoes`, `conciliacao_dias_sem_movimento`, `conciliacao_recibo_changes`
- Lógica: `buildConciliacaoRule*`, `sanitizeConciliacaoBandRules*`, `calcularPctConciliacao`, `resolveConciliacaoBandRule*` (em `comissao.ts`)
- Telas: `/financeiro/ajustes-vendas` e `/admin/parametros-importacao`
- Importers CVC/REXTUR: qualquer arquivo em `src/lib/server/importers/`

**Atenção:** `comissao.ts` mistura funções X02 com funções válidas. Na reescrita, separar em dois arquivos: `comissao-calculo.ts` (manter) e `comissao-conciliacao.ts` (excluir).

---

## 10. Convites e autenticação

| Função | Arquivo | Decisão |
|---|---|---|
| Fluxo de convite (`/api/v1/convites/send`, `accept`) | Routes | **REDESENHAR** (Better Auth + D1) |
| `createOrReuseAuthUser(...)` | `admin.ts` | **REDESENHAR** (Supabase Auth → Better Auth) |
| `findAuthUserIdByEmail(...)` | `admin.ts` | **REDESENHAR** (Supabase Auth → Better Auth) |
| Passkeys (`/auth/passkeys/*`) | Routes | **REDESENHAR** (Supabase Passkeys → Better Auth passkey plugin) |
| MFA/TOTP | Telas Svelte | **REDESENHAR** (Better Auth TOTP/2FA plugin) |
| Turnstile verify | Route | **MANTER** (verificação de token Cloudflare — lógica independente) |

---

## 11. Funções utilitárias portáveis (MANTER sem alteração)

Funções puramente lógicas sem dependência de Supabase ou PostgreSQL:

- `isUuid(value)`, `parseUuidList(...)`, `parseIntSafe(...)` — `v1.ts`
- `normalizeText(...)`, `sanitizePostgrestSearchTerm(...)` — `v1.ts`
- `normalizeModulo(...)`, `permLevel(...)` — `v1.ts`
- `resolvePapel(tipoNome, usoIndividual)` — `v1.ts`
- `resolveScopedCompanyIds(...)`, `resolveScopedCompanyId(...)` — `v1.ts`
- `calcularStatusPeriodo(...)` — `vendasSave.ts`
- `isSaleInScope(sale, params)`, `shouldApplySellerScope(scope)` — `salesScope.ts`
- `canManageUsers/Permissions/Companies(scope)` e guards `ensure*` — `admin.ts`
- `buildPermissionMatrix(...)` — `admin.ts`
- `calcularPctEscalonavel`, `calcularPctPorRegra`, `isRegraValida`, `calcularResumoComissoes` — `comissao.ts`
- `MAPA_MODULOS`, `MODULO_HERANCA`, `listarModulosComHeranca(...)`, `hasModuloAccess(...)` — `modulos.ts`

---

## Aceite verificado

- [x] Papéis documentados com escopo, hierarquia e flag `usoIndividual`
- [x] Níveis de permissão e herança de módulos mapeados
- [x] Todos os guards de autenticação/autorização com decisão
- [x] Funções de escopo de empresa/vendedor com decisão
- [x] Funções de comissão separadas: lógica pura (manter) vs integração DB (redesenhar) vs X02 (excluir)
- [x] Conciliação explicitamente marcada como EXCLUIR (X02)
- [x] Lista de funções portáveis (zero dependência de Supabase)
- [x] Ponto de atenção: `comissao.ts` mistura X02 com válido → separar em F4-01
