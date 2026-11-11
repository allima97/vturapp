import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

const api = vi.hoisted(() => ({ fetch: vi.fn(), post: vi.fn(), get: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('$lib/services/api', () => ({
  apiFetch: api.fetch,
  apiPost: api.post,
  apiDelete: vi.fn(),
  apiGet: api.get
}));
vi.mock('$lib/stores/ui', () => ({ toast }));
vi.mock('$lib/stores/confirm', () => ({ confirmAction: vi.fn() }));
import Page from '../../../routes/(app)/cadastros/opcionais/+page.svelte';

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  document.body.replaceChildren();
});

it('inicia sem listar, busca pelo nome e permite cadastrar em modal', async () => {
  vi.useFakeTimers();
  api.fetch.mockReset();
  api.fetch.mockResolvedValue({
    items: [{ id: '1', cidade: 'Lisboa', nome: 'Passeio de barco', descricao: '' }],
    hasMore: false
  });
  api.post.mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const page = mount(Page, { target });
  await tick();
  expect(api.fetch).not.toHaveBeenCalled();
  expect(target.textContent).toContain('Digite pelo menos 2 letras');
  expect(target.querySelector('#opcional-cidade')).toBeNull();
  expect(target.querySelector('#opcional-filtro')).toBeNull();
  expect(target.textContent).toContain('Buscar opcional (cidade ou descrição)');
  expect(target.querySelector('#texto-importar-opcionais')).toBeNull();

  const button = (text: string) =>
    [...target.querySelectorAll('button')].find((item) => item.textContent?.trim() === text)!;
  button('Novo opcional').click();
  flushSync();
  expect(target.querySelector('[role="dialog"]')?.textContent).toContain('Novo opcional');
  expect(target.querySelector('#opcional-cidade')).not.toBeNull();
  button('Cancelar').click();
  flushSync();
  expect(target.querySelector('[role="dialog"]')).toBeNull();

  const search = target.querySelector<HTMLInputElement>('#opcional-busca')!;
  search.value = 'barco';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(300);
  await tick();
  expect(api.fetch).toHaveBeenCalledWith('/api/v1/opcionais', {
    query: { q: 'barco', pagina: 1 },
    noCache: true
  });
  expect(target.textContent).toContain('Passeio de barco');
  button('Limpar busca').click();
  flushSync();
  expect(target.textContent).not.toContain('Passeio de barco');
  expect(target.textContent).toContain('Digite pelo menos 2 letras');
  await unmount(page);
});

it('abre importação pelo cabeçalho, mantém a prévia e impede fechamento durante envio', async () => {
  vi.useFakeTimers();
  api.fetch.mockReset();
  api.get.mockResolvedValue([{ nome: 'Lisboa, Portugal' }]);
  let concluir: (resultado: { importados: number; ignorados: number }) => void = () => {};
  api.post.mockImplementation(
    () =>
      new Promise((resolve) => {
        concluir = resolve;
      })
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const page = mount(Page, { target });
  const button = (text: string) =>
    [...target.querySelectorAll('button')].find((item) => item.textContent?.trim() === text)!;
  expect(button('Adicionar em lote').parentElement).toBe(
    button('Importar passeios opcionais').parentElement
  );
  button('Importar passeios opcionais').click();
  flushSync();
  expect(target.querySelector('[role="dialog"]')?.textContent).toContain(
    'Importar passeios opcionais'
  );
  const textarea = target.querySelector<HTMLTextAreaElement>('#texto-importar-opcionais')!;
  textarea.value = 'Passeio de barco\nVisita guiada';
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  button('Analisar e conferir').click();
  flushSync();
  expect(target.querySelector('[role="dialog"]')?.textContent).toContain('Visita guiada');
  const city = target.querySelector<HTMLInputElement>('#import-cidade-unica')!;
  city.value = 'Lisboa';
  city.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(300);
  await tick();
  flushSync();
  button('Lisboa, Portugal').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  flushSync();
  button('Salvar passeios').click();
  flushSync();
  expect(api.post).toHaveBeenCalledWith('/api/v1/opcionais/importar', {
    items: [{ cidade: 'Lisboa, Portugal', nome: 'Passeio de barco', descricao: 'Visita guiada' }]
  });
  expect(button('Fechar').disabled).toBe(true);
  concluir({ importados: 1, ignorados: 0 });
  await tick();
  await tick();
  flushSync();
  expect(target.querySelector('[role="dialog"]')?.textContent).toContain(
    '1 passeio(s) importado(s)'
  );
  expect(button('Fechar').disabled).toBe(false);
  button('Fechar').click();
  flushSync();
  expect(target.querySelector('[role="dialog"]')).toBeNull();
  expect(target.querySelector('#texto-importar-opcionais')).toBeNull();
  button('Importar passeios opcionais').click();
  flushSync();
  expect(target.querySelector<HTMLTextAreaElement>('#texto-importar-opcionais')?.value).toBe('');
  await unmount(page);
});

it('salva novo opcional pelo modal sem listar o catálogo', async () => {
  api.fetch.mockReset();
  api.post.mockReset().mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const page = mount(Page, { target });
  const button = (text: string) =>
    [...target.querySelectorAll('button')].find((item) => item.textContent?.trim() === text)!;
  button('Novo opcional').click();
  flushSync();
  const city = target.querySelector<HTMLInputElement>('#opcional-cidade')!;
  city.value = 'Lisboa';
  city.dispatchEvent(new Event('input', { bubbles: true }));
  const nameLabel = [...target.querySelectorAll('label')].find((label) =>
    label.textContent?.includes('Nome do passeio')
  )!;
  const name = target.querySelector<HTMLInputElement>(`#${nameLabel.htmlFor}`)!;
  name.value = 'Passeio de barco';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  button('Salvar opcional').click();
  await tick();
  await tick();
  expect(api.post).toHaveBeenCalledWith(
    '/api/v1/opcionais',
    expect.objectContaining({ cidade: 'Lisboa', nome: 'Passeio de barco' })
  );
  expect(api.fetch).not.toHaveBeenCalledWith('/api/v1/opcionais', expect.anything());
  expect(target.querySelector('[role="dialog"]')).toBeNull();
  await unmount(page);
});

it('cadastra em lote com cidade selecionada no catálogo legado', async () => {
  vi.useFakeTimers();
  api.get.mockResolvedValue([{ nome: 'Lisboa, Portugal' }]);
  api.post.mockResolvedValue({ importados: 1, ignorados: 0 });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const page = mount(Page, { target });
  const button = (text: string) =>
    [...target.querySelectorAll('button')].find((item) => item.textContent?.trim() === text)!;
  button('Adicionar em lote').click();
  flushSync();
  const city = target.querySelector<HTMLInputElement>('#lote-opcional-cidade')!;
  city.value = 'Lisboa';
  city.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(300);
  await tick();
  flushSync();
  button('Lisboa, Portugal').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  const name = target.querySelector<HTMLInputElement>('#lote-opcional-nome-0')!;
  name.value = 'Passeio';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  button('Salvar passeios').click();
  await tick();
  await tick();
  expect(api.post).toHaveBeenCalledWith('/api/v1/opcionais/importar', {
    items: [{ cidade: 'Lisboa, Portugal', nome: 'Passeio', descricao: '' }]
  });
  await unmount(page);
});

it('descarta respostas de buscas anteriores após limpar o campo', async () => {
  vi.useFakeTimers();
  api.fetch.mockReset();
  let resolveSearch: (result: unknown) => void = () => {};
  api.fetch.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveSearch = resolve;
      })
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const page = mount(Page, { target });
  const search = target.querySelector<HTMLInputElement>('#opcional-busca')!;
  search.value = 'barco';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(300);
  expect(api.fetch).toHaveBeenCalledTimes(1);
  search.value = '';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  resolveSearch({
    items: [{ id: '1', cidade: 'Lisboa', nome: 'Passeio de barco', descricao: '' }],
    hasMore: false
  });
  await tick();
  await tick();
  expect(target.textContent).not.toContain('Passeio de barco');
  expect(target.textContent).toContain('Digite pelo menos 2 letras');
  await unmount(page);
});

