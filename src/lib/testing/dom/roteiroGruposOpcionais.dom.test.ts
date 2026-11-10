import { afterEach, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  post: vi.fn(),
  salvar: vi.fn(),
  error: vi.fn()
}));
vi.mock('$app/stores', async () => {
  const { readable } = await import('svelte/store');
  return {
    page: readable({
      params: { id: 'roteiro-1' },
      url: new URL('https://vtur.app/orcamentos/roteiros/roteiro-1')
    })
  };
});
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/config/destinosGeograficos', async (original) => ({
  ...(await original<typeof import('$lib/config/destinosGeograficos')>()),
  revisaoRoteiroAtiva: true,
  roteiroGeograficoAtivo: true
}));
vi.mock('$lib/services/session', () => ({ ensureServerSessionCookie: vi.fn() }));
vi.mock('$lib/services/api', async (original) => ({
  ...(await original<typeof import('$lib/services/api')>()),
  apiFetch: mocks.fetch,
  apiPost: mocks.post
}));
vi.mock('$lib/features/roteiros/salvarComConfirmacao', () => ({
  salvarRoteiroComConfirmacao: mocks.salvar
}));
vi.mock('$lib/stores/ui', () => ({
  toast: { error: mocks.error, success: vi.fn(), warning: vi.fn() }
}));
import Page from '../../../routes/(app)/orcamentos/roteiros/[id]/+page.svelte';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  document.body.replaceChildren();
});

it('mantém IDs recebidos na leitura entre salvamentos e duplicação', async () => {
  const anterior = crypto.randomUUID();
  const legado = crypto.randomUUID();
  mocks.fetch.mockImplementation(async (url: string) => {
    if (url === '/api/v1/roteiros/roteiro-1')
      return {
        roteiro: {
          nome: 'Viagem',
          revisao: '',
          opcionais: [
            { cidade: 'Roma', cidade_id: 'geonames:1', registro_id: anterior, passeios: [] },
            { cidade: 'Paris', registro_id: legado, passeios: [] }
          ]
        }
      };
    return {};
  });
  mocks.salvar.mockResolvedValueOnce({ revisao: 'primeira' }).mockResolvedValueOnce({
    revisao: 'segunda'
  });
  mocks.post.mockResolvedValue({ id: 'copia' });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  await vi.waitFor(() => expect(target.querySelector('#rot-dur')).toBeTruthy());
  const button = (text: string) =>
    [...target.querySelectorAll('button')].find((item) => item.textContent?.includes(text))!;
  button('Salvar roteiro').click();
  await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalledTimes(1));
  const primeira = mocks.salvar.mock.calls[0][0];
  const ids = primeira.opcionais.map((item: { registro_id: string }) => item.registro_id);
  expect(ids[0]).toBe(anterior);
  expect(ids[1]).toBe(legado);
  await vi.waitFor(() => expect(button('Salvar roteiro').disabled).toBe(false));
  button('Salvar roteiro').click();
  await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalledTimes(2));
  expect(mocks.salvar.mock.calls[1][0]).toMatchObject({
    revisao: 'primeira',
    opcionais: [{ registro_id: ids[0] }, { registro_id: ids[1] }]
  });
  await vi.waitFor(() => expect(button('Duplicar roteiro').disabled).toBe(false));
  button('Duplicar roteiro').click();
  await vi.waitFor(() => expect(mocks.post).toHaveBeenCalled());
  expect(mocks.post.mock.calls[0][1].opcionais).toMatchObject([
    { registro_id: ids[0] },
    { registro_id: ids[1] }
  ]);
  expect(mocks.error).not.toHaveBeenCalled();
  await unmount(app);
});
