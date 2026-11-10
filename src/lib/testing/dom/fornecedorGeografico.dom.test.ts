import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({ get: vi.fn(), fetch: vi.fn(), error: vi.fn(), goto: vi.fn() }));
vi.mock('$lib/config/destinosGeograficos', () => ({
  fornecedoresGeograficosAtivos: true,
  modulosOperacionaisGeograficosAtivos: false,
  campoGeografico: () => ({})
}));
vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
vi.mock('$lib/services/api', () => ({
  apiGet: mocks.get,
  apiFetch: mocks.fetch,
  apiDelete: vi.fn(),
  isCanceledApiError: () => false
}));
vi.mock('$lib/stores/ui', () => ({ toast: { error: mocks.error, success: vi.fn() } }));
import FornecedorForm from '$lib/components/cadastros/FornecedorForm.svelte';

const legacy = {
  nome_completo: 'Fornecedor',
  nome_fantasia: 'Fantasia',
  localizacao: 'exterior',
  cidade: 'Roma',
  estado: 'Lácio',
  telefone: '111',
  whatsapp: '222',
  telefone_emergencia: '333',
  responsavel: 'Contato',
  principais_servicos: 'Passeios'
};
const roma = {
  id: 'geonames:1',
  nome: 'Roma',
  label: 'Roma, Lácio, Itália',
  origem: 'geonames',
  referencia: { regiao: 'Lácio' }
};
const texas = {
  id: 'geonames:2',
  nome: 'Roma',
  label: 'Roma, Texas, Estados Unidos',
  origem: 'geonames',
  referencia: { regiao: 'Texas' }
};
const semEstado = {
  id: 'geonames:3',
  nome: 'Roma',
  label: 'Roma, País',
  origem: 'geonames',
  referencia: { regiao: null }
};

afterEach(() => {
  vi.resetAllMocks();
  document.body.replaceChildren();
});

async function setup(data: typeof legacy & { cidade_geografica_id?: string }) {
  mocks.get.mockResolvedValue({ data });
  mocks.fetch.mockImplementation(async (path: string) => {
    if (path.endsWith('/busca')) return { items: [roma, texas, semEstado], podeHaverMais: false };
    if (path.endsWith('/detalhes')) return { item: roma };
    return { success: true };
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(FornecedorForm, { target, props: { fornecedorId: 'fornecedor-1' } });
  await vi.waitFor(() => expect(target.querySelector('#forn-cidade')).toBeTruthy());
  return { target, app };
}

function click(target: HTMLElement, text: string) {
  const button = [...target.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === text
  );
  expect(button, text).toBeTruthy();
  button!.click();
  flushSync();
}

function digitar(target: HTMLElement, text: string) {
  const input = target.querySelector<HTMLInputElement>('#forn-cidade')!;
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

function submit(target: HTMLElement) {
  target
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  flushSync();
}

it('preserva cidade legada sem chamar GeoNames e permite cancelar a substituição', async () => {
  const tela = await setup(legacy);
  expect(tela.target.querySelector<HTMLInputElement>('#forn-cidade')?.value).toBe('Roma (Lácio)');
  submit(tela.target);
  await vi.waitFor(() =>
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/v1/fornecedores/fornecedor-1',
      expect.objectContaining({
        method: 'PUT',
        body: expect.objectContaining({ cidade: 'Roma', estado: 'Lácio' })
      })
    )
  );
  expect(mocks.fetch.mock.calls[0][1].body).not.toHaveProperty('cidade_geografica_id');
  mocks.fetch.mockClear();
  click(tela.target, 'Selecionar cidade geográfica');
  digitar(tela.target, 'Outra');
  submit(tela.target);
  expect(mocks.error).toHaveBeenCalledWith('Selecione uma cidade geográfica válida.');
  expect(mocks.fetch).not.toHaveBeenCalled();
  click(tela.target, 'Manter cidade anterior');
  expect(tela.target.querySelector<HTMLInputElement>('#forn-estado')?.value).toBe('Lácio');
  submit(tela.target);
  await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
  expect(mocks.fetch.mock.calls[0][1].body).toMatchObject({ cidade: 'Roma', estado: 'Lácio' });
  await unmount(tela.app);
});

it('exige seleção explícita e envia a identidade da localidade homônima escolhida', async () => {
  const tela = await setup(legacy);
  click(tela.target, 'Selecionar cidade geográfica');
  digitar(tela.target, 'Roma');
  submit(tela.target);
  expect(mocks.error).toHaveBeenCalledWith('Selecione uma cidade geográfica válida.');
  await vi.waitFor(() => expect(tela.target.textContent).toContain(texas.label));
  click(tela.target, texas.label);
  expect(tela.target.querySelector<HTMLInputElement>('#forn-estado')?.value).toBe('Texas');
  submit(tela.target);
  await vi.waitFor(() =>
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/v1/fornecedores/fornecedor-1',
      expect.objectContaining({
        method: 'PUT',
        body: expect.objectContaining({
          cidade: 'Roma',
          estado: 'Texas',
          cidade_geografica_id: 'geonames:2',
          cidade_geografica_esperada: null
        })
      })
    )
  );
  await unmount(tela.app);
});

it('impede salvar destino sem região', async () => {
  const tela = await setup(legacy);
  click(tela.target, 'Selecionar cidade geográfica');
  digitar(tela.target, 'Roma');
  await vi.waitFor(() => expect(tela.target.textContent).toContain(semEstado.label));
  click(tela.target, semEstado.label);
  expect(tela.target.textContent).toContain('O destino não possui estado ou região.');
  submit(tela.target);
  expect(mocks.error).toHaveBeenCalledWith('Estado é obrigatório.');
  expect(
    mocks.fetch.mock.calls.some(([path]) => path === '/api/v1/fornecedores/fornecedor-1')
  ).toBe(false);
  await unmount(tela.app);
});

it('cria fornecedor apenas após selecionar destino geográfico', async () => {
  mocks.fetch.mockImplementation(async (path: string) =>
    path.endsWith('/busca') ? { items: [texas], podeHaverMais: false } : { success: true }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(FornecedorForm, { target });
  await vi.waitFor(() => expect(target.querySelector('#forn-cidade')).toBeTruthy());
  click(target, 'Exterior Permite cadastro internacional sem exigir documento fiscal brasileiro.');
  const preencher = (id: string, value: string) => {
    const input = target.querySelector<HTMLInputElement>(`#${id}`)!;
    expect(input, id).toBeTruthy();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
  };
  preencher('forn-nome-completo', 'Fornecedor');
  preencher('forn-fantasia', 'Fantasia');
  digitar(target, 'Roma');
  submit(target);
  expect(mocks.error).toHaveBeenCalledWith('Selecione uma cidade geográfica válida.');
  await vi.waitFor(() => expect(target.textContent).toContain(texas.label));
  click(target, texas.label);
  preencher('forn-telefone', '1111111111');
  preencher('forn-whatsapp', '1111111111');
  preencher('forn-emergencia', '1111111111');
  preencher('forn-responsavel', 'Contato');
  preencher('forn-servicos', 'Passeios');
  submit(target);
  await vi.waitFor(() =>
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/v1/fornecedores/create',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({ cidade_geografica_id: 'geonames:2', estado: 'Texas' })
      })
    )
  );
  await unmount(app);
});

