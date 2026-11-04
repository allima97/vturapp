# F0-06 — Cenários de UX/performance e estimativas de custo D1

**Estado:** CONCLUÍDA  
**Responsável / data:** 2026-10-26  
**Dependência:** F0-01, F0-03  

> Estimativas baseadas no modelo de precificação do Cloudflare D1 (2025) e no inventário da aplicação. Números são estimativas de planejamento — não substituem medição real.

---

## 1. Dados sintéticos para testes de carga

Volumes representativos de uma agência de médio porte (uso real estimado):

| Entidade | Volume | Notas |
|---|---|---|
| Empresas (tenants) | 1 MASTER com 3–10 empresas filhas | Escala MASTER típica |
| Usuários por empresa | 5–30 | Vendedores + gestores + financeiro |
| Vendas por empresa/mês | 100–500 | Pico dezembro/janeiro |
| Recibos por venda | 1–5 | Média ~2 |
| Clientes por empresa | 500–5.000 | Acumulado ao longo dos anos |
| Meses de histórico no read model | 24 | 2 anos para relatórios |
| Produtos | 200–2.000 | Catálogo do fornecedor |
| Roteiros ativos | 50–500 | |

**Dados sintéticos para seeds F1:** gerar ~3 empresas, 10 usuários, 1.000 vendas/empresa, 12 meses de histórico = ~36.000 vendas totais nos seeds de teste.

---

## 2. Modelo de precificação D1 (Cloudflare Workers, 2025)

### Limites do plano Workers Free

| Recurso | Limite Free |
|---|---|
| Leituras/dia | 5 milhões |
| Escritas/dia | 100.000 |
| Armazenamento | 5 GB |
| Bancos D1 | 10 |

### Limites do plano Workers Paid ($5/mês base)

| Recurso | Incluído | Excesso |
|---|---|---|
| Leituras/mês | 25 bilhões | $0.001/milhão |
| Escritas/mês | 50 milhões | $0.001/milhão |
| Armazenamento | 5 GB incluídos | $0.75/GB/mês |

> **Conclusão:** Para uma agência de médio porte, o plano Free é suficiente nas leituras. Escritas podem exceder o limite Free em períodos de pico. Workers Paid ($5/mês) cobre com margem ampla.

---

## 3. Estimativas de custo por operação

### Leituras por requisição API (exemplos representativos)

| Endpoint | Tabelas acessadas | Leituras D1 estimadas |
|---|---|---|
| `GET /api/v1/vendas/list` | 6 | ~20–50 linhas lidas |
| `GET /api/v1/clientes/historico` | 6 | ~30–100 linhas |
| `GET /api/v1/dashboard/summary` | 5 + read model | ~10 + read model |
| `GET /api/v1/relatorios/vendas` | 6 | ~100–1.000 linhas |
| `POST /api/v1/roteiros/save` | 7 | ~10 escritas + validações |
| `POST /api/v1/vendas/[id]` (save) | 6 | ~5–10 escritas + read model dirty |

### Estimativa de tráfego diário (agência ativa)

| Operação | Req/dia estimado | Leituras D1/dia | Escritas D1/dia |
|---|---|---|---|
| Listagens (vendas, clientes, orçamentos) | 500 | ~25.000 | 0 |
| Dashboards/relatórios | 200 | ~20.000 | 0 |
| Saves (vendas, recibos, clientes) | 100 | ~500 | ~1.000 |
| Auth (login, check de sessão) | 300 | ~300 | ~100 |
| Read model rebuild (cron 5min) | 288/dia | ~50.000 | ~5.000 |
| **Total estimado** | | **~96.000 leituras/dia** | **~6.100 escritas/dia** |

**Plano Free:** 5M leituras/dia → **96.000 = ~2%** do limite. Escritas: 100K/dia → **6.100 = ~6%** do limite. **Plano Free é suficiente.**

---

## 4. Custo do rebuild do read model (análise crítica)

### Como funciona hoje

1. Cron de 5 min → detecta `ranking_read_model_status` com `status = 'dirty'`
2. Para cada empresa/mês dirty → `DELETE + INSERT` na tabela `ranking_recibo_contribuicoes`
3. `INSERT_CHUNK_SIZE = 500` linhas por batch
4. Cron noturno (06:07 UTC) → marca todos os meses dos últimos N meses como dirty

