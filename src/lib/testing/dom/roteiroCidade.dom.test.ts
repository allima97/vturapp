import { expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('$lib/services/api', () => ({ apiGet }));
import Harness from './harness/RoteiroCidadeHarness.svelte';

it('exige seleção de uma cidade cadastrada e conserva o nome completo', async () => {
  apiGet.mockResolvedValue([{ nome: 'Roma, Lácio, Itália' }]);
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Harness, { target });
  flushSync();

  const input = target.querySelector('input')!;
  input.value = 'Roma';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(target.querySelector('[role="alert"]')?.textContent).toContain('Selecione uma cidade');

  await vi.waitFor(() =>
    expect(apiGet).toHaveBeenCalledWith('/api/v1/roteiros/cidades-busca', {
      q: 'Roma',
      limite: 8
    })
  );
  await vi.waitFor(() => expect(target.querySelector('button')?.textContent).toContain('Roma'));
  target.querySelector('button')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  flushSync();
  expect(target.querySelector('output')?.textContent).toBe('Roma, Lácio, Itália');
  expect(input.hasAttribute('aria-invalid')).toBe(false);
  expect(target.querySelector('[data-roteiro-cidade-pendente]')).toBeNull();

  await unmount(app);
  target.remove();
});
