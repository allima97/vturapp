# F2-03 — Políticas centralizadas e contexto de acesso (RBAC)

**Status:** ✅ Concluído
**Commit:** `ffad78a0` — feat(f2-03): política RBAC centralizada — matriz VTUR + funções de autorização
**Data:** 26/10/2026

## Objetivo

Implementar políticas centralizadas e contexto de acesso, com matriz de capacidades e escopos reais do VTUR, sem hierarquia inventada (correção F3.5 do plano anterior: nada de `master > admin > gestor > vendedor > viewer`).

## Implementação

### Matriz de capacidades — `src/lib/server/policy/matrix.ts`

- **9 recursos:** empresa, usuarios, convites, vendas, clientes, financeiro, relatorios, configuracoes, auditoria
- **6 ações:** ler, criar, editar, excluir, gerenciar, exportar
- **3 papéis:** admin (superset), operador (escrita limitada), visualizador (leitura) — definidos em `src/lib/server/db/schema.ts` (`PAPEIS`)
- `MATRIZ_RBAC: Record<Papel, Set<"recurso:acao">>` — lookup O(1)

### Funções de autorização — `src/lib/server/policy/authorize.ts`

| Função | Tipo | Uso |
|---|---|---|
| `can(papel, recurso, acao)` | pura → boolean | verificação única |
| `canAny(papel, recurso, acoes[])` | pura → boolean | qualquer uma das ações |
| `canAll(papel, recurso, acoes[])` | pura → boolean | todas as ações |
| `authorize(papel, recurso, acao, fn)` | `{ ok, value \| response }` | handlers SvelteKit |
| `requireCan(recurso, acao)` | `MiddlewareHandler<ApiEnv>` | rotas Hono |
| `listarCapacidades(papel)` | `string[]` | UI/depuração |
| `temAcessoAoRecurso(papel, recurso)` | boolean | menus |

## Integração

- Contexto de acesso resolvido por `resolveAuthContext()` (`src/lib/server/auth/context.ts`, F2-02): a identidade e os vínculos vêm da sessão validada, não de `company_id` vindo do navegador.
- Escopo de tenant aplicado por `src/lib/server/tenant/guard.ts` (F2-04): RBAC responde "pode fazer?", o tenant guard responde "neste registro?".
- Negação por padrão: capacidade ausente da matriz = negado.

## Validação

- `src/lib/server/policy/policy.test.ts` — 42 testes puros, sem banco:
  - permissões básicas por papel (20 casos);
  - `canAny`/`canAll` (4 casos);
  - invariantes da matriz: admin ⊇ operador ⊇ visualizador, formatos `recurso:acao` válidos;
  - `authorize()` com 401/403 corretos;
  - `listarCapacidades`/`temAcessoAoRecurso`.
- Baseline revalidada em 26/10/2026: 879 testes passando, `svelte-check` 0 erros, build OK (commit `c8bb5a58`).

## Pendências

- A matriz atual cobre os papéis base (admin/operador/visualizador). Os escopos legados mais finos (FINANCEIRO, GESTOR de equipe, uso individual, múltiplas empresas MASTER) serão refinados quando os módulos de negócio correspondentes entrarem (M01, M04, M05), conforme seção 5 do roteiro.
