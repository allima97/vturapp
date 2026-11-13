import { expect, it } from 'vitest';
import { mount, unmount } from 'svelte';
import AtribuicaoGeoNames from '$lib/components/AtribuicaoGeoNames.svelte';

it('apresenta a fonte, a licença e a indicação de adaptações com links seguros', async () => {
  const target = document.createElement('div');
  const app = mount(AtribuicaoGeoNames, { target });
  const links = [...target.querySelectorAll('a')];
  expect(links.map((link) => [link.textContent?.trim(), link.href])).toEqual([
    ['GeoNames', 'https://www.geonames.org/'],
    ['CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/']
  ]);
  expect(
    links.every((link) => link.target === '_blank' && link.rel === 'noopener noreferrer')
  ).toBe(true);
  expect(target.textContent).toContain('Nomes e resultados podem ser adaptados.');
  await unmount(app);
});
