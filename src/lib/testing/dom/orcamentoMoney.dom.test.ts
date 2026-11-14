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
    expect(target.querySelector('details')?.open).toBe(false);
    target
      .querySelector('details summary')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    const type = (selector: string, value: string) => {
      const input = target.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
      return input;
    };
    type('input[placeholder="Digite o nome do cliente"]', 'Cliente teste');
    type('#orcamento-novo-item-0-descricao', 'Passeio');
    type('#orcamento-novo-item-0-destino', 'Roma');
    type('#orcamento-novo-item-0-data-inicial', '2027-08-10');
    type('#orcamento-novo-item-0-data-final', '2027-08-10');
    const category = target.querySelector('#orcamento-novo-item-0-categoria') as Element & {
      value: string;
    };
    category.value = 'Serviço Compartilhado';
    category.dispatchEvent(new Event('change', { bubbles: true }));
    type('#orcamento-novo-item-0-adultos', '2');
    type('#orcamento-novo-item-0-criancas', '0');
    expect(type('#orcamento-novo-item-0-valor-adultos', '123456').value).toBe('1.234,56');
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
              city_name: 'Roma',
              raw: {
                detalhes_orcamento: {
                  categoria: 'Serviço Compartilhado',
                  adultos: 2,
                  adultos_valor: 1234.56,
                  criancas: 0,
                  criancas_valor: 0,
                  infant: 0,
                  infant_valor: 0
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

it('recolhe o item incluído ao adicionar outro item', async () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  try {
    flushSync();
    const firstItem = target.querySelector('details')!;
    firstItem.querySelector('summary')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(firstItem.open).toBe(true);

    const addButton = [...target.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Adicionar Item')
    )!;
    addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();

    expect([...target.querySelectorAll('details')].map((item) => item.open)).toEqual([
      false,
      false
    ]);
  } finally {
    await unmount(app);
  }
});

it('mostra os tipos e a classe de reserva definidos para trechos aéreos', async () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  try {
    flushSync();
    target
      .querySelector('details summary')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    const type = target.querySelector('#orcamento-novo-item-0-tipo') as Element & {
      value: string;
      dispatchEvent: (event: Event) => boolean;
    };
    type.value = 'passagem';
    type.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(target.querySelector('#orcamento-novo-item-0-destino')).toBeNull();

    const addSegment = [...target.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Adicionar trecho')
    )!;
    addSegment.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(
      [...target.querySelectorAll('[id^="orcamento-novo-item-0-voo-"]')].map((field) => field.id)
    ).toEqual(
      [
        'tipo-voo',
        'cia-aerea',
        'numero-voo',
        'classe',
        'aeroporto-saida',
        'data-voo',
        'hora-saida',
        'duracao',
        'aeroporto-chegada',
        'data-chegada',
        'hora-chegada',
        'tarifa'
      ].map((field) => `orcamento-novo-item-0-voo-${field}-0`)
    );
    expect(
      [...target.querySelectorAll('#orcamento-novo-item-0-voo-tipo-voo-0 option')].map(
        (option) => option.textContent
      )
    ).toEqual(['Nacional', 'Internacional', 'Voo Interno', 'Fretamento']);
    expect(
      [...target.querySelectorAll('#orcamento-novo-item-0-voo-classe-0 option')].map(
        (option) => option.textContent
      )
    ).toEqual(['Selecione', 'Econômica', 'Econômica Premium', 'Executiva', 'Primeira Classe']);
    expect(
      target.querySelector<HTMLInputElement>('#orcamento-novo-item-0-voo-duracao-0')?.type
    ).toBe('time');

    const airline = target.querySelector<HTMLInputElement>(
      '#orcamento-novo-item-0-voo-cia-aerea-0'
    )!;
    airline.value = 'LATAM';
    airline.dispatchEvent(new Event('input', { bubbles: true }));
    const flightType = target.querySelector('#orcamento-novo-item-0-voo-tipo-voo-0') as Element & {
      value: string;
      dispatchEvent: (event: Event) => boolean;
    };
    flightType.value = 'Internacional';
    flightType.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    addSegment.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();

    expect(
      target.querySelector<HTMLInputElement>('#orcamento-novo-item-0-voo-cia-aerea-0')?.value
    ).toBe('LATAM');
    expect(
      (
        target.querySelector('#orcamento-novo-item-0-voo-tipo-voo-0') as
          | (Element & { value: string })
          | null
      )?.value
    ).toBe('Internacional');
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
    target
      .querySelector('details summary')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    const type = (selector: string, value: string) => {
      const input = target.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
    };
    const change = (selector: string, value: string) => {
      const select = target.querySelector(selector) as Element & { value: string };
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      flushSync();
    };
    type('input[placeholder="Digite o nome do cliente"]', 'Cliente teste');
    type('#orcamento-novo-item-0-descricao', 'Hotel');
    change('#orcamento-novo-item-0-tipo', 'hotel');
    type('#orcamento-novo-item-0-valor-unitario', '10000');
    target
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    flushSync();
    expect(api.post).not.toHaveBeenCalled();
    expect(target.textContent).toContain('Informe as datas de início e fim');
    type('#orcamento-novo-item-0-destino', 'Roma');
    type('#orcamento-novo-item-0-checkin', '2027-08-11');
    type('#orcamento-novo-item-0-checkout', '2027-08-13');
    type('#orcamento-novo-item-0-categoria', '4 estrelas');
    type('#orcamento-novo-item-0-adultos', '2');
    type('#orcamento-novo-item-0-criancas', '0');
    type('#orcamento-novo-item-0-apartamento', 'Duplo');
    type('#orcamento-novo-item-0-quantidade-apartamentos', '1');
    type('#orcamento-novo-item-0-regime', 'Café da manhã');
    target
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/v1/orcamentos/create',
        expect.objectContaining({
          itens: [
            expect.objectContaining({
              city_name: 'Roma',
              quantity: 1,
              unit_price: 100,
              total_amount: 100,
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
        city_name: 'Roma',
        quantity: 1,
        unit_price: 150,
        total_amount: 150,
        start_date: '2027-08-11',
        end_date: '2027-08-13',
        raw: {
          aereo_import: null,
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
      expect(
        target.querySelector<HTMLInputElement>('#orcamento-editar-item-0-checkin')?.value
      ).toBe('2027-08-11')
    );
    target
      .querySelector('details summary')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(target.querySelector<HTMLInputElement>('#orcamento-editar-item-0-criancas')!.value).toBe(
      '0'
    );
    expect(
      target.querySelector<HTMLInputElement>('#orcamento-editar-item-0-apartamento')!.value
    ).toBe('Duplo');
    const apartamento = target.querySelector<HTMLInputElement>(
      '#orcamento-editar-item-0-apartamento'
    )!;
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
                aereo_import: null,
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

it('permite alterar câmbio e itens incluídos ao editar aluguel de carro', async () => {
  api.fetch.mockResolvedValue({
    client_name: 'Cliente',
    valid_until: '2027-01-30',
    currency: 'BRL',
    itens: [
      {
        id: 'item-carro',
        title: 'SUV - Automático',
        item_type: 'aluguel_carro',
        city_name: 'Los Angeles',
        quantity: 1,
        unit_price: 700,
        total_amount: 700,
        start_date: '2027-01-17',
        end_date: '2027-01-20',
        raw: {
          detalhes_orcamento: {
            cambio: 'Automático',
            incluidos: ['CDW']
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
      expect(target.querySelector('#orcamento-editar-item-0-cambio')).toBeTruthy()
    );
    const change = target.querySelector('#orcamento-editar-item-0-cambio') as Element & {
      value: string;
      disabled: boolean;
      dispatchEvent: (event: Event) => boolean;
    };
    target
      .querySelector('details summary')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();

    expect(change.disabled).toBe(false);
    expect(
      [...change.querySelectorAll('option')].map((option) => option.getAttribute('value'))
    ).toEqual(['', 'Manual', 'Automático']);
    expect(change.value).toBe('Automático');

    change.value = 'Manual';
    change.dispatchEvent(new Event('change', { bubbles: true }));
    const included = [...target.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(included.map((input) => input.value)).toEqual([
      'KM Livre',
      'CDW',
      'LDW',
      'Tanque Cheio'
    ]);
    included.find((input) => input.value === 'KM Livre')!.click();
    included.find((input) => input.value === 'LDW')!.click();
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
              id: 'item-carro',
              raw: {
                detalhes_orcamento: {
                  cambio: 'Manual',
                  incluidos: ['KM Livre', 'CDW', 'LDW']
                },
                aereo_import: null
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