### Custo por rebuild completo (empresa com 500 vendas/mês)

| Etapa | Operação D1 | Custo estimado |
|---|---|---|
| Leitura de status dirty | 1 query | ~50 linhas lidas |
| Delete de contribuições do mês | 1 DELETE | ~500 linhas escritas |
| Select de recibos/contribuições | 3–5 queries | ~500–2.000 linhas lidas |
| Insert de contribuições | batches de 500 | ~500 linhas escritas |
| **Por empresa/mês** | | ~2.500 leituras + 1.000 escritas |

### Impacto do cron noturno (3 empresas × 24 meses)

- 72 rebuilds completos por cron noturno
- ~180.000 leituras + 72.000 escritas em ~10 minutos
- No plano Free: **18 min de escritas do limite diário consumidos em 1 execução**
- **Risco:** Cron noturno pode esgotar cota de escritas do Free em períodos de rebuild total

**Recomendação para F4-04:** avaliar rebuild incremental (só os meses dirty de verdade, sem forçar tudo no cron noturno) e lazy rebuild por demanda (reconstruir só quando acessado). No plano Paid, não há problema.

---

## 5. Limites de D1 a respeitar

| Limite | Valor | Impacto |
|---|---|---|
| Tamanho máximo de query SQL | 100 KB | Sem impacto esperado |
| Linhas por transação | ~10.000 | Usar chunks no rebuild |
| Tamanho máximo do banco | 10 GB (Paid) | Sem risco; histórico de 2 anos < 500 MB |
| Tempo de execução do Worker | 30s (CPU) / 5 min (wall) | Rebuild por mês deve ser < 30s |
| Tamanho máximo de linha | 1 MB | Sem risco (linhas pequenas) |

> **Atenção para read model:** o rebuild completo de 1 empresa × 1 mês deve ser medido em F4-04 para garantir que fica abaixo de 30s de CPU. SQLite não tem pg_proc — queries complexas precisam ser validadas.

---

## 6. Cenários de UX com SLA esperado

| Cenário | SLA esperado | Estratégia |
|---|---|---|
| Login / check de sessão | < 200ms | Better Auth com D1 |
| Listagem de vendas (< 500 itens) | < 300ms | Query D1 com índices; sem RPC |
| Dashboard principal | < 800ms | Read model em cache KV; stale-while-revalidate |
| Relatório de vendas (1 mês) | < 1.000ms | D1 query direta ou read model |
| Save de venda (write + dirty flag) | < 500ms | Transação D1 + waitUntil para dirty async |
| Rebuild de read model (1 empresa/mês) | < 30s | D1 batch INSERT; monitorar em F4 |
| Upload de logo/imagem | < 2.000ms | R2 PUT direto via presigned URL |
| Geração de PDF (orçamento/voucher) | < 3.000ms | Sem mudança na lógica; apenas armazenamento em R2 |

---

## 7. Decisão: R2 para arquivos

Atualmente: logos e PDFs de orçamento via Supabase Storage.

| Arquivo | Tamanho estimado | Frequência |
|---|---|---|
| Logo de empresa | < 500 KB | Raro (upload único) |
| PDF de orçamento | 200 KB–2 MB | Alta (gerado por venda) |
| PDF de voucher | 200 KB–1 MB | Alta (gerado por viagem) |
| Fotos de acompanhantes/documentos | 1–5 MB | Moderada |

**R2 pricing:** $0.015/GB/mês armazenamento + $4.50/1M ops Class A (PUT/POST) + $0.36/1M ops Class B (GET). Para 10 GB/mês armazenado + 10K uploads + 100K downloads: ~$0.27/mês. Custo insignificante.

---

## Aceite verificado

- [x] Volumes sintéticos definidos para seeds de testes
- [x] Modelo de precificação D1 documentado (Free vs Paid)
- [x] Estimativa de leituras/escritas por dia (plano Free é suficiente)
- [x] Custo do rebuild do read model analisado (risco no cron noturno documentado)
- [x] Limites D1 críticos registrados (30s CPU, chunks no rebuild)
- [x] SLA esperado por cenário UX
- [x] Decisão R2 documentada (custo negligenciável)
- [x] Risco principal: cron noturno × Free tier (recomendação para F4-04)
