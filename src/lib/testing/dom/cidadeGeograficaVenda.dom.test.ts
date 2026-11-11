import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('$lib/services/api', () => ({ apiFetch }));
import Harness from './harness/CidadeGeograficaVendaHarness.svelte';

const roma = { id: 'geonames:1', nome: 'Roma', label: 'Roma, Itália', cidade_interna_id: null };
const texas = {
  id: 'geonames:2',
  nome: 'Roma',
  label: 'Roma, Texas',
  cidade_interna_id: 'cidade-texas'
};
const legada = { id: 'legada', nome: 'Roma', label: 'Roma antiga' };
const resultado = {
  items: [roma, texas],
  podeHaverMais: false,
  cidades_legadas: [legada],
  legadas_pode_haver_mais: false
};

afterEach(() => {
  apiFetch.mockReset();
  document.body.replaceChildren();
});

function setup(initialValue = '') {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Harness, { target, props: { initialValue } });
  flushSync();
  const input = target.querySelector<HTMLInputElement>('#cidade')!;
  function digitar(texto: string) {
    input.value = texto;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
  }
  function click(texto: string) {
    [...target.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === texto)!
      .click();
    flushSync();
  }
  return { target, app, input, digitar, click };
}

it('distingue homônimos e cidades antigas sem criar vínculo por nome', async () => {
  apiFetch.mockResolvedValue(resultado);
  const tela = setup();
  expect(tela.target.querySelector('a[href="https://www.geonames.org/"]')).toBeNull();
  tela.digitar('Roma');
  expect(tela.target.querySelector('[data-pending]')?.textContent).toBe('true');
  await vi.waitFor(() => expect(tela.target.textContent).toContain('Roma, Texas'));
  tela.click('Roma, Texas');
  expect(tela.target.querySelector('[data-id]')?.textContent).toBe('cidade-texas');
  expect(tela.target.querySelector('[data-pending]')?.textContent).toBe('false');
  expect(apiFetch).toHaveBeenCalledTimes(1);
  tela.digitar('Roma');
  await vi.waitFor(() => expect(tela.target.textContent).toContain('Roma antiga'));
  tela.click('Roma antiga');
  expect(tela.target.querySelector('[data-id]')?.textContent).toBe('legada');
  expect(apiFetch).toHaveBeenCalledTimes(2);
  await unmount(tela.app);
});

it('aguarda vínculo explícito, rejeita erros e permite limpar', async () => {
  let resolver: (value: unknown) => void = () => {};
  apiFetch.mockImplementation((path: string) =>
    path.endsWith('/referencia')
      ? new Promise((resolve) => (resolver = resolve))
      : Promise.resolve(resultado)
  );
  const tela = setup();
  tela.digitar('Roma');
  await vi.waitFor(() => expect(tela.target.textContent).toContain('Roma, Itália'));
  tela.click('Roma, Itália');
  expect(tela.target.querySelector('[data-id]')?.textContent).toBe('');
  expect(tela.target.querySelector('[data-pending]')?.textContent).toBe('true');
  expect(
    [...tela.target.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Buscar nome exato')
    )?.disabled
  ).toBe(true);
  expect(apiFetch).toHaveBeenLastCalledWith('/api/v1/destinos-geograficos/referencia', {
    method: 'POST',
    body: { id: 'geonames:1' }
  });
  resolver({ item: { id: 'cidade-italia', destino_geografico_id: 'geonames:1' } });
  await vi.waitFor(() =>
    expect(tela.target.querySelector('[data-id]')?.textContent).toBe('cidade-italia')
  );
  tela.digitar('');
  expect(tela.target.querySelector('[data-pending]')?.textContent).toBe('false');
  expect(tela.input.checkValidity()).toBe(true);
  await unmount(tela.app);
});

