import { expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Harness from './harness/InputMaskHarness.svelte';
import type { MaskType } from '$lib/actions/inputMask';
import { formatDocumentoSalvo } from '$lib/features/clientes/form';

it.each([
  { mask: 'cpf' as const, valid: '52998224725', invalid: '52998224724', name: 'CPF' },
  { mask: 'cnpj' as const, valid: '04252011000110', invalid: '04252011000111', name: 'CNPJ' }
])(
  'informa $name válido ou inválido ao completar ou sair do campo',
  async ({ mask, valid, invalid, name }) => {
    const target = document.createElement('div');
    const app = mount(Harness, { target, props: { mask, documentType: mask } });
    flushSync();
    const input = target.querySelector<HTMLInputElement>('input')!;
    const digit = (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
    };
    digit(invalid.slice(0, 3));
    expect(target.querySelector('#mascara-desc')).toBeNull();
    input.dispatchEvent(new Event('blur'));
    flushSync();
    expect(target.querySelector('#mascara-desc')?.textContent).toBe(`${name} inválido.`);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('mascara-desc');
    digit(valid);
    expect(target.querySelector('#mascara-desc')?.textContent).toBe(`${name} válido.`);
    expect(input.getAttribute('aria-invalid')).toBeNull();
    digit(invalid);
    expect(target.querySelector('#mascara-desc')?.textContent).toBe(`${name} inválido.`);
    digit('');
    expect(target.querySelector('#mascara-desc')).toBeNull();
    await unmount(app);
  }
);

it.each([
  { mask: 'cpf' as const, initialValue: '123456789012' },
  { mask: 'cnpj' as const, initialValue: 'ABC12345678000190' }
])('não altera valor salvo fora do padrão na montagem: $mask', async (props) => {
  const target = document.createElement('div');
  const app = mount(Harness, { target, props });
  flushSync();
  expect(target.querySelector('input')?.value).toBe(props.initialValue);
  expect(target.querySelector('[data-value]')?.textContent).toBe(props.initialValue);
  await unmount(app);
});

it('mostra erro para documento obrigatório vazio ao sair, sem validar outros campos', async () => {
  const target = document.createElement('div');
  const app = mount(Harness, {
    target,
    props: { mask: 'cpf', documentType: 'cpf', required: true }
  });
  flushSync();
  const input = target.querySelector<HTMLInputElement>('input')!;
  expect(target.querySelector('#mascara-desc')).toBeNull();
  input.dispatchEvent(new Event('blur'));
  flushSync();
  expect(target.querySelector('#mascara-desc')?.textContent).toBe('CPF inválido.');
  await unmount(app);
});

it.each([
  { value: '12345678901', tipo: 'PF' as const, expected: '123.456.789-01' },
  { value: '12345678000190', tipo: 'PJ' as const, expected: '12.345.678/0001-90' },
  { value: '123456789012', tipo: 'PF' as const, expected: '123456789012' },
  { value: 'ABC12345678901', tipo: 'PF' as const, expected: 'ABC12345678901' },
  { value: '1234', tipo: 'PJ' as const, expected: '1234' }
])(
  'formata documento salvo sem truncar valores fora do padrão: $value',
  ({ value, tipo, expected }) => {
    expect(formatDocumentoSalvo(value, tipo)).toBe(expected);
  }
);

it.each<{ mask: MaskType; raw: string; expected: string }>([
  { mask: 'cep', raw: '02244010', expected: '02244-010' },
  { mask: 'cpf', raw: '12345678901', expected: '123.456.789-01' },
  { mask: 'cnpj', raw: '12345678000190', expected: '12.345.678/0001-90' },
  { mask: 'phone', raw: '11912345678', expected: '(11) 91234-5678' },
  { mask: 'date', raw: '10112026', expected: '10/11/2026' },
  { mask: 'rg', raw: '123456789', expected: '12.345.678-9' }
])('atualiza o valor com máscara $mask sem disparar eventos recursivos', async (cenario) => {
  const target = document.createElement('div');
  const app = mount(Harness, { target, props: { mask: cenario.mask } });
  flushSync();
  const input = target.querySelector<HTMLInputElement>('input')!;
  input.value = cenario.raw;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(input.value).toBe(cenario.expected);
  expect(target.querySelector('[data-value]')?.textContent).toBe(cenario.expected);
  expect(target.querySelector('[data-events]')?.textContent).toBe('1');
  await unmount(app);
});

it.each([
  { mask: 'phone' as const, withIcon: true, prefix: null, indented: false },
  { mask: 'cep' as const, withIcon: true, prefix: null, indented: false },
  { mask: 'cep' as const, withIcon: false, prefix: 'CEP', indented: true },
  { mask: undefined, withIcon: true, prefix: null, indented: true }
])('reserva espaço somente para elementos visíveis: %o', async (props) => {
  const target = document.createElement('div');
  const app = mount(Harness, { target, props });
  flushSync();
  expect(target.querySelector('input')?.classList.contains('pl-10')).toBe(props.indented);
  if (props.withIcon && !props.mask) expect(target.querySelector('svg')).not.toBeNull();
  await unmount(app);
});
