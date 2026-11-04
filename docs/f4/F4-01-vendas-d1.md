# F4-01 — Venda manual D1: schema, validação, service e API

**Fase:** F4 — Núcleo de vendas e financeiro  
**ID:** F4-01  
**Commit:** `963e6952`  
**Data:** 30/10/2026  
**Testes:** 926 passando (18 novos workers)

---

## 1. Escopo

Implementar o núcleo de criação de venda manual no novo stack D1/Drizzle,
cobrindo:

- schema relacional (6 tabelas)
- validação e normalização de entrada
- service com atomicidade e idempotência
- rota Hono `/api/v2/vendas`
- testes Workers (suítes A–G)

---

## 2. Schema (drizzle/0005_f4_vendas.sql)

### Tabelas criadas

| Tabela | Propósito | empresa_id |
|--------|-----------|-----------|
| `produtos` | Catálogo global de produtos/destinos | ❌ global |
| `formas_pagamento` | Formas de pagamento por empresa | ✅ |
| `vendas` | Cabeçalho da venda | ✅ |
| `venda_itens` | Recibos/serviços da venda | ✅ |
| `venda_pagamentos` | Pagamentos da venda | ✅ |
| `venda_parcelas` | Parcelas de cada pagamento | ✅ |

### Decisões de design

- **`produtos` é global**: sem `empresa_id`, compartilhado entre agências
  (replicando comportamento do legado Supabase).
- **`chave_idempotencia` UNIQUE global**: UUID v4 gerado pelo cliente previne
  duplicação em retry de POST. Como UUIDs v4 são globalmente únicos, um índice
  global é mais seguro que por empresa.
- **`cancelada` boolean, não enum**: status é derivado em leitura
  (`derivarStatus()`); não há coluna de status persistida.
- **`versao` INTEGER** para concorrência otimista
  (`UPDATE ... WHERE versao = ? RETURNING id`).

---

## 3. Valores monetários (ADR-005)

Todos os valores em centavos inteiros:

| Campo | Exemplo | Armazenado |
|-------|---------|-----------|
| `valor_bruto` | R$ 600,00 | `600000` |
| `valor_taxas` | R$ 50,00 | `5000` |
| `valor_total` | R$ 605,00 | `605000` |
| `cambio` | 5,1234/USD | `51234` (4 casas) |
| `desconto_pct` | 10,50% | `1050` (2 casas) |

Utilitário: `reaisToCentavos(v: unknown): number`

---

## 4. Validação (`validation.ts`)

```typescript
const result = validarVenda(body);
if (!result.ok) {
  // result.errors: Record<string, string>
}
const dados: VendaNormalizada = result.dados;
```

### Regras

- `data_venda` obrigatória, YYYY-MM-DD, não pode ser futura
- `data_lancamento` padrão = hoje; não pode ser futura
- `data_venda <= data_lancamento`
- `itens`: mínimo 1
- `pagamentos`: mínimo 1
- `chave_idempotencia`: UUID v4 se informada

### Normalização

- Moeda não informada → `'BRL'`
- `cambio` não informado → `10000` (1.0000)
- `valor_total` de item = `valor_bruto + valor_taxas` (calculado, não confiado do cliente)
- `valor_total` de pagamento = `valor_bruto - desconto` (calculado)

---

## 5. Service (`service.ts`)

### Atomicidade no Workers runtime

O D1 no Workers runtime rejeita `BEGIN TRANSACTION` SQL direto (Drizzle usa
`db.transaction()` que emite `begin`). A solução é inserção sequencial sem
transação explícita, passando `D1Database` opcional para usar `d1.batch()` em
paralelo onde possível (itens e parcelas).

```typescript
await criarVenda(db, empresaId, userId, dadosNormalizados, env.DB);
```

### Status derivado

```typescript
export function derivarStatus(row): VendaStatus {
  if (row.cancelada) return 'cancelada';
  const hoje = /* YYYY-MM-DD */;
  if (row.dataFinal && row.dataFinal < hoje) return 'concluida';
  if (row.dataEmbarque && row.dataEmbarque >= hoje) return 'confirmada';
  return 'pendente';
}
```

### Número de venda

Formato: `VTUR-AAAA-NNNNN` (sequencial por empresa).

### Idempotência

1. Se `chave_idempotencia` informada, verifica existência por `(empresa_id, chave)`.
2. Se já existe → retorna venda existente sem criar nova.
3. Se não existe → insere normalmente.

---

## 6. API (`/api/v2/vendas`)

| Método | Endpoint | Ação | Permissão |
|--------|----------|------|-----------|
| GET | `/api/v2/vendas` | Listar (cursor + filtros) | vendas:ler |
| POST | `/api/v2/vendas` | Criar | vendas:criar |
| GET | `/api/v2/vendas/:id` | Detalhe completo | vendas:ler |
| POST | `/api/v2/vendas/:id/cancelar` | Cancelar (exige versao) | vendas:editar |
| GET | `/api/v2/vendas/produtos` | Lista global de produtos | vendas:ler |
| GET | `/api/v2/vendas/formas-pagamento` | Formas da empresa | vendas:ler |

### POST /api/v2/vendas — body mínimo

```json
{
  "data_venda": "2024-11-01",
  "chave_idempotencia": "550e8400-e29b-41d4-a716-446655440000",
  "itens": [{
    "descricao": "Pacote Cancún 7 noites",
    "valor_bruto": "6000.00",
    "valor_taxas": "50.00"
  }],
  "pagamentos": [{
    "forma_nome": "Cartão de Crédito",
    "valor_bruto": "6050.00",
    "parcelas_qtd": 3,
    "parcelas": [
      { "numero": 1, "valor": "2016.67", "vencimento": "2024-12-01" },
      { "numero": 2, "valor": "2016.67", "vencimento": "2025-01-01" },
      { "numero": 3, "valor": "2016.66", "vencimento": "2025-02-01" }
    ]
  }]
}
```

---

## 7. Testes Workers (vendas.workers.test.ts)

| Suíte | Cobertura |
|-------|-----------|
| A. Criação | Transação, totais calculados, número sequencial |
| B. Idempotência | Mesma chave → mesma venda; chaves distintas → vendas distintas |
| C. Listagem | Cursor pagination, filtros (canceladas) |
| D. Detalhe | Venda com itens + pagamentos + parcelas |
| E. Cancelamento | Lógico, concorrência otimista, já cancelada |
| F. Isolamento | Empresa B não lê/cancela venda da empresa A |
| G. Status | derivarStatus() — todos os 4 estados |

---

## 8. Aceite F4-01

- [x] Schema migrado (SQL gerado manualmente por incompatibilidade de plataforma)
- [x] Validação com normalização ADR-005
- [x] Service com idempotência e status derivado
- [x] Rota Hono registrada em `/api/v2/vendas`
- [x] 18 testes Workers passando
- [x] Suíte completa: 926 testes, 0 regressões
