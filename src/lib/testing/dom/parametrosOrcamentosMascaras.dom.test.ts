import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('$lib/services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/services/api')>()),
  apiGet: api.get,
  apiPost: api.post
}));
vi.mock('$lib/db/browserData', () => ({
  createBrowserDataClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }) }
  })
}));

import Page from '../../../routes/(app)/parametros/orcamentos/+page.svelte';

afterEach(() => {
  vi.resetAllMocks();
  document.body.replaceChildren();
});

it('formata o WhatsApp brasileiro e salva o número sem descartar o DDI', async () => {
  api.get.mockResolvedValue({ settings: { whatsapp_codigo_pais: '55', whatsapp: '' } });
  api.post.mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  try {
    await vi.waitFor(() => expect(target.querySelector('#orc-whatsapp')).not.toBeNull());
    const whatsapp = target.querySelector<HTMLInputElement>('#orc-whatsapp')!;
    whatsapp.value = '11912345678';
    whatsapp.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(whatsapp.value).toBe('(11) 91234-5678');
    expect(whatsapp.parentElement?.querySelector('svg')).not.toBeNull();
    target
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/v1/parametros/orcamentos-pdf',
        expect.objectContaining({
          settings: expect.objectContaining({
            whatsapp_codigo_pais: '55',
            whatsapp: '(11) 91234-5678'
          })
        })
      )
    );
  } finally {
    await unmount(app);
  }
});

it('não aplica a máscara brasileira quando o DDI é estrangeiro', async () => {
  api.get.mockResolvedValue({ settings: { whatsapp_codigo_pais: '34', whatsapp: '652 99 00 47' } });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  try {
    await vi.waitFor(() => expect(target.querySelector('#orc-whatsapp')).not.toBeNull());
    const whatsapp = target.querySelector<HTMLInputElement>('#orc-whatsapp')!;
    expect(whatsapp.value).toBe('652 99 00 47');
    whatsapp.value = '612 34 56 78';
    whatsapp.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(whatsapp.value).toBe('612 34 56 78');
  } finally {
    await unmount(app);
  }
});
