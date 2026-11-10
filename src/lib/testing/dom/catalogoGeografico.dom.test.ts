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

it('filtra homônimos por identidade e valida a edição antes de salvar', async () => {
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
  const filter = target.querySelector<HTMLInputElement>('#opcional-filtro')!;
  filter.value = 'Roma';
  filter.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  button('Buscar').click();
  expect(toast.error).toHaveBeenCalledWith('Selecione uma cidade na lista para filtrar.');
  await vi.advanceTimersByTimeAsync(300);
  await tick();
  flushSync();
  button('Roma, Texas').click();
  flushSync();
  button('Buscar').click();
  await tick();
  expect(api.fetch).toHaveBeenCalledWith('/api/v1/opcionais', {
    query: { cidade: '', cidade_id: 'geonames:2', pagina: 1 },
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
  const checkbox = target.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  checkbox.click();
  flushSync();
  const filter = target.querySelector<HTMLInputElement>('#opcional-filtro')!;
  filter.value = 'Roma antiga';
  filter.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  button('Buscar').click();
  await tick();
  expect(api.fetch).toHaveBeenCalledWith('/api/v1/opcionais', {
    query: { cidade: 'Roma antiga', pagina: 1 },
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
