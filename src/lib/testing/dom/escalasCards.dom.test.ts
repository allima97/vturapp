import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { todayISODateLocal } from '$lib/date';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('$lib/services/api', async (original) => ({
  ...(await original<typeof import('$lib/services/api')>()),
  apiGet: api.get
}));
vi.mock('$lib/stores/permissoes', async () => {
  const { readable } = await import('svelte/store');
  return {
    permissoes: Object.assign(readable({ ready: true, isSystemAdmin: true }), { can: () => true })
  };
});

import Page from '../../../routes/(app)/parametros/escalas/+page.svelte';

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('revela a edição da escala após selecionar o colaborador no mobile', async () => {
  vi.stubGlobal('innerWidth', 375);
  const data = `${todayISODateLocal().slice(0, 7)}-01`;
  api.get.mockResolvedValue({
    usuarios: [{ id: 'u1', nome_completo: 'Ana', email: null }],
    dias: [{ usuario_id: 'u1', data, tipo: 'TRABALHO' }]
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  try {
    await vi.waitFor(() => expect(target.querySelector('tbody tr')).not.toBeNull());
    const row = target.querySelector<HTMLTableRowElement>('tbody tr')!;
    const cell = row.querySelector<HTMLTableCellElement>('td:nth-child(2)')!;
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(cell.querySelector('.vtur-table-cell-preview')?.textContent?.trim()).toBe('T');
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(row.getAttribute('aria-expanded')).toBe('true');
    cell.querySelector<HTMLButtonElement>('button')!.click();
    flushSync();
    const tipo = target.querySelector('#esc-tipo');
    expect(tipo).toBeInstanceOf(HTMLSelectElement);
    if (!(tipo instanceof HTMLSelectElement)) throw new Error('Campo de tipo não encontrado');
    expect(tipo.value).toBe('TRABALHO');
    expect(target.textContent).toContain('Ana');
  } finally {
    await unmount(app);
  }
});

it('mantém a edição direta da data no desktop', async () => {
  const data = `${todayISODateLocal().slice(0, 7)}-01`;
  api.get.mockResolvedValue({
    usuarios: [{ id: 'u1', nome_completo: 'Ana', email: null }],
    dias: [{ usuario_id: 'u1', data, tipo: 'FOLGA' }]
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  try {
    await vi.waitFor(() => expect(target.querySelector('tbody tr')).not.toBeNull());
    const row = target.querySelector<HTMLTableRowElement>('tbody tr')!;
    expect(row.hasAttribute('aria-expanded')).toBe(false);
    row.querySelector<HTMLButtonElement>('button')!.click();
    flushSync();
    const tipo = target.querySelector('#esc-tipo');
    expect(tipo).toBeInstanceOf(HTMLSelectElement);
    if (!(tipo instanceof HTMLSelectElement)) throw new Error('Campo de tipo não encontrado');
    expect(tipo.value).toBe('FOLGA');
  } finally {
    await unmount(app);
  }
});

it('permite selecionar várias datas do colaborador após abrir o cartão', async () => {
  vi.stubGlobal('innerWidth', 375);
  api.get.mockResolvedValue({
    usuarios: [{ id: 'u1', nome_completo: 'Ana', email: null }],
    dias: []
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  try {
    await vi.waitFor(() => expect(target.querySelector('tbody tr')).not.toBeNull());
    const checkbox = target.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    checkbox.click();
    flushSync();
    const row = target.querySelector<HTMLTableRowElement>('tbody tr')!;
    row.click();
    const days = row.querySelectorAll<HTMLButtonElement>('button.escala-dia-edit');
    days[0].click();
    days[1].click();
    flushSync();
    expect(target.textContent).toContain('2 dia(s) selecionado(s)');
    expect(target.querySelector('#esc-tipo')).toBeNull();
  } finally {
    await unmount(app);
  }
});
