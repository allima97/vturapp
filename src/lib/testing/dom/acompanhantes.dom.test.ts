import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const api = vi.hoisted(() => ({ get: vi.fn(), fetch: vi.fn() }));
vi.mock('$lib/services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/services/api')>()),
  apiGet: api.get,
  apiFetch: api.fetch
}));

import AcompanhantesManager from '$lib/components/clientes/AcompanhantesManager.svelte';

const acompanhante = {
  id: 'acomp-1',
  nome_completo: 'Ana',
  cpf: '52998224725',
  telefone: '11987654321',
  grau_parentesco: 'Amigo(a)',
  rg: null,
  data_nascimento: null,
  observacoes: null,
  ativo: true
};

function button(target: HTMLElement, label: string) {
  const found = Array.from(target.querySelectorAll('button')).find(
    (item) => item.textContent?.trim() === label
  );
  if (!found) throw new Error(`Botão ${label} não encontrado`);
  return found;
}

afterEach(() => {
  api.get.mockReset();
  api.fetch.mockReset();
  document.body.replaceChildren();
});

it('formata dados e abre, edita, cancela e cadastra acompanhantes', async () => {
  api.get.mockResolvedValue({ items: [acompanhante] });
  api.fetch.mockResolvedValue({});
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(AcompanhantesManager, {
    target,
    props: { clienteId: 'cliente-1', editable: true, title: 'Acompanhantes do cliente' }
  });
  await vi.waitFor(() => expect(target.textContent).toContain('Ana'));
  expect(target.textContent).toContain('529.982.247-25');
  expect(target.querySelector('[data-label="CPF"]')?.textContent?.trim()).toBe('529.982.247-25');
  expect(target.textContent).toContain('(11) 98765-4321');
  expect(target.querySelector('#acomp-nome')).toBeNull();
  const novo = button(target, 'Novo');
  expect(novo.closest('.vtur-card')?.querySelector('h3')?.textContent).toBe(
    'Acompanhantes do cliente'
  );
  expect(novo.getAttribute('aria-expanded')).toBe('false');

  const linha = target.querySelector<HTMLTableRowElement>('tbody tr')!;
  expect(linha.tabIndex).toBe(0);
  linha.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  flushSync();
  expect(target.querySelector<HTMLInputElement>('#acomp-cpf')?.value).toBe('529.982.247-25');
  expect(target.querySelector<HTMLInputElement>('#acomp-telefone')?.value).toBe('(11) 98765-4321');
  expect(target.textContent).toContain('Editar acompanhante');
  button(target, 'Cancelar').click();
  flushSync();
  expect(target.querySelector('#acomp-nome')).toBeNull();

  novo.click();
  flushSync();
  expect(novo.getAttribute('aria-expanded')).toBe('true');
  const nome = target.querySelector<HTMLInputElement>('#acomp-nome')!;
  const cpf = target.querySelector<HTMLInputElement>('#acomp-cpf')!;
  const telefone = target.querySelector<HTMLInputElement>('#acomp-telefone')!;
  const inputs: Array<[HTMLInputElement, string]> = [
    [nome, 'Maria'],
    [cpf, '52998224725'],
    [telefone, '1132345678']
  ];
  for (const [input, value] of inputs) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  flushSync();
  expect(cpf.value).toBe('529.982.247-25');
  expect(telefone.value).toBe('(11) 3234-5678');
  button(target, 'Salvar acompanhante').click();
  await vi.waitFor(() => expect(api.fetch).toHaveBeenCalledOnce());
  expect(api.fetch).toHaveBeenCalledWith(
    '/api/v1/clientes/cliente-1/acompanhantes',
    expect.objectContaining({
      method: 'POST',
      body: expect.objectContaining({ cpf: '529.982.247-25', telefone: '(11) 3234-5678' })
    })
  );
  await vi.waitFor(() => expect(target.querySelector('#acomp-nome')).toBeNull());
  await unmount(app);
});

it('formata dados também na consulta sem permitir edição', async () => {
  api.get.mockResolvedValue({ items: [acompanhante] });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(AcompanhantesManager, { target, props: { clienteId: 'cliente-1' } });
  await vi.waitFor(() => expect(target.textContent).toContain('Ana'));
  expect(target.textContent).toContain('529.982.247-25');
  expect(target.querySelector('[data-label="CPF"]')?.textContent?.trim()).toBe('529.982.247-25');
  expect(target.textContent).toContain('(11) 98765-4321');
  target.querySelector<HTMLTableRowElement>('tbody tr')!.click();
  flushSync();
  expect(target.querySelector('#acomp-nome')).toBeNull();
  expect(target.querySelectorAll('button')).toHaveLength(0);
  await unmount(app);
});

it('preserva telefones antigos fora do formato nacional ao editar', async () => {
  api.get.mockResolvedValue({
    items: [{ ...acompanhante, telefone: '+1 212 555 1234 ramal 25' }]
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(AcompanhantesManager, {
    target,
    props: { clienteId: 'cliente-1', editable: true }
  });
  await vi.waitFor(() => expect(target.textContent).toContain('Ana'));
  target.querySelector<HTMLTableRowElement>('tbody tr')!.click();
  flushSync();
  expect(target.querySelector<HTMLInputElement>('#acomp-telefone')?.value).toBe(
    '+1 212 555 1234 ramal 25'
  );
  await unmount(app);
});
