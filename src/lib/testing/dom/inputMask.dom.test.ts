import { expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Harness from './harness/InputMaskHarness.svelte';
import type { MaskType } from '$lib/actions/inputMask';
import { formatDocumentoSalvo, formatTelefone } from '$lib/features/clientes/form';
import FieldInput from '$lib/components/ui/form/FieldInput.svelte';
import { Eye } from '$lib/icons';

it('mantém o campo acessível e aciona o botão associado', async () => {
  const onAction = vi.fn();
  const target = document.createElement('div');
  const app = mount(FieldInput, {
    target,
    props: { label: 'Senha', actionIcon: Eye, actionLabel: 'Mostrar senha', onAction }
  });
  flushSync();
  const input = target.querySelector<HTMLInputElement>('input')!;
  const button = target.querySelector<HTMLButtonElement>('button[aria-label="Mostrar senha"]')!;
  input.value = 'teste';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  button.click();
  expect(input.value).toBe('teste');
  expect(onAction).toHaveBeenCalledOnce();
  await unmount(app);
});

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
  { mask: 'cnpj' as const, initialValue: 'ABC12345678000190' },
  { mask: 'cep' as const, initialValue: 'ABC123456789' },
  { mask: 'phone' as const, initialValue: '+34 652 99 00 47' },
  { mask: 'phone' as const, initialValue: '55119912345678' }
])('não altera valor salvo fora do padrão na montagem: $mask', async (props) => {
  const target = document.createElement('div');
  const app = mount(Harness, { target, props });
  flushSync();
  expect(target.querySelector('input')?.value).toBe(props.initialValue);
  expect(target.querySelector('[data-value]')?.textContent).toBe(props.initialValue);
  await unmount(app);
});

it.each(['11h 30min', '14:00 (+1)'])(
  'preserva horário ou duração legada %s até edição intencional',
  async (initialValue) => {
    const target = document.createElement('div');
    const app = mount(Harness, { target, props: { mask: 'time', initialValue } });
    flushSync();
    const input = target.querySelector<HTMLInputElement>('input')!;
    expect(input.value).toBe(initialValue);
    expect(target.querySelector('[data-value]')?.textContent).toBe(initialValue);
    if (initialValue.includes('(+1)')) {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
      expect(input.value).toBe(initialValue);
    }
    input.value = '0950';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(input.value).toBe('09:50');
    expect(target.querySelector('[data-value]')?.textContent).toBe('09:50');
    await unmount(app);
  }
);

it.each([
  ['9:50', '09:50'],
  ['9h 05min', '09:05'],
  ['9h 5min', '09:05'],
  ['1135', '11:35'],
  ['12', '12'],
  ['', '']
])('formata tempo digitado ou colado %s como %s', async (raw, expected) => {
  const target = document.createElement('div');
  const app = mount(Harness, { target, props: { mask: 'time' } });
  flushSync();
  const input = target.querySelector<HTMLInputElement>('input')!;
  input.value = raw;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(input.value).toBe(expected);
  expect(target.querySelector('[data-value]')?.textContent).toBe(expected);
  await unmount(app);
});

it('preserva telefone internacional salvo ao editar e retoma máscara ao limpar', async () => {
  const target = document.createElement('div');
  const app = mount(Harness, {
    target,
    props: { mask: 'phone', initialValue: '55119912345678' }
  });
  flushSync();
  const input = target.querySelector<HTMLInputElement>('input')!;
  input.value = '551199123456789';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(input.value).toBe('551199123456789');
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  input.value = '11912345678';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(input.value).toBe('(11) 91234-5678');
  await unmount(app);
});

it('preserva telefones internacionais digitados com DDI', async () => {
  const target = document.createElement('div');
  const app = mount(Harness, { target, props: { mask: 'phone' } });
  flushSync();
  const input = target.querySelector<HTMLInputElement>('input')!;
  input.value = '+34 652 99 00 47';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(input.value).toBe('+34 652 99 00 47');
  expect(target.querySelector('[data-value]')?.textContent).toBe('+34 652 99 00 47');
  await unmount(app);
});

it.each(['1', '11', '119', '1191234', '11912345678'])(
  'usa a mesma formatação de telefone do cadastro para %s',
  async (raw) => {
    const target = document.createElement('div');
    const app = mount(Harness, { target, props: { mask: 'phone' } });
    flushSync();
    const input = target.querySelector<HTMLInputElement>('input')!;
    input.value = raw;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(input.value).toBe(formatTelefone(raw));
    await unmount(app);
  }
);

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
  { mask: 'phone' as const, withIcon: true, prefix: null, indented: true },
  { mask: 'cep' as const, withIcon: true, prefix: null, indented: true },
  { mask: 'cep' as const, withIcon: false, prefix: 'CEP', indented: true },
  { mask: undefined, withIcon: true, prefix: null, indented: true }
])('reserva espaço somente para elementos visíveis: %o', async (props) => {
  const target = document.createElement('div');
  const app = mount(Harness, { target, props });
  flushSync();
  expect(target.querySelector('input')?.classList.contains('pl-10')).toBe(props.indented);
  if (props.withIcon) expect(target.querySelector('svg')).not.toBeNull();
  await unmount(app);
});
