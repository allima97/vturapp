# ADR-004 — Estratégia de tempo real (mural de recados)

**Estado:** SUPERSEDIDO (por ADR-008)  
**Data:** 2026-10-26  

## Contexto

O VTUR tem um mural de recados (`mural_recados`) que pode exigir notificação em tempo real. KV tem consistência eventual e não é adequado para pub/sub. Workers SSE não fornece broadcast entre instâncias. Durable Objects (DO) suporta WebSockets mas adiciona custo e complexidade.

## Decisão proposta

**Polling com cursor** como primeira hipótese.

- Client faz GET periódico (ex: a cada 30s) com timestamp do último recado lido
- Servidor retorna novos recados desde o cursor
- Zero infra adicional; compatível com Workers stateless

Só migrar para DO/WebSockets se houver **requisito demonstrado** de latência real (< 5s) com múltiplos usuários simultâneos ativos no mural.

## Consequências

- Requisito de "tempo real verdadeiro" deve ser validado com usuários antes de implementar DO
- SSE pode ser implementado como passo intermediário se polling de 30s for rejeitado

## Alternativas consideradas

- **Durable Objects + WebSockets:** correto para broadcast; custo e complexidade altos sem requisito validado
- **KV como pub/sub:** inadequado (consistência eventual); descartado
- **SSE simples:** não fornece broadcast entre instâncias; inadequado para múltiplos usuários
