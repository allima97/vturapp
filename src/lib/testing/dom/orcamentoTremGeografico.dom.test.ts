import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const api = vi.hoisted(() => ({ fetch: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', async () => {
  const { readable } = await import('svelte/store');
  return { page: readable({ params: { id: 'orcamento-1' } }) };
});
vi.mock('$lib/config/destinosGeograficos', async (original) => ({
  ...(await original<typeof import('$lib/config/destinosGeograficos')>()),
  modulosOperacionaisGeograficosAtivos: true,
  campoGeografico: (id: string) => (id ? { destino_geografico_id: id } : {})
}));
vi.mock('$lib/services/api', async (original) => ({
  ...(await original<typeof import('$lib/services/api')>()),
  apiFetch: api.fetch,
  apiPost: api.post,
  apiPatch: api.patch
}));

import Page from '../../../routes/(app)/orcamentos/novo/+page.svelte';
import EditPage from '../../../routes/(app)/orcamentos/[id]/editar/+page.svelte';
import { readQuoteFlightSegments } from '$lib/quote/flights';

afterEach(() => {
  vi.resetAllMocks();
  document.body.replaceChildren();
});

it('seleciona cidades dos trechos, calcula a chegada e salva assentos e identificadores', async () => {
  api.fetch.mockImplementation((path: string, options: { query: { q: string } }) =>
    Promise.resolve({
      items:
        options.query.q === 'Roma'
          ? [{ id: 'geonames:2', nome: 'Roma', label: 'Roma, Itália', origem: 'geonames' }]
          : [{ id: 'geonames:1', nome: 'Milão', label: 'Milão, Itália', origem: 'geonames' }],
      podeHaverMais: false
    })
  );
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
    const type = target.querySelector('#orcamento-novo-item-0-tipo') as Element & {
      value: string;
      dispatchEvent: (event: Event) => boolean;
    };
    type.value = 'trem';
    type.dispatchEvent(new Event('input', { bubbles: true }));
    type.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    setInput('input[placeholder="Digite o nome do cliente"]', 'Cliente');
    setInput('#orcamento-novo-item-0-descricao', 'Roma / Milão');
    setInput('#orcamento-novo-item-0-data-saida', '2027-12-31');
    setInput('#orcamento-novo-item-0-data-chegada', '2028-01-01');
    setInput('#orcamento-novo-item-0-valor-adultos', '10000');
    [...target.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Adicionar trecho'))!
      .click();
    flushSync();

    const prefix = '#orcamento-novo-item-0-voo-';
    for (const [field, city] of [
      ['aeroporto-saida-0', 'Roma'],
      ['aeroporto-chegada-0', 'Milão']
    ]) {
      setInput(`${prefix}${field}`, city);
      if (field === 'aeroporto-saida-0') {
        [...target.querySelectorAll('button')]
          .find((button) => button.textContent?.includes('Salvar Rascunho'))!
          .click();
        flushSync();
        expect(api.post).not.toHaveBeenCalled();
        expect(target.textContent).toContain('Selecione as cidades dos trechos de trem');
      }
      await vi.waitFor(() =>
        expect(target.querySelector(`${prefix}${field} ~ div li button`)).toBeTruthy()
      );
      target.querySelector<HTMLButtonElement>(`${prefix}${field} ~ div li button`)!.click();
      flushSync();
    }

    setInput(`${prefix}data-voo-0`, '2027-12-31');
    setInput(`${prefix}hora-saida-0`, '23:30');
    setInput(`${prefix}duracao-0`, '02:15');
    expect(target.querySelector<HTMLInputElement>(`${prefix}data-chegada-0`)!.value).toBe(
      '2028-01-01'
    );
    expect(target.querySelector<HTMLInputElement>(`${prefix}hora-chegada-0`)!.value).toBe('01:45');
    setInput(`${prefix}duracao-0`, '01:00');
    expect(target.querySelector<HTMLInputElement>(`${prefix}hora-chegada-0`)!.value).toBe('00:30');
    setInput(`${prefix}assentos-0`, '12A, 12B');

    target
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/v1/orcamentos/create',
        expect.objectContaining({
          itens: [
            expect.objectContaining({
              raw: expect.objectContaining({
                aereo_import: {
                  segmentos: [
                    expect.objectContaining({
                      aeroporto_saida: 'Roma, Itália',
                      cidade_saida_id: 'geonames:2',
                      aeroporto_chegada: 'Milão, Itália',
                      cidade_chegada_id: 'geonames:1',
                      data_fim: '2028-01-01',
                      hora_chegada: '00:30',
                      assentos: '12A, 12B'
                    })
                  ]
                }
              })
            })
          ]
        })
      )
    );
    setInput(`${prefix}duracao-0`, '');
    expect(target.querySelector<HTMLInputElement>(`${prefix}data-chegada-0`)!.value).toBe('');
    expect(target.querySelector<HTMLInputElement>(`${prefix}hora-chegada-0`)!.value).toBe('');
    setInput(`${prefix}data-chegada-0`, '2028-01-03');
    setInput(`${prefix}hora-chegada-0`, '08:00');
    setInput(`${prefix}hora-saida-0`, '');
    expect(target.querySelector<HTMLInputElement>(`${prefix}data-chegada-0`)!.value).toBe(
      '2028-01-03'
    );
    expect(target.querySelector<HTMLInputElement>(`${prefix}hora-chegada-0`)!.value).toBe('08:00');
  } finally {
    await unmount(app);
  }
});

