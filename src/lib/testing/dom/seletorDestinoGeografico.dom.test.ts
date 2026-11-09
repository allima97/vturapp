import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('$lib/services/api', () => ({ apiFetch }));
import Harness from './harness/SeletorDestinoHarness.svelte';

const roma = { id: 'geonames:1', nome: 'Roma', label: 'Roma, Lácio, Itália', origem: 'geonames' };
const texas = {
  id: 'geonames:2',
  nome: 'Roma',
  label: 'Roma, Texas, Estados Unidos',
  origem: 'geonames'
};

afterEach(() => {
  apiFetch.mockReset();
  document.body.replaceChildren();
});

it('preserva identidade dos homônimos e invalida edição livre', async () => {
  apiFetch.mockResolvedValue({ items: [roma, texas], podeHaverMais: true });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Harness, { target });
  flushSync();
  expect(target.querySelector('a[href="https://www.geonames.org/"]')?.textContent).toBe('GeoNames');
  expect(
    target.querySelector('a[href="https://creativecommons.org/licenses/by/4.0/"]')?.textContent
  ).toBe('CC BY 4.0');
  const input = target.querySelector<HTMLInputElement>('#destino')!;
  input.value = 'Roma';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(input.checkValidity()).toBe(false);
  await vi.waitFor(() => expect(target.querySelectorAll('li')).toHaveLength(2));
  expect(target.textContent).toContain('Há mais resultados');
  target.querySelectorAll<HTMLButtonElement>('li button')[1].click();
  flushSync();
  expect(target.querySelector('[data-id]')?.textContent).toBe('geonames:2');
  expect(input.value).toBe('Roma, Texas, Estados Unidos');
  expect(input.checkValidity()).toBe(true);
  input.value = 'Rome';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(target.querySelector('[data-id]')?.textContent).toBe('');
  expect(input.checkValidity()).toBe(false);
  await unmount(app);
});

it('busca nomes exatos com filtro e paginação', async () => {
  apiFetch.mockImplementation(async (path: string, options: { query: { offset?: number } }) =>
    path.endsWith('/exata')
      ? { items: options.query.offset ? [texas] : [roma], podeHaverMais: !options.query.offset }
      : { items: [roma], podeHaverMais: true }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Harness, { target });
  flushSync();
  const input = target.querySelector<HTMLInputElement>('#destino')!;
  input.value = 'Roma';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  const pais = target.querySelector<HTMLInputElement>('#destino-pais')!;
  pais.value = 'IT';
  pais.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  const button = [...target.querySelectorAll('button')].find((item) =>
    item.textContent?.includes('Buscar nome exato')
  )!;
  button.click();
  await vi.waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/destinos-geograficos/exata', {
      query: { q: 'Roma', idioma: 'pt-BR', pais: 'IT', offset: 0 },
      noCache: true
    })
  );
  await vi.waitFor(() => expect(target.textContent).toContain('Próximos resultados'));
  [...target.querySelectorAll('button')]
    .find((item) => item.textContent?.includes('Próximos resultados'))!
    .click();
  await vi.waitFor(() => expect(target.textContent).toContain('Roma, Texas, Estados Unidos'));
  expect(target.textContent).toContain('Anterior');
  await unmount(app);
});

it('resolve a identidade salva e exibe erro se ela não puder ser validada', async () => {
  apiFetch.mockResolvedValueOnce({ item: roma });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Harness, { target, props: { initialId: 'geonames:1', initialValue: 'Rome' } });
  await vi.waitFor(() =>
    expect(target.querySelector('[data-value]')?.textContent).toBe(roma.label)
  );
  expect(target.querySelector<HTMLInputElement>('#destino')?.checkValidity()).toBe(true);
  await unmount(app);
  target.replaceChildren();
  apiFetch.mockRejectedValueOnce(new Error('unavailable'));
  const second = mount(Harness, {
    target,
    props: { initialId: 'geonames:1', initialValue: 'Rome' }
  });
  await vi.waitFor(() => expect(target.textContent).toContain('Não foi possível validar'));
  expect(target.querySelector('[data-id]')?.textContent).toBe('geonames:1');
  expect(target.querySelector<HTMLInputElement>('#destino')?.checkValidity()).toBe(false);
  await unmount(second);
});

it('rejeita resolução cujo ID não corresponde à identidade salva', async () => {
  apiFetch.mockResolvedValueOnce({ item: texas });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Harness, {
    target,
    props: { initialId: 'geonames:1', initialValue: 'Roma' }
  });
  await vi.waitFor(() => expect(target.textContent).toContain('Não foi possível validar'));
  expect(target.querySelector('[data-id]')?.textContent).toBe('geonames:1');
  expect(target.querySelector<HTMLInputElement>('#destino')?.checkValidity()).toBe(false);
  await unmount(app);
});

it('ignora respostas de pesquisas anteriores após uma edição', async () => {
  let resolveFirst: (value: { items: (typeof roma)[]; podeHaverMais: boolean }) => void = () => {};
  apiFetch
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    )
    .mockResolvedValueOnce({ items: [texas], podeHaverMais: false });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Harness, { target });
  flushSync();
  const input = target.querySelector<HTMLInputElement>('#destino')!;
  input.value = 'Roma';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
  input.value = 'Rome';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.waitFor(() => expect(target.textContent).toContain(texas.label));
  resolveFirst({ items: [roma], podeHaverMais: false });
  await Promise.resolve();
  flushSync();
  expect(target.textContent).not.toContain(roma.label);
  expect(target.textContent).toContain(texas.label);
  await unmount(app);
});

it('não aceita somente espaços em um destino obrigatório', async () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Harness, { target });
  flushSync();
  const input = target.querySelector<HTMLInputElement>('#destino')!;
  input.value = '   ';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(input.checkValidity()).toBe(false);
  await unmount(app);
});
