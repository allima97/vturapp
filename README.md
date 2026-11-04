# VTUR Svelte

CRM de vendas para agências de viagens, com identidade VTur, desenvolvido em SvelteKit + Flowbite-Svelte.

Vendas e orçamentos são cadastrados manualmente. Esta versão não oferece importação de contratos, reservas ou orçamentos para criar vendas. A conciliação financeira de extratos permanece separada do cadastro de vendas.

A identidade visual dos documentos é fixa: orçamentos, roteiros, circuitos, vouchers e cartões usam o logo VTur incorporado. Logos antigos de empresas, fornecedores e modelos não são utilizados nas novas emissões.

## Stack Tecnológica

- **Framework**: SvelteKit 2.x
- **UI Library**: Flowbite-Svelte
- **Estilização**: Tailwind CSS 3.x
- **Banco de dados**: Cloudflare D1
- **Arquivos**: Cloudflare R2
- **Autenticação**: Better Auth (sobre D1) + Cloudflare Turnstile
- **Cache Local**: IndexedDB nativo (quando necessário)
- **API**: Hono (compatibilidade com APIs existentes)
- **Deploy**: Cloudflare Workers

## Estrutura

```
src/
├── lib/
│   ├── components/     # Componentes Svelte
│   ├── stores/         # Svelte Stores
│   ├── db/             # Cliente de dados do navegador (D1 via API)
│   ├── api/            # Cliente API
│   ├── theme/          # Cores e tema
│   └── utils/          # Utilitários
├── routes/             # Rotas SvelteKit
└── app.html            # Template HTML
```

## Instalação

```bash
npm install
```

## Desenvolvimento

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Migração do VTUR Original

Esta é uma reescrita completa do sistema VTUR (Astro + React) para SvelteKit.
Mantém:

- Lógica de negócio (APIs Hono)
- Banco de dados relacional (agora Cloudflare D1, em vez de Supabase)
- Identidade visual (cores por módulo)
- Funcionalidades existentes

## Cores por Módulo

- **Clientes**: Azul (#2563eb)
- **Financeiro/Parâmetros**: Laranja (#f97316)
- **Vendas**: Verde (#16a34a)
