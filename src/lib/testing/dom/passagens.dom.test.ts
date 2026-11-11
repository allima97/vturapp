import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const api = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('$lib/services/api', async (original) => ({
  ...(await original<typeof import('$lib/services/api')>()),
  apiFetch: api.fetch
}));
import Passagens from '../../../routes/(app)/operacao/passagens/+page.svelte';

function click(target: HTMLElement, label: string) {
  const found = [...target.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === label
  );
  if (!found) throw new Error(`Botão ${label} não encontrado`);
  found.click();
  flushSync();
}

afterEach(() => {
  api.fetch.mockReset();
  document.body.replaceChildren();
});

it('permite importar, revisar, salvar e abrir comprovante', async () => {
  api.fetch.mockImplementation(async (_path, options) =>
    options.method === 'POST' ? { id: '00000000-0000-4000-8000-000000000001' } : { items: [] }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() => expect(target.textContent).toContain('Nenhuma passagem salva.'));
  click(target, 'Nova passagem');
  const text = target.querySelector<HTMLTextAreaElement>('#texto-reserva')!;
  text.value =
    'LOC: ABC123\nsegmentos\nCompanhia Exemplo XY 123 12/11/2026 - 15:00 12/11/2026 - 16:19 HK AAA - Aaa BBB - Bbb E90 01:19 W\npassageiros\nADT\tSOBRENOME EXEMPLO\tMARIA\tFeminino\tEmitida\nassentos\nSOBRENOME EXEMPLO/MARIA\t17D';
  text.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  click(target, 'Analisar texto');
  await vi.waitFor(() =>
    expect(target.querySelector<HTMLInputElement>('#passageiro-0')?.value).toBe(
      'SOBRENOME EXEMPLO, MARIA'
    )
  );
  expect(target.querySelector<HTMLInputElement>('#assento-0-0')?.value).toBe('17D');
  click(target, 'Salvar passagem');
  await vi.waitFor(() =>
    expect(api.fetch).toHaveBeenCalledWith(
      '/api/v1/passagens',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          localizador: 'ABC123',
          passageiros: [
            expect.objectContaining({ nome: 'SOBRENOME EXEMPLO, MARIA', assentos: ['17D'] })
          ]
        })
      })
    )
  );
  await vi.waitFor(() => expect(target.textContent).toContain('Gerar comprovante'));
  await unmount(app);
});
