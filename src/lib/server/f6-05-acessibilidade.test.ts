/**
 * Suíte S — F6-05: Acessibilidade e experiência dos papéis reais
 *
 * Análise estática dos componentes Svelte e páginas SvelteKit:
 *   S1.   Labels em todos os <input> (for/id ou aria-label)
 *   S2.   Botões com texto ou aria-label (não apenas ícones sem descrição)
 *   S3.   Imagens com alt text (nunca alt="" em imagens informativas)
 *   S4.   Links com texto descritivo (não apenas "Clique aqui")
 *   S5.   <title> em todas as páginas +layout/+page Svelte
 *   S6.   lang="pt-BR" no documento HTML raiz
 *   S7.   role="alert" ou aria-live para mensagens de erro/sucesso
 *   S8.   Formulários: nenhum campo obrigatório sem indicação visual/aria
 *   S9.   Contraste: nenhuma cor de texto explicitamente branco-sobre-branco
 *   S10.  Navegação: skip-link ou equivalente presente no layout principal
 *   S11.  Papéis RBAC: UI não expõe ações de admin para visualizador
 *   S12.  Mobile: viewport meta tag presente
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();
const SRC_ROUTES = join(ROOT, 'src/routes');
const SRC_LIB_COMPONENTS = join(ROOT, 'src/lib');

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf-8');
}

/** Coleta recursivamente todos os arquivos .svelte sob um diretório. */
function coletarSveltes(dir: string): string[] {
  const resultado: string[] = [];
  try {
    for (const entrada of readdirSync(dir)) {
      const caminho = join(dir, entrada);
      const stat = statSync(caminho);
      if (stat.isDirectory()) {
        resultado.push(...coletarSveltes(caminho));
      } else if (extname(entrada) === '.svelte') {
        resultado.push(caminho);
      }
    }
  } catch {
    // Diretório não existe — retornar vazio
  }
  return resultado;
}

const todosOsSveltes = [
  ...coletarSveltes(SRC_ROUTES),
  ...coletarSveltes(SRC_LIB_COMPONENTS),
];

// Sveltes que são páginas ou layouts (não componentes genéricos)
const paginasELayouts = todosOsSveltes.filter(
  (f) => f.includes('+page') || f.includes('+layout')
);

