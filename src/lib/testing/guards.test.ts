/**
 * Guardas estáticas contra defeitos já encontrados (25/09/2026).
 * Leem os arquivos .svelte e falham se o padrão problemático voltar.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');

function svelteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...svelteFiles(full));
    else if (name.endsWith('.svelte')) out.push(full);
  }
  return out;
}

const files = svelteFiles(SRC).map((file) => ({
  path: relative(process.cwd(), file).replace(/\\/g, '/'),
  text: readFileSync(file, 'utf8')
}));

describe('guardas', () => {
  it('nenhum `$: x = fn();` sem argumentos (modo legado não enxerga as variáveis dentro de fn)', () => {
    // Exceções conscientes: dependem só da data de hoje, ou demonstram o problema de propósito.
    const permitidos = new Set([
      'src/routes/(app)/relatorios/ranking/+page.svelte:diasRestantesNoMes',
      'src/lib/testing/dom/harness/LegacyReactivityHarness.svelte:keyViaFuncao'
    ]);
    const achados: string[] = [];
    for (const { path, text } of files) {
      for (const match of text.matchAll(/^\s*\$:\s*(\w+)\s*=\s*\w+\(\s*\)\s*;?\s*$/gm)) {
        const id = `${path}:${match[1]}`;
        if (!permitidos.has(id)) achados.push(id);
      }
    }
    expect(
      achados,
      'Escreva a expressão na própria linha do $: (ver PROGRESSO-MIGRACAO.md, "Filtros que não recarregavam")'
    ).toEqual([]);
  });

  it('a URL da própria tela é sincronizada com replaceState(), não com goto(..., { replaceState: true })', () => {
    // goto() dispara o beforeNavigate do layout raiz, que cancela as leituras em andamento;
    // a leitura cancelada por navegação nunca termina e a tela fica em "carregando".
    const achados = files
      .filter(({ text }) => /goto\([^)]*\{[^}]*replaceState:\s*true/s.test(text))
      .map(({ path }) => path);
    expect(achados).toEqual([]);
  });

  it('componentes visuais do Flowbite vêm da cópia 0.48 (flowbite-legacy), não do pacote 1.x', () => {
    // Fase 4.2: no flowbite-svelte 1.x os campos, selos, alertas, menus e a janela modal mudaram
    // de aparência e de comportamento. O pacote 1.x só entra por import direto de arquivo
    // (hoje só a tabela); o import pelo índice ('flowbite-svelte') traria o pacote inteiro.
    const permitidos = new Set(['src/lib/components/ui/SimpleTable.svelte']);
    const achados = files
      .filter(({ text }) => /from\s+['"]flowbite-svelte(\/[^'"]*)?['"]/.test(text))
      .map(({ path }) => path)
      .filter((path) => !permitidos.has(path));
    expect(achados).toEqual([]);
  });

  it('ícones vêm de $lib/icons (Fase 4.3), não direto do lucide-svelte', () => {
    // $lib/icons usa o desenho do flowbite-svelte-icons com o mesmo tamanho do Lucide;
    // só os ícones sem equivalente no Flowbite continuam com o desenho do Lucide, lá dentro.
    const achados = files
      .filter(({ path }) => !path.startsWith('src/lib/icons/'))
      .filter(({ text }) => /from\s+['"]lucide-svelte/.test(text))
      .map(({ path }) => path);
    expect(achados).toEqual([]);
  });

  it('consulta opcional (com .catch) não manda a tela para "/negado" num 403', () => {
    // Uma chamada com .catch(...) é tratada como opcional pela tela. Sem redirectOnForbidden: false,
    // um 403 dela leva o usuário para "/negado" mesmo tendo acesso à tela (Fase 5, revisão do /negado).
    const permitidos = new Set(['src/routes/(app)/perfil/+page.svelte:/api/v1/profile/signature']);
    const achados: string[] = [];
    for (const { path, text } of files) {
      const re = /\b(apiGet|apiFetch)\s*(?:<[^>]*>)?\s*\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        let i = m.index + m[0].length;
        let depth = 1;
        while (depth > 0 && i < text.length) {
          if (text[i] === '(') depth += 1;
          else if (text[i] === ')') depth -= 1;
          i += 1;
        }
        const chamada = text.slice(m.index, i);
        if (!/^\s*\.catch\(/.test(text.slice(i, i + 20))) continue;
        if (chamada.includes('redirectOnForbidden')) continue;
        const endpoint = /['"`](\/api\/v1\/[^'"`?$]*)/.exec(chamada)?.[1] ?? '?';
        const id = `${path}:${endpoint}`;
        if (!permitidos.has(id)) achados.push(id);
      }
    }
    expect(achados).toEqual([]);
  });
});
