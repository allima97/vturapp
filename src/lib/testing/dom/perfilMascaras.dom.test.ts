import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('$lib/services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/services/api')>()),
  apiGet: api.get,
  apiPatch: api.patch
}));
import Perfil from '../../../routes/(app)/perfil/+page.svelte';

afterEach(() => {
  vi.resetAllMocks();
  document.body.replaceChildren();
});

it('apresenta valores salvos formatados, ícones e máscaras iguais às do cadastro de clientes', async () => {
  api.get.mockImplementation((path: string) =>
    Promise.resolve(
      path === '/api/v1/user/profile'
        ? {
            nome_completo: 'Teste',
            telefone: '1133334444',
            whatsapp: '11912345678',
            cpf: '52998224725',
            cep: '02244010',
            rg: 'RG-A123',
            email: 'teste@example.test'
          }
        : {}
    )
  );
  api.patch.mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Perfil, { target });
  await vi.waitFor(() => expect(target.querySelector('#perfil-telefone')).not.toBeNull());

  const field = (name: string) => target.querySelector<HTMLInputElement>(`#perfil-${name}`)!;
  expect(field('telefone').value).toBe('(11) 3333-4444');
  expect(field('whatsapp').value).toBe('(11) 91234-5678');
  expect(field('cpf').value).toBe('529.982.247-25');
  expect(field('cep').value).toBe('02244-010');
  expect(field('rg').value).toBe('RG-A123');
  for (const id of ['nome', 'nascimento', 'email', 'telefone', 'whatsapp', 'cep']) {
    expect(field(id).parentElement?.querySelector('svg')).not.toBeNull();
  }
  expect(field('whatsapp').parentElement?.querySelector('svg')?.getAttribute('viewBox')).toBe(
    '0 0 24 24'
  );
  expect(field('whatsapp').parentElement?.querySelectorAll('svg path')).toHaveLength(2);
  expect(field('telefone').parentElement?.querySelector('svg')?.outerHTML).not.toBe(
    field('whatsapp').parentElement?.querySelector('svg')?.outerHTML
  );
  for (const id of ['cpf', 'rg', 'endereco', 'cidade']) {
    expect(field(id).parentElement?.querySelector('svg')).toBeNull();
  }
  expect(field('telefone').type).toBe('tel');
  expect(field('whatsapp').type).toBe('tel');

  const digitar = (id: string, value: string) => {
    const input = field(id);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    return input.value;
  };
  expect(digitar('telefone', '11')).toBe('(11');
  expect(digitar('telefone', '11912345678')).toBe('(11) 91234-5678');
  expect(digitar('whatsapp', '1133334444')).toBe('(11) 3333-4444');
  expect(digitar('cpf', '52998224725')).toBe('529.982.247-25');
  expect(digitar('cep', '12345678')).toBe('12345-678');
  expect(digitar('rg', 'ABC123')).toBe('ABC123');

  target
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() =>
    expect(api.patch).toHaveBeenCalledWith(
      '/api/v1/user/profile',
      expect.objectContaining({
        telefone: '(11) 91234-5678',
        whatsapp: '(11) 3333-4444',
        cpf: '529.982.247-25',
        cep: '12345-678',
        rg: 'ABC123'
      })
    )
  );
  await unmount(app);
});

it('não altera um telefone salvo fora do padrão nacional ao exibi-lo ou salvá-lo', async () => {
  api.get.mockImplementation((path: string) =>
    Promise.resolve(
      path === '/api/v1/user/profile' ? { nome_completo: 'Teste', telefone: '+1 212 555 1234' } : {}
    )
  );
  api.patch.mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Perfil, { target });
  await vi.waitFor(() => expect(target.querySelector('#perfil-telefone')).not.toBeNull());
  expect(target.querySelector<HTMLInputElement>('#perfil-telefone')?.value).toBe('+1 212 555 1234');
  target
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() =>
    expect(api.patch).toHaveBeenCalledWith(
      '/api/v1/user/profile',
      expect.objectContaining({ telefone: '+1 212 555 1234' })
    )
  );
  await unmount(app);
});

it('impede salvar CPF inválido e permite corrigir antes do envio', async () => {
  api.get.mockImplementation((path: string) =>
    Promise.resolve(path === '/api/v1/user/profile' ? { nome_completo: 'Teste' } : {})
  );
  api.patch.mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Perfil, { target });
  await vi.waitFor(() => expect(target.querySelector('#perfil-cpf')).not.toBeNull());
  const cpf = target.querySelector<HTMLInputElement>('#perfil-cpf')!;
  cpf.value = '52998224724';
  cpf.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  const form = target.querySelector('form')!;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  expect(api.patch).not.toHaveBeenCalled();
  cpf.value = '52998224725';
  cpf.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() =>
    expect(api.patch).toHaveBeenCalledWith(
      '/api/v1/user/profile',
      expect.objectContaining({ cpf: '529.982.247-25' })
    )
  );
  await unmount(app);
});
