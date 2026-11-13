import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { parseConciliacaoImportText } from '$lib/conciliacao/importParser';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('$lib/services/api', async (original) => ({
  ...(await original<typeof import('$lib/services/api')>()),
  apiGet: api.get,
  apiPost: api.post
}));

import Page from '../../../routes/(app)/financeiro/conciliacao/+page.svelte';

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('permite editar os valores da importação após selecionar o cartão', async () => {
  vi.stubGlobal('innerWidth', 375);
  api.get.mockResolvedValue({});
  api.post.mockResolvedValue({ matches: {} });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  try {
    flushSync();
    const importButton = [...target.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Importar'
    )!;
    importButton.click();
    flushSync();
    const textarea = target.querySelector<HTMLTextAreaElement>('#conciliacao-paste')!;
    textarea.value =
      'DOCUMENTO;DESCRICAO;VALOR_LANCAMENTOS;TAXAS\n12345;BAIXA DE RECIBO;1234,56;50,00';
    expect(parseConciliacaoImportText(textarea.value).linhas).toHaveLength(1);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    await vi.waitFor(() => expect(target.querySelector('tbody tr[aria-expanded]')).not.toBeNull());
    const row = target.querySelector<HTMLTableRowElement>('tbody tr[aria-expanded]')!;
    const cell = row.querySelector<HTMLTableCellElement>('td[data-label="Lançamentos"]')!;
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(cell.querySelector('.vtur-table-cell-preview')?.textContent).toBe('1.234,56');
    row.click();
    const input = cell.querySelector<HTMLInputElement>('input')!;
    input.value = '2000';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    row.click();
    flushSync();
    expect(cell.querySelector('.vtur-table-cell-preview')?.textContent).toBe('20,00');
  } finally {
    await unmount(app);
  }
});
