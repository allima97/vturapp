# F4-02 — Alteração, cancelamento, estorno e comissão

**Fase:** F4 (Vendas e financeiro)  
**Aceite:** endpoints de edição, cancelamento e estorno funcionando; cálculo de comissão com exemplos documentados; invariantes testados.

---

## 1. Endpoints implementados

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| `PATCH` | `/api/v2/vendas/:id` | `vendas:editar` | Substituição atômica de cabeçalho, itens e pagamentos |
| `POST` | `/api/v2/vendas/:id/cancelar` | `vendas:editar` | Cancelamento lógico (exige `versao`) |
| `POST` | `/api/v2/vendas/:id/estornar` | `vendas:editar` | Estorno financeiro parcial ou total |
| `GET` | `/api/v2/vendas/:id/comissao?taxa_pct=N` | `vendas:ler` | Cálculo de comissão sobre a venda |

---

## 2. Diferença entre cancelamento e estorno

| Aspecto | Cancelamento (`/cancelar`) | Estorno (`/estornar`) |
|---------|---------------------------|----------------------|
| **Efeito** | `cancelada = true`; status → "cancelada" | Nova linha de pagamento com valor negativo |
| **Venda** | Encerrada; não aceita mais operações | Permanece ativa; pode receber novos pagamentos |
| **`valor_pago`** | Não altera | Reduz pelo valor do estorno |
| **Reversível** | Não (sem rota de reativação) | Sim (pode-se criar novo pagamento) |
| **Concorrência** | `versao` verificada e incrementada | `versao` verificada e incrementada |
| **Uso** | Anular totalmente uma venda | Devolver parte ou todo o valor pago |

---

## 3. Cálculo de comissão

### 3.1 Base comissionável

```
base = Σ item.valor_total_centavos  WHERE item.paga_comissao = true
```

Itens com `paga_comissao = false` são excluídos da base. O campo
`vendas.valor_nao_comissionado_centavos` serve para auditoria e reconhecimento
contábil, mas o cálculo usa os itens para máxima precisão.

### 3.2 Arredondamento: banker's rounding (half-even)

Para minimizar acúmulo de erro em séries de vendas com o mesmo percentual, a
comissão usa **arredondamento banker's (half-even)**: quando o resultado cai
exatamente em `.5`, arredonda para o número par mais próximo.

```
comissão = roundHalfEven(base × taxa_pct / 100)
```

| `taxa_pct` | `valor_total` | Cálculo | `roundHalfEven` | `comissão` |
|-----------|--------------|---------|-----------------|------------|
| 10% | R$ 100,00 (10 000 ¢) | 1 000,0 | — | **1 000 ¢** |
| 10% | R$ 33,33 (3 333 ¢) | 333,3 | < .5 → 333 | **333 ¢** |
| 10% | R$ 10,01 (1 001 ¢) | 100,1 | < .5 → 100 | **100 ¢** |
| 10% | R$ 10,05 (1 005 ¢) | 100,5 | par (100) → 100 | **100 ¢** |
| 10% | R$ 10,15 (1 015 ¢) | 101,5 | ímpar (101) → 102 | **102 ¢** |
| 10% | R$ 30,05 (3 005 ¢) | 300,5 | par (300) → 300 | **300 ¢** |
| 10,5% | R$ 200,00 (20 000 ¢) | 2 100,0 | — | **2 100 ¢** |

### 3.3 Exemplo de uso da API

```http
GET /api/v2/vendas/42/comissao?taxa_pct=10
Authorization: Cookie session=...

HTTP/1.1 200 OK
{
  "data": {
    "baseComissionavelCentavos": 10000,
    "taxaPct": 10,
    "comissaoCentavos": 1000,
    "valorNaoComissionadoCentavos": 0
  }
}
```

---

## 4. Estorno: exemplos de uso

### 4.1 Estorno parcial

```http
POST /api/v2/vendas/42/estornar
Content-Type: application/json

{
  "forma_nome": "Cartão Crédito",
  "valor_centavos": 3000,
  "motivo": "cliente solicitou devolução parcial",
  "versao": 1
}

HTTP/1.1 200 OK
{
  "data": {
    "valor_pago_centavos": 7000,
    "versao": 2,
    "cancelada": false,
    "pagamentos": [
      { "valor_total_centavos": 10000, "operacao": "crédito" },
      { "valor_total_centavos": -3000, "operacao": "estorno: cliente solicitou devolução parcial" }
    ]
  }
}
```

