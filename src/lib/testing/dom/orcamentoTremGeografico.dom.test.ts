import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const api = vi.hoisted(() => ({ fetch: vi.fn(), post: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/config/destinosGeograficos', async (original) => ({
  ...(await original<typeof import('$lib/config/destinosGeograficos')>()),
  modulosOperacionaisGeograficosAtivos: true,
  campoGeografico: (id: string) => (id ? { destino_geografico_id: id } : {})
}));
vi.mock('$lib/services/api', async (original) => ({
  ...(await original<typeof import('$lib/services/api')>()),
  apiFetch: api.fetch,
  apiPost: api.post
}));

import Page from '../../../routes/(app)/orcamentos/novo/+page.svelte';

afterEach(() => {
  vi.resetAllMocks();
  document.body.replaceChildren();
});

it('salva a cidade geográfica escolhida como destino do serviço de trem', async () => {
  api.fetch.mockResolvedValue({
    items: [{ id: 'geonames:1', nome: 'Milão', label: 'Milão, Itália', origem: 'geonames' }],
    podeHaverMais: false
  });
  api.post.mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  try {
    flushSync();
    const setInput = (selector: string, value: string) => {
      const input = target.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
    };
    setInput('#orcamento-novo-item-0-destino', 'Milão');
    await vi.waitFor(() =>
      expect(
        target
          .querySelector('#orcamento-novo-item-0-destino')
          ?.parentElement?.querySelector('li button')
      ).toBeTruthy()
    );
    target
      .querySelector<HTMLButtonElement>('#orcamento-novo-item-0-destino ~ div li button')!
      .click();
    flushSync();
    const type = target.querySelector('#orcamento-novo-item-0-tipo') as Element & { value: string };
    type.value = 'trem';
    type.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    type.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(target.querySelector<HTMLInputElement>('#orcamento-novo-item-0-destino')?.value).toBe(
      'Milão, Itália'
    );
    setInput('input[placeholder="Digite o nome do cliente"]', 'Cliente');
    setInput('#orcamento-novo-item-0-descricao', 'Roma / Milão');
    setInput('#orcamento-novo-item-0-data-saida', '2027-08-11');
    setInput('#orcamento-novo-item-0-data-chegada', '2027-08-11');
    setInput('#orcamento-novo-item-0-valor-adultos', '10000');
    target
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/v1/orcamentos/create',
        expect.objectContaining({
          itens: [
            expect.objectContaining({
              item_type: 'trem',
              city_name: 'Milão, Itália',
              destino_geografico_id: 'geonames:1'
            })
          ]
        })
      )
    );
  } finally {
    await unmount(app);
  }
});
