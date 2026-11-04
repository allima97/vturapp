# ADR-006 — Importação de dados históricos

**Estado:** CONFIRMADA  
**Data:** 2026-10-26  
**Decisão:** DISPENSADA por decisão do usuário  

## Contexto

A reescrita parte de um banco D1 vazio. A base Supabase atual contém vendas, clientes, usuários, histórico de comissões e outros dados operacionais acumulados em produção.

## Decisão

**Não será feita nenhuma migração de dados históricos.** A nova instalação parte com banco vazio.

Confirmado pelo usuário em 2026-10-26, durante a execução da fase F0.

## Implicações

- Nenhum script ETL será produzido para transferir dados do PostgreSQL para D1
- Seeds de desenvolvimento (`docs/seeds/`) usarão dados sintéticos (especificação em F0-06)
- O banco Supabase original **não será excluído** durante a reescrita — permanece como referência e como fallback enquanto o sistema novo não entrar em produção
- Métricas históricas de comissão, ranking e dashboard partem do zero na nova instalação
- Usuários precisarão re-registrar passkeys e MFA na nova autenticação (Better Auth)

## Por que dispensada

- Complexidade de ETL PostgreSQL → SQLite envolve conversões de tipo (numeric → integer, UUID, timestamps, booleanos), relacionamentos e possível inconsistência de dados
- Base vazia é mais simples de validar e testar
- Não há requisito de continuidade operacional imediata — a migração de usuários ativos pode ser feita manualmente pelo ADMIN no sistema novo
