# ADR-005 — Valores monetários, percentuais e datas

**Estado:** CONFIRMADA  
**Data:** 2026-10-26  
**Aplicável desde:** F1-03 (validação) e F2-01 (schema Drizzle)  

## Contexto

O banco atual usa PostgreSQL `numeric` para valores monetários (ex: `123.45` BRL) com `Math.round()` na aplicação. No D1/SQLite não há tipo `numeric` nativo — usar `REAL` levaria a erros de ponto flutuante acumulados.

## Decisão

### Valores monetários

**INTEGER (centavos).** `R$ 123,45` é armazenado como `12345`.

- Toda entrada do usuário (campo de formulário) converte de reais para centavos antes de gravar
- Toda exibição converte de centavos para reais (`valor / 100`)
- Operações de soma/subtração são inteiras — sem ponto flutuante
- Sem `Math.round()` para operações básicas

### Percentuais e câmbio

**INTEGER com escala de 2 casas decimais.** `10,50%` → `1050` (= 10.50 × 100).

- Câmbio: 4 casas decimais → `R$ 5,0123/USD` → `50123` (= 5.0123 × 10000)
- Convenção a ser confirmada e documentada no schema Drizzle antes de F2-01

### Datas

| Dado | Tipo D1 | Formato |
|---|---|---|
| Data de calendário (vencimento, data de viagem) | `TEXT` | `YYYY-MM-DD` |
| Instante / evento | `TEXT` | ISO 8601 UTC (`2026-10-26T09:00:00Z`) |
| Timestamp com fuso | `TEXT` UTC no banco | Converter para fuso de exibição no cliente |

**Nunca converter automaticamente uma data sem hora em timestamp.**

### Drizzle — convenções de tipo

```ts
// Booleano
integer('ativo', { mode: 'boolean' })

// Data de calendário
text('data_viagem')  // 'YYYY-MM-DD'

// Timestamp UTC
text('criado_em')    // ISO 8601 UTC

// UUID
text('id').$type<string>()

// Valor monetário (centavos)
integer('valor_bruto')  // centavos inteiros

// Percentual (2 casas)
integer('pct_comissao')  // ex: 1050 = 10.50%
```

## Consequências

- F1-03 valida inserção e leitura correta em D1 real
- Todas as operações de cálculo em `comissao.ts` que usem valores monetários precisam ser adaptadas para centavos (mapeado em F0-04)
- Formulários de venda e recibo precisam de função utilitária centralizada de conversão reais↔centavos
- A função `formatarMoeda(valor)` em `comissao.ts` será adaptada para receber centavos

## Por que não REAL?

SQLite `REAL` usa IEEE 754 double (64-bit). Somas de muitos valores podem acumular erro. Para dados financeiros, INTEGER é a única opção segura sem usar biblioteca BigDecimal.