it('recarrega identificadores e assentos salvos de trechos', () => {
  const [segment] = readQuoteFlightSegments({
    aereo_import: {
      segmentos: [
        {
          aeroporto_saida: 'Roma, Itália',
          cidade_saida_id: 'geonames:2',
          aeroporto_chegada: 'Milão, Itália',
          cidade_chegada_id: 'geonames:1',
          assentos: '12A, 12B'
        }
      ]
    }
  });
  expect(segment).toMatchObject({
    cidade_saida_id: 'geonames:2',
    cidade_chegada_id: 'geonames:1',
    assentos: '12A, 12B'
  });
});

it('preserva cidades antigas sem identificador e assentos ao editar trem', async () => {
  api.fetch.mockResolvedValue({
    client_name: 'Cliente',
    valid_until: '2027-01-30',
    currency: 'BRL',
    itens: [
      {
        id: 'trem-1',
        item_type: 'trem',
        title: 'Roma / Milão',
        city_name: '',
        quantity: 1,
        unit_price: 100,
        total_amount: 100,
        start_date: '2027-08-11',
        end_date: '2027-08-11',
        raw: {
          detalhes_orcamento: { adultos: 1, adultos_valor: 100 },
          aereo_import: {
            segmentos: [{ aeroporto_saida: 'Roma', aeroporto_chegada: 'Milão', assentos: '12A' }]
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
      expect(target.querySelector('#orcamento-editar-item-0-voo-assentos-0')).toBeTruthy()
    );
    expect(
      target.querySelector<HTMLInputElement>('#orcamento-editar-item-0-voo-aeroporto-saida-0')!
        .validity.valid
    ).toBe(true);
    expect(
      target.querySelector<HTMLInputElement>('#orcamento-editar-item-0-voo-assentos-0')!.value
    ).toBe('12A');
    target
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/api/v1/orcamentos/orcamento-1',
        expect.objectContaining({
          itens: [
            expect.objectContaining({
              raw: expect.objectContaining({
                aereo_import: {
                  segmentos: [
                    expect.objectContaining({
                      aeroporto_saida: 'Roma',
                      aeroporto_chegada: 'Milão',
                      assentos: '12A'
                    })
                  ]
                }
              })
            })
          ]
        })
      )
    );
  } finally {
    await unmount(app);
  }
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