it('preserva a busca na paginação e após salvar uma edição', async () => {
  api.fetch.mockReset();
  api.fetch.mockImplementation(async (_path, { query }) => ({
    items: [{ id: '1', cidade: 'Lisboa', nome: 'Passeio de barco', descricao: '' }],
    hasMore: query.pagina === 1
  }));
  api.post.mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const page = mount(Page, { target });
  const button = (text: string) =>
    [...target.querySelectorAll('button')].find((item) => item.textContent?.trim() === text)!;
  const search = target.querySelector<HTMLInputElement>('#opcional-busca')!;
  search.value = 'barco';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  button('Buscar').click();
  await tick();
  await tick();
  button('Próxima').click();
  await tick();
  await tick();
  flushSync();
  expect(api.fetch).toHaveBeenLastCalledWith('/api/v1/opcionais', {
    query: { q: 'barco', pagina: 2 },
    noCache: true
  });
  button('Editar').click();
  flushSync();
  button('Salvar opcional').click();
  await tick();
  await tick();
  expect(api.post).toHaveBeenCalledWith(
    '/api/v1/opcionais',
    expect.objectContaining({ id: '1', nome: 'Passeio de barco' })
  );
  expect(api.fetch).toHaveBeenLastCalledWith('/api/v1/opcionais', {
    query: { q: 'barco', pagina: 1 },
    noCache: true
  });
  await unmount(page);
});

it('mantém o formulário legado e não edita registros geográficos com o recurso desligado', async () => {
  api.fetch.mockResolvedValue({
    items: [
      { id: 'legacy', cidade: 'Lisboa', nome: 'Passeio antigo', descricao: '' },
      {
        id: 'geo',
        cidade: 'Roma',
        cidade_id: 'geonames:1',
        nome: 'Passeio geográfico',
        descricao: ''
      }
    ],
    hasMore: false
  });
  api.post.mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const page = mount(Page, { target });
  await tick();
  const search = target.querySelector<HTMLInputElement>('#opcional-busca')!;
  search.value = 'Passeio';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  [...target.querySelectorAll('button')]
    .find((button) => button.textContent?.trim() === 'Buscar')!
    .click();
  await tick();
  flushSync();
  const edit = [...target.querySelectorAll('button')].filter(
    (button) => button.textContent?.trim() === 'Editar'
  );
  edit[1].click();
  expect(toast.error).toHaveBeenCalledWith(
    'A edição deste destino geográfico ainda não está disponível.'
  );
  edit[0].click();
  flushSync();
  expect(target.querySelector<HTMLInputElement>('#opcional-cidade')?.value).toBe('Lisboa');
  [...target.querySelectorAll('button')]
    .find((button) => button.textContent?.trim() === 'Salvar opcional')!
    .click();
  await tick();
  expect(api.post).toHaveBeenCalledWith('/api/v1/opcionais', {
    id: 'legacy',
    cidade: 'Lisboa',
    cidade_id: undefined,
    nome: 'Passeio antigo',
    descricao: ''
  });
  expect(api.fetch).not.toHaveBeenCalledWith(
    expect.stringContaining('/destinos-geograficos/'),
    expect.anything()
  );
  await unmount(page);
});
