import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  fetch: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  goto: vi.fn(),
  error: vi.fn()
}));
vi.mock('$lib/config/destinosGeograficos', () => ({ vendasGeograficasAtivas: true }));
vi.mock('$app/stores', async () => {
  const { readable } = await import('svelte/store');
  return {
    page: readable({
      params: { id: 'venda-1' },
      url: new URL('https://vtur.app/vendas/venda-1/editar')
    })
  };
});
vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
vi.mock('$lib/services/session', () => ({ ensureServerSessionCookie: vi.fn() }));
vi.mock('$lib/services/api', () => ({
  apiGet: mocks.get,
  apiFetch: mocks.fetch,
  apiPost: mocks.post,
  apiPatch: mocks.patch,
  isCanceledApiError: () => false,
  ApiError: class extends Error {}
}));
vi.mock('$lib/stores/ui', () => ({
  toast: { error: mocks.error, success: vi.fn(), warning: vi.fn() }
}));
vi.mock('$lib/stores/permissoes', async () => {
  const { readable } = await import('svelte/store');
  return { permissoes: readable({ ready: true, isSystemAdmin: true }) };
});

import NovaVenda from '../../../routes/(app)/vendas/nova/+page.svelte';
import EditarVenda from '../../../routes/(app)/vendas/[id]/editar/+page.svelte';
import DetalhesVenda from '../../../routes/(app)/vendas/[id]/+page.svelte';

const base = {
  user: { id: 'vendedor', can_assign_vendedor: false },
  clientes: [{ id: 'cliente', nome: 'Cliente Teste' }],
  cidades: [
    { id: 'antiga', nome: 'Cidade antiga' },
    { id: 'outra', nome: 'Outra cidade' }
  ],
  produtos: [{ id: 'produto', nome: 'Produto', tipo_produto: 'tipo', todas_as_cidades: true }],
  tipos: [{ id: 'tipo', nome: 'Tipo' }],
  tiposPacote: [],
  formasPagamento: []
};
const recibo = {
  tipo_produto_id: 'tipo',
  produto_id: 'produto',
  produto_resolvido_id: 'produto',
  destino_cidade_id: 'outra',
  numero_recibo: '1',
  tipo_pacote: 'pacote',
  valor_total: '100',
  data_inicio: '2026-11-10',
  data_fim: '2026-11-12'
};
const sale = {
  vendedor_id: 'vendedor',
  cliente_id: 'cliente',
  destino_cidade_id: 'antiga',
  data_venda: '2026-11-09',
  data_embarque: '2026-11-10',
  data_final: '2026-11-12',
  recibos: [recibo, { ...recibo, numero_recibo: '2' }],
  pagamentos: []
};

afterEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

function click(target: HTMLElement, text: string) {
  const button = [...target.querySelectorAll('button')].find((item) =>
    item.textContent?.includes(text)
  );
  expect(button, `Botão ${text}`).toBeTruthy();
  button!.click();
  flushSync();
}

