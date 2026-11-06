/**
 * Suíte N — F5-04: Auditoria de ausência de Dados na stack v2
 *
 * Prova estática (leitura de arquivos fonte) que a stack nova não depende
 * de Dados em nenhum caminho de execução do app-v2.
 *
 * Testes:
 *  N1.  app-v2.ts não importa @dados/dados-js
 *  N2.  app-v2.ts não importa createDadosServerClient nem getAdminClient
 *  N3.  sveltekit-v2.ts não importa @dados/dados-js
 *  N4.  sveltekit-v2.ts não passa event.locals.dados para o Hono app
 *  N5.  src/routes/api/v2/[...path]/+server.ts não importa Dados
 *  N6.  ApiEnv.Bindings não inclui campo DataClient
 *  N7.  Nenhuma rota montada em app-v2 importa @dados/dados-js
 *  N8.  wrangler.toml não define DADOS_URL nem DADOS_ANON_KEY como vars ativos
 *  N9.  sveltekit-v2.ts declara explicitamente "sem Dados em v2"
 *  N10. app-v2.ts não monta rotas que importam Dados (conciliação, viagens, pagamentos)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd(); // vitest roda a partir da raiz do projeto

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf-8');
}

// Arquivos nucleares da stack v2
const APP_V2 = 'src/lib/server/api/app-v2.ts';
const SVELTEKIT_V2 = 'src/lib/server/api/sveltekit-v2.ts';
const SK_ROUTE_V2 = 'src/routes/api/v2/[...path]/+server.ts';
const TYPES = 'src/lib/server/api/types.ts';
const WRANGLER = 'wrangler.toml';

// Rotas montadas explicitamente em app-v2 (extraídas do app-v2.ts)
const ROTAS_MONTADAS_V2 = [
  'src/lib/server/api/routes/invites-v2/index.ts',
  'src/lib/server/api/routes/clientes-v2/index.ts',
  'src/lib/server/api/routes/vendas-v2/index.ts',
  'src/lib/server/api/routes/tenant-proof/index.ts'
];

// Rotas legadas com Dados — NÃO devem aparecer em app-v2
const ROTAS_LEGADAS_DADOS = [
  'conciliacao',
  'viagens',
  'pagamentos',
  'voucher-assets',
  'consultorias'
];

describe('Suíte N — F5-04: auditoria Dados na stack v2', () => {
  // N1 ────────────────────────────────────────────────────────────────────────
  it('N1. app-v2.ts não importa @dados/dados-js', () => {
    const src = readSrc(APP_V2);
    expect(src).not.toMatch(/@dados\/dados-js/);
    expect(src).not.toMatch(/@dados\/ssr/);
  });

  // N2 ────────────────────────────────────────────────────────────────────────
  it('N2. app-v2.ts não importa createDadosServerClient nem getAdminClient', () => {
    const src = readSrc(APP_V2);
    expect(src).not.toMatch(/createDadosServerClient/);
    expect(src).not.toMatch(/getAdminClient/);
    expect(src).not.toMatch(/dadosClient/i);
  });

  // N3 ────────────────────────────────────────────────────────────────────────
  it('N3. sveltekit-v2.ts não importa @dados/dados-js', () => {
    const src = readSrc(SVELTEKIT_V2);
    expect(src).not.toMatch(/@dados\/dados-js/);
    expect(src).not.toMatch(/@dados\/ssr/);
  });

  // N4 ────────────────────────────────────────────────────────────────────────
  it('N4. sveltekit-v2.ts não injeta event.locals.dados nas bindings', () => {
    const src = readSrc(SVELTEKIT_V2);
    expect(src).not.toMatch(/locals\.dados/);
    expect(src).not.toMatch(/dados\s*:/);
  });

  // N5 ────────────────────────────────────────────────────────────────────────
  it('N5. src/routes/api/v2/+server.ts não importa Dados', () => {
    const src = readSrc(SK_ROUTE_V2);
    expect(src).not.toMatch(/@dados/);
    expect(src).not.toMatch(/dados/i);
  });

  // N6 ────────────────────────────────────────────────────────────────────────
  it('N6. ApiEnv.Bindings não declara campo DataClient', () => {
    const src = readSrc(TYPES);
    // Não pode ter um campo cujo tipo seja DataClient
    expect(src).not.toMatch(/DataClient/);
    expect(src).not.toMatch(/@dados\/dados-js/);
    // event: RequestEvent é o campo legado presente (comentado como futuro a remover)
    // Apenas verificar que não há dados como Binding type
    expect(src).not.toMatch(/dados\s*:\s*DataClient/);
  });

  // N7 ────────────────────────────────────────────────────────────────────────
  it('N7. nenhuma rota montada em app-v2 importa @dados/dados-js', () => {
    for (const rota of ROTAS_MONTADAS_V2) {
      const src = readSrc(rota);
      expect(src, `rota ${rota} não deve importar @dados`).not.toMatch(/@dados/);
      expect(src, `rota ${rota} não deve referenciar dados`).not.toMatch(/dadosClient/i);
    }
  });

  // N8 ────────────────────────────────────────────────────────────────────────
  it('N8. wrangler.toml não ativa DADOS_URL nem DADOS_ANON_KEY como vars', () => {
    const src = readSrc(WRANGLER);
    // Pode conter comentados (#) mas não como var ativo
    const linhasAtivas = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('#'))
      .join('\n');
    expect(linhasAtivas).not.toMatch(/DADOS_URL\s*=/);
    expect(linhasAtivas).not.toMatch(/DADOS_ANON_KEY\s*=/);
    expect(linhasAtivas).not.toMatch(/DADOS_SERVICE_ROLE_KEY\s*=/);
  });

  // N9 ────────────────────────────────────────────────────────────────────────
  it('N9. sveltekit-v2.ts declara explicitamente ausência de Dados', () => {
    const src = readSrc(SVELTEKIT_V2);
    // O arquivo deve conter comentário documental explícito
    expect(src).toMatch(/sem Dados/i);
    // E passa event: null (não injeta o event.locals do SvelteKit)
    expect(src).toMatch(/event\s*:\s*null/);
  });

  // N10 ───────────────────────────────────────────────────────────────────────
  it('N10. app-v2.ts não monta rotas legadas com Dados', () => {
    const src = readSrc(APP_V2);
    for (const rota of ROTAS_LEGADAS_DADOS) {
      expect(src, `app-v2 não deve montar rota ${rota}`).not.toMatch(new RegExp(`routes/${rota}`));
    }
  });
});
