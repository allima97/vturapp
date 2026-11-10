import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

const fetchCatalogo = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }));
vi.mock('$lib/services/api', () => ({
  apiFetch: fetchCatalogo,
  apiGet: vi.fn()
}));
vi.mock('$lib/stores/ui', () => ({ toast }));
import Harness from './harness/CatalogoOpcionaisHarness.svelte';
import type { RoteiroOpcionalCidade } from '$lib/roteiroOpcionais';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('opcionais do catálogo no roteiro', () => {
  it('separa homônimos por identidade ao adicionar cidades e passeios em lote', async () => {
    fetchCatalogo.mockImplementation(async (_url, { query }) => ({
      items: [
        {
          id: query.cidade_id,
          cidade: 'Roma',
          cidade_id: query.cidade_id,
          nome: 'Museu',
          descricao: query.cidade_id
        }
      ],
      hasMore: false
    }));
    const target = document.createElement('div');
    let get = (): RoteiroOpcionalCidade[] => [];
    const app = mount(Harness, {
      target,
      props: {
        expose: (value) => (get = value),
        cidades: [
          { cidade: 'Roma, Itália', cidade_id: 'geonames:1' },
          { cidade: 'Roma, Texas', cidade_id: 'geonames:2' }
        ],
        passeiosIncorporados: [{ cidade: 'Roma', cidade_id: 'geonames:1', passeio: 'Museu' }]
      }
    });
    flushSync();
    [...target.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Adicionar todos os opcionais das cidades'))!
      .click();
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(fetchCatalogo).toHaveBeenCalledWith(
      '/api/v1/opcionais',
      expect.objectContaining({ query: { cidade_id: 'geonames:1', pagina: 1 } })
    );
    expect(fetchCatalogo).toHaveBeenCalledWith(
      '/api/v1/opcionais',
      expect.objectContaining({ query: { cidade_id: 'geonames:2', pagina: 1 } })
    );
    expect(get()).toEqual([
      {
        cidade: 'Roma, Texas',
        cidade_id: 'geonames:2',
        passeios: [{ nome: 'Museu', descricao: 'geonames:2' }]
      }
    ]);
    await unmount(app);
  });

  it('rejeita resultados de identidade diferente mesmo com o mesmo nome', async () => {
    fetchCatalogo.mockResolvedValue({
      items: [{ id: '2', cidade: 'Roma', cidade_id: 'geonames:2', nome: 'Tour', descricao: '' }],
      hasMore: false
    });
    const target = document.createElement('div');
    const app = mount(Harness, {
      target,
      props: {
        expose: () => {},
        cidades: [],
        inicial: [{ cidade: 'Roma', cidade_id: 'geonames:1', passeios: [] }]
      }
    });
    flushSync();
    target.querySelector('summary')!.click();
    [...target.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Atualizar catálogo desta cidade'))!
      .click();
    await vi.waitFor(() => expect(target.textContent).toContain('passeio de outra cidade'));
    await unmount(app);
  });

  it('mantém catálogos independentes mesmo quando os rótulos são iguais', async () => {
    fetchCatalogo.mockImplementation(async (_url, { query }) => ({
      items: [
        {
          id: query.cidade_id,
          cidade: 'Roma',
          cidade_id: query.cidade_id,
          nome: `Passeio ${query.cidade_id}`,
          descricao: ''
        }
      ],
      hasMore: false
    }));
    const target = document.createElement('div');
    let get = (): RoteiroOpcionalCidade[] => [];
    const app = mount(Harness, {
      target,
      props: {
        expose: (value) => (get = value),
        cidades: [
          { cidade: 'Roma', cidade_id: 'geonames:1' },
          { cidade: 'Roma', cidade_id: 'geonames:2' }
        ]
      }
    });
    flushSync();
    [...target.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Adicionar cidades do itinerário'))!
      .click();
    flushSync();
    expect(get()).toEqual([
      { cidade: 'Roma', cidade_id: 'geonames:1', passeios: [] },
      { cidade: 'Roma', cidade_id: 'geonames:2', passeios: [] }
    ]);
    await vi.waitFor(() => {
      const cities = [
        ...target.querySelectorAll<HTMLDetailsElement>(':scope > div details')
      ].filter((details) => details.querySelector('summary')?.textContent?.includes('Roma'));
      expect(cities).toHaveLength(2);
      expect(
        cities.every((details) => details.querySelector('summary')?.textContent?.includes('(-1)'))
      ).toBe(true);
    });
    const cities = [...target.querySelectorAll<HTMLDetailsElement>('details')].filter((details) =>
      details.querySelector('summary')?.textContent?.includes('Roma')
    );
    cities[0].querySelector('summary')!.click();
    cities[1].querySelector('summary')!.click();
    flushSync();
    expect(cities[0].textContent).toContain('Passeio geonames:1');
    expect(cities[0].textContent).not.toContain('Passeio geonames:2');
    expect(cities[1].textContent).toContain('Passeio geonames:2');
    expect(cities[1].textContent).not.toContain('Passeio geonames:1');
    await unmount(app);
  });

  it('busca pela cidade do itinerário e copia o passeio selecionado', async () => {
    fetchCatalogo.mockResolvedValue({
      items: [{ id: '1', cidade: 'Lisboa, Lisboa, Portugal', nome: 'Belém', descricao: 'Passeio' }],
      hasMore: false
    });
    const target = document.createElement('div');
    let get = (): RoteiroOpcionalCidade[] => [];
    const app = mount(Harness, {
      target,
      props: {
        expose: (value) => {
          get = value;
        }
      }
    });
    flushSync();
    const button = (text: string) => {
      const found = [...target.querySelectorAll('button')].find((item) =>
        item.textContent?.includes(text)
      );
      if (!found) throw new Error(`Botão não encontrado: ${text}`);
      return found;
    };
    button('Adicionar cidades do itinerário').click();
    flushSync();
    expect(get()).toEqual([{ cidade: 'Lisboa, Lisboa, Portugal', passeios: [] }]);
    const cidade = target.querySelector('details')!;
    expect(cidade.open).toBe(false);
    cidade.querySelector('summary')!.click();
    button('Atualizar catálogo desta cidade').click();
    await tick();
    await tick();
    flushSync();
    expect(fetchCatalogo).toHaveBeenCalledWith(
      '/api/v1/opcionais',
      expect.objectContaining({
        query: { cidade: 'Lisboa, Lisboa, Portugal', pagina: 1 },
        noCache: true
      })
    );
    expect(cidade.querySelector('summary')!.textContent).toContain('(-1)');
    expect(target.textContent).toContain('Não adicionados do catálogo');
    cidade.querySelector<HTMLElement>('details summary')!.click();
    const descricao = cidade.querySelector('details p')!;
    expect(descricao.textContent).toContain('Passeio');
    expect(descricao.nextElementSibling?.textContent).toContain('Adicionar ao roteiro');
    button('Adicionar ao roteiro').click();
    flushSync();
    expect(get()[0].passeios).toEqual([{ nome: 'Belém', descricao: 'Passeio' }]);
    expect(cidade.querySelector('summary')!.textContent).toContain('(+1)');
    expect(cidade.querySelector('summary')!.textContent).toContain('(-0)');
    expect(cidade.querySelector('details')!.open).toBe(false);
    expect(get()[0].passeios).toHaveLength(1);
    await unmount(app);
  });

  it('calcula pendentes pelo nome normalizado e atualiza grupos ao remover ou editar', async () => {
    fetchCatalogo.mockResolvedValue({
      items: [
        { id: '1', cidade: 'Lisboa', nome: 'Belém Histórico', descricao: 'Original' },
        { id: '2', cidade: 'Lisboa', nome: 'Sintra', descricao: 'Palácio' }
      ],
      hasMore: false
    });
    const target = document.createElement('div');
    const app = mount(Harness, {
      target,
      props: {
        expose: () => {},
        inicial: [
          { cidade: 'Lisboa', passeios: [{ nome: '  BELÉM  histórico ', descricao: 'Editada' }] }
        ],
        cidades: []
      }
    });
    flushSync();
    const cidade = target.querySelector('details')!;
    await vi.waitFor(() => expect(cidade.querySelector('summary')!.textContent).toContain('(-1)'));
    expect(cidade.open).toBe(false);
    cidade.querySelector('summary')!.click();
    flushSync();
    expect(target.textContent).toContain('Adicionados ao roteiro (1)');
    expect(target.textContent).toContain('Não adicionados do catálogo');
    expect(
      [...cidade.querySelectorAll('details summary')].map((e) => e.textContent?.trim())
    ).toEqual(
      expect.arrayContaining([expect.stringContaining('BELÉM'), expect.stringContaining('Sintra')])
    );
    const adicionado = cidade.querySelector('details')!;
    adicionado.querySelector('summary')!.click();
    [...target.querySelectorAll('button')]
      .find((item) => item.textContent?.includes('Remover opcional'))!
      .click();
    flushSync();
    expect(cidade.querySelector('summary')!.textContent).toContain('(+0)');
    expect(cidade.querySelector('summary')!.textContent).toContain('(-2)');
    await unmount(app);
  });

  it('mostra erro em vez de contagem incorreta e permite tentar novamente', async () => {
    fetchCatalogo
      .mockRejectedValueOnce(new Error('Catálogo indisponível'))
      .mockResolvedValueOnce({ items: [], hasMore: false });
    const target = document.createElement('div');
    const app = mount(Harness, {
      target,
      props: { expose: () => {}, inicial: [{ cidade: 'Lisboa', passeios: [] }], cidades: [] }
    });
    flushSync();
    const cidade = target.querySelector('details')!;
    cidade.querySelector('summary')!.click();
    await vi.waitFor(() =>
      expect(target.querySelector('[role="alert"]')?.textContent).toContain('Catálogo indisponível')
    );
    expect(cidade.querySelector('summary')!.textContent).toContain('(-?)');
    [...target.querySelectorAll('button')]
      .find((item) => item.textContent?.includes('Atualizar catálogo desta cidade'))!
      .click();
    await vi.waitFor(() => expect(cidade.querySelector('summary')!.textContent).toContain('(-0)'));
    await unmount(app);
  });

  it('adiciona todas as páginas da cidade, preservando passeios existentes e ignorando duplicados', async () => {
    fetchCatalogo.mockImplementation(async (_url, { query }) => ({
      items:
        query.pagina === 1
          ? [{ id: '1', cidade: 'Lisboa', nome: 'Belém', descricao: 'Passeio' }]
          : [
              { id: '2', cidade: 'Lisboa', nome: 'Sintra', descricao: 'Palácio' },
              { id: '3', cidade: 'Lisboa', nome: 'Sintra', descricao: 'Palácio' }
            ],
      hasMore: query.pagina === 1
    }));
    const target = document.createElement('div');
    let get = (): RoteiroOpcionalCidade[] => [];
    const app = mount(Harness, {
      target,
      props: {
        expose: (value) => (get = value),
        inicial: [{ cidade: 'Lisboa', passeios: [{ nome: 'Belém', descricao: 'Passeio' }] }],
        cidades: []
      }
    });
    flushSync();
    target.querySelector('summary')!.click();
    [...target.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Adicionar todos os opcionais desta cidade'))!
      .click();
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
    flushSync();
    expect(fetchCatalogo).toHaveBeenCalledTimes(2);
    expect(get()[0].passeios).toEqual([
      { nome: 'Belém', descricao: 'Passeio' },
      { nome: 'Sintra', descricao: 'Palácio' }
    ]);
    await unmount(app);
  });

  it('busca todas as cidades do itinerário e da aba sem incluir destinos sem passeios', async () => {
    fetchCatalogo.mockImplementation(async (_url, { query }) => ({
      items:
        query.cidade === 'Sem passeios'
          ? []
          : [
              {
                id: query.cidade,
                cidade: query.cidade,
                nome: `Tour ${query.cidade}`,
                descricao: 'Descrição'
              }
            ],
      hasMore: false
    }));
    const target = document.createElement('div');
    let get = (): RoteiroOpcionalCidade[] => [];
    const app = mount(Harness, {
      target,
      props: {
        expose: (value) => (get = value),
        inicial: [{ cidade: 'Porto', passeios: [] }],
        cidades: ['Lisboa', 'Lisboa', 'Porto', 'Sem passeios']
      }
    });
    flushSync();
    [...target.querySelectorAll('button')]
      .find((button) =>
        button.textContent?.includes('Adicionar todos os opcionais das cidades do roteiro')
      )!
      .click();
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
    flushSync();
    expect(fetchCatalogo).toHaveBeenCalledTimes(3);
    expect(get()).toEqual([
      { cidade: 'Porto', passeios: [{ nome: 'Tour Porto', descricao: 'Descrição' }] },
      { cidade: 'Lisboa', passeios: [{ nome: 'Tour Lisboa', descricao: 'Descrição' }] }
    ]);
    await unmount(app);
  });

  it('não adiciona como opcionais passeios já incorporados na aba Passeios', async () => {
    fetchCatalogo.mockResolvedValue({
      items: [
        { id: '1', cidade: 'Lisboa', nome: 'Belém', descricao: 'Já incorporado' },
        { id: '2', cidade: 'Lisboa', nome: 'Sintra', descricao: 'Ainda opcional' }
      ],
      hasMore: false
    });
    const target = document.createElement('div');
    let get = (): RoteiroOpcionalCidade[] => [];
    const app = mount(Harness, {
      target,
      props: {
        expose: (value) => (get = value),
        inicial: [],
        cidades: ['Lisboa'],
        passeiosIncorporados: [{ cidade: ' Lisboa ', passeio: ' belém ' }]
      }
    });
    flushSync();
    [...target.querySelectorAll('button')]
      .find((button) =>
        button.textContent?.includes('Adicionar todos os opcionais das cidades do roteiro')
      )!
      .click();

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
    flushSync();
    expect(get()).toEqual([
      { cidade: 'Lisboa', passeios: [{ nome: 'Sintra', descricao: 'Ainda opcional' }] }
    ]);
    expect(target.textContent).not.toContain('Belém');
    await unmount(app);
  });

  it('informa quando todos os opcionais encontrados já foram incorporados', async () => {
    fetchCatalogo.mockResolvedValue({
      items: [{ id: '1', cidade: 'Lisboa', nome: 'Belém', descricao: 'Já incorporado' }],
      hasMore: false
    });
    const target = document.createElement('div');
    let get = (): RoteiroOpcionalCidade[] => [];
    const app = mount(Harness, {
      target,
      props: {
        expose: (value) => (get = value),
        inicial: [],
        cidades: ['Lisboa'],
        passeiosIncorporados: [{ cidade: 'Lisboa', passeio: 'Belém' }]
      }
    });
    flushSync();
    [...target.querySelectorAll('button')]
      .find((button) =>
        button.textContent?.includes('Adicionar todos os opcionais das cidades do roteiro')
      )!
      .click();

    await vi.waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        'Nenhum passeio novo: todos os passeios encontrados no catálogo já estão em Opcionais ou incorporados ao roteiro.'
      )
    );
    expect(get()).toEqual([]);
    await unmount(app);
  });

  it('distingue cidades sem passeios cadastrados no catálogo', async () => {
    fetchCatalogo.mockResolvedValue({ items: [], hasMore: false });
    const target = document.createElement('div');
    let get = (): RoteiroOpcionalCidade[] => [];
    const app = mount(Harness, {
      target,
      props: {
        expose: (value) => (get = value),
        inicial: [],
        cidades: ['Lisboa'],
        passeiosIncorporados: []
      }
    });
    flushSync();
    [...target.querySelectorAll('button')]
      .find((button) =>
        button.textContent?.includes('Adicionar todos os opcionais das cidades do roteiro')
      )!
      .click();

    await vi.waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        'Nenhum passeio foi encontrado no catálogo para as cidades do roteiro. Confira se os opcionais estão cadastrados para essas cidades.'
      )
    );
    expect(get()).toEqual([]);
    await unmount(app);
  });

  it('não aplica alterações parciais se uma busca falhar ou exceder o limite', async () => {
    const inicial = [{ cidade: 'Porto', passeios: [] }];
    fetchCatalogo
      .mockResolvedValueOnce({
        items: [{ id: '1', cidade: 'Porto', nome: 'Tour', descricao: '' }],
        hasMore: false
      })
      .mockRejectedValueOnce(new Error('Falha na busca'));
    const target = document.createElement('div');
    let get = (): RoteiroOpcionalCidade[] => [];
    const app = mount(Harness, {
      target,
      props: { expose: (value) => (get = value), inicial, cidades: ['Lisboa'] }
    });
    flushSync();
    const button = [...target.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('Adicionar todos os opcionais das cidades do roteiro')
    )!;
    button.click();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(get()).toEqual([{ cidade: 'Porto', passeios: [] }]);
    toast.error.mockClear();
    fetchCatalogo.mockResolvedValue({
      items: Array.from({ length: 101 }, (_, index) => ({
        id: `${index}`,
        cidade: 'Porto',
        nome: `Tour ${index}`,
        descricao: ''
      })),
      hasMore: false
    });
    target.querySelector('summary')!.click();
    [...target.querySelectorAll('button')]
      .find((item) => item.textContent?.includes('Adicionar todos os opcionais desta cidade'))!
      .click();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error.mock.calls[0][0]).toContain('limite de 100');
    expect(get()).toEqual([{ cidade: 'Porto', passeios: [] }]);
    await unmount(app);
  });

  it('não adiciona passeios se a cidade mudar durante a busca em lote', async () => {
    let resolver: (data: {
      items: { id: string; cidade: string; nome: string; descricao: string }[];
      hasMore: boolean;
    }) => void = () => {};
    fetchCatalogo.mockImplementation(() => new Promise((resolve) => (resolver = resolve)));
    const target = document.createElement('div');
    let get = (): RoteiroOpcionalCidade[] => [];
    const app = mount(Harness, {
      target,
      props: {
        expose: (value) => (get = value),
        inicial: [{ cidade: 'Porto', passeios: [] }],
        cidades: []
      }
    });
    flushSync();
    target.querySelector('summary')!.click();
    [...target.querySelectorAll('button')]
      .find((item) => item.textContent?.includes('Adicionar todos os opcionais desta cidade'))!
      .click();
    const input = target.querySelector('input')!;
    input.value = 'Lisboa';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    resolver({
      items: [{ id: '1', cidade: 'Porto', nome: 'Tour', descricao: '' }],
      hasMore: false
    });
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(get()).toEqual([{ cidade: 'Lisboa', passeios: [] }]);
    await unmount(app);
  });

  it('não aplica resultado antigo quando a identidade é removida durante a busca', async () => {
    let resolver: (data: {
      items: {
        id: string;
        cidade: string;
        cidade_id: string;
        nome: string;
        descricao: string;
      }[];
      hasMore: boolean;
    }) => void = () => {};
    fetchCatalogo.mockImplementation(() => new Promise((resolve) => (resolver = resolve)));
    const target = document.createElement('div');
    let get = (): RoteiroOpcionalCidade[] => [];
    const app = mount(Harness, {
      target,
      props: {
        expose: (value) => (get = value),
        inicial: [{ cidade: 'Roma', cidade_id: 'geonames:1', passeios: [] }],
        cidades: []
      }
    });
    flushSync();
    target.querySelector('summary')!.click();
    [...target.querySelectorAll('button')]
      .find((item) => item.textContent?.includes('Adicionar todos os opcionais desta cidade'))!
      .click();
    const input = target.querySelector('input')!;
    input.value = 'Roma';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    resolver({
      items: [{ id: '1', cidade: 'Roma', cidade_id: 'geonames:1', nome: 'Tour', descricao: '' }],
      hasMore: false
    });
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(get()).toMatchObject([{ cidade: 'Roma', cidade_id: undefined, passeios: [] }]);
    await unmount(app);
  });
});
