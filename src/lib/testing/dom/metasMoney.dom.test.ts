import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('$lib/services/api', async (original) => ({
  ...(await original<typeof import('$lib/services/api')>()),
  apiGet: api.get,
  apiPost: api.post
}));
vi.mock('$lib/stores/permissoes', async () => {
  const { readable } = await import('svelte/store');
  return {
    permissoes: Object.assign(readable({ ready: true, isSystemAdmin: true }), { can: () => true })
  };
});

import Page from '../../../routes/(app)/parametros/metas/+page.svelte';

afterEach(() => {
  vi.resetAllMocks();
  document.body.replaceChildren();
});

it('salva metas geral e por produto com os valores digitados por centavos', async () => {
  api.get.mockResolvedValue({
    items: [],
    vendedores: [{ id: 'v1', nome_completo: 'Vendedor' }],
    produtos: [{ id: 'p1', nome: 'Seguro' }]
  });
  api.post.mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  try {
    await vi.waitFor(() =>
      expect(target.querySelector('#metas-vendedor-filtro option[value="v1"]')).not.toBeNull()
    );
    const button = (text: string) =>
      [...document.querySelectorAll('button')].find((item) =>
        item.textContent?.trim().includes(text)
      )!;
    button('Nova meta').click();
    flushSync();
    const digitar = (input: HTMLInputElement, raw: string) => {
      input.value = raw;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
    };
    const geral = document.querySelector<HTMLInputElement>('#meta-geral')!;
    digitar(geral, '123456');
    expect(geral.value).toBe('1.234,56');
    [...document.querySelectorAll('button')]
      .find((item) => item.textContent?.trim() === 'Produto')!
      .click();
    flushSync();
    const produto = [...document.querySelectorAll('select')].find((item) =>
      [...item.options].some((option) => option.value === 'p1')
    );
    expect(produto).toBeDefined();
    produto!.value = 'p1';
    produto!.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    const metaProduto = [...document.querySelectorAll<HTMLInputElement>('input')].find(
      (item) => item !== geral && item.getAttribute('inputmode') === 'decimal'
    )!;
    digitar(metaProduto, '9999');
    expect(metaProduto.value).toBe('99,99');
    button('Salvar').click();
    await vi.waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/v1/parametros/metas',
        expect.objectContaining({
          meta_geral: 1234.56,
          meta_produtos: [{ produto_id: 'p1', valor: 99.99 }]
        })
      )
    );
  } finally {
    await unmount(app);
  }
});
