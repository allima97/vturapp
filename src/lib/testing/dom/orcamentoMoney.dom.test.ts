import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const api = vi.hoisted(() => ({ post: vi.fn(), fetch: vi.fn(), patch: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', async () => {
  const { readable } = await import('svelte/store');
  return {
    page: readable({
      params: { id: 'orcamento-1' },
      url: new URL('https://vtur.app/orcamentos/orcamento-1/editar')
    })
  };
});
vi.mock('$lib/services/session', () => ({ ensureServerSessionCookie: vi.fn() }));
vi.mock('$lib/services/api', async (original) => ({
  ...(await original<typeof import('$lib/services/api')>()),
  apiPost: api.post,
  apiFetch: api.fetch,
  apiPatch: api.patch
}));

import Page from '../../../routes/(app)/orcamentos/novo/+page.svelte';
import EditPage from '../../../routes/(app)/orcamentos/[id]/editar/+page.svelte';

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
    type('#orcamento-novo-item-0-inicio', '2027-08-10');
    type('#orcamento-novo-item-0-fim', '2027-08-10');
    type('#orcamento-novo-item-0-categoria', 'Standard');
    type('#orcamento-novo-item-0-adultos', '2');
    type('#orcamento-novo-item-0-criancas', '0');
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
            expect.objectContaining({
              quantity: 2,
              unit_price: 1234.56,
              total_amount: 2469.12,
              start_date: '2027-08-10',
              end_date: '2027-08-10',
              raw: { detalhes_orcamento: { categoria: 'Standard', adultos: 2, criancas: 0 } }
            })
          ]
        })
      )
    );
  } finally {
    await unmount(app);
  }
});

it('exige detalhes do hotel antes de salvar e envia os campos específicos', async () => {
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
    };
    const change = (selector: string, value: string) => {
      const select = [...target.querySelectorAll('select')].find((item) => item.matches(selector))!;
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      flushSync();
    };
    type('input[placeholder="Digite o nome do cliente"]', 'Cliente teste');
    type('#orcamento-novo-item-titulo-0', 'Hotel');
    type('#orcamento-novo-item-valor-0', '10000');
    change('#orcamento-novo-item-tipo-0', 'hotel');
    target
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    flushSync();
    expect(api.post).not.toHaveBeenCalled();
    expect(target.textContent).toContain('Informe as datas de início e fim');
    type('#orcamento-novo-item-0-inicio', '2027-08-11');
    type('#orcamento-novo-item-0-fim', '2027-08-13');
    type('#orcamento-novo-item-0-categoria', '4 estrelas');
    type('#orcamento-novo-item-0-adultos', '2');
    type('#orcamento-novo-item-0-criancas', '0');
    type('#orcamento-novo-item-0-apto', 'Duplo');
    type('#orcamento-novo-item-0-qtd-apto', '1');
    change('#orcamento-novo-item-0-regime', 'Café da manhã');
    target
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/v1/orcamentos/create',
        expect.objectContaining({
          itens: [
            expect.objectContaining({
              start_date: '2027-08-11',
              end_date: '2027-08-13',
              raw: {
                detalhes_orcamento: {
                  categoria: '4 estrelas',
                  adultos: 2,
                  criancas: 0,
                  tipo_apartamento: 'Duplo',
                  quantidade_apartamentos: 1,
                  regime: 'Café da manhã'
                }
              }
            })
          ]
        })
      )
    );
  } finally {
    await unmount(app);
  }
});

it('carrega e preserva os detalhes de hotel ao editar o orçamento', async () => {
  api.fetch.mockResolvedValue({
    client_name: 'Cliente',
    valid_until: '2027-08-01',
    currency: 'BRL',
    itens: [
      {
        id: 'item-1',
        title: 'Hotel',
        item_type: 'hotel',
        quantity: 1,
        unit_price: 150,
        total_amount: 150,
        start_date: '2027-08-11',
        end_date: '2027-08-13',
        raw: {
          detalhes_orcamento: {
            categoria: '4 estrelas',
            adultos: 2,
            criancas: 0,
            tipo_apartamento: 'Duplo',
            quantidade_apartamentos: 1,
            regime: 'Café da manhã'
          }
        }
      }
    ]
  });
  api.patch.mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(EditPage, { target });
  try {
    await vi.waitFor(() =>
      expect(target.querySelector<HTMLInputElement>('#orcamento-editar-item-0-inicio')?.value).toBe(
        '2027-08-11'
      )
    );
    expect(target.querySelector<HTMLInputElement>('#orcamento-editar-item-0-criancas')!.value).toBe(
      '0'
    );
    expect(target.querySelector<HTMLInputElement>('#orcamento-editar-item-0-apto')!.value).toBe(
      'Duplo'
    );
    const apartamento = target.querySelector<HTMLInputElement>('#orcamento-editar-item-0-apto')!;
    apartamento.value = 'Triplo';
    apartamento.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    target
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/api/v1/orcamentos/orcamento-1',
        expect.objectContaining({
          itens: [
            expect.objectContaining({
              id: 'item-1',
              start_date: '2027-08-11',
              end_date: '2027-08-13',
              raw: {
                detalhes_orcamento: {
                  categoria: '4 estrelas',
                  adultos: 2,
                  criancas: 0,
                  tipo_apartamento: 'Triplo',
                  quantidade_apartamentos: 1,
                  regime: 'Café da manhã'
                }
              }
            })
          ]
        })
      )
    );
  } finally {
    await unmount(app);
  }
});
