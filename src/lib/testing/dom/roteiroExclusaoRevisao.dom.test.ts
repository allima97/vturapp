import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  delete: vi.fn(),
  confirm: vi.fn(),
  error: vi.fn()
}));
vi.mock('$lib/config/destinosGeograficos', () => ({
  revisaoRoteiroAtiva: true,
  roteiroGeograficoAtivo: true
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/services/api', () => ({
  apiGet: mocks.get,
  apiPost: vi.fn(),
  apiDelete: mocks.delete,
  isCanceledApiError: () => false
}));
vi.mock('$lib/stores/confirm', () => ({ confirmAction: mocks.confirm }));
vi.mock('$lib/stores/ui', () => ({ toast: { error: mocks.error, success: vi.fn() } }));
import Page from '../../../routes/(app)/orcamentos/roteiros/+page.svelte';

afterEach(() => {
  vi.resetAllMocks();
  document.body.replaceChildren();
});

async function setup(revisao?: string) {
  mocks.get.mockResolvedValue({
    roteiros: [{ id: 'roteiro-1', nome: 'Viagem', revisao, duracao: null }]
  });
  mocks.delete.mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  await vi.waitFor(() =>
    expect(target.querySelector('[aria-label="Excluir roteiro"]')).toBeTruthy()
  );
  return { target, app };
}

function excluir(target: HTMLElement) {
  target.querySelector<HTMLButtonElement>('[aria-label="Excluir roteiro"]')!.click();
  flushSync();
}

it.each(['', 'revisao-123'])('envia a revisão %s somente após confirmação', async (revisao) => {
  mocks.confirm.mockResolvedValue(true);
  const tela = await setup(revisao);
  excluir(tela.target);
  await vi.waitFor(() =>
    expect(mocks.delete).toHaveBeenCalledWith('/api/v1/roteiros', {
      id: 'roteiro-1',
      revisao: `r:${revisao}`
    })
  );
  await unmount(tela.app);
});

it('não exclui quando o usuário cancela ou a revisão não foi carregada', async () => {
  mocks.confirm.mockResolvedValue(false);
  const tela = await setup('revisao');
  excluir(tela.target);
  await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
  expect(mocks.delete).not.toHaveBeenCalled();
  await unmount(tela.app);

  const antiga = await setup();
  excluir(antiga.target);
  expect(mocks.error).toHaveBeenCalledWith(
    'Revisão indisponível. Recarregue a lista antes de excluir.'
  );
  expect(mocks.delete).not.toHaveBeenCalled();
  await unmount(antiga.app);
});
