import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const api = vi.hoisted(() => ({ get: vi.fn(), fetch: vi.fn(), delete: vi.fn() }));
vi.mock('$lib/services/api', () => ({
  apiGet: api.get,
  apiFetch: api.fetch,
  apiDelete: api.delete,
  isCanceledApiError: () => false
}));
vi.mock('$lib/stores/permissoes', async () => {
  const { readable } = await import('svelte/store');
  return {
    permissoes: Object.assign(
      readable({
        ready: true,
        isSystemAdmin: false,
        isMaster: false,
        isGestor: false,
        isVendedor: true,
        usoIndividual: true
      }),
      { can: () => true }
    )
  };
});

import Page from '../../../routes/(app)/parametros/vouchers/+page.svelte';

afterEach(() => {
  vi.resetAllMocks();
  document.body.replaceChildren();
});

it('permite ao usuário individual salvar escolha e enviar logo sem empresa', async () => {
  api.fetch.mockImplementation(async (path: string, options: { method?: string }) =>
    path === '/api/v1/voucher-assets' && !options.method
      ? { items: [], logo_esquerdo: 'vtur', individual: true, company_id: null }
      : { success: true }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  try {
    await vi.waitFor(() => expect(target.querySelector('#voucher-logo-esquerdo')).not.toBeNull());
    const select = [...target.querySelectorAll('select')].find(
      (item) => item.id === 'voucher-logo-esquerdo'
    )!;
    select.value = 'operadora';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    [...target.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Salvar escolha'))!
      .click();
    await vi.waitFor(() =>
      expect(api.fetch).toHaveBeenCalledWith(
        '/api/v1/voucher-assets/settings',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ logo_esquerdo: 'operadora' })
        })
      )
    );

    const provider = [...target.querySelectorAll('select')].find(
      (item) => item.id === 'voucher-provider'
    )!;
    provider.value = 'special_tours';
    provider.dispatchEvent(new Event('change', { bubbles: true }));
    const kind = [...target.querySelectorAll('select')].find(
      (item) => item.id === 'voucher-asset-kind'
    )!;
    kind.value = 'logo';
    kind.dispatchEvent(new Event('change', { bubbles: true }));
    const input = target.querySelector<HTMLInputElement>('input[type=file]')!;
    const file = new File(['png'], 'logo.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { configurable: true, writable: true, value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    [...target.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Enviar asset'))!
      .click();
    await vi.waitFor(() =>
      expect(api.fetch).toHaveBeenCalledWith(
        '/api/v1/voucher-assets',
        expect.objectContaining({ method: 'POST', body: expect.any(FormData) })
      )
    );
    const form = api.fetch.mock.calls.find(
      ([path, options]) => path === '/api/v1/voucher-assets' && options.method === 'POST'
    )![1].body as FormData;
    expect(form.get('company_id')).toBeNull();
    expect(form.get('provider')).toBe('special_tours');
    expect(form.get('asset_kind')).toBe('logo');
    expect(form.get('file')).toBe(file);
  } finally {
    await unmount(app);
  }
});
