# ADR-007: Read Models — Consultas Ao Vivo vs. Pré-Agregação

- **Status**: Aceito
- **Fase**: F4-04
- **Data**: 2026-10-30

## Contexto

F4-03 introduziu `resumoVendas` (totais + reconciliação) e `listarParcelas`
(paginação keyset). O sistema Supabase anterior recalculava tabelas resumo a
cada 5 minutos via cron job. Precisamos decidir se portamos essa estratégia.

## Estimativa de escala (de F0-06)

| Tabela          | Linhas estimadas (1 ano) |
|-----------------|--------------------------|
| `vendas`        | ≤ 5 000                  |
| `venda_itens`   | ≤ 25 000                 |
| `venda_parcelas`| ≤ 15 000                 |
| `venda_pagamentos` | ≤ 15 000              |

Uma agência típica processa 10–50 vendas/dia. O D1 Free tier suporta
5 M leituras de linha/dia; uma query de resumo lendo 5 000 linhas
representa < 0,1 % desse limite.

## Opções consideradas

### A. Live query com índices compostos (escolhida)

- `resumoVendas`: 3 queries SQL com os mesmos predicados (`empresa_id`,
  `cancelada`, `data_venda`).
- `listarVendas`: keyset cursor por `(empresa_id, cancelada, id DESC)`.
- `listarParcelas`: keyset cursor por `(empresa_id, vencimento, id)`.

**Índices adicionados em `0006_f4_04_indices.sql`**:

```sql
idx_vendas_empresa_cancelada_data (empresa_id, cancelada, data_venda)
idx_vendas_empresa_cancelada_id   (empresa_id, cancelada, id)
idx_venda_parcelas_vencimento     (empresa_id, vencimento)
```

**Prós**: sem estado extra, zero lag, sem infra de cron, reconciliação
sempre precisa (invariante verificada em cada chamada).

**Contras**: nenhum relevante nesta escala.

### B. Tabela pré-agregada com rebuild cron (rejeitada)

Portaria diretamente o cron do Supabase (rebuild a cada 5 min).

**Contras**:
- Acrescenta complexidade (tabela extra, lógica de versão, checkpoint,
  recomposição e limite de atraso visível).
- Dados podem estar até 5 min desatualizados.
- D1 Workers Cron Triggers exigem configuração adicional no `wrangler.toml`.
- Desnecessário até > 500 K linhas (estimativa conservadora para SQLite).

### C. Materialização sob demanda / cache em memória

Descartada: Workers são stateless; cache sobreviveria apenas dentro de
uma única invocação.

## Decisão

**Opção A** — live queries com índices compostos.

O rebuild a cada 5 minutos do sistema Supabase **não é portado** conforme
o roteiro de F4-04.

Quando a escala exceder ~100 K vendas/empresa reavaliamos esta decisão.
Nesse ponto o caminho preferido seria Durable Objects com checkpoint
incremental, não uma tabela materializada.

## Consequências

- Nenhuma tabela de agregação a manter.
- `resumoVendas` sempre reflete o estado em tempo real.
- Reconciliação (`itensReconciliam`, `pagamentosReconciliam`) verificada
  a cada chamada — invariante nunca se torna stale.
- Migração `0006_f4_04_indices.sql` deve ser aplicada em produção antes
  de F4-03 entrar em produção (os índices existentes já cobrem F4-01/F4-02).
