/**
 * F4-06 — Prova de ausência: conciliação e importadores excluídos da nova stack
 *
 * Suíte M — análise estática do grafo de módulos, RBAC e schema D1.
 *
 * Estratégia: "prova por ausência" — cada teste lê o fonte real e afirma
 * que certos símbolos/rotas/tabelas NÃO estão presentes na nova stack (app-v2).
 * A nova stack é delimitada pelos arquivos montados em app-v2.ts e pelo
 * schema D1 (src/lib/server/db/schema.ts + drizzle/*.sql).
 *
 * O que é provado:
 *   M1.  app-v2.ts não monta rota de conciliação
 *   M2.  app-v2.ts não monta rota de financeiro/importação
 *   M3.  app-v2.ts não importa de src/lib/conciliacao/
 *   M4.  vendas-v2 não importa de src/lib/conciliacao/
 *   M5.  vendas-v2 não importa de src/lib/server/conciliacaoReconcile
 *   M6.  vendas-v2 não importa de src/lib/server/readModelCache
 *   M7.  vendas-v2 não importa de src/lib/server/readModelRebuild
 *   M8.  clientes-v2 não importa de src/lib/conciliacao/
 *   M9.  Schema D1 não define tabela conciliacao_*
 *   M10. Schema D1 não define tabela importa* / movimentos* / recibos_ext*
 *   M11. RBAC não define recurso 'conciliacao' nem 'importacao'
 *   M12. Migrações D1 não criam tabela conciliacao_* nem importa*
 *   M13. sveltekit-v2.ts não importa handler de conciliação
 *   M14. Nenhum módulo v2 importa kvInvalidation (dependência legada de cron)
 *   M15. Nenhum módulo v2 importa relatorios.ts legado
 *
 * Executar:
 *   npx vitest run src/lib/server/f4-06-ausencia.test.ts
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ─── helpers ──────────────────────────────────────────────────────────────────

// process.cwd() é o raiz do projeto quando vitest é executado via CLI
const ROOT = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf-8');
}

function readAllSql(): string {
  const dir = join(ROOT, 'drizzle');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(dir, f), 'utf-8'))
    .join('\n');
}

/** Arquivos que compõem a nova stack (app-v2) */
const V2_FILES = [
  'src/lib/server/api/app-v2.ts',
  'src/lib/server/api/sveltekit-v2.ts',
  'src/lib/server/api/routes/vendas-v2/index.ts',
  'src/lib/server/api/routes/clientes-v2/index.ts',
  'src/lib/server/api/routes/invites-v2/index.ts',
  'src/lib/server/api/routes/tenant-proof/index.ts',
];

// ─── Suíte M ──────────────────────────────────────────────────────────────────

