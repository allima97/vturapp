import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({ get: vi.fn(), fetch: vi.fn(), error: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/services/api', () => ({
  apiGet: mocks.get,
  apiFetch: mocks.fetch,
  apiDelete: vi.fn(),
  isCanceledApiError: () => false
}));
vi.mock('$lib/stores/ui', () => ({ toast: { error: mocks.error, success: vi.fn() } }));
import FornecedorForm from '$lib/components/cadastros/FornecedorForm.svelte';

afterEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

async function setup() {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(FornecedorForm, { target });
  await vi.waitFor(() => expect(target.querySelector('#forn-cidade')).toBeTruthy());
  const input = target.querySelector<HTMLInputElement>('#forn-cidade')!;
  function digitar(text: string) {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
  }
  return { target, app, input, digitar };
}

it('descarta respostas antigas imediatamente ao alterar a busca', async () => {
  let responder: (value: unknown) => void = () => {};
  mocks.get
    .mockImplementationOnce(() => new Promise((resolve) => (responder = resolve)))
    .mockResolvedValueOnce([{ id: '2', nome: 'Paris', subdivisao_nome: 'França', label: 'Paris' }]);
  const tela = await setup();
  tela.digitar('Roma');
  await vi.waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1));
  const signal = mocks.get.mock.calls[0][2] as AbortSignal;
  tela.digitar('Paris');
  expect(signal.aborted).toBe(true);
  responder([{ id: '1', nome: 'Roma', subdivisao_nome: 'Itália', label: 'Roma antiga' }]);
  await Promise.resolve();
  flushSync();
  expect(tela.target.textContent).not.toContain('Roma antiga');
  await vi.waitFor(() => expect(tela.target.textContent).toContain('Paris'));
  [...tela.target.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('Paris'))!
    .click();
  flushSync();
  expect(tela.input.value).toBe('Paris');
  expect(tela.target.querySelector<HTMLInputElement>('#forn-estado')?.value).toBe('França');
  await unmount(tela.app);
});

it('ignora falhas de buscas antigas depois de uma seleção mais recente', async () => {
  let rejeitar: (reason: Error) => void = () => {};
  mocks.get
    .mockImplementationOnce(() => new Promise((_resolve, reject) => (rejeitar = reject)))
    .mockResolvedValueOnce([{ id: '2', nome: 'Paris', subdivisao_nome: 'França', label: 'Paris' }]);
  const tela = await setup();
  tela.digitar('Roma');
  await vi.waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1));
  tela.digitar('Paris');
  await vi.waitFor(() => expect(tela.target.textContent).toContain('Paris'));
  [...tela.target.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('Paris'))!
    .click();
  flushSync();
  rejeitar(new Error('falha antiga'));
  await Promise.resolve();
  flushSync();
  expect(tela.target.textContent).not.toContain('Erro ao buscar cidades.');
  expect(tela.input.value).toBe('Paris');
  expect(tela.target.querySelector<HTMLInputElement>('#forn-estado')?.value).toBe('França');
  await unmount(tela.app);
});