it('não deixa respostas antigas alterarem uma seleção mais recente', async () => {
  let resolver: (value: unknown) => void = () => {};
  apiFetch.mockImplementation((path: string) =>
    path.endsWith('/referencia')
      ? new Promise((resolve) => (resolver = resolve))
      : Promise.resolve(resultado)
  );
  const tela = setup();
  tela.digitar('Roma');
  await vi.waitFor(() => expect(tela.target.textContent).toContain('Roma, Itália'));
  tela.click('Roma, Itália');
  tela.digitar('Roma');
  await vi.waitFor(() => expect(tela.target.textContent).toContain('Roma, Texas'));
  tela.click('Roma, Texas');
  resolver({ item: { id: 'cidade-italia', destino_geografico_id: 'geonames:1' } });
  await Promise.resolve();
  flushSync();
  expect(tela.target.querySelector('[data-id]')?.textContent).toBe('cidade-texas');
  expect(tela.target.querySelector('[data-pending]')?.textContent).toBe('false');
  await unmount(tela.app);
});

it('mantém o campo pendente em falhas e recupera cidades salvas por UUID', async () => {
  apiFetch.mockResolvedValueOnce({ id: 'antiga', nome: 'Roma', label: 'Roma antiga' });
  const tela = setup('antiga');
  await vi.waitFor(() => expect(tela.input.value).toBe('Roma antiga'));
  expect(tela.target.querySelector('[data-id]')?.textContent).toBe('antiga');
  apiFetch.mockResolvedValueOnce(resultado).mockRejectedValueOnce(new Error('falha'));
  tela.digitar('Roma');
  await vi.waitFor(() => expect(tela.target.textContent).toContain('Roma, Itália'));
  tela.click('Roma, Itália');
  await vi.waitFor(() => expect(tela.target.textContent).toContain('Não foi possível vincular'));
  expect(tela.target.querySelector('[data-pending]')?.textContent).toBe('true');
  expect(tela.input.checkValidity()).toBe(false);
  await unmount(tela.app);
});

it('permite busca exata por país e pagina cada grupo independentemente', async () => {
  apiFetch.mockResolvedValue({
    ...resultado,
    podeHaverMais: true,
    legadas_pode_haver_mais: true
  });
  const tela = setup();
  tela.digitar('Roma');
  await vi.waitFor(() => expect(tela.target.textContent).toContain('Roma, Itália'));
  const pais = tela.target.querySelector<HTMLInputElement>('#cidade-pais')!;
  pais.value = 'IT';
  pais.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  tela.click('Buscar nome exato');
  await vi.waitFor(() =>
    expect(apiFetch).toHaveBeenLastCalledWith('/api/v1/vendas/cidades-geograficas', {
      query: { q: 'Roma', exata: 1, pais: 'IT', offset_geografico: 0, offset_legadas: 0 },
      noCache: true
    })
  );
  await vi.waitFor(() => expect(tela.target.textContent).toContain('Próximos destinos'));
  tela.click('Próximos destinos');
  await vi.waitFor(() => expect(tela.target.textContent).toContain('Destinos anteriores'));
  tela.click('Próximas cidades');
  await vi.waitFor(() =>
    expect(apiFetch).toHaveBeenLastCalledWith('/api/v1/vendas/cidades-geograficas', {
      query: { q: 'Roma', exata: 1, pais: 'IT', offset_geografico: 8, offset_legadas: 8 },
      noCache: true
    })
  );
  await unmount(tela.app);
});

it('ignora respostas de busca anteriores e informa falha de restauração', async () => {
  let resolver: (value: unknown) => void = () => {};
  apiFetch
    .mockImplementationOnce(() => new Promise((resolve) => (resolver = resolve)))
    .mockResolvedValueOnce({ ...resultado, items: [texas] });
  const tela = setup();
  tela.digitar('Roma');
  await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
  tela.digitar('Rome');
  await vi.waitFor(() => expect(tela.target.textContent).toContain('Roma, Texas'));
  resolver(resultado);
  await Promise.resolve();
  flushSync();
  expect(tela.target.textContent).not.toContain('Roma, Itália');
  await unmount(tela.app);

  apiFetch.mockRejectedValueOnce(new Error('falha'));
  const outra = setup('cidade-salva');
  await vi.waitFor(() => expect(outra.target.textContent).toContain('Não foi possível carregar'));
  expect(outra.target.querySelector('[data-pending]')?.textContent).toBe('true');
  expect(outra.input.checkValidity()).toBe(false);
  await unmount(outra.app);
});
