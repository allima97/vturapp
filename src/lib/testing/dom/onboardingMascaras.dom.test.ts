import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/services/api')>()),
  apiGet: api.get
}));

import Page from '../../../routes/(app)/perfil/onboarding/+page.svelte';

afterEach(() => {
  api.get.mockReset();
  document.body.replaceChildren();
});

it('aplica as máscaras de telefone, WhatsApp e CEP no onboarding', async () => {
  api.get.mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  try {
    await vi.waitFor(() => expect(target.querySelector('#ob-telefone')).not.toBeNull());
    for (const [id, raw, expected] of [
      ['telefone', '1133334444', '(11) 3333-4444'],
      ['whatsapp', '11912345678', '(11) 91234-5678'],
      ['cep', '02244010', '02244-010']
    ]) {
      const input = target.querySelector<HTMLInputElement>(`#ob-${id}`)!;
      input.value = raw;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
      expect(input.value).toBe(expected);
    }
  } finally {
    await unmount(app);
  }
});