### 4.2 Estorno total

```http
POST /api/v2/vendas/42/estornar
{
  "forma_nome": "Pix",
  "valor_centavos": 7000,
  "motivo": "cancelamento a pedido do cliente",
  "versao": 2
}
```

Após estorno total, `valor_pago_centavos = 0`. A venda permanece ativa
(não cancelada); use `/cancelar` para encerrar operacionalmente.

---

## 5. Invariantes preservados

| Invariante | Mecanismo |
|-----------|-----------|
| Isolamento de tenant | `WHERE empresa_id = ?` no SELECT antes de qualquer mutação |
| Concorrência otimista | `UPDATE ... WHERE versao = ?`; lança `CONFLITO_VERSAO` se 0 linhas afetadas |
| Venda cancelada inoperante | CHECK na entrada de estorno: lança `CANCELADA` se `cancelada=true` |
| Valor positivo | Validação em serviço antes de qualquer escrita |
| Audit trail | Linha de estorno preservada em `venda_pagamentos`; nunca excluída |

---

## 6. Testes

### Suíte N — cálculo de comissão (vitest puro, sem DB)
`src/lib/server/f4-02-comissao.test.ts`

| ID | Caso |
|----|------|
| N1 | 10% sobre R$100,00 = R$10,00 |
| N2 | 10% sobre R$33,33 = 333¢ (truncado de 333.3) |
| N3 | 10% sobre R$10,15 = 102¢ (101.5 → ímpar → 102) |
| N4 | 10% sobre R$10,05 = 100¢ (100.5 → par → 100) |
| N5 | 10% sobre R$30,05 = 300¢ (300.5 → par → 300) |
| N6 | Itens mistos: somente comissionáveis entram na base |
| N7 | Taxa 0% → comissão zero |
| N8 | Taxa 100% → comissão = base |
| N9 | Nenhum item comissionável → base e comissão = 0 |
| N10 | Taxa > 100 → VendaError VALIDACAO |
| N11 | Taxa negativa → VendaError VALIDACAO |
| N12 | Taxa fracionária 10.5% |
| N-rhe | 9 casos de roundHalfEven |

### Suíte O — estorno (Workers runtime / D1 efêmero)
`src/lib/server/f4-02-estorno.workers.test.ts`

| ID | Caso |
|----|------|
| O1 | Estorno parcial: valor_pago reduz, linha negativa inserida |
| O2 | Estorno total: valor_pago = 0 |
| O3 | versaoAtual errada → CONFLITO_VERSAO |
| O4 | Venda inexistente → NAO_ENCONTRADA |
| O5 | Venda cancelada → CANCELADA |
| O6 | valor_centavos = 0 → VALIDACAO |
| O7 | Empresa errada → NAO_ENCONTRADA (isolamento) |
| O8 | Estornos sequenciais: versão incremental correta |

---

## 7. Datas em cálculos financeiros

Todos os campos de data em `vendas`, `venda_itens` e `venda_parcelas` são
strings `YYYY-MM-DD` (SQLite `TEXT`). Comparações de data usam ordenação
lexicográfica, que é equivalente a numérica para este formato.

Campos relevantes para comissão e vencimento:

| Campo | Onde | Significado |
|-------|------|-------------|
| `data_venda` | cabeçalho | Data da formalização da venda |
| `data_lancamento` | cabeçalho | Data de lançamento contábil |
| `data_embarque` | cabeçalho | Início do serviço; afeta status derivado |
| `data_final` | cabeçalho | Fim do serviço; se < hoje → status "concluida" |
| `data_servico` | item | Data de execução do item |
| `vencimento` | parcela | Data de vencimento da parcela |

O status "concluida" é **derivado** (`derivarStatus`): não é persistido, é
calculado a cada leitura. Isso evita inconsistências quando a data muda.

---

## 8. Backlog / próximos passos

- [ ] Tela de estorno na UI (botão no detalhe da venda)
- [ ] Relatório de comissões por vendedor (soma por período)
- [ ] Integração com M05 (comissão → caixa do vendedor)
