# ADR-008 — Mural de Recados: Polling com Cursor

**Status:** ACEITO  
**Fase:** F5-03  
**Data:** 2026-10-30  

## Contexto

O sistema possui um módulo de mural de recados (`src/lib/server/api/routes/mural/`)
com as rotas de leitura e escrita já implementadas, mas **não montadas** no
`app-v2.ts`. A decisão de estratégia de tempo real foi deixada como PROPOSTA
em ADR-004.

Opções avaliadas:

| Opção | Prós | Contras |
|-------|------|---------|
| **Polling HTTP** | Zero infra extra; stateless; simples de implementar e testar | Latência ≥ intervalo de poll |
| SSE (Server-Sent Events) | Menor latência que polling | Exige conexão persistente; Workers têm limite de CPU/duração; sem broadcast nativo entre instâncias |
| Durable Objects + WebSocket | Broadcast real entre usuários | Custo adicional; complexidade; exige requisito de latência < 5 s validado com usuários |

## Decisão

**Polling com cursor** — confirmando a hipótese de ADR-004.

- Client faz `GET /api/v2/mural/recados?since=<timestamp_iso>` a cada **30 s**.
- Servidor retorna apenas recados criados após `since` (cursor).
- `since` é guardado em `localStorage` no cliente; na primeira visita usa
  `Date.now() - 24h` para carregar recados do dia.
- Intervalo padrão: 30 s; pode ser ajustado por empresa sem alterar a API.

## Justificativa

1. **Requisito não validado**: nenhum usuário pediu latência < 5 s no mural.
   Uma agência típica tem ≤ 20 usuários simultâneos; polling de 30 s é
   perceptualmente instantâneo para comunicação assíncrona.
2. **Workers stateless**: SSE exigiria reconexão/heartbeat e não faz broadcast
   entre instâncias Workers sem estado compartilhado (KV é eventually
   consistent — ADR-004 já descartou KV como pub/sub).
3. **Custo**: Durable Objects adicionam custo fixo mensal sem necessidade
   comprovada.

## Consequências

- As rotas de mural existentes (`routes/mural/`) serão **montadas em app-v2.ts**
  sob `/api/v2/mural`.
- A rota de leitura **deve aceitar `?since=` como query param** e retornar
  array vazio quando não há recados novos (sem 304, para simplicidade).
- Remoção de acesso (`membrosEmpresa` removido ou papel alterado) é efetiva
  no próximo poll (≤ 30 s de janela — aceitável).
- Migrar para DO/WebSockets **se e somente se** houver requisito demonstrado
  de latência real com N ≥ 3 usuários ativos simultaneamente no mural.

## Arquivos afetados (F5-03)

| Arquivo | Ação |
|---------|------|
| `src/lib/server/api/app-v2.ts` | Montar `muralV2Routes` em `/mural` |
| `src/lib/server/api/routes/mural/index.ts` | Adicionar param `?since=` |
| `src/lib/server/api/routes/mural/recados.ts` | Filtro `WHERE criado_em > ?` |

ADR-004 é supersedido por este documento; seu status passa a SUPERSEDIDO.
