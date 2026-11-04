# ADR-009 — Catálogo de Módulos M01–M10: Status de Lançamento

**Status:** ACEITO  
**Fase:** F5-01  
**Data:** 2026-10-30  

## Contexto

O roteiro define 10 módulos (M01–M10) para a reescrita. Este documento registra
o status de cada módulo ao final de F5, com justificativa para inclusão, adiamento
ou exclusão do escopo de lançamento.

**Critério de aceite (herdado de F3/F4):**
- CONCLUÍDO: rota v2 implementada + testes passando + isolamento de tenant provado
- ADIADO: schema e modelo de domínio preservados; rota v2 não exposta; motivo documentado
- EXCLUÍDO: removido intencionalmente do produto; razão de negócio documentada

## Catálogo

### M01 — Identidade e autorização (F2) · **CONCLUÍDO**

Better Auth + D1. Convites, sessões, RBAC (`admin | operador | visualizador`).
Supabase Auth removido do caminho de execução v2. Testes: Suíte A–G passando.

### M02 — Clientes e anexos (F3) · **CONCLUÍDO**

CRUD de clientes com upload de anexos via R2. Isolamento de tenant provado
(Suíte H–I). Playwright E2E validou upload de arquivo real.

### M03 — Produtos e formas de pagamento · **ADIADO**

Schema presente (`produtos`, `formas_pagamento`). FK `produto_id` em `vendas`
é nullable — vendas funcionam sem produto cadastrado.

**Motivo do adiamento:** o catálogo de produtos é preenchido manualmente antes
do go-live; a agência já importará os dados via SQL. Nenhum fluxo de CRUD de
produto precisa estar em v2 no lançamento. A rota v1 legada continua ativa
durante a fase de transição.

**Condição de reabertura:** quando a UI precisar criar/editar produtos sem
intervenção técnica.

### M04 — Vendas e recebimentos (F4) · **CONCLUÍDO**

CRUD completo de vendas, itens, pagamentos e parcelas. Relatório PDF (Suíte L).
Isolamento de tenant e RBAC provados. Conciliação e importação excluídos
(Suíte M). Testes: Suíte J–M passando.

### M05 — Comissões · **EXCLUÍDO**

Comissões dependem de conciliação bancária (M06) para cálculo de base. A
conciliação foi excluída do produto (ADR-006, F4-06). Sem base de cálculo,
o módulo de comissões não pode funcionar corretamente.

**Condição de reabertura:** M06 ou fluxo alternativo de apuração de base.

### M06 — Conciliação bancária e importação · **EXCLUÍDO**

Excluído por decisão de produto (F4-06, Suíte M). O módulo importava extratos
via OFX/CSV e conciliava com pagamentos; toda a infra (tabelas, parsers, rotas)
foi removida da stack v2. O código legado (`routes/conciliacao/`) permanece
ativo apenas na v1 durante a transição, sem novos desenvolvimentos.

### M07 — Orçamentos e roteiros · **ADIADO**

Entidade `viagens` existe no banco legado com dependência de Supabase Storage.
A migração exige: (a) portar o upload de vouchers para R2, (b) reescrever
os parsers de roteiro, (c) implementar PDF de orçamento no padrão Workers.
Escopo relevante mas não crítico para o lançamento.

**Condição de reabertura:** após F6 (operação estável) ou requisito de usuário.

### M08 — Agenda e tarefas · **ADIADO**

Sem schema existente na base v2. Seria um módulo novo. Adiado para fase de
crescimento pós-lançamento.

### M09 — Mural de recados · **ADIADO** (rotas prontas, não montadas)

Código em `src/lib/server/api/routes/mural/` está implementado mas não montado
em `app-v2.ts`. Estratégia de entrega decidida em ADR-008 (polling com cursor,
30 s). A montagem e os testes integrados são o entregável de F5-03.

**Ação pendente F5-03:** montar rotas em `app-v2.ts` e adicionar param `?since=`.

### M10 — Destinos · **ADIADO**

Campo `destino TEXT` em `vendas` é suficiente para o lançamento. Um cadastro
de destinos normalizado (com IATA, região, voos) é úturo relevante mas não
bloqueante.

## Resumo

| Módulo | Domínio | Status |
|--------|---------|--------|
| M01 | Identidade/Auth | ✅ CONCLUÍDO |
| M02 | Clientes/Anexos | ✅ CONCLUÍDO |
| M03 | Produtos/FormasPgto | ⏸ ADIADO |
| M04 | Vendas/Recebimentos | ✅ CONCLUÍDO |
| M05 | Comissões | ❌ EXCLUÍDO |
| M06 | Conciliação/Import | ❌ EXCLUÍDO |
| M07 | Orçamentos/Roteiros | ⏸ ADIADO |
| M08 | Agenda/Tarefas | ⏸ ADIADO |
| M09 | Mural/Recados | ⏸ ADIADO (código pronto) |
| M10 | Destinos | ⏸ ADIADO |

**Aceite de lançamento:** M01, M02, M04 CONCLUÍDOS cobrem o fluxo principal
(vender, cobrar, entregar). M05/M06 excluídos por decisão de produto documentada.
Módulos adiados não aparecem como funcionais na UI.
