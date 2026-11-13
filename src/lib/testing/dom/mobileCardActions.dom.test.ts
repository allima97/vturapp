import { afterEach, expect, it, vi } from 'vitest';
import { mobileCardActions } from '$lib/actions/mobileCardActions';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('revela ações por clique ou teclado somente no mobile', () => {
  vi.stubGlobal('innerWidth', 375);
  const table = document.createElement('table');
  table.innerHTML = '<tbody><tr><td>Nome</td><td><button>Ação</button></td></tr></tbody>';
  document.body.appendChild(table);
  const row = table.querySelector('tr')!;
  const action = mobileCardActions(row);

  expect(row.getAttribute('aria-expanded')).toBe('false');
  row.click();
  expect(row.getAttribute('aria-expanded')).toBe('true');
  row.querySelector('button')!.click();
  expect(row.getAttribute('aria-expanded')).toBe('true');
  row.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  expect(row.getAttribute('aria-expanded')).toBe('false');
  action.update(false);
  row.click();
  expect(row.hasAttribute('aria-expanded')).toBe(false);
  action.update(true);

  vi.stubGlobal('innerWidth', 1024);
  window.dispatchEvent(new Event('resize'));
  expect(row.hasAttribute('aria-expanded')).toBe(false);
  expect(row.hasAttribute('tabindex')).toBe(false);
  action.destroy();
});
