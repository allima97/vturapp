import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/services/api', () => ({
  apiGet: mocks.get,
  apiFetch: vi.fn(),
  apiPost: mocks.post,
  apiPatch: mocks.patch,
  apiDelete: vi.fn(),
  isCanceledApiError: () => false
}));
vi.mock('$lib/stores/ui', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import ProdutoOperacionalForm from '$lib/components/cadastros/ProdutoOperacionalForm.svelte';

afterEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

it('mantém o seletor e o UUID legado com a flag desligada', async () => {
  mocks.get.mockImplementation(async (path: string) =>
    path.endsWith('/base')
      ? { tipos: [{ id: 'tipo', nome: 'Passeio' }], cidades: [{ id: 'antiga', nome: 'Roma' }] }
      : { nome: 'Passeio', destino: 'Roma', tipo_produto: 'tipo', cidade_id: 'antiga' }
  );
  mocks.patch.mockResolvedValue({ data: { id: 'produto-1' } });
  mocks.post.mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(ProdutoOperacionalForm, {
    target,
    props: { produtoId: 'produto-1' }
  });
  await vi.waitFor(() => expect(target.querySelector('select#produto-cidade')).toBeTruthy());
  expect(target.querySelector('#produto-cidade option:checked')?.getAttribute('value')).toBe(
    'antiga'
  );
  target
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  flushSync();
  await vi.waitFor(() =>
    expect(mocks.patch).toHaveBeenCalledWith(
      '/api/v1/produtos/produto-1',
      expect.objectContaining({ cidade_id: 'antiga' })
    )
  );
  await unmount(app);
});
