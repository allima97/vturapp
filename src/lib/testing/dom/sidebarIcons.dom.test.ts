import { expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { Compass, Globe, Route } from '$lib/icons';

const mocks = vi.hoisted(() => ({ setPath: (_path: string) => {} }));
vi.mock('$app/navigation', () => ({ afterNavigate: vi.fn() }));
vi.mock('$app/stores', async () => {
  const { writable } = await import('svelte/store');
  const page = writable({ url: new URL('http://localhost/orcamentos/roteiros') });
  mocks.setPath = (path: string) => page.set({ url: new URL(path, 'http://localhost') });
  return { page };
});

import Sidebar from '$lib/components/layout/Sidebar.svelte';

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

it('atualiza o destaque dos ícones ao navegar entre roteiros e viagens', async () => {
  localStorage.setItem('vtur:menu-prefs', JSON.stringify({ hidden: [] }));
  const target = document.createElement('div');
  document.body.appendChild(target);
  const component = mount(Sidebar, { target });
  await tick();
  const roteiro = target.querySelector('a[title="Roteiros"]')!;
  expect(roteiro.getAttribute('aria-current')).toBe('page');
  expect(roteiro.classList.contains('vtur-sidebar__item--active')).toBe(true);
  expect(roteiro.querySelector('svg')!.classList.contains('text-blue-600')).toBe(false);
  mocks.setPath('/operacao/viagens');
  await tick();
  const roteiroAtual = target.querySelector('a[title="Roteiros"]')!;
  const viagemAtual = target.querySelector('a[title="Viagens"]')!;
  expect(viagemAtual.getAttribute('aria-current')).toBe('page');
  expect(roteiroAtual.getAttribute('aria-current')).toBeNull();
  expect(viagemAtual.classList.contains('vtur-sidebar__item--active')).toBe(true);
  expect(roteiroAtual.classList.contains('vtur-sidebar__item--active')).toBe(false);
  expect(roteiroAtual.querySelector('svg')!.classList.contains('text-blue-600')).toBe(false);
  await unmount(component);
  target.remove();
  localStorage.removeItem('vtur:menu-prefs');
});
