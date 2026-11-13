import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readable } from 'svelte/store';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('$app/stores', () => ({
  page: readable({ params: { id: 'cliente-1' }, url: new URL('https://vturapp.test/') })
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/services/api')>()),
  apiGet: api.get
}));

import NovoCliente from '../../../routes/(app)/clientes/novo/+page.svelte';
import EditarCliente from '../../../routes/(app)/clientes/[id]/editar/+page.svelte';
import Perfil from '../../../routes/(app)/perfil/+page.svelte';
import Onboarding from '../../../routes/(app)/perfil/onboarding/+page.svelte';
import { ApiError } from '$lib/services/api';

afterEach(() => {
  api.get.mockReset();
  document.body.replaceChildren();
});

it('formata CPF carregado e digitado no onboarding e exibe o ícone de WhatsApp', async () => {
  api.get.mockResolvedValue({ cpf: '12345678901' });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Onboarding, { target });
  await vi.waitFor(() => expect(target.querySelector('#ob-cpf')).not.toBeNull());
  const cpf = target.querySelector<HTMLInputElement>('#ob-cpf')!;
  expect(cpf.value).toBe('123.456.789-01');
  cpf.value = '98765432100';
  cpf.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(cpf.value).toBe('987.654.321-00');
  expect(
    target.querySelector('#ob-whatsapp')?.parentElement?.querySelectorAll('svg path')
  ).toHaveLength(2);
  await unmount(app);
});

it.each([
  { nome: 'novo', component: NovoCliente },
  { nome: 'edição', component: EditarCliente }
])('formata CPF e CNPJ no cadastro de cliente: $nome', async ({ component }) => {
  api.get.mockResolvedValue({ tipo_pessoa: 'PF', cpf: '12345678901' });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(component, { target });
  await vi.waitFor(() => expect(target.querySelector('#cpf')).not.toBeNull());
  const cpf = target.querySelector<HTMLInputElement>('#cpf')!;
  const digitar = (value: string) => {
    cpf.value = value;
    cpf.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    return cpf.value;
  };
  expect(digitar('12345678901')).toBe('123.456.789-01');
  expect(digitar('12345678901')).toBe('123.456.789-01');
  const pessoaJuridica = target.querySelector<HTMLInputElement>('input[value="PJ"]')!;
  pessoaJuridica.click();
  flushSync();
  expect(digitar('12345678000190')).toBe('12.345.678/0001-90');
  expect(digitar('12345678000190')).toBe('12.345.678/0001-90');
  expect(
    target.querySelector('#whatsapp')?.parentElement?.querySelectorAll('svg path')
  ).toHaveLength(2);
  await unmount(app);
});

it.each([
  { nome: 'novo', component: NovoCliente },
  { nome: 'edição', component: EditarCliente }
])('informa validação imediata ao digitar CPF e CNPJ em cliente $nome', async ({ component }) => {
  api.get.mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(component, { target });
  await vi.waitFor(() => expect(target.querySelector('#cpf')).not.toBeNull());
  const input = target.querySelector<HTMLInputElement>('#cpf')!;
  const digit = (value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
  };
  digit('52998224724');
  expect(target.querySelector('#cpf-desc')?.textContent).toBe('CPF inválido.');
  target
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  flushSync();
  expect(target.querySelector('#cpf-desc')?.textContent).toContain('CPF');
  digit('52998224725');
  expect(target.querySelector('#cpf-desc')?.textContent).toBe('CPF válido.');
  target.querySelector<HTMLInputElement>('input[value="PJ"]')!.click();
  flushSync();
  digit('04252011000111');
  expect(target.querySelector('#cpf-desc')?.textContent).toBe('CNPJ inválido.');
  digit('04252011000110');
  expect(target.querySelector('#cpf-desc')?.textContent).toBe('CNPJ válido.');
  await unmount(app);
});

it.each([
  { nome: 'novo cliente', component: NovoCliente, prefix: '' },
  { nome: 'edição de cliente', component: EditarCliente, prefix: '' },
  { nome: 'perfil', component: Perfil, prefix: 'perfil-' },
  { nome: 'onboarding', component: Onboarding, prefix: 'ob-' }
])('preenche o endereço e ignora resultado antigo em $nome', async ({ component, prefix }) => {
  let resolveCep: ((value: object) => void) | undefined;
  api.get.mockImplementation((path: string) => {
    if (path === '/api/v1/enderecos/cep') {
      return new Promise((resolve) => (resolveCep = resolve));
    }
    return Promise.resolve({});
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(component, { target });
  await vi.waitFor(() => expect(target.querySelector(`#${prefix}cep`)).not.toBeNull());
  const cep = target.querySelector<HTMLInputElement>(`#${prefix}cep`)!;
  const digitar = (value: string) => {
    cep.value = value;
    cep.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
  };
  digitar('02244010');
  cep.dispatchEvent(new Event('blur'));
  await vi.waitFor(() => expect(resolveCep).toBeDefined());
  resolveCep!({ logradouro: 'Rua Miyano Oba', localidade: 'São Paulo', uf: 'SP' });
  await vi.waitFor(() =>
    expect(target.querySelector<HTMLInputElement>(`#${prefix}endereco`)?.value).toBe(
      'Rua Miyano Oba'
    )
  );
  expect(target.querySelector<HTMLInputElement>(`#${prefix}cidade`)?.value).toBe('São Paulo');
  expect(target.querySelector(`#${prefix}estado option:checked`)?.getAttribute('value')).toBe('SP');
  if (prefix) {
    const helperId = cep.getAttribute('aria-describedby');
    expect(helperId).toBe(`${prefix}cep-desc`);
    const helper = target.querySelector(`[id="${helperId}"]`);
    expect(helper?.textContent).toBe('Endereço carregado.');
    const campo = helper?.parentElement;
    expect(campo?.contains(cep)).toBe(true);
    expect(campo?.nextElementSibling?.querySelector(`#${prefix}endereco`)).not.toBeNull();
  }

  resolveCep = undefined;
  digitar('01001000');
  cep.dispatchEvent(new Event('blur'));
  await vi.waitFor(() => expect(resolveCep).toBeDefined());
  digitar('22222222');
  resolveCep!({ logradouro: 'Endereço antigo', localidade: 'Outra cidade', uf: 'RJ' });
  await Promise.resolve();
  flushSync();
  expect(target.querySelector<HTMLInputElement>(`#${prefix}endereco`)?.value).toBe(
    'Rua Miyano Oba'
  );
  expect(target.querySelector<HTMLInputElement>(`#${prefix}cidade`)?.value).toBe('São Paulo');
  expect(target.querySelector(`#${prefix}estado option:checked`)?.getAttribute('value')).toBe('SP');
  await unmount(app);
});

it.each([
  { status: 404, mensagem: 'CEP não encontrado.' },
  { status: 502, mensagem: 'Não foi possível consultar o CEP. Tente novamente.' }
])('informa falha de consulta sem afirmar que o CEP é inexistente: $status', async (cenario) => {
  api.get.mockRejectedValue(new ApiError('Erro de consulta', cenario.status));
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(NovoCliente, { target });
  flushSync();
  const cep = target.querySelector<HTMLInputElement>('#cep')!;
  cep.value = '02244010';
  cep.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  cep.dispatchEvent(new Event('blur'));
  await vi.waitFor(() => expect(target.textContent).toContain(cenario.mensagem));
  await unmount(app);
});
