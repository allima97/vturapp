import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

const api = vi.hoisted(() => ({ fetch: vi.fn(), post: vi.fn(), delete: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('$lib/services/api', () => ({
  apiFetch: api.fetch,
  apiPost: api.post,
  apiDelete: api.delete,
  apiGet: vi.fn()
}));
vi.mock('$lib/config/destinosGeograficos', () => ({
  catalogoGeograficoAtivo: true,
  modulosOperacionaisGeograficosAtivos: false,
  campoGeografico: () => ({})
}));
vi.mock('$lib/stores/ui', () => ({ toast }));
vi.mock('$lib/stores/confirm', () => ({ confirmAction: vi.fn() }));
import Page from '../../../routes/(app)/cadastros/opcionais/+page.svelte';

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  document.body.replaceChildren();
});

it('busca por texto e valida a identidade geográfica na edição antes de salvar', async () => {
  vi.useFakeTimers();
  let resolveDetails: (value: { item: { id: string; label: string } }) => void = () => {};
  const item = {
    id: 'item-1',
    cidade: 'Roma, Itália',
    cidade_id: 'geonames:1',
    nome: 'Passeio',
    descricao: ''
  };
  api.fetch.mockImplementation((path: string) => {
    if (path.endsWith('/detalhes'))
      return new Promise((resolve) => {
        resolveDetails = resolve;
      });
    if (path.endsWith('/busca'))
      return Promise.resolve({
        items: [
          { id: 'geonames:1', nome: 'Roma', label: 'Roma, Itália', origem: 'geonames' },
          { id: 'geonames:2', nome: 'Roma', label: 'Roma, Texas', origem: 'geonames' }
        ],
        podeHaverMais: false
      });
    return Promise.resolve({ items: [item], hasMore: false });
  });
  api.post.mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const page = mount(Page, { target });
  await tick();
  flushSync();
  const button = (text: string) =>
    [...target.querySelectorAll('button')].find((item) => item.textContent?.trim() === text)!;
  const filter = target.querySelector<HTMLInputElement>('#opcional-busca')!;
  filter.value = 'Roma';
  filter.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  button('Buscar').click();
  await tick();
  expect(api.fetch).toHaveBeenCalledWith('/api/v1/opcionais', {
    query: { q: 'Roma', pagina: 1 },
    noCache: true
  });
  await tick();
  flushSync();
  button('Editar').click();
  flushSync();
  button('Salvar opcional').click();
  expect(api.post).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith('Selecione e confirme o destino geográfico.');
  resolveDetails({ item: { id: 'geonames:1', label: 'Roma, Itália' } });
  await tick();
  await Promise.resolve();
  await tick();
  flushSync();
  button('Salvar opcional').click();
  await tick();
  expect(api.post).toHaveBeenCalledWith('/api/v1/opcionais', item);
  await unmount(page);
});

it('permite filtrar dados legados por texto e exige novo destino ao editá-los', async () => {
  const item = {
    id: 'legacy',
    cidade: 'Roma antiga',
    cidade_id: null,
    nome: 'Passeio antigo',
    descricao: ''
  };
  api.fetch.mockResolvedValue({ items: [item], hasMore: false });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const page = mount(Page, { target });
  await tick();
  await tick();
  flushSync();
  const button = (text: string) =>
    [...target.querySelectorAll('button')].find((item) => item.textContent?.trim() === text)!;
  const filter = target.querySelector<HTMLInputElement>('#opcional-busca')!;
  filter.value = 'Roma antiga';
  filter.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  button('Buscar').click();
  await tick();
  expect(api.fetch).toHaveBeenCalledWith('/api/v1/opcionais', {
    query: { q: 'Roma antiga', pagina: 1 },
    noCache: true
  });
  await tick();
  flushSync();
  button('Editar').click();
  flushSync();
  button('Salvar opcional').click();
  expect(api.post).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith('Selecione e confirme o destino geográfico.');
  await unmount(page);
});

it('cadastra vários passeios para a mesma cidade e mantém o modal aberto em caso de erro', async () => {
  vi.useFakeTimers();
  api.fetch.mockReset();
  api.post.mockReset();
  api.fetch.mockResolvedValue({
    items: [{ id: 'geonames:1', nome: 'Roma', label: 'Roma, Itália', origem: 'geonames' }],
    podeHaverMais: false
  });
  api.post
    .mockRejectedValueOnce(new Error('Falha ao salvar'))
    .mockResolvedValueOnce({ importados: 1, ignorados: 1 });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const page = mount(Page, { target });
  const button = (text: string) =>
    [...target.querySelectorAll('button')].find((item) => item.textContent?.trim() === text)!;
  button('Adicionar em lote').click();
  flushSync();
  expect(target.querySelector('[role="dialog"]')?.textContent).toContain(
    'Adicionar opcionais em lote'
  );
  button('Salvar passeios').click();
  expect(toast.error).toHaveBeenCalledWith('Informe a cidade dos passeios.');

  const city = target.querySelector<HTMLInputElement>('#lote-opcional-cidade')!;
  city.value = 'Roma';
  city.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(300);
  await tick();
  flushSync();
  button('Roma, Itália').click();
  flushSync();
  button('Salvar passeios').click();
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Confira o passeio 1'));

  const setValue = (selector: string, value: string) => {
    const input = target.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  setValue('#lote-opcional-nome-0', 'Museu');
  setValue('#lote-opcional-descricao-0', 'Visita guiada');
  button('Adicionar outro passeio').click();
  flushSync();
  setValue('#lote-opcional-nome-1', 'Parque');
  setValue('#lote-opcional-descricao-1', 'Caminhada');
  flushSync();
  button('Adicionar outro passeio').click();
  flushSync();
  setValue('#lote-opcional-nome-2', 'Remover');
  flushSync();
  button('Remover passeio 3').click();
  flushSync();
  expect(target.querySelector('#lote-opcional-nome-2')).toBeNull();
  expect(target.querySelector<HTMLInputElement>('#lote-opcional-nome-1')?.value).toBe('Parque');
  button('Salvar passeios').click();
  await tick();
  await tick();
  expect(target.querySelector('[role="dialog"]')).not.toBeNull();
  expect(toast.error).toHaveBeenCalledWith('Falha ao salvar');
  button('Salvar passeios').click();
  await tick();
  await tick();
  expect(api.post).toHaveBeenLastCalledWith('/api/v1/opcionais/importar', {
    items: [
      {
        cidade: 'Roma, Itália',
        cidade_id: 'geonames:1',
        nome: 'Museu',
        descricao: 'Visita guiada'
      },
      { cidade: 'Roma, Itália', cidade_id: 'geonames:1', nome: 'Parque', descricao: 'Caminhada' }
    ]
  });
  expect(toast.success).toHaveBeenCalledWith(
    '1 passeio(s) cadastrado(s); 1 duplicado(s) ignorado(s).'
  );
  expect(target.querySelector('[role="dialog"]')).toBeNull();
  expect(api.fetch).not.toHaveBeenCalledWith('/api/v1/opcionais', expect.anything());
  button('Adicionar em lote').click();
  flushSync();
  expect(target.querySelector<HTMLInputElement>('#lote-opcional-cidade')?.value).toBe('');
  expect(target.querySelector('#lote-opcional-nome-1')).toBeNull();
  await unmount(page);
});
