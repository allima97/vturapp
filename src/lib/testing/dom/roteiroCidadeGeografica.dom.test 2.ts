import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

const api = vi.hoisted(() => ({ fetch: vi.fn(), get: vi.fn() }));
vi.mock('$lib/services/api', () => ({ apiFetch: api.fetch, apiGet: api.get }));
vi.mock('$lib/config/destinosGeograficos', () => ({
  roteiroGeograficoAtivo: true,
  modulosOperacionaisGeograficosAtivos: false,
  campoGeografico: () => ({})
}));
import Harness from './harness/RoteiroCidadeGeograficaHarness.svelte';
import ItinerarioHarness from './harness/RoteiroItinerarioHarness.svelte';
import ServicosHarness from './harness/RoteiroServicosHarness.svelte';
import OpcionaisHarness from './harness/RoteiroOpcionaisHarness.svelte';

type Cidade = { cidade: string; cidade_id?: string | null; cidade_pendente?: boolean };

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
  document.body.replaceChildren();
});

it('preserva pendência ao trocar de aba e confirma homônimos por ID', async () => {
  vi.useFakeTimers();
  api.fetch.mockResolvedValue({
    items: [
      { id: 'geonames:1', nome: 'Roma', label: 'Roma, Itália', origem: 'geonames' },
      { id: 'geonames:2', nome: 'Roma', label: 'Roma, Texas', origem: 'geonames' }
    ],
    podeHaverMais: false
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  let get: () => Cidade = () => ({ cidade: '' });
  const app = mount(Harness, {
    target,
    props: { inicial: { cidade: '' }, expose: (value) => (get = value) }
  });
  flushSync();
  let input = target.querySelector<HTMLInputElement>('#cidade-teste')!;
  input.value = 'Roma';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(get().cidade_pendente).toBe(true);
  target.querySelector<HTMLButtonElement>('button')!.click();
  flushSync();
  expect(get().cidade_pendente).toBe(true);
  target.querySelector<HTMLButtonElement>('button')!.click();
  flushSync();
  input = target.querySelector<HTMLInputElement>('#cidade-teste')!;
  input.value = 'Roma';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(300);
  await tick();
  flushSync();
  [...target.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('Roma, Texas'))!
    .click();
  flushSync();
  expect(get()).toMatchObject({
    cidade: 'Roma, Texas',
    cidade_id: 'geonames:2',
    cidade_pendente: false
  });
  await unmount(app);
});

it('mantém ID salvo e bloqueia confirmação quando a resolução falha', async () => {
  api.fetch.mockRejectedValue(new Error('indisponível'));
  const target = document.createElement('div');
  document.body.appendChild(target);
  let get: () => Cidade = () => ({ cidade: '' });
  const app = mount(Harness, {
    target,
    props: {
      inicial: { cidade: 'Roma', cidade_id: 'geonames:1' },
      expose: (value) => (get = value)
    }
  });
  await vi.waitFor(() => expect(target.textContent).toContain('Não foi possível validar'));
  expect(get()).toMatchObject({ cidade_id: 'geonames:1', cidade_pendente: true });
  await unmount(app);
});

it('preserva confirmação ao mudar de aba, mas volta a bloquear se a cidade for editada', async () => {
  vi.useFakeTimers();
  api.fetch.mockImplementation(async (path: string) => {
    if (path.includes('/busca'))
      return {
        items: [{ id: 'geonames:1', nome: 'Roma', label: 'Roma, Itália', origem: 'geonames' }],
        podeHaverMais: false
      };
    return new Promise(() => {});
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  let get: () => Cidade = () => ({ cidade: '' });
  const app = mount(Harness, {
    target,
    props: { inicial: { cidade: '' }, expose: (value) => (get = value) }
  });
  flushSync();
  let input = target.querySelector<HTMLInputElement>('#cidade-teste')!;
  input.value = 'Roma';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(300);
  await tick();
  flushSync();
  [...target.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('Roma, Itália'))!
    .click();
  flushSync();
  target.querySelector<HTMLButtonElement>('button')!.click();
  flushSync();
  target.querySelector<HTMLButtonElement>('button')!.click();
  flushSync();
  expect(get()).toMatchObject({ cidade_id: 'geonames:1', cidade_pendente: false });
  expect(api.fetch.mock.calls.some(([path]) => String(path).includes('/detalhes'))).toBe(false);
  input = target.querySelector<HTMLInputElement>('#cidade-teste')!;
  input.value = 'Outra cidade';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(get()).toMatchObject({ cidade_id: '', cidade_pendente: true });
  await unmount(app);
});

it('permite preservar uma cidade legada e selecionar geografia explicitamente', async () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  let get: () => Cidade = () => ({ cidade: '' });
  const app = mount(Harness, {
    target,
    props: { inicial: { cidade: 'Lisboa, Portugal' }, expose: (value) => (get = value) }
  });
  flushSync();
  expect(target.querySelector<HTMLInputElement>('#cidade-teste')?.value).toBe('Lisboa, Portugal');
  expect(api.fetch).not.toHaveBeenCalled();
  [...target.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('Selecionar destino geográfico'))!
    .click();
  flushSync();
  expect(get().cidade).toBe('Lisboa, Portugal');
  expect(get().cidade_pendente).toBe(true);
  await unmount(app);
});

it.each([
  { componente: ItinerarioHarness, adicionar: 'Adicionar dia', campo: '#dia-cidade-0' },
  { componente: ServicosHarness, adicionar: '', campo: '#hotel-cidade-0' },
  { componente: ServicosHarness, adicionar: '', campo: '#passeio-cidade-0' },
  { componente: OpcionaisHarness, adicionar: 'Adicionar cidade', campo: '#opcional-cidade-0' }
])('oferece seleção geográfica no campo $campo', async ({ componente, adicionar, campo }) => {
  vi.useFakeTimers();
  api.fetch.mockImplementation(async (path: string) =>
    path.includes('destinos-geograficos/busca')
      ? {
          items: [{ id: 'geonames:1', nome: 'Roma', label: 'Roma, Itália', origem: 'geonames' }],
          podeHaverMais: false
        }
      : { items: [], hasMore: false }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(componente, { target, props: { expose: () => {} } });
  flushSync();
  if (adicionar) {
    [...target.querySelectorAll('button')]
      .find((button) => button.textContent?.includes(adicionar))!
      .click();
    flushSync();
  }
  const input = target.querySelector<HTMLInputElement>(campo)!;
  expect(input).not.toBeNull();
  input.value = 'Roma';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(300);
  await tick();
  flushSync();
  const option = [...target.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('Roma, Itália')
  );
  expect(option).toBeDefined();
  option!.click();
  flushSync();
  expect(input.value).toBe('Roma, Itália');
  await unmount(app);
});

it('habilita a busca de descrições somente após selecionar a cidade do dia', async () => {
  vi.useFakeTimers();
  api.fetch.mockResolvedValue({
    items: [{ id: 'geonames:1', nome: 'Roma', label: 'Roma, Itália', origem: 'geonames' }],
    podeHaverMais: false
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  let get: () => { descricaoSolicitada: Cidade | null } = () => ({ descricaoSolicitada: null });
  const app = mount(ItinerarioHarness, {
    target,
    props: { expose: (value: () => unknown) => (get = value as typeof get) }
  });
  flushSync();
  [...target.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('Adicionar dia'))!
    .click();
  flushSync();
  const buscar = [...target.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('Buscar descrições desta cidade')
  )!;
  expect(buscar.disabled).toBe(true);
  const input = target.querySelector<HTMLInputElement>('#dia-cidade-0')!;
  input.value = 'Roma';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(300);
  await tick();
  flushSync();
  [...target.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('Roma, Itália'))!
    .click();
  flushSync();
  expect(buscar.disabled).toBe(false);
  buscar.click();
  flushSync();
  expect(get().descricaoSolicitada).toMatchObject({
    cidade: 'Roma, Itália',
    cidade_id: 'geonames:1'
  });
  await unmount(app);
});

it('preserva a cidade já confirmada ao adicionar outro hotel e salvar imediatamente', async () => {
  vi.useFakeTimers();
  api.fetch.mockImplementation(async (path: string) => {
    if (path.includes('/busca'))
      return {
        items: [{ id: 'geonames:1', nome: 'Roma', label: 'Roma, Itália', origem: 'geonames' }],
        podeHaverMais: false
      };
    return new Promise(() => {});
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  let get: () => { hoteis: Cidade[] } = () => ({ hoteis: [] });
  const app = mount(ServicosHarness, {
    target,
    props: { expose: (value: () => unknown) => (get = value as typeof get) }
  });
  flushSync();
  const input = target.querySelector<HTMLInputElement>('#hotel-cidade-0')!;
  input.value = 'Roma';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(300);
  await tick();
  flushSync();
  [...target.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('Roma, Itália'))!
    .click();
  flushSync();
  expect(get().hoteis[0]).toMatchObject({ cidade_id: 'geonames:1', cidade_pendente: false });
  [...target.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('Adicionar hotel'))!
    .click();
  flushSync();
  expect(get().hoteis[0]).toMatchObject({ cidade_id: 'geonames:1', cidade_pendente: false });
  expect(get().hoteis.some((hotel) => hotel.cidade_pendente)).toBe(false);
  await unmount(app);
});