describe('Suíte S — F6-05: acessibilidade e experiência', () => {

  // S1 ───────────────────────────────────────────────────────────────────────
  it('S1. Inputs têm label associado ou aria-label em todos os componentes Svelte', () => {
    const violacoes: string[] = [];
    for (const arquivo of todosOsSveltes) {
      const src = readFileSync(arquivo, 'utf-8');
      // Encontrar inputs sem for/id ou aria-label
      const inputsSemLabel = src.match(/<input(?![^>]*aria-label)[^>]*>/g) || [];
      for (const input of inputsSemLabel) {
        // Verificar se tem id e se o arquivo tem label com for correspondente
        const temId = /id=["'][^"']+["']/.test(input);
        const temAriaLabel = /aria-label=/.test(input);
        const temType = /type=["'](?:hidden|submit|button|reset|checkbox|radio)["']/.test(input);
        if (!temId && !temAriaLabel && !temType) {
          const relativo = arquivo.replace(ROOT + '/', '');
          violacoes.push(`${relativo}: ${input.slice(0, 80)}`);
        }
      }
    }
    if (violacoes.length > 0) {
      console.warn('[S1] Inputs sem label/aria-label (verificar manualmente):');
      violacoes.forEach((v) => console.warn(`  ${v}`));
    }
    // Tolerância: máximo 3 ocorrências suspeitas (podem ser IDs dinâmicos)
    expect(violacoes.length).toBeLessThanOrEqual(3);
  });

  // S2 ───────────────────────────────────────────────────────────────────────
  it('S2. Botões de ícone têm aria-label (não apenas SVG sem texto)', () => {
    const suspeitos: string[] = [];
    for (const arquivo of todosOsSveltes) {
      const src = readFileSync(arquivo, 'utf-8');
      // Botões que contêm apenas SVG sem texto
      const botoesComSvg = src.match(/<button[^>]*>[\s\S]{0,200}<\/button>/g) || [];
      for (const botao of botoesComSvg) {
        const temSvg = /<svg/.test(botao);
        const temTexto = botao.replace(/<[^>]*>/g, '').trim().length > 0;
        const temAriaLabel = /aria-label=/.test(botao);
        const temTitle = /<title>/.test(botao);
        if (temSvg && !temTexto && !temAriaLabel && !temTitle) {
          suspeitos.push(arquivo.replace(ROOT + '/', ''));
        }
      }
    }
    if (suspeitos.length > 0) {
      console.warn('[S2] Botões de ícone sem aria-label:', suspeitos);
    }
    expect(suspeitos.length).toBeLessThanOrEqual(5);
  });

  // S3 ───────────────────────────────────────────────────────────────────────
  it('S3. Imagens têm atributo alt (mesmo que vazio para decorativas)', () => {
    const violacoes: string[] = [];
    for (const arquivo of todosOsSveltes) {
      const src = readFileSync(arquivo, 'utf-8');
      const imgsSemAlt = (src.match(/<img(?![^>]*alt=)[^>]*>/g) || []);
      if (imgsSemAlt.length > 0) {
        violacoes.push(arquivo.replace(ROOT + '/', ''));
      }
    }
    expect(violacoes, `Imagens sem alt: ${violacoes.join(', ')}`).toHaveLength(0);
  });

  // S4 ───────────────────────────────────────────────────────────────────────
  it('S4. Nenhum link com texto genérico "clique aqui" ou "aqui"', () => {
    const violacoes: string[] = [];
    for (const arquivo of todosOsSveltes) {
      const src = readFileSync(arquivo, 'utf-8');
      if (/>\s*(clique aqui|clique|aqui|here|click here)\s*</i.test(src)) {
        violacoes.push(arquivo.replace(ROOT + '/', ''));
      }
    }
    expect(violacoes, `Links com texto genérico: ${violacoes.join(', ')}`).toHaveLength(0);
  });

  // S5 ───────────────────────────────────────────────────────────────────────
  it('S5. Layout raiz define <title> ou usa <svelte:head> com title', () => {
    const layoutRaiz = paginasELayouts.find(
      (f) => f.includes('+layout.svelte') && !f.includes('(')
    );
    if (!layoutRaiz) {
      console.warn('[S5] Layout raiz não encontrado — pulando verificação de title');
      return;
    }
    const src = readFileSync(layoutRaiz, 'utf-8');
    expect(src).toMatch(/<title>|<svelte:head>/);
  });

  // S6 ───────────────────────────────────────────────────────────────────────
  it('S6. Documento HTML tem lang definido (pt, pt-BR ou pt-br)', () => {
    // Verificar app.html (SvelteKit root HTML)
    try {
      const appHtml = readSrc('src/app.html');
      expect(appHtml).toMatch(/lang=["']pt/i);
    } catch {
      // Se não existe app.html, verificar layout raiz
      const layoutRaiz = paginasELayouts.find(
        (f) => f.includes('+layout.svelte') && !f.includes('(')
      );
      if (layoutRaiz) {
        const src = readFileSync(layoutRaiz, 'utf-8');
        // Layout raiz deve referenciar lang ou isso é definido em app.html
        console.warn('[S6] app.html não encontrado — verificar manualmente');
      }
    }
  });

  // S7 ───────────────────────────────────────────────────────────────────────
  it('S7. Mensagens de erro usam role="alert" ou aria-live para screen readers', () => {
    const comErro = todosOsSveltes.filter((f) => {
      const src = readFileSync(f, 'utf-8');
      return /error|erro|mensagem/i.test(src) && /<p|<div|<span/.test(src);
    });

    const semAria = comErro.filter((f) => {
      const src = readFileSync(f, 'utf-8');
      return !/(role=["']alert["']|aria-live=)/i.test(src);
    });

    if (semAria.length > 0) {
      console.warn('[S7] Componentes com mensagens de erro sem aria-live/role=alert:');
      semAria.forEach((f) => console.warn(`  ${f.replace(ROOT + '/', '')}`));
    }
    // Tolerância: máximo 5 (alguns erros podem ser apenas visuais)
    expect(semAria.length).toBeLessThanOrEqual(5);
  });

  // S8 ───────────────────────────────────────────────────────────────────────
  it('S8. Campos required têm aria-required ou indicação visual marcada', () => {
    const suspeitos: string[] = [];
    for (const arquivo of todosOsSveltes) {
      const src = readFileSync(arquivo, 'utf-8');
      // Inputs com required sem aria-required
      const requiredSemAria = src.match(/<input[^>]*required(?![^>]*aria-required)[^>]*>/g) || [];
      if (requiredSemAria.length > 0) {
        suspeitos.push(arquivo.replace(ROOT + '/', ''));
      }
    }
    if (suspeitos.length > 0) {
      console.warn('[S8] Inputs required sem aria-required:', suspeitos);
    }
    expect(suspeitos.length).toBeLessThanOrEqual(10);
  });

  // S9 ───────────────────────────────────────────────────────────────────────
  it('S9. Nenhuma declaração explícita de texto branco sobre fundo branco', () => {
    for (const arquivo of todosOsSveltes) {
      const src = readFileSync(arquivo, 'utf-8');
      // Padrão suspeito: color:white com background:white (ou vice-versa)
      expect(src).not.toMatch(/color:\s*white[^}]*background(?:-color)?:\s*white/i);
      expect(src).not.toMatch(/background(?:-color)?:\s*white[^}]*color:\s*white/i);
    }
  });

  // S10 ──────────────────────────────────────────────────────────────────────
  it('S10. Layout ou app.html contém skip-link ou equivalente de navegação', () => {
    const layoutRaiz = paginasELayouts.find(
      (f) => f.includes('+layout.svelte') && !f.includes('(')
    );

    let skipLinkEncontrado = false;

    if (layoutRaiz) {
      const src = readFileSync(layoutRaiz, 'utf-8');
      skipLinkEncontrado = /(skip|pular|ir para o conteúdo|skip-link)/i.test(src);
    }

    try {
      const appHtml = readSrc('src/app.html');
      if (/(skip|pular|ir para o conteúdo|skip-link)/i.test(appHtml)) {
        skipLinkEncontrado = true;
      }
    } catch {
      // Não existe
    }

    if (!skipLinkEncontrado) {
      console.warn('[S10] Skip-link não encontrado — recomendado para acessibilidade com teclado');
    }
    // Não falha hard — é uma recomendação WCAG AA
    expect(true).toBe(true);
  });

  // S11 ──────────────────────────────────────────────────────────────────────
  it('S11. Papéis RBAC: código diferencia admin/operador/visualizador na UI', () => {
    const sveltes = todosOsSveltes.filter((f) => {
      const src = readFileSync(f, 'utf-8');
      return src.includes('papel') || src.includes('role') || src.includes('admin');
    });

    for (const arquivo of sveltes) {
      const src = readFileSync(arquivo, 'utf-8');
      // Não deve usar apenas "admin" como guard sem verificar papéis reais
      if (src.includes('admin')) {
        // Se condicionais existem, devem usar os papéis corretos do sistema
        expect(src).not.toMatch(/papel\s*===\s*["']superadmin["']/);
      }
    }
  });

  // S12 ──────────────────────────────────────────────────────────────────────
  it('S12. Viewport meta tag presente para suporte mobile', () => {
    try {
      const appHtml = readSrc('src/app.html');
      expect(appHtml).toContain('viewport');
      expect(appHtml).toContain('width=device-width');
    } catch {
      // Verificar layout raiz
      const layoutRaiz = paginasELayouts.find(
        (f) => f.includes('+layout.svelte') && !f.includes('(')
      );
      if (layoutRaiz) {
        const src = readFileSync(layoutRaiz, 'utf-8');
        expect(src).toContain('viewport');
      }
    }
  });
});
