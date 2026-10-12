/** Fase 5.1: busca rápida no menu (Ctrl+K). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

const nav = vi.hoisted(() => ({ goto: vi.fn(async () => {}) }));
vi.mock('$app/navigation', () => ({ goto: nav.goto }));
vi.mock('$app/stores', async () => {
  const { readable } = await import('svelte/store');
  return { page: readable({ url: new URL('https://vtur.app/dashboard') }) };
});

import CommandPalette from '$lib/components/layout/CommandPalette.svelte';
import { menuVisivel } from '$lib/stores/navegacao';

let app: ReturnType<typeof mount> | null = null;
let target: HTMLElement | null = null;

async function montar() {
  menuVisivel.set([
    { secao: 'INFORMATIVOS', nome: 'Dashboard', href: '/dashboard' },
    { secao: 'OPERAÇÃO', nome: 'Vendas', href: '/vendas' },
    { secao: 'OPERAÇÃO', nome: 'Clientes', href: '/clientes' },
  ]);
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(CommandPalette as any, { target, props: { open: false } });
  flushSync();
}

async function tecla(el: EventTarget, key: string, extra: KeyboardEventInit = {}) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }));
  flushSync();
  await tick();
}

function campo() {
  return document.querySelector<HTMLInputElement>('input[role="combobox"]');
}

afterEach(() => {
  if (app) unmount(app);
  target?.remove();
  app = null;
  nav.goto.mockClear();
});

describe('busca rápida (Ctrl+K)', () => {
  it('Ctrl+K abre com o foco no campo e lista o menu', async () => {
    await montar();
    expect(campo()).toBeNull();
    await tecla(window, 'k', { ctrlKey: true });
    await tick();
    expect(campo()).toBeTruthy();
    expect(document.activeElement).toBe(campo());
    expect([...document.querySelectorAll('[role="option"]')].map((o) => o.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Dashboard INFORMATIVOS', 'Vendas OPERAÇÃO', 'Clientes OPERAÇÃO',
    ]);
  });

  it('filtra sem acento, ↓ muda a escolha e Enter abre a tela', async () => {
    await montar();
    await tecla(window, 'k', { metaKey: true });
    const input = campo()!;
    input.value = 'c';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    await tick();
    const opcoes = () => [...document.querySelectorAll('[role="option"]')];
    expect(opcoes().map((o) => o.querySelector('span')?.textContent)).toEqual(['Clientes', 'Vendas']); // Vendas entra pela seção (OPERAÇÃO)
    expect(input.getAttribute('aria-activedescendant')).toBe(opcoes()[0].id);
    await tecla(input, 'ArrowDown');
    expect(opcoes()[1].getAttribute('aria-selected')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(opcoes()[1].id);
    await tecla(input, 'Enter');
    expect(campo()).toBeNull();
  });

  it('Esc fecha; outra janela aberta impede o atalho', async () => {
    await montar();
    await tecla(window, 'k', { ctrlKey: true });
    await tecla(campo()!, 'Escape');
    expect(campo()).toBeNull();

    const outra = document.createElement('div');
    outra.setAttribute('role', 'dialog');
    outra.setAttribute('aria-modal', 'true');
    document.body.appendChild(outra);
    await tecla(window, 'k', { ctrlKey: true });
    expect(campo()).toBeNull();
    outra.remove();
  });

  it('sem resultado mostra aviso', async () => {
    await montar();
    await tecla(window, 'k', { ctrlKey: true });
    const input = campo()!;
    input.value = 'xyz';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    await tick();
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Nenhuma tela encontrada');
  });
});