function digitar(target: HTMLElement, id: string, value: string) {
  const input = target.querySelector<HTMLInputElement>(`#${id}`)!;
  expect(input).toBeTruthy();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

it('impede avanço e envio de venda nova com cidade padrão não selecionada', async () => {
  mocks.get.mockResolvedValue(base);
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(NovaVenda, { target });
  await vi.waitFor(() => expect(target.querySelector('#venda-nova-cidade')).toBeTruthy());
  digitar(target, 'venda-nova-cidade', 'Roma');
  click(target, 'Recibos');
  expect(target.querySelector('#venda-nova-cidade')).toBeTruthy();
  expect(target.textContent).toContain('Selecione uma cidade da lista ou limpe o campo.');
  target
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  flushSync();
  expect(mocks.post).not.toHaveBeenCalled();
  await unmount(app);
});

it('preserva pendência do recibo após voltar de etapa e impede salvar', async () => {
  mocks.get.mockResolvedValue(base);
  mocks.fetch.mockImplementation(async (path: string) =>
    path === '/api/v1/vendas/venda-1'
      ? sale
      : { items: [], podeHaverMais: false, cidades_legadas: [], legadas_pode_haver_mais: false }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(EditarVenda, { target });
  await vi.waitFor(() => expect(target.querySelector('#venda-editar-cidade')).toBeTruthy());
  click(target, 'Recibos');
  await vi.waitFor(() =>
    expect(target.querySelector('#venda-editar-recibo-cidade-1')).toBeTruthy()
  );
  digitar(target, 'venda-editar-recibo-cidade-1', 'Roma');
  click(target, 'Dados da venda');
  expect(target.querySelector('#venda-editar-recibo-cidade-1')).toBeNull();
  target
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  flushSync();
  expect(mocks.patch).not.toHaveBeenCalled();
  click(target, 'Recibos');
  await vi.waitFor(() =>
    expect(target.querySelector<HTMLInputElement>('#venda-editar-recibo-cidade-1')?.value).toBe(
      'Roma'
    )
  );
  click(target, 'Forma de pagamento');
  expect(target.textContent).toContain('Selecione uma cidade da lista ou limpe o campo.');
  await unmount(app);
});

it('mantém a pendência no recibo correto ao excluir um recibo anterior', async () => {
  mocks.get.mockResolvedValue(base);
  mocks.fetch.mockImplementation(async (path: string) =>
    path === '/api/v1/vendas/venda-1'
      ? sale
      : { items: [], podeHaverMais: false, cidades_legadas: [], legadas_pode_haver_mais: false }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(EditarVenda, { target });
  await vi.waitFor(() => expect(target.querySelector('#venda-editar-cidade')).toBeTruthy());
  click(target, 'Recibos');
  await vi.waitFor(() =>
    expect(target.querySelector('#venda-editar-recibo-cidade-1')).toBeTruthy()
  );
  digitar(target, 'venda-editar-recibo-cidade-1', 'Roma');
  const primeiro = target.querySelector('#venda-editar-recibo-cidade-0')!.closest('.rounded-xl')!;
  primeiro.querySelector('button')!.click();
  flushSync();
  expect(target.querySelector<HTMLInputElement>('#venda-editar-recibo-cidade-0')?.value).toBe(
    'Roma'
  );
  click(target, 'Forma de pagamento');
  expect(target.textContent).toContain('Selecione uma cidade da lista ou limpe o campo.');
  await unmount(app);
});

it('não aplica resposta de vínculo após desmontar a etapa', async () => {
  let resolver: (value: unknown) => void = () => {};
  mocks.get.mockResolvedValue(base);
  mocks.fetch.mockImplementation((path: string) => {
    if (path === '/api/v1/vendas/venda-1') return Promise.resolve(sale);
    if (path.endsWith('/referencia')) return new Promise((resolve) => (resolver = resolve));
    return Promise.resolve({
      items: [{ id: 'geonames:1', nome: 'Roma', label: 'Roma, Itália', cidade_interna_id: null }],
      podeHaverMais: false,
      cidades_legadas: [],
      legadas_pode_haver_mais: false
    });
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(EditarVenda, { target });
  await vi.waitFor(() => expect(target.querySelector('#venda-editar-cidade')).toBeTruthy());
  click(target, 'Recibos');
  await vi.waitFor(() =>
    expect(target.querySelector('#venda-editar-recibo-cidade-1')).toBeTruthy()
  );
  digitar(target, 'venda-editar-recibo-cidade-1', 'Roma');
  await vi.waitFor(() => expect(target.textContent).toContain('Roma, Itália'));
  click(target, 'Roma, Itália');
  click(target, 'Dados da venda');
  resolver({ item: { id: 'cidade-italia', destino_geografico_id: 'geonames:1' } });
  await Promise.resolve();
  flushSync();
  click(target, 'Recibos');
  await vi.waitFor(() =>
    expect(target.querySelector<HTMLInputElement>('#venda-editar-recibo-cidade-1')?.value).toBe(
      'Roma, Itália'
    )
  );
  click(target, 'Forma de pagamento');
  expect(target.textContent).toContain('Selecione uma cidade da lista ou limpe o campo.');
  expect(mocks.patch).not.toHaveBeenCalled();
  await unmount(app);
});

it('salva UUIDs existentes sem enviar estado interno do seletor', async () => {
  mocks.get.mockResolvedValue(base);
  mocks.patch.mockResolvedValue({});
  mocks.fetch.mockResolvedValue({
    ...sale,
    pagamentos: [{ forma_nome: 'Dinheiro', valor_total: '200', parcelas_qtd: 1 }]
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(EditarVenda, { target });
  await vi.waitFor(() => expect(target.querySelector('#venda-editar-cidade')).toBeTruthy());
  target
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
  const payload = mocks.patch.mock.calls[0][1] as {
    venda: { destino_cidade_id: string };
    recibos: Record<string, unknown>[];
  };
  expect(payload.venda.destino_cidade_id).toBe('antiga');
  expect(payload.recibos.map((item) => item.destino_cidade_id)).toEqual(['outra', 'outra']);
  expect(payload.recibos.every((item) => !('estadoCidade' in item))).toBe(true);
  await unmount(app);
});

it('salva a cidade geográfica escolhida usando o UUID interno do recibo', async () => {
  mocks.get.mockResolvedValue(base);
  mocks.patch.mockResolvedValue({});
  mocks.fetch.mockImplementation(async (path: string) =>
    path === '/api/v1/vendas/venda-1'
      ? {
          ...sale,
          pagamentos: [{ forma_nome: 'Dinheiro', valor_total: '200', parcelas_qtd: 1 }]
        }
      : {
          items: [
            { id: 'geonames:2', nome: 'Roma', label: 'Roma, Texas', cidade_interna_id: 'texas' }
          ],
          podeHaverMais: false,
          cidades_legadas: [],
          legadas_pode_haver_mais: false
        }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(EditarVenda, { target });
  await vi.waitFor(() => expect(target.querySelector('#venda-editar-cidade')).toBeTruthy());
  click(target, 'Recibos');
  await vi.waitFor(() =>
    expect(target.querySelector('#venda-editar-recibo-cidade-1')).toBeTruthy()
  );
  digitar(target, 'venda-editar-recibo-cidade-1', 'Roma');
  await vi.waitFor(() => expect(target.textContent).toContain('Roma, Texas'));
  click(target, 'Roma, Texas');
  target
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
  const payload = mocks.patch.mock.calls[0][1] as { recibos: Record<string, unknown>[] };
  expect(payload.recibos[1].destino_cidade_id).toBe('texas');
  expect(payload.recibos[1].cidade_nome).toBe('Roma');
  await unmount(app);
});

it('bloqueia cidade não selecionada no modal de recibo e salva após seleção', async () => {
  mocks.get.mockImplementation(async (path: string) =>
    path.endsWith('cadastro-base') ? base : { recibos: [], totais: null }
  );
  mocks.patch.mockResolvedValue({});
  mocks.fetch.mockImplementation(async (path: string) =>
    path === '/api/v1/vendas/venda-1'
      ? {
          ...sale,
          recibos: [{ ...recibo, id: 'recibo-1', destino_cidade: { nome: 'Outra cidade' } }]
        }
      : {
          items: [
            { id: 'geonames:2', nome: 'Roma', label: 'Roma, Texas', cidade_interna_id: 'texas' }
          ],
          podeHaverMais: false,
          cidades_legadas: [],
          legadas_pode_haver_mais: false
        }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(DetalhesVenda, { target });
  await vi.waitFor(() => expect(target.querySelector('tr[role="button"]')).toBeTruthy());
  target.querySelector<HTMLTableRowElement>('tr[role="button"]')!.click();
  flushSync();
  await vi.waitFor(() => expect(target.querySelector('#recibo-cidade')).toBeTruthy());
  const dialog = target.querySelector<HTMLElement>('[role="dialog"]')!;
  click(dialog, 'Editar');
  digitar(target, 'recibo-cidade', 'Roma');
  click(dialog, 'Salvar');
  expect(mocks.patch).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalledWith('Selecione uma cidade da lista ou limpe o campo.');
  await vi.waitFor(() => expect(dialog.textContent).toContain('Roma, Texas'));
  click(dialog, 'Roma, Texas');
  click(dialog, 'Salvar');
  await vi.waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
  expect(mocks.patch).toHaveBeenCalledWith(
    '/api/v1/vendas/recibo-edit',
    expect.objectContaining({ recibo_id: 'recibo-1', destino_cidade_id: 'texas' })
  );
  await unmount(app);
});

it('descarta vínculo pendente ao cancelar o modal sem afetar outro recibo', async () => {
  let resolver: (value: unknown) => void = () => {};
  mocks.get.mockImplementation(async (path: string) =>
    path.endsWith('cadastro-base') ? base : { recibos: [], totais: null }
  );
  mocks.fetch.mockImplementation((path: string) => {
    if (path === '/api/v1/vendas/venda-1')
      return Promise.resolve({
        ...sale,
        recibos: [
          { ...recibo, id: 'recibo-1', destino_cidade: { nome: 'Outra cidade' } },
          { ...recibo, id: 'recibo-2', destino_cidade: { nome: 'Outra cidade' } }
        ]
      });
    if (path.endsWith('/referencia')) return new Promise((resolve) => (resolver = resolve));
    return Promise.resolve({
      items: [{ id: 'geonames:1', nome: 'Roma', label: 'Roma, Itália', cidade_interna_id: null }],
      podeHaverMais: false,
      cidades_legadas: [],
      legadas_pode_haver_mais: false
    });
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(DetalhesVenda, { target });
  await vi.waitFor(() => expect(target.querySelectorAll('tr[role="button"]')).toHaveLength(2));
  target.querySelectorAll<HTMLTableRowElement>('tr[role="button"]')[0].click();
  flushSync();
  let dialog = target.querySelector<HTMLElement>('[role="dialog"]')!;
  click(dialog, 'Editar');
  digitar(target, 'recibo-cidade', 'Roma');
  await vi.waitFor(() => expect(dialog.textContent).toContain('Roma, Itália'));
  click(dialog, 'Roma, Itália');
  click(dialog, 'Cancelar');
  target.querySelectorAll<HTMLTableRowElement>('tr[role="button"]')[1].click();
  flushSync();
  resolver({ item: { id: 'cidade-italia', destino_geografico_id: 'geonames:1' } });
  await Promise.resolve();
  flushSync();
  dialog = target.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.querySelector<HTMLInputElement>('#recibo-cidade')?.value).toBe('Outra cidade');
  await unmount(app);
});
