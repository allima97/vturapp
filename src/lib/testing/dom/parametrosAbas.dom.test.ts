import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const api = vi.hoisted(() => ({ fetch: vi.fn(), get: vi.fn() }));
vi.mock('$lib/services/api', async (original) => ({
  ...(await original<typeof import('$lib/services/api')>()),
  apiFetch: api.fetch,
  apiGet: api.get
}));
vi.mock('$lib/stores/permissoes', async () => {
  const { readable } = await import('svelte/store');
  return {
    permissoes: Object.assign(readable({ ready: true, isSystemAdmin: true }), { can: () => true })
  };
});

import Page from '../../../routes/(app)/parametros/+page.svelte';
import Lgpd from '../../../routes/(app)/admin/lgpd/+page.svelte';
import TabsHarness from './harness/RoteiroTabsHarness.svelte';

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('troca as abas próprias de LGPD pelo menu e carrega a seção selecionada', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ items: [], atividades: [] })
  });
  vi.stubGlobal('fetch', fetchMock);
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Lgpd, { target });
  try {
    flushSync();
    const select = target.querySelector('select')!;
    select.value = 'atividades';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/lgpd/admin/atividades'));
    expect(target.textContent).toContain('Atividades de Tratamento');
  } finally {
    await unmount(app);
  }
});

it('abre as ações de solicitações pendentes no mobile sem alterar as concluídas', async () => {
  vi.stubGlobal('innerWidth', 375);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: '1',
            titular_nome: 'Pessoa pendente',
            titular_email: 'pendente@example.com',
            tipo: 'acesso',
            status: 'recebida',
            created_at: '2025-01-01',
            prazo_legal: '2025-02-01',
            prazo_vencido: false
          },
          {
            id: '2',
            titular_nome: 'Pessoa concluída',
            titular_email: 'concluida@example.com',
            tipo: 'acesso',
            status: 'concluida',
            created_at: '2025-01-01',
            prazo_legal: '2025-02-01',
            prazo_vencido: false
          }
        ]
      })
    })
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Lgpd, { target });
  try {
    await vi.waitFor(() => expect(target.querySelectorAll('tbody tr')).toHaveLength(2));
    const [pending, completed] = target.querySelectorAll<HTMLTableRowElement>('tbody tr');
    expect(pending.getAttribute('aria-expanded')).toBe('false');
    expect(completed.hasAttribute('aria-expanded')).toBe(false);
    pending.click();
    expect(pending.getAttribute('aria-expanded')).toBe('true');
    pending.querySelector('button')!.click();
    flushSync();
    expect(target.textContent).toContain('Responder Solicitação');
    expect(completed.textContent).toContain('Concluída');
  } finally {
    await unmount(app);
  }
});

it('aciona a mesma navegação ao selecionar uma aba com callback no menu móvel', async () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(TabsHarness, { target });
  try {
    flushSync();
    const select = target.querySelector('select')!;
    select.value = 'hoteis';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(target.querySelector('[data-testid="aba-atual"]')?.textContent).toBe('hoteis');
  } finally {
    await unmount(app);
  }
});

it('navega pelas abas de parâmetros pelo seletor e mantém a seleção sincronizada com as abas', async () => {
  api.fetch.mockResolvedValue({});
  api.get.mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  try {
    flushSync();
    const select = target.querySelector('select')!;
    expect([...select.options].map((option) => option.textContent?.trim())).toEqual([
      'Parâmetros do Sistema',
      'Regras de Comissão',
      'Personalizar Menu'
    ]);
    select.value = 'regras';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(target.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain(
      'Regras de Comissão'
    );
    expect(target.textContent).toContain('Nova Regra');
    const menu = [...target.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((tab) =>
      tab.textContent?.includes('Personalizar Menu')
    )!;
    menu.click();
    flushSync();
    expect(select.value).toBe('personalizar');
    await vi.waitFor(() => expect(target.textContent).toContain('Resetar'));
  } finally {
    await unmount(app);
  }
});

it('mostra os valores das faixas e só libera edição após selecionar o cartão', async () => {
  vi.stubGlobal('innerWidth', 375);
  api.fetch.mockResolvedValue({});
  api.get.mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  try {
    flushSync();
    const tabs = target.querySelector('select')!;
    tabs.value = 'regras';
    tabs.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    const button = (label: string) =>
      [...target.querySelectorAll('button')].find((item) => item.textContent?.trim() === label)!;
    button('Nova Regra').click();
    flushSync();
    const type = target.querySelector('#regra-tipo');
    if (!(type instanceof HTMLSelectElement)) throw new Error('Campo de tipo não encontrado');
    type.value = 'ESCALONAVEL';
    type.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    button('+ Faixa PRE').click();
    flushSync();
    const row = target.querySelector<HTMLTableRowElement>('tbody tr[aria-expanded]')!;
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(row.querySelector('.vtur-table-cell-preview')?.textContent).toBe('PRE');
    row.click();
    expect(row.getAttribute('aria-expanded')).toBe('true');
    const input = row.querySelector<HTMLInputElement>('input[type="number"]')!;
    input.value = '42';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    row.click();
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(row.querySelectorAll('.vtur-table-cell-preview')[1].textContent).toBe('42');
  } finally {
    await unmount(app);
  }
});
