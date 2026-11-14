import { afterEach, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/services/api', async (original) => ({
  ...(await original<typeof import('$lib/services/api')>()),
  apiGet: api.get
}));

import Page from '../../../routes/(app)/orcamentos/+page.svelte';

afterEach(() => {
  vi.resetAllMocks();
  document.body.replaceChildren();
});

it('oferece uma ação direta para editar cada orçamento na listagem', async () => {
  api.get.mockResolvedValue([
    {
      id: 'quote-123',
      codigo: 'ORC-12345678',
      cliente: 'Cliente teste',
      cliente_id: '',
      destino: 'Roma',
      data_criacao: null,
      data_validade: null,
      valor_total: 100,
      status: 'pendente',
      status_negociacao: 'novo',
      vendedor: 'Equipe VTUR',
      vendedor_id: '',
      origem: 'manual',
      quantidade_itens: 1
    }
  ]);
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });

  try {
    await vi.waitFor(() =>
      expect(target.querySelector('a[href="/orcamentos/quote-123/editar"]')).toBeTruthy()
    );
    expect(target.querySelector('a[href="/orcamentos/quote-123/editar"]')?.textContent).toContain(
      'Editar'
    );
  } finally {
    await unmount(app);
  }
});
