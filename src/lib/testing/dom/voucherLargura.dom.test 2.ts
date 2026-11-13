import { afterEach, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import { readable } from 'svelte/store';

vi.mock('$app/stores', () => ({
  page: readable({ url: new URL('https://example.test/operacao/vouchers/novo') })
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/services/api', () => ({
  apiGet: vi.fn().mockResolvedValue({ company_id: 'empresa' }),
  apiPost: vi.fn(),
  apiFetch: vi.fn(),
  isCanceledApiError: () => false
}));

import NovoVoucher from '../../../routes/(app)/operacao/vouchers/novo/+page.svelte';

afterEach(() => {
  document.body.replaceChildren();
});

it('usa toda a largura disponível para fornecedor, etapas e formulário', async () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(NovoVoucher, { target });
  await vi.waitFor(() => expect(target.textContent).toContain('Escolha o fornecedor do voucher'));

  const fornecedor = [...target.querySelectorAll('section')].find((section) =>
    section.textContent?.includes('Escolha o fornecedor do voucher')
  );
  const conteudo = fornecedor?.parentElement;
  expect(conteudo?.classList.contains('w-full')).toBe(true);
  expect([...conteudo!.classList].some((name) => name.startsWith('max-w-'))).toBe(false);
  expect(conteudo?.textContent).toContain('Dia a Dia');
  expect(conteudo?.querySelector('#voucher-nome')).not.toBeNull();
  await unmount(app);
});
