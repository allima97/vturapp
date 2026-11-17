import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sidebar = readFileSync(new URL('./Sidebar.svelte', import.meta.url), 'utf8');
const menu = sidebar.slice(
  sidebar.indexOf('$: menuSections ='),
  sidebar.indexOf('// Seções recolhidas')
);

describe('ícones da navegação lateral', () => {
  it('usa um desenho distinto para cada opção do menu, incluindo master e admin', () => {
    const icons = Array.from(menu.matchAll(/icon:\s*(\w+)/g), ([, icon]) => icon);
    expect(icons.length).toBeGreaterThan(50);
    const drawings = icons.map((icon) => {
      const wrapper = readFileSync(new URL(`../../icons/${icon}.svelte`, import.meta.url), 'utf8');
      const source = wrapper.match(/import (?:\{ (\w+) as Icon \} from |Icon from )'([^']+)'/);
      expect(source, `ícone ${icon} sem desenho reconhecido`).not.toBeNull();
      return `${source![2]}:${source![1] || 'default'}`;
    });
    expect(new Set(drawings).size).toBe(icons.length);
  });

  it.each([
    ['roteiros', 'Route'],
    ['cadastros_opcionais', 'Compass'],
    ['cadastros_destinos', 'Globe']
  ])('atribui identidade própria a %s', (key, icon) => {
    expect(menu).toMatch(new RegExp(`key: '${key}'[^}]*?icon: ${icon}\\b`));
  });

  it('mantém os mesmos ícones nos atalhos móveis', () => {
    const mobile = sidebar.slice(
      sidebar.indexOf('$: mobileNavEntries ='),
      sidebar.indexOf('$: {\n    hiddenMenuSet;', sidebar.indexOf('$: mobileNavEntries ='))
    );
    const entries = Array.from(mobile.matchAll(/key: '([^']+)'[^}]*?icon:\s*(\w+)/g));
    expect(entries.length).toBeGreaterThan(20);
    for (const [, key, icon] of entries) {
      expect(menu, `ícone móvel inconsistente para ${key}`).toMatch(
        new RegExp(`key: '${key}'[^}]*?icon: ${icon}\\b`)
      );
    }
  });
});
