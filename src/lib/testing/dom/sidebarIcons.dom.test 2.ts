import { expect, it } from 'vitest';
import { mount, unmount } from 'svelte';
import { Compass, Globe, Route } from '$lib/icons';

it('renderiza desenhos diferentes para roteiros, passeios opcionais e destinos', async () => {
  const desenhos: string[] = [];
  for (const Icon of [Route, Compass, Globe]) {
    const target = document.createElement('div');
    const component = mount(Icon, { target, props: { size: 20 } });
    const svg = target.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('width')).toBe('20');
    desenhos.push(svg!.innerHTML);
    await unmount(component);
  }
  expect(new Set(desenhos).size).toBe(3);
});
