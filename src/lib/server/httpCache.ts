// Headers para dados transacionais privados (vendas, dashboard, KPIs).
// private: não entra no CDN — cada usuário tem cache próprio no browser.
// max-age=30: fresco por 30s. stale-while-revalidate=120: servir stale até 120s enquanto revalida.
export const DYNAMIC_READ_HEADERS = {
  'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff'
} as const;

// Headers para dados que mudam com frequência mas são menos críticos.
export const SHORT_DYNAMIC_READ_HEADERS = {
  'Cache-Control': 'private, max-age=15, stale-while-revalidate=60',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff'
} as const;

// Headers para catálogos semi-estáticos protegidos por autenticação.
// Dados como países, estados, cidades, produtos base, tipos de usuário.
// private: usuário autenticado — não entra no CDN Cloudflare (comportamento correto para dados
// que dependem de permissão). max-age=600: browser cacheia por 10 min sem bater no servidor.
// stale-while-revalidate=3600: mantém stale por até 1h em background.
export const CATALOG_READ_HEADERS = {
  'Cache-Control': 'private, max-age=600, stale-while-revalidate=3600',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff'
} as const;

// Headers para dados de configuração raramente alterados (planos, módulos, avisos).
// Mais agressivo que CATALOG mas ainda privado.
export const CONFIG_READ_HEADERS = {
  'Cache-Control': 'private, max-age=300, stale-while-revalidate=1800',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff'
} as const;

// Headers para dados de leitura sem sensibilidade de negócio (ex: contexto de usuário logado).
export const USER_CONTEXT_READ_HEADERS = {
  'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff'
} as const;

// Sem cache — mutações, dados financeiros críticos, operações que não podem ter lag.
export const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff'
} as const;
