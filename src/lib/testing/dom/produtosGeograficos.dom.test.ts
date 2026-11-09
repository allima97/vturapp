import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  fetch: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  goto: vi.fn(),
  error: vi.fn()
}));
vi.mock('$lib/config/destinosGeograficos', () => ({ produtosGeograficosAtivos: true }));
vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
vi.mock('$lib/services/api', () => ({
  apiGet: mocks.get,
  apiFetch: mocks.fetch,
  apiPost: mocks.post,
  apiPatch: mocks.patch,
  apiDelete: vi.fn(),
  isCanceledApiError: () => false
}));
vi.mock('$lib/stores/ui', () => ({
  toast: { error: mocks.error, success: vi.fn() }
}));

import ProdutoOperacionalForm from '$lib/components/cadastros/ProdutoOperacionalForm.svelte';

const base = { tipos: [{ id: 'tipo', nome: 'Passeio' }], cidades: [], fornecedores: [] };
const produto = {
  nome: 'Passeio',
  destino: 'Roma',
  tipo_produto: 'tipo',
  cidade_id: 'cidade-antiga'
};
const resultado = {
  items: [{ id: 'geonames:1', nome: 'Roma', label: 'Roma, Itália', cidade_interna_id: null }],
  podeHaverMais: false,
  cidades_legadas: [{ id: 'cidade-legada', nome: 'Roma', label: 'Roma antiga' }],
  legadas_pode_haver_mais: false
};

afterEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

async function setup(mode: 'produtos' | 'destinos') {
  mocks.get.mockImplementation(async (path: string) => (path.endsWith('/base') ? base : produto));
  mocks.fetch.mockImplementation(async (_path: string, options: { query?: { id?: string } }) =>
    options.query?.id ? { id: 'cidade-antiga', nome: 'Cidade antiga' } : resultado
  );
  mocks.patch.mockResolvedValue({ data: { id: 'produto-1' } });
  mocks.post.mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(ProdutoOperacionalForm, { target, props: { mode, produtoId: 'produto-1' } });
  await vi.waitFor(() =>
    expect(target.querySelector<HTMLInputElement>('#produto-cidade')?.value).toBe('Cidade antiga')
  );
  const input = target.querySelector<HTMLInputElement>('#produto-cidade')!;
  return { target, app, input };
}

function digitar(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

function submit(target: HTMLElement) {
  target
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  flushSync();
}

it.each(['produtos', 'destinos'] as const)(
  'preserva UUID legado e bloqueia texto pendente no formulário de %s',
  async (mode) => {
    const tela = await setup(mode);
    expect(mocks.fetch).toHaveBeenCalledWith('/api/v1/produtos/cidades-geograficas', {
      query: { id: 'cidade-antiga' },
      noCache: true
    });
    digitar(tela.input, 'Roma');
    submit(tela.target);
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith('Selecione uma cidade da lista ou limpe o campo.');
    await vi.waitFor(() => expect(tela.target.textContent).toContain('Roma antiga'));
    [...tela.target.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Roma antiga')!
      .click();
    flushSync();
    submit(tela.target);
    await vi.waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        '/api/v1/produtos/produto-1',
        expect.objectContaining({ cidade_id: 'cidade-legada' })
      )
    );
    await unmount(tela.app);
  }
);

it('mantém a cidade salva quando o cadastro é alterado sem trocar de cidade', async () => {
  const tela = await setup('produtos');
  submit(tela.target);
  await vi.waitFor(() =>
    expect(mocks.patch).toHaveBeenCalledWith(
      '/api/v1/produtos/produto-1',
      expect.objectContaining({ cidade_id: 'cidade-antiga' })
    )
  );
  await unmount(tela.app);
});

it('aguarda vínculo geográfico e salva o UUID retornado, sem conciliar pelo nome', async () => {
  const tela = await setup('produtos');
  let resolver: (value: unknown) => void = () => {};
  mocks.fetch.mockImplementation((path: string) =>
    path.endsWith('/referencia')
      ? new Promise((resolve) => (resolver = resolve))
      : Promise.resolve(resultado)
  );
  digitar(tela.input, 'Roma');
  await vi.waitFor(() => expect(tela.target.textContent).toContain('Roma, Itália'));
  [...tela.target.querySelectorAll('button')]
    .find((button) => button.textContent?.trim() === 'Roma, Itália')!
    .click();
  flushSync();
  submit(tela.target);
  expect(mocks.patch).not.toHaveBeenCalled();
  resolver({ item: { id: 'cidade-nova', destino_geografico_id: 'geonames:1' } });
  await vi.waitFor(() => expect(tela.input.value).toBe('Roma, Itália'));
  await vi.waitFor(() => {
    submit(tela.target);
    expect(mocks.patch).toHaveBeenCalledWith(
      '/api/v1/produtos/produto-1',
      expect.objectContaining({ cidade_id: 'cidade-nova' })
    );
  });
  await unmount(tela.app);
});

it('descarta respostas atrasadas ao transformar o produto em global', async () => {
  const tela = await setup('produtos');
  let resolver: (value: unknown) => void = () => {};
  mocks.fetch.mockImplementation((path: string) =>
    path.endsWith('/referencia')
      ? new Promise((resolve) => (resolver = resolve))
      : Promise.resolve(resultado)
  );
  digitar(tela.input, 'Roma');
  await vi.waitFor(() => expect(tela.target.textContent).toContain('Roma, Itália'));
  [...tela.target.querySelectorAll('button')]
    .find((button) => button.textContent?.trim() === 'Roma, Itália')!
    .click();
  flushSync();
  const label = [...tela.target.querySelectorAll('label')].find(
    (item) => item.textContent?.trim() === 'Produto global'
  )!;
  const toggle = tela.target.querySelector<HTMLInputElement>(`#${label.htmlFor}`)!;
  toggle.click();
  flushSync();
  resolver({ item: { id: 'cidade-nova', destino_geografico_id: 'geonames:1' } });
  await Promise.resolve();
  flushSync();
  submit(tela.target);
  await vi.waitFor(() =>
    expect(mocks.patch).toHaveBeenCalledWith(
      '/api/v1/produtos/produto-1',
      expect.objectContaining({ todas_as_cidades: true, cidade_id: null })
    )
  );
  await unmount(tela.app);
});
