# ADR-001 — Stack principal da reescrita

**Estado:** PROPOSTA (pendente confirmação em F1-02)  
**Data:** 2026-10-26  
**Decisão revertida/nova:** —  

## Contexto

A aplicação atual usa SvelteKit 2.59.0 + Svelte 5.55.1 + Hono 4.12.16 + Supabase (PostgreSQL) + adapter-cloudflare 7.2.8 + Wrangler 4.87.0. A reescrita substitui Supabase por Cloudflare D1 + R2. A questão é se atualizar também para SvelteKit 3.x.

## Decisão proposta

**Manter SvelteKit 2.x** nas versões já instaladas (2.59.0 + Svelte 5.55.1) para o início da reescrita. Avaliar atualização para Kit 3 **apenas após** a prova de stack em F1-02.

Manter: Hono 4.12.16, adapter-cloudflare, Wrangler.

## Motivação

- Kit 3.x muda APIs de configuração e integração com Cloudflare — adicionar isso ao escopo da reescrita aumenta o risco sem benefício imediato
- A versão atual já roda em produção com adapter-cloudflare; o risco de regressão é baixo
- A prova em F1-02 pode revelar incompatibilidades antes da decisão de atualizar

## Consequências

- F1-02 deve incluir benchmark de Kit 3 em ambiente isolado como opcional
- Se Kit 3 for adotado, criar novo ADR substituindo este
- Versões exatas serão fixadas no lockfile após a prova

## Alternativas consideradas

- **Kit 3.x imediatamente:** risco alto sem ganho comprovado; descartada
- **Continuar em Kit 2.x permanentemente:** pode ser necessário; revisar após F1-02
