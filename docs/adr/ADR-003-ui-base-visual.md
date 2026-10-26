# ADR-003 — Base visual e componentes de UI

**Estado:** PROPOSTA (pendente confirmação em F1-06)  
**Data:** 2026-10-26  

## Contexto

A aplicação atual tem:
- Wrappers customizados em `src/lib/components/ui` (sobre Flowbite 1.33.1 atual e copias de Flowbite 0.48.6 legadas)
- Mistura de versões de Flowbite na mesma base de código
- Tailwind 4.3.3

A questão é se manter essa base ou migrar para uma base mais acessível e mantida (ex: Bits UI / shadcn-svelte).

## Decisão proposta

**Preservar os wrappers atuais** como ponto de partida na reescrita. **Avaliar migração em F1-06** comparando um formulário/modal completo em cada alternativa.

A decisão final será registrada em um novo ADR após F1-06.

## Critérios de avaliação (F1-06)

- Acessibilidade (ARIA, teclado, NVDA/VoiceOver)
- Bundle size
- Manutenibilidade (cobertura, issues abertas, atividade do projeto)
- Esforço de migração dos wrappers existentes
- Aparência e fidelidade aos wrappers atuais

## Restrições

- **Não manter duas bases de UI indefinidamente** — a decisão em F1-06 é final
- Wrappers legados (Flowbite 0.48.6) são excluídos na reescrita independente da escolha

## Alternativas consideradas

- **Bits UI / shadcn-svelte:** candidato a substituição; avaliar em F1-06
- **Manter Flowbite 1.33.1:** opção de menor risco; exige limpeza do legado