describe('M. F4-06 — Ausência de conciliação e importadores na nova stack', () => {

  // ── M1. app-v2.ts não monta rota de conciliação ──
  it('M1. app-v2.ts não registra rota /conciliacao', () => {
    const src = readSrc('src/lib/server/api/app-v2.ts');
    // Verifica que não há app.route() com caminho de conciliação
    expect(src).not.toMatch(/app\.route\s*\(\s*['"][^'"]*concilia/i);
    expect(src).not.toMatch(/app\.route\s*\(\s*['"][^'"]*importa/i);
  });

  // ── M2. app-v2.ts não monta rota de financeiro/ajustes ──
  it('M2. app-v2.ts não registra rota /financeiro nem /ajustes', () => {
    const src = readSrc('src/lib/server/api/app-v2.ts');
    expect(src).not.toMatch(/app\.route\s*\(\s*['"][^'"]*financeiro/i);
    expect(src).not.toMatch(/app\.route\s*\(\s*['"][^'"]*ajuste/i);
    expect(src).not.toMatch(/app\.route\s*\(\s*['"][^'"]*comiss/i);
  });

  // ── M3. app-v2.ts não importa do módulo legado de conciliação ──
  it('M3. app-v2.ts não importa de src/lib/conciliacao/ nem conciliacaoReconcile', () => {
    const src = readSrc('src/lib/server/api/app-v2.ts');
    expect(src).not.toMatch(/from\s+['"][^'"]*concilia/i);
    expect(src).not.toMatch(/require\s*\(\s*['"][^'"]*concilia/i);
  });

  // ── M4. vendas-v2: sem import de conciliação ──
  it('M4. vendas-v2/index.ts não importa de src/lib/conciliacao/', () => {
    const src = readSrc('src/lib/server/api/routes/vendas-v2/index.ts');
    // Imports reais (não comentários)
    const importLines = src
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'));
    const hasConciliacaoImport = importLines.some((l) =>
      /from\s+['"][^'"]*concilia/i.test(l) || /require.*concilia/i.test(l),
    );
    expect(hasConciliacaoImport).toBe(false);
  });

  // ── M5. vendas-v2: sem import de conciliacaoReconcile ──
  it('M5. vendas-v2/index.ts não importa conciliacaoReconcile.ts legado', () => {
    const src = readSrc('src/lib/server/api/routes/vendas-v2/index.ts');
    const importLines = src
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'));
    expect(importLines.some((l) => /conciliacaoReconcile/i.test(l))).toBe(false);
  });

  // ── M6. vendas-v2: sem import de readModelCache ──
  it('M6. vendas-v2/index.ts não importa readModelCache (cron legado)', () => {
    const src = readSrc('src/lib/server/api/routes/vendas-v2/index.ts');
    const importLines = src
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'));
    expect(importLines.some((l) => /readModelCache/i.test(l))).toBe(false);
  });

  // ── M7. vendas-v2: sem import de readModelRebuild ──
  it('M7. vendas-v2/index.ts não importa readModelRebuild (cron legado)', () => {
    const src = readSrc('src/lib/server/api/routes/vendas-v2/index.ts');
    const importLines = src
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'));
    expect(importLines.some((l) => /readModelRebuild/i.test(l))).toBe(false);
  });

  // ── M8. clientes-v2: sem import de conciliação ──
  it('M8. clientes-v2/index.ts não importa de src/lib/conciliacao/', () => {
    const src = readSrc('src/lib/server/api/routes/clientes-v2/index.ts');
    const importLines = src
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'));
    expect(importLines.some((l) => /from\s+['"][^'"]*concilia/i.test(l))).toBe(false);
  });

  // ── M9. Schema D1: sem tabela conciliacao_* ──
  it('M9. schema.ts não define tabela conciliacao_*', () => {
    const src = readSrc('src/lib/server/db/schema.ts');
    // sqliteTable('conciliacao_...', ...) não deve existir
    expect(src).not.toMatch(/sqliteTable\s*\(\s*['"]concilia/i);
    expect(src).not.toMatch(/sqliteTable\s*\(\s*['"]importa/i);
  });

  // ── M10. Schema D1: sem tabela de movimentos externos ou recibos externos ──
  it('M10. schema.ts não define tabela movimentos_ext* nem recibos_ext*', () => {
    const src = readSrc('src/lib/server/db/schema.ts');
    expect(src).not.toMatch(/sqliteTable\s*\(\s*['"]movimentos?_ext/i);
    expect(src).not.toMatch(/sqliteTable\s*\(\s*['"]recibos?_ext/i);
    expect(src).not.toMatch(/sqliteTable\s*\(\s*['"]extrato/i);
  });

  // ── M11. RBAC: sem recurso 'conciliacao' nem 'importacao' ──
  it('M11. RBAC não define recurso "conciliacao" nem "importacao"', () => {
    const src = readSrc('src/lib/server/policy/matrix.ts');
    // O array RECURSOS não deve conter esses recursos dedicados
    // (conciliação é responsabilidade do recurso 'financeiro' caso necessário)
    expect(src).not.toMatch(/'conciliacao'/);
    expect(src).not.toMatch(/'importacao'/);
    expect(src).not.toMatch(/'importador'/);
  });

  // ── M12. Migrações D1: sem CREATE TABLE conciliacao_* ──
  it('M12. migrações D1 não criam tabela conciliacao_* nem importa*', () => {
    const allSql = readAllSql();
    expect(allSql).not.toMatch(/CREATE TABLE.*concilia/i);
    expect(allSql).not.toMatch(/CREATE TABLE.*importa/i);
    expect(allSql).not.toMatch(/CREATE TABLE.*extrato/i);
    expect(allSql).not.toMatch(/CREATE TABLE.*recibos_ext/i);
  });

  // ── M13. sveltekit-v2: não importa handler de conciliação ──
  it('M13. sveltekit-v2.ts não importa handler de conciliação', () => {
    const src = readSrc('src/lib/server/api/sveltekit-v2.ts');
    const importLines = src
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'));
    expect(importLines.some((l) => /concilia/i.test(l))).toBe(false);
    expect(importLines.some((l) => /importa/i.test(l))).toBe(false);
    expect(importLines.some((l) => /financeiro/i.test(l))).toBe(false);
  });

  // ── M14. Módulos v2: sem import de kvInvalidation ──
  it('M14. nenhum módulo v2 importa kvInvalidation (dependência de cron legado)', () => {
    const hits: string[] = [];
    for (const rel of V2_FILES) {
      try {
        const src = readSrc(rel);
        const importLines = src
          .split('\n')
          .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'));
        if (importLines.some((l) => /kvInvalidation/i.test(l))) {
          hits.push(rel);
        }
      } catch {
        // arquivo pode não existir — ignorado
      }
    }
    expect(hits).toEqual([]);
  });

  // ── M15. Módulos v2: sem import do relatorios.ts legado ──
  it('M15. nenhum módulo v2 importa $lib/server/relatorios (legado Supabase)', () => {
    const hits: string[] = [];
    for (const rel of V2_FILES) {
      try {
        const src = readSrc(rel);
        const importLines = src
          .split('\n')
          .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'));
        if (importLines.some((l) => /server\/relatorios/i.test(l))) {
          hits.push(rel);
        }
      } catch {
        // arquivo pode não existir — ignorado
      }
    }
    expect(hits).toEqual([]);
  });
});
