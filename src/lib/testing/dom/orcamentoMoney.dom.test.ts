import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/services/api', async (original) => ({
  ...(await original<typeof import('$lib/services/api')>()),
  apiPost: api.post
}));

import Page from '../../../routes/(app)/orcamentos/novo/+page.svelte';

afterEach(() => {
  vi.resetAllMocks();
  document.body.replaceChildren();
});

it('calcula e salva o preço unitário digitado por centavos', async () => {
  api.post.mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  try {
    flushSync();
    const type = (selector: string, value: string) => {
      const input = target.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
      return input;
    };
    type('input[placeholder="Digite o nome do cliente"]', 'Cliente teste');
    type('#orcamento-novo-item-titulo-0', 'Passeio');
    type('#orcamento-novo-item-quantidade-0', '2');
    expect(type('#orcamento-novo-item-valor-0', '123456').value).toBe('1.234,56');
    expect(target.textContent).toContain('2.469,12');
    target
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/v1/orcamentos/create',
        expect.objectContaining({
          itens: [
            expect.objectContaining({ quantity: 2, unit_price: 1234.56, total_amount: 2469.12 })
          ]
        })
      )
    );
  } finally {
    await unmount(app);
  }
});
