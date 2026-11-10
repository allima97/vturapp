import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

const api = vi.hoisted(() => ({ fetch: vi.fn(), post: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('$lib/services/api', () => ({
  apiFetch: api.fetch,
  apiPost: api.post,
  apiDelete: vi.fn(),
  apiGet: vi.fn()
}));
vi.mock('$lib/stores/ui', () => ({ toast }));
vi.mock('$lib/stores/confirm', () => ({ confirmAction: vi.fn() }));
import Page from '../../../routes/(app)/cadastros/opcionais/+page.svelte';

afterEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
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
