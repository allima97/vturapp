import { expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ConcorrenciaTab from '$lib/components/modais/ConcorrenciaTab.svelte';

it('permite trocar as categorias de pagamento pelo seletor móvel', async () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(ConcorrenciaTab, { target });
  try {
    flushSync();
    const config = [...target.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Formas de Pagamento')
    )!;
    config.click();
    flushSync();
    const select = target.querySelector('select')!;
    expect(select.getAttribute('aria-label')).toBe('Selecionar aba');
    expect(select.value).toBe('padrao');
    select.value = 'ingressos';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    const ingressos = [...target.querySelectorAll('button')].find(
      (button) =>
        button.textContent?.includes('Ingressos (Disney / Universal)') &&
        button.getAttribute('role') !== 'tab'
    )!;
    expect(ingressos.className).toContain('text-indigo-700');
    expect(select.value).toBe('ingressos');
  } finally {
    await unmount(app);
    target.remove();
  }
});
