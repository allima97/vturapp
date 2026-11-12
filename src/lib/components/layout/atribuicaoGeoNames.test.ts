import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('mantém a atribuição em um único rodapé do layout da aplicação', () => {
  const layout = readFileSync(
    new URL('../../../routes/(app)/+layout.svelte', import.meta.url),
    'utf8'
  );
  expect(layout.match(/<AtribuicaoGeoNames\s*\/>/g)).toHaveLength(1);
  expect(layout).toMatch(/<footer\b[^>]*>[\s\S]*?<AtribuicaoGeoNames\s*\/>[\s\S]*?<\/footer>/);
  expect(layout).toMatch(/<footer\b[^>]*class="[^"]*\btext-right\b[^"]*"/);
});
