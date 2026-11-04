# ADR-002 — Autenticação e gerenciamento de sessão

**Estado:** PROPOSTA (pendente confirmação em F1-04)  
**Data:** 2026-10-26  
**Decisão revertida/nova:** substitui menção a Lucia v3 no plano anterior  

## Contexto

A autenticação atual usa Supabase Auth (email/senha, passkeys, TOTP/MFA, convites). Na reescrita com D1, o Supabase Auth precisa ser substituído. O plano anterior citava Lucia v3 — projeto descontinuado.

## Decisão proposta

**Better Auth** como candidato principal, com **adapter Drizzle/D1**.

**Plano B documentado:** se a prova em F1-04 falhar, implementar sessão própria sobre Drizzle:
- Cookie HttpOnly com token gravado com hash no banco
- Expiração absoluta e por inatividade
- Revogação na aplicação (listagem de sessões, logout)
- TOTP e passkeys implementados conforme spec

## Escopo de auth do VTUR a provar

- Email/senha com verificação de e-mail
- Convite com token seguro, expiração e uso único
- TOTP (MFA) para contas privilegiadas + recuperação + códigos de backup
- Passkeys (RP ID e origens por ambiente)
- Sessões com listagem de dispositivos e revogação
- Rate limit de tentativas por conta/IP
- E-mail transacional via API HTTP (não SMTP)

## Decisões explícitas

- **Não usar SMTP:** runtime Workers não suporta; usar Resend ou equivalente via API HTTP
- **Não presumir plugin de organização do Better Auth** como substituto das políticas de escopo do VTUR
- **Passkeys serão recadastradas:** base vazia, sem importação de credenciais
- **Cache de sessão/autorização:** DESLIGADO inicialmente; revogação deve ser imediata

## Consequências

- F1-04 é a porta de aceite desta decisão
- Qualquer mudança de biblioteca gera novo ADR, não edição deste

## Alternativas consideradas

- **Lucia v3:** descontinuado; descartado
- **NextAuth / Auth.js:** não testado em Workers/Hono; descartado sem prova
- **Sessão própria desde o início:** plano B; mais trabalhoso, mas sem dependências
