import { expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Harness from './harness/MoneyInputHarness.svelte';

it.each([
  { numeric: true, initialValue: 12.5, expected: '1234.56' },
  { numeric: false, initialValue: '12.5', expected: '"1234.56"' }
])('formata centavos e preserva o contrato do valor: $numeric', async (props) => {
  const target = document.createElement('div');
  const app = mount(Harness, { target, props });
  try {
    flushSync();
    const input = target.querySelector<HTMLInputElement>('#money')!;
    expect(input.value).toBe('12,50');
    input.value = '123456';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(input.value).toBe('1.234,56');
    expect(target.querySelector('[data-value]')?.textContent).toBe(props.expected);
    expect(target.querySelector('[data-event]')?.textContent).toBe('1234.56');
    target.querySelector('button')!.click();
    flushSync();
    expect(input.value).toBe('45,67');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(input.value).toBe('');
    expect(target.querySelector('[data-value]')?.textContent).toBe('""');
    input.value = '-123';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(input.value).toBe('-1,23');
    expect(target.querySelector('[data-event]')?.textContent).toBe('-1.23');
  } finally {
    await unmount(app);
  }
});

it('não altera valor salvo com precisão maior que centavos antes de editá-lo', async () => {
  const target = document.createElement('div');
  const app = mount(Harness, { target, props: { initialValue: '3.1415' } });
  try {
    flushSync();
    expect(target.querySelector<HTMLInputElement>('#money')?.value).toBe('3.1415');
    expect(target.querySelector('[data-value]')?.textContent).toBe('"3.1415"');
  } finally {
    await unmount(app);
  }
});

it('mantém visível o valor anterior ao exceder o limite e valida os limites informados', async () => {
  const target = document.createElement('div');
  const app = mount(Harness, {
    target,
    props: { initialValue: 12.5, numeric: true, min: '0', max: '100' }
  });
  try {
    flushSync();
    const input = target.querySelector<HTMLInputElement>('#money')!;
    const type = (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
    };
    type('1234567890123456');
    expect(input.value).toBe('12,50');
    expect(target.querySelector('[data-value]')?.textContent).toBe('12.5');
    expect(input.validity.valid).toBe(false);
    expect(target.textContent).toContain('O valor anterior foi mantido');
    type('-1');
    expect(input.validity.valid).toBe(false);
    expect(target.textContent).toContain('O valor mínimo');
    type('10001');
    expect(input.validity.valid).toBe(false);
    expect(target.textContent).toContain('O valor máximo');
    type('10000');
    expect(input.validity.valid).toBe(true);
    expect(input.value).toBe('100,00');
  } finally {
    await unmount(app);
  }
});
