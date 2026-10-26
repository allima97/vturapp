# F0-07 — Decisões pendentes e registro ADR

**Fase:** F0 — Inventário e baseline  
**Criado em:** 2026-10-26  

## Objetivo

Registrar as decisões arquiteturais abertas no início da reescrita, indicando o critério de fechamento de cada uma e onde está documentada.

## Decisões registradas em `docs/adr/`

| ADR | Título | Estado | Fecha em |
|-----|--------|--------|----------|
| [ADR-001](../adr/ADR-001-stack-principal.md) | Stack principal (SvelteKit + Hono + D1 + R2 + Drizzle) | PROPOSTA | F1-02 — prova de stack |
| [ADR-002](../adr/ADR-002-autenticacao.md) | Autenticação (Better Auth vs sessão própria) | PROPOSTA | F1-04 — prova de auth |
| [ADR-003](../adr/ADR-003-ui-base-visual.md) | UI base visual (wrappers atuais vs Bits UI/shadcn-svelte) | PROPOSTA | F1-06 — comparação de formulário |
| [ADR-004](../adr/ADR-004-tempo-real.md) | Tempo real (polling com cursor vs DO/WebSockets) | PROPOSTA | Validar com usuários; sem prazo fixo |
| [ADR-005](../adr/ADR-005-dinheiro-datas.md) | Valores monetários e datas (INTEGER centavos, TEXT ISO 8601) | CONFIRMADA | — |
| [ADR-006](../adr/ADR-006-importacao-historica.md) | Importação de dados históricos | CONFIRMADA (DISPENSADA) | — |

## Regra de versionamento

- Decisão nova → novo arquivo ADR com número sequencial
- Decisão revertida ou superada → novo ADR que referencia o anterior; o arquivo original **nunca é editado retroativamente**
- Estado `CONFIRMADA` significa: decisão tomada e não revisável sem novo ADR
- Estado `PROPOSTA` significa: candidato escolhido, mas depende de prova em fase futura

## Decisões pendentes não mapeadas em ADR

Os itens abaixo foram identificados no roteiro mas ainda não têm ADR — serão abertos em cada fase correspondente:

| Tema | Fase que abre o ADR |
|------|---------------------|
| Escopo mínimo do lançamento (MVP vs full) | F1-01 |
| Estratégia de convite e onboarding de usuário no sistema novo | F3-02 |
| Política de soft delete vs hard delete | F2-01 |
| Estratégia de cache KV (TTL, invalidação) | F3-05 |
| Cron scheduling: crontriggger Cloudflare vs KV-lock | F4-03 |

## Importação histórica — nota de contexto

Conforme ADR-006, a decisão de **dispensar a importação histórica** foi tomada pelo usuário em 2026-10-26. O banco Supabase original **não será excluído** durante a reescrita.
