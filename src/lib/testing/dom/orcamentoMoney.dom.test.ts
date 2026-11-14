import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const api = vi.hoisted(() => ({ post: vi.fn(), fetch: vi.fn(), patch: vi.fn(), get: vi.fn() }));
const preview = vi.hoisted(() => ({ open: vi.fn(), client: {} }));
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
  apiPatch: api.patch,
  apiGet: api.get
}));
vi.mock('$lib/db/browserData', () => ({ createBrowserDataClient: () => preview.client }));
vi.mock('$lib/quote/exportQuotePdfClient', async (original) => ({
  ...(await original<typeof import('$lib/quote/exportQuotePdfClient')>()),
  openQuotePreview: preview.open
}));

import Page from '../../../routes/(app)/orcamentos/novo/+page.svelte';
import EditPage from '../../../routes/(app)/orcamentos/[id]/editar/+page.svelte';
import DetailPage from '../../../routes/(app)/orcamentos/[id]/+page.svelte';

afterEach(() => {
  vi.resetAllMocks();
  document.body.replaceChildren();
});

it('mostra os itens em uma tabela padrão, na ordem manual e antes das ações', async () => {
  api.fetch.mockImplementation((path: string) =>
    Promise.resolve(
      path.endsWith('/interacao')
        ? { interacoes: [] }
        : {
            client_name: 'Cliente',
            currency: 'BRL',
            total: 1300,
            itens: [
              {
                item_type: 'hotel',
                title: 'Hotel Roma',
                city_name: 'Roma, Itália',
                quantity: 1,
                unit_price: 300,
                total_amount: 300,
                start_date: '2027-08-11',
                end_date: '2027-08-13',
                raw: { detalhes_orcamento: { adultos: 2, quantidade_apartamentos: 1 } }
              },
              {
                item_type: 'passagem',
                title: 'São Paulo / Roma',
                quantity: 2,
                unit_price: 500,
                total_amount: 1000,
                raw: {
                  detalhes_orcamento: { adultos: 2 },
                  aereo_import: {
                    segmentos: [
                      {
                        tipo_voo: 'Internacional',
                        cia_aerea: 'LATAM',
                        aeroporto_saida: 'GRU',
                        aeroporto_chegada: 'FCO'
                      }
                    ]
                  }
                }
              }
            ]
          }
    )
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(DetailPage, { target });
  try {
    await vi.waitFor(() => expect(target.querySelector('.quote-items')).toBeTruthy());
    const items = target.querySelector('.quote-items')!;
    const text = items.textContent || '';
    expect(text.indexOf('Hotel Roma')).toBeLessThan(text.indexOf('LATAM'));
    for (const value of [
      'GRU → FCO',
      '02 passagens',
      '01 apartamento',
      'Valor Unit.',
      'Total',
      'R$ 500,00',
      'R$ 1.000,00'
    ]) {
      expect(text).toContain(value);
    }
    expect(items.querySelectorAll('table')).toHaveLength(1);
    expect([...items.querySelectorAll('thead th')].map((cell) => cell.textContent?.trim())).toEqual(
      ['Cidade', 'Serviço', 'Descrição / Detalhes', 'Valor Unit.', 'Qtd', 'Total']
    );
    const rows = [...items.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(2);
    expect([...rows[0].querySelectorAll('td')].map((cell) => cell.textContent?.trim())).toEqual([
      'Roma',
      'Hotel',
      expect.stringContaining('Hotel Roma'),
      'R$ 300,00',
      '01 apartamento',
      'R$ 300,00'
    ]);
    expect(
      [...rows[1].querySelectorAll('td')].map((cell) => cell.getAttribute('data-label'))
    ).toEqual(['Cidade', 'Serviço', 'Descrição / Detalhes', 'Valor Unit.', 'Qtd', 'Total']);
    expect(rows[1].querySelector('td')?.textContent?.trim()).toBe('—');
    expect(text).not.toContain('Subtotal');
    expect(text).not.toContain('Passagens Aéreas Internacionais e Trechos Internos');
    const itemsCard = items.closest('.vtur-card')!;
    const actionHeading = [...target.querySelectorAll('h3')].find(
      (heading) => heading.textContent === 'Ações'
    )!;
    expect(
      itemsCard.compareDocumentPosition(actionHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(itemsCard.parentElement?.className).not.toContain('lg:col-span-2');
  } finally {
    await unmount(app);
  }
});

it('organiza as ações e abre os formulários sem perder as opções do PDF', async () => {
  api.fetch.mockImplementation((path: string) =>
    Promise.resolve(
      path.endsWith('/interacao')
        ? { interacoes: [] }
        : { client_name: 'Cliente', currency: 'BRL', status: 'pendente', itens: [] }
    )
  );
  api.get.mockResolvedValue({ interacoes: [] });
  preview.open.mockResolvedValue(undefined);
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(DetailPage, { target });
  try {
    await vi.waitFor(() =>
      expect([...target.querySelectorAll('h3')].some((h) => h.textContent === 'Ações')).toBe(true)
    );
    const heading = [...target.querySelectorAll('h3')].find((h) => h.textContent === 'Ações')!;
    const card = heading.closest('.vtur-card')!;
    const buttons = [...card.querySelectorAll('button')];
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Opções do PDF',
      'Aprovar',
      'Rejeitar',
      'Registrar interações',
      'Visualizar PDF',
      'Enviar ao Cliente'
    ]);
    expect(buttons.every((button) => button.parentElement === buttons[0].parentElement)).toBe(true);
    expect(target.querySelector('[title="Editar orçamento"]')).toBeNull();
    expect(target.querySelectorAll('a[href="/orcamentos/orcamento-1/editar"]')).toHaveLength(1);
    expect(target.querySelector('#quote-pdf-options')).toBeNull();
    expect(buttons[0].getAttribute('aria-expanded')).toBe('false');
    buttons[0].click();
    flushSync();
    const select = target.querySelector('#quote-pdf-options')!.querySelectorAll('select')[2];
    select.value = 'sim';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(buttons[0].getAttribute('aria-expanded')).toBe('true');
    buttons[0].click();
    flushSync();
    expect(target.querySelector('#quote-pdf-options')).toBeNull();
    buttons[4].click();
    await vi.waitFor(() =>
      expect(preview.open).toHaveBeenCalledWith(
        expect.objectContaining({ quoteId: 'orcamento-1', showItemValues: true })
      )
    );
    buttons[0].click();
    flushSync();
    expect(target.querySelector('#quote-pdf-options')?.querySelectorAll('select')[2]?.value).toBe(
      'sim'
    );
    buttons[3].click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Registrar Nova Interação'));
  } finally {
    await unmount(app);
  }
});

it('preserva a ação de criar venda e oculta decisões após aprovação', async () => {
  api.fetch.mockImplementation((path: string) =>
    Promise.resolve(
      path.endsWith('/interacao')
        ? { interacoes: [] }
        : { client_name: 'Cliente', status: 'aprovado', itens: [] }
    )
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(DetailPage, { target });
  try {
    await vi.waitFor(() =>
      expect([...target.querySelectorAll('h3')].some((h) => h.textContent === 'Ações')).toBe(true)
    );
    const card = [...target.querySelectorAll('h3')]
      .find((heading) => heading.textContent === 'Ações')!
      .closest('.vtur-card')!;
    expect(
      [...card.querySelectorAll('button')].map((button) => button.textContent?.trim())
    ).toEqual(['Opções do PDF', 'Registrar interações', 'Visualizar PDF', 'Criar Venda']);
  } finally {
    await unmount(app);
  }
});

it.each([
  { form: Page, prefix: 'orcamento-novo', modo: 'criação' },
  { form: EditPage, prefix: 'orcamento-editar', modo: 'edição' }
])(
  'permite trocar seletores na $modo com eventos nativos de input e change',
  async ({ form, prefix }) => {
    api.fetch.mockResolvedValue({
      client_name: 'Cliente',
      valid_until: '2027-01-30',
      currency: 'BRL',
      itens: []
    });
    const target = document.createElement('div');
    document.body.appendChild(target);
    const app = mount(form, { target });
    try {
      await vi.waitFor(() => expect(target.querySelector(`#${prefix}-item-0-tipo`)).toBeTruthy());
      target
        .querySelector('details summary')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      flushSync();
      const type = target.querySelector(`#${prefix}-item-0-tipo`) as Element & {
        value: string;
        dispatchEvent: (event: Event) => boolean;
      };
      for (const [value, field] of [
        ['hotel', 'checkin'],
        ['aluguel_carro', 'cambio'],
        ['passagem', 'data-saida'],
        ['servico', 'categoria']
      ]) {
        type.value = value;
        type.dispatchEvent(new Event('input', { bubbles: true }));
        flushSync();
        type.dispatchEvent(new Event('change', { bubbles: true }));
        flushSync();
        expect(type.value).toBe(value);
        expect(target.querySelector(`#${prefix}-item-0-${field}`)).toBeTruthy();
      }
      const category = target.querySelector(`#${prefix}-item-0-categoria`) as Element & {
        value: string;
        dispatchEvent: (event: Event) => boolean;
      };
      category.value = 'Serviço Privativo';
      category.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
      category.dispatchEvent(new Event('change', { bubbles: true }));
      flushSync();
      expect(category.value).toBe('Serviço Privativo');
    } finally {
      await unmount(app);
    }
  }
);

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

it('permite reordenar novos itens preservando os dados e o estado aberto', async () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  try {
    flushSync();
    const first = target.querySelector('details')!;
    first.querySelector('summary')!.click();
    flushSync();
    const description = target.querySelector<HTMLInputElement>('#orcamento-novo-item-0-descricao')!;
    description.value = 'Primeiro';
    description.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    [...target.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Adicionar Item'))!
      .click();
    flushSync();
    const second = target.querySelectorAll('details')[1];
    second.querySelector('summary')!.click();
    second.dispatchEvent(new Event('toggle'));
    flushSync();
    const secondDescription = target.querySelector<HTMLInputElement>(
      '#orcamento-novo-item-1-descricao'
    )!;
    secondDescription.value = 'Segundo';
    secondDescription.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    await vi.waitFor(() => expect(second.querySelector('summary')?.textContent).toContain('-'));
    target.querySelector<HTMLButtonElement>('[aria-label="Mover item 2 para cima"]')!.click();
    flushSync();
    const cards = [...target.querySelectorAll('details')];
    expect(cards.map((card) => card.querySelector('summary')?.textContent)).toEqual([
      expect.stringContaining('Segundo'),
      expect.stringContaining('Primeiro')
    ]);
    expect(cards.map((card) => card.open)).toEqual([true, false]);
    expect(
      target.querySelector<HTMLButtonElement>('[aria-label="Mover item 1 para cima"]')?.disabled
    ).toBe(true);
    expect(
      target.querySelector<HTMLButtonElement>('[aria-label="Mover item 2 para baixo"]')?.disabled
    ).toBe(true);
  } finally {
    await unmount(app);
  }
});

it('salva a ordem alterada dos itens de um orçamento existente', async () => {
  api.fetch.mockResolvedValue({
    client_name: 'Cliente',
    valid_until: '2027-08-01',
    currency: 'BRL',
    itens: ['Primeiro', 'Segundo'].map((title, index) => ({
      id: `item-${index}`,
      title,
      item_type: 'passagem',
      quantity: 1,
      unit_price: 150,
      total_amount: 150,
      start_date: '2027-08-11',
      end_date: '2027-08-13',
      order_index: index,
      raw: { detalhes_orcamento: { adultos: 1, adultos_valor: 150 } }
    }))
  });
  api.patch.mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(EditPage, { target });
  try {
    await vi.waitFor(() =>
      expect(target.querySelector('[aria-label="Mover item 1 para baixo"]')).toBeTruthy()
    );
    target.querySelector<HTMLButtonElement>('[aria-label="Mover item 1 para baixo"]')!.click();
    flushSync();
    expect(
      [...target.querySelectorAll('details summary')].map((summary) => summary.textContent)
    ).toEqual([expect.stringContaining('Segundo'), expect.stringContaining('Primeiro')]);
    target
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/api/v1/orcamentos/orcamento-1',
        expect.objectContaining({
          itens: [
            expect.objectContaining({ id: 'item-1', title: 'Segundo', order_index: 0 }),
            expect.objectContaining({ id: 'item-0', title: 'Primeiro', order_index: 1 })
          ]
        })
      )
    );
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

it('permite criar trem com campos, trechos e cálculo de passagem aérea', async () => {
  api.post.mockResolvedValue({});
  api.get.mockResolvedValue([{ label: 'Milão, Itália' }]);
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
    type('input[placeholder="Digite o nome do cliente"]', 'Cliente');
    const select = target.querySelector('#orcamento-novo-item-0-tipo') as Element & {
      value: string;
      dispatchEvent: (event: Event) => boolean;
    };
    select.value = 'trem';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    for (const [field, span] of [
      ['tipo', 'xl:col-span-2'],
      ['destino', 'xl:col-span-3'],
      ['descricao', 'xl:col-span-3'],
      ['data-saida', 'xl:col-span-2'],
      ['data-chegada', 'xl:col-span-2']
    ]) {
      expect(
        target.querySelector(`#orcamento-novo-item-0-${field}`)?.closest(`[class~="${span}"]`)
      ).toBeTruthy();
    }
    type('#orcamento-novo-item-0-destino', 'Milão');
    await vi.waitFor(() =>
      expect(
        [...target.querySelectorAll('button')].some((button) =>
          button.textContent?.includes('Milão, Itália')
        )
      ).toBe(true)
    );
    [...target.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Milão, Itália'))!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    flushSync();
    type('#orcamento-novo-item-0-descricao', 'ROMA / MILÃO');
    type('#orcamento-novo-item-0-data-saida', '2027-08-11');
    type('#orcamento-novo-item-0-data-chegada', '2027-08-11');
    type('#orcamento-novo-item-0-adultos', '2');
    type('#orcamento-novo-item-0-criancas', '1');
    type('#orcamento-novo-item-0-valor-adultos', '10000');
    type('#orcamento-novo-item-0-valor-criancas', '5000');
    [...target.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Adicionar trecho'))!
      .click();
    flushSync();
    expect(target.textContent).toContain('Dados dos trechos de trem');
    const segmentFields = [...target.querySelectorAll('[id^="orcamento-novo-item-0-voo-"]')];
    expect(
      segmentFields.map((field) => field.id.replace('orcamento-novo-item-0-voo-', ''))
    ).toEqual([
      'cia-aerea-0',
      'numero-voo-0',
      'classe-0',
      'aeroporto-saida-0',
      'data-voo-0',
      'hora-saida-0',
      'duracao-0',
      'aeroporto-chegada-0',
      'data-chegada-0',
      'hora-chegada-0'
    ]);
    expect(
      segmentFields.map((field) =>
        target.querySelector(`label[for="${field.id}"]`)?.textContent?.trim()
      )
    ).toEqual([
      'Fornecedor',
      'Número do Trem',
      'Classe de reserva',
      'Cidade de saída',
      'Data de saída',
      'Hora de saída',
      'Duração da viagem',
      'Cidade de chegada',
      'Data de chegada',
      'Hora de chegada'
    ]);
    type('#orcamento-novo-item-0-voo-cia-aerea-0', 'Trenitalia');
    type('#orcamento-novo-item-0-voo-numero-voo-0', 'FR 1000');
    type('#orcamento-novo-item-0-voo-aeroporto-saida-0', 'Roma');
    type('#orcamento-novo-item-0-voo-aeroporto-chegada-0', 'Milão');
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
              title: 'Roma / Milão',
              city_name: 'Milão, Itália',
              quantity: 3,
              total_amount: 250,
              raw: expect.objectContaining({
                aereo_import: {
                  segmentos: [
                    expect.objectContaining({
                      cia_aerea: 'Trenitalia',
                      numero_voo: 'FR 1000',
                      aeroporto_saida: 'Roma',
                      aeroporto_chegada: 'Milão'
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

it('edita trechos de trem já salvos sem perder dados ocultos antigos', async () => {
  api.fetch.mockResolvedValue({
    client_name: 'Cliente',
    valid_until: '2027-01-30',
    currency: 'BRL',
    itens: [
      {
        id: 'trem-1',
        item_type: 'trem',
        title: 'Roma / Milão',
        city_name: 'Milão, Itália',
        quantity: 1,
        unit_price: 100,
        total_amount: 100,
        start_date: '2027-08-11',
        end_date: '2027-08-11',
        raw: {
          detalhes_orcamento: { adultos: 1, adultos_valor: 100 },
          aereo_import: {
            segmentos: [
              {
                tipo_voo: 'Internacional',
                tarifa_nome: 'Legado',
                cia_aerea: 'Trenitalia',
                numero_voo: 'FR 1000',
                aeroporto_saida: 'Roma',
                aeroporto_chegada: 'Milão'
              }
            ]
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
      expect(target.querySelector('#orcamento-editar-item-0-voo-cia-aerea-0')).toBeTruthy()
    );
    target
      .querySelector('details summary')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(target.querySelector('#orcamento-editar-item-0-voo-tipo-voo-0')).toBeNull();
    expect(target.querySelector('#orcamento-editar-item-0-voo-tarifa-0')).toBeNull();
    expect(target.querySelector<HTMLInputElement>('#orcamento-editar-item-0-destino')?.value).toBe(
      'Milão, Itália'
    );
    const city = target.querySelector<HTMLInputElement>(
      '#orcamento-editar-item-0-voo-aeroporto-chegada-0'
    )!;
    expect(city.value).toBe('Milão');
    city.value = 'Veneza';
    city.dispatchEvent(new Event('input', { bubbles: true }));
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
              item_type: 'trem',
              city_name: 'Milão, Itália',
              raw: expect.objectContaining({
                aereo_import: {
                  segmentos: [
                    expect.objectContaining({
                      cia_aerea: 'Trenitalia',
                      aeroporto_saida: 'Roma',
                      aeroporto_chegada: 'Veneza',
                      tipo_voo: 'Internacional',
                      tarifa_nome: 'Legado'
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

it('formata a descrição aérea ao sair do campo e ao salvar', async () => {
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
    const description = type('#orcamento-novo-item-0-descricao', 'SÃO PAULO / ROMA / SÃO PAULO');
    description.dispatchEvent(new Event('blur'));
    flushSync();
    expect(description.value).toBe('SÃO PAULO / ROMA / SÃO PAULO');
    const typeSelect = target.querySelector('#orcamento-novo-item-0-tipo') as Element & {
      value: string;
      dispatchEvent: (event: Event) => boolean;
    };
    typeSelect.value = 'passagem';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(description.value).toBe('São Paulo / Roma / São Paulo');
    type('#orcamento-novo-item-0-descricao', 'RIO DE JANEIRO / ROMA');
    description.dispatchEvent(new Event('blur'));
    flushSync();
    expect(description.value).toBe('Rio de Janeiro / Roma');
    type('#orcamento-novo-item-0-data-saida', '2027-08-10');
    type('#orcamento-novo-item-0-data-chegada', '2027-08-25');
    type('#orcamento-novo-item-0-valor-adultos', '10000');
    type('#orcamento-novo-item-0-descricao', 'SÃO PAULO / ROMA / SÃO PAULO');
    target
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/v1/orcamentos/create',
        expect.objectContaining({
          itens: [expect.objectContaining({ title: 'São Paulo / Roma / São Paulo' })]
        })
      )
    );
  } finally {
    await unmount(app);
  }
});

it('apresenta descrições aéreas antigas formatadas na edição', async () => {
  api.fetch.mockResolvedValue({
    client_name: 'Cliente',
    valid_until: '2027-08-01',
    currency: 'BRL',
    itens: [
      {
        id: 'item-voo',
        title: 'SÃO PAULO / ROMA',
        item_type: 'passagem',
        quantity: 1,
        unit_price: 150,
        total_amount: 150,
        start_date: '2027-08-11',
        end_date: '2027-08-13',
        raw: { detalhes_orcamento: { adultos: 1, adultos_valor: 150 } }
      }
    ]
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(EditPage, { target });
  try {
    await vi.waitFor(() =>
      expect(
        target.querySelector<HTMLInputElement>('#orcamento-editar-item-0-descricao')?.value
      ).toBe('São Paulo / Roma')
    );
    expect(target.querySelector('summary')?.textContent).toContain('São Paulo / Roma');
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