it('ignora resposta atrasada de validação após uma nova seleção', async () => {
  let responder: (value: unknown) => void = () => {};
  mocks.get.mockResolvedValue({ data: { ...legacy, cidade_geografica_id: 'geonames:1' } });
  mocks.fetch.mockImplementation((path: string) => {
    if (path.endsWith('/detalhes')) return new Promise((resolve) => (responder = resolve));
    if (path.endsWith('/busca')) return Promise.resolve({ items: [texas], podeHaverMais: false });
    return Promise.resolve({ success: true });
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(FornecedorForm, { target, props: { fornecedorId: 'fornecedor-1' } });
  await vi.waitFor(() =>
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/v1/destinos-geograficos/detalhes',
      expect.anything()
    )
  );
  submit(target);
  expect(mocks.error).toHaveBeenCalledWith('Selecione uma cidade geográfica válida.');
  digitar(target, 'Roma');
  await vi.waitFor(() => expect(target.textContent).toContain(texas.label));
  click(target, texas.label);
  responder({ item: roma });
  await Promise.resolve();
  flushSync();
  expect(target.querySelector<HTMLInputElement>('#forn-cidade')?.value).toBe(texas.label);
  expect(target.querySelector<HTMLInputElement>('#forn-estado')?.value).toBe('Texas');
  submit(target);
  await vi.waitFor(() =>
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/v1/fornecedores/fornecedor-1',
      expect.objectContaining({
        body: expect.objectContaining({ cidade_geografica_id: 'geonames:2' })
      })
    )
  );
  await unmount(app);
});

it('preserva ID salvo, bloqueia falha de resolução e permite selecionar outro destino', async () => {
  const tela = await setup({ ...legacy, cidade_geografica_id: 'geonames:1' });
  await vi.waitFor(() =>
    expect(tela.target.querySelector<HTMLInputElement>('#forn-cidade')?.value).toBe(roma.label)
  );
  submit(tela.target);
  await vi.waitFor(() =>
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/v1/fornecedores/fornecedor-1',
      expect.objectContaining({
        body: expect.objectContaining({
          cidade_geografica_id: 'geonames:1',
          cidade_geografica_esperada: 'geonames:1'
        })
      })
    )
  );
  await unmount(tela.app);

  mocks.get.mockResolvedValue({ data: { ...legacy, cidade_geografica_id: 'geonames:1' } });
  mocks.fetch.mockImplementation(async (path: string) => {
    if (path.endsWith('/detalhes')) throw new Error('indisponível');
    return { items: [texas], podeHaverMais: false };
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(FornecedorForm, { target, props: { fornecedorId: 'fornecedor-1' } });
  await vi.waitFor(() => expect(target.textContent).toContain('Não foi possível validar'));
  mocks.fetch.mockClear();
  submit(target);
  expect(mocks.error).toHaveBeenCalledWith('Selecione uma cidade geográfica válida.');
  expect(mocks.fetch).not.toHaveBeenCalled();
  digitar(target, 'Roma');
  await vi.waitFor(() => expect(target.textContent).toContain(texas.label));
  click(target, texas.label);
  submit(target);
  await vi.waitFor(() =>
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/v1/fornecedores/fornecedor-1',
      expect.objectContaining({
        body: expect.objectContaining({ cidade_geografica_id: 'geonames:2' })
      })
    )
  );
  await unmount(app);
});
