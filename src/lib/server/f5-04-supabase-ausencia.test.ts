/**
 * Suíte N — F5-04: Auditoria de ausência de Supabase na stack v2
 *
 * Prova estática (leitura de arquivos fonte) que a stack nova não depende
 * de Supabase em nenhum caminho de execução do app-v2.
 *
 * Testes:
 *  N1.  app-v2.ts não importa @supabase/supabase-js
 *  N2.  app-v2.ts não importa createSupabaseServerClient nem getAdminClient
 *  N3.  sveltekit-v2.ts não importa @supabase/supabase-js
 *  N4.  sveltekit-v2.ts não passa event.locals.supabase para o Hono app
 *  N5.  src/routes/api/v2/[...path]/+server.ts não importa Supabase
 *  N6.  ApiEnv.Bindings não inclui campo SupabaseClient
 *  N7.  Nenhuma rota montada em app-v2 importa @supabase/supabase-js
 *  N8.  wrangler.toml não define SUPABASE_URL nem SUPABASE_ANON_KEY como vars ativos
 *  N9.  sveltekit-v2.ts declara explicitamente "sem Supabase em v2"
 *  N10. app-v2.ts não monta rotas que importam Supabase (conciliação, viagens, pagamentos)
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
  'src/lib/server/api/routes/tenant-proof/index.ts',
];

// Rotas legadas com Supabase — NÃO devem aparecer em app-v2
const ROTAS_LEGADAS_SUPABASE = [
  'conciliacao',
  'viagens',
  'pagamentos',
  'voucher-assets',
  'consultorias',
];

describe('Suíte N — F5-04: auditoria Supabase na stack v2', () => {
  // N1 ────────────────────────────────────────────────────────────────────────
  it('N1. app-v2.ts não importa @supabase/supabase-js', () => {
    const src = readSrc(APP_V2);
    expect(src).not.toMatch(/@supabase\/supabase-js/);
    expect(src).not.toMatch(/@supabase\/ssr/);
  });

  // N2 ────────────────────────────────────────────────────────────────────────
  it('N2. app-v2.ts não importa createSupabaseServerClient nem getAdminClient', () => {
    const src = readSrc(APP_V2);
    expect(src).not.toMatch(/createSupabaseServerClient/);
    expect(src).not.toMatch(/getAdminClient/);
    expect(src).not.toMatch(/supabaseClient/i);
  });

  // N3 ────────────────────────────────────────────────────────────────────────
  it('N3. sveltekit-v2.ts não importa @supabase/supabase-js', () => {
    const src = readSrc(SVELTEKIT_V2);
    expect(src).not.toMatch(/@supabase\/supabase-js/);
    expect(src).not.toMatch(/@supabase\/ssr/);
  });

  // N4 ────────────────────────────────────────────────────────────────────────
  it('N4. sveltekit-v2.ts não injeta event.locals.supabase nas bindings', () => {
    const src = readSrc(SVELTEKIT_V2);
    expect(src).not.toMatch(/locals\.supabase/);
    expect(src).not.toMatch(/supabase\s*:/);
  });

  // N5 ────────────────────────────────────────────────────────────────────────
  it('N5. src/routes/api/v2/+server.ts não importa Supabase', () => {
    const src = readSrc(SK_ROUTE_V2);
    expect(src).not.toMatch(/@supabase/);
    expect(src).not.toMatch(/supabase/i);
  });

  // N6 ────────────────────────────────────────────────────────────────────────
  it('N6. ApiEnv.Bindings não declara campo SupabaseClient', () => {
    const src = readSrc(TYPES);
    // Não pode ter um campo cujo tipo seja SupabaseClient
    expect(src).not.toMatch(/SupabaseClient/);
    expect(src).not.toMatch(/@supabase\/supabase-js/);
    // event: RequestEvent é o campo legado presente (comentado como futuro a remover)
    // Apenas verificar que não há supabase como Binding type
    expect(src).not.toMatch(/supabase\s*:\s*SupabaseClient/);
  });

  // N7 ────────────────────────────────────────────────────────────────────────
  it('N7. nenhuma rota montada em app-v2 importa @supabase/supabase-js', () => {
    for (const rota of ROTAS_MONTADAS_V2) {
      const src = readSrc(rota);
      expect(src, `rota ${rota} não deve importar @supabase`).not.toMatch(/@supabase/);
      expect(src, `rota ${rota} não deve referenciar supabase`).not.toMatch(/supabaseClient/i);
    }
  });

  // N8 ────────────────────────────────────────────────────────────────────────
  it('N8. wrangler.toml não ativa SUPABASE_URL nem SUPABASE_ANON_KEY como vars', () => {
    const src = readSrc(WRANGLER);
    // Pode conter comentados (#) mas não como var ativo
    const linhasAtivas = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('#'))
      .join('\n');
    expect(linhasAtivas).not.toMatch(/SUPABASE_URL\s*=/);
    expect(linhasAtivas).not.toMatch(/SUPABASE_ANON_KEY\s*=/);
    expect(linhasAtivas).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY\s*=/);
  });

  // N9 ────────────────────────────────────────────────────────────────────────
  it('N9. sveltekit-v2.ts declara explicitamente ausência de Supabase', () => {
    const src = readSrc(SVELTEKIT_V2);
    // O arquivo deve conter comentário documental explícito
    expect(src).toMatch(/sem Supabase/i);
    // E passa event: null (não injeta o event.locals do SvelteKit)
    expect(src).toMatch(/event\s*:\s*null/);
  });

  // N10 ───────────────────────────────────────────────────────────────────────
  it('N10. app-v2.ts não monta rotas legadas com Supabase', () => {
    const src = readSrc(APP_V2);
    for (const rota of ROTAS_LEGADAS_SUPABASE) {
      expect(src, `app-v2 não deve montar rota ${rota}`).not.toMatch(
        new RegExp(`routes/${rota}`)
      );
    }
  });
});
