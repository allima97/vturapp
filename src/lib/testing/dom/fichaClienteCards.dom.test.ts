import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readable } from 'svelte/store';

const api = vi.hoisted(() => ({ get: vi.fn(), fetch: vi.fn() }));
vi.mock('$app/stores', () => ({
  page: readable({ params: { id: 'cliente-1' }, url: new URL('https://vturapp.test/') })
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/services/api')>()),
  apiGet: api.get,
  apiFetch: api.fetch
}));

import Page from '../../../routes/(app)/clientes/[id]/+page.svelte';
import { ApiError } from '$lib/services/api';

afterEach(() => {
  api.get.mockReset();
  api.fetch.mockReset();
  document.body.replaceChildren();
});

it('oculta as abas de viagens e contatos quando o usuário não tem acesso', async () => {
  api.get.mockImplementation(async (url: string) => {
    if (url.endsWith('/acompanhantes')) return { items: [] };
    if (url.includes('/historico')) return { vendas: [], orcamentos: [] };
    return { id: 'cliente-1', nome: 'Cliente teste', status: 'prospect', acompanhantes_count: 0 };
  });
  api.fetch.mockRejectedValue(new ApiError('Sem acesso', 403));
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  await vi.waitFor(() => expect(target.querySelectorAll('[role="tab"]')).toHaveLength(5));
  const tabs = [...target.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent?.trim());
  expect(tabs).not.toContain('Viagens');
  expect(tabs).not.toContain('Contatos enviados');
  expect(target.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim()).toBe(
    'Resumo do cliente'
  );
  await unmount(app);
});

it('mostra as seções em abas na ordem solicitada e abre apenas a aba selecionada', async () => {
  api.get.mockImplementation(async (url: string) => {
    if (url.endsWith('/acompanhantes')) return { items: [] };
    if (url.includes('/historico')) return { vendas: [], orcamentos: [] };
    return {
      id: 'cliente-1',
      nome: 'Cliente teste',
      status: 'prospect',
      acompanhantes_count: 0,
      endereco: 'Rua de teste',
      numero: '41',
      complemento: 'Casa 05',
      bairro: 'Centro',
      cidade: 'São Paulo',
      estado: 'SP',
      cep: '02244010',
      tags: ['VIP', 'Família'],
      documento_formatado: '529.982.247-25',
      telefone: '11912345678',
      whatsapp: '11912345678',
      email: 'cliente@exemplo.com',
      nascimento: '1990-01-01',
      genero: 'Feminino',
      nacionalidade: 'Brasileira',
      classificacao: 'A',
      notas: 'Nota preservada'
    };
  });
  api.fetch.mockResolvedValue({ items: [] });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  await vi.waitFor(() => expect(target.querySelectorAll('[role="tab"]')).toHaveLength(7));

  const buttons = [...target.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const names = [
    'Resumo do cliente',
    'Acompanhantes',
    'Histórico de vendas',
    'Histórico de orçamentos',
    'Viagens',
    'Contatos enviados',
    'Notas e contexto'
  ];
  expect(buttons.map((button) => names.find((name) => button.textContent?.includes(name)))).toEqual(
    names
  );
  const summary = [...target.querySelectorAll('h3')].find((item) =>
    item.textContent?.includes('Resumo do cliente')
  );
  expect(summary).toBeTruthy();
  expect(buttons[0].getAttribute('aria-selected')).toBe('true');
  const resumo = target.querySelector<HTMLElement>('#cliente-panel-resumo')!;
  expect(resumo.textContent).not.toContain('Ultima compra');
  expect(resumo.textContent).not.toContain('Prospect');
  expect(target.textContent).toContain('Última compra');
  expect(target.textContent).toContain('Rua de teste');
  const endereco = target.querySelector<HTMLElement>('[aria-label="Endereço do cliente"]')!;
  expect([...endereco.children].map((item) => item.querySelector('p')?.textContent)).toEqual([
    'CEP',
    'Endereço',
    'Cidade',
    'Estado'
  ]);
  expect(endereco.textContent).toContain('02244010');
  expect(endereco.textContent).toContain('Rua de teste, 41 · Casa 05 · Centro');
  expect(endereco.textContent).toContain('São Paulo');
  expect(endereco.textContent).toContain('SP');
  expect(resumo.textContent).not.toContain('VIP');
  expect(resumo.textContent).not.toContain('Família');
  expect(resumo.textContent).not.toContain('Tags');
  const dados = target.querySelector('[aria-label="Dados do cliente"]')!;
  const pessoais = dados.querySelector('[aria-label="Dados pessoais"]')!;
  const contatos = dados.querySelector('[aria-label="Contatos e classificação do cliente"]')!;
  for (const group of [pessoais, contatos]) {
    expect(group.classList.contains('grid-cols-2')).toBe(true);
    expect(group.classList.contains('lg:grid-cols-4')).toBe(true);
    for (const item of group.children) {
      expect(item.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
  }
  expect(endereco.classList.contains('grid-cols-2')).toBe(true);
  expect(endereco.classList.contains('lg:grid-cols-4')).toBe(true);
  for (const item of endereco.children) {
    expect(item.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  }
  expect(
    contatos.compareDocumentPosition(endereco) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
  expect([...pessoais.children].map((item) => item.querySelector('p')?.textContent)).toEqual([
    'Nome',
    'CPF/CNPJ',
    'Nascimento',
    'Gênero / Nacionalidade'
  ]);
  expect([...contatos.children].map((item) => item.querySelector('p')?.textContent)).toEqual([
    'Telefone',
    'WhatsApp',
    'E-mail',
    'Classificação'
  ]);
  expect(contatos.lastElementChild?.textContent).toContain('A');
  expect(
    target.querySelector('[aria-label="Falar com o cliente"]')?.classList.contains('gap-4')
  ).toBe(true);
  const acoes = resumo.querySelector<HTMLElement>('[aria-label="Falar com o cliente"]')!;
  expect(acoes.parentElement).toBe(summary?.parentElement?.parentElement);
  expect(acoes.parentElement?.classList.contains('items-center')).toBe(true);
  expect([...acoes.querySelectorAll('a')].map((link) => link.textContent?.trim())).toEqual([
    'WhatsApp',
    'Ligar',
    'E-mail'
  ]);
  expect(acoes.querySelector('a[href^="https://wa.me/"]')).not.toBeNull();
  expect(acoes.querySelector('a[href="tel:11912345678"]')).not.toBeNull();
  expect(acoes.querySelector('a[href="mailto:cliente@exemplo.com"]')).not.toBeNull();
  expect(
    pessoais.compareDocumentPosition(contatos) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
  const whatsapp = target.querySelector<HTMLAnchorElement>('a[href^="https://wa.me/"]')!;
  expect(whatsapp.querySelector('svg')).not.toBeNull();
  for (const value of ['529.982.247-25', '11912345678', 'cliente@exemplo.com', 'Brasileira']) {
    expect(dados.textContent).toContain(value);
  }
  for (const button of buttons) {
    button.click();
    flushSync();
    expect(button.getAttribute('aria-selected')).toBe('true');
    const body = target.querySelector<HTMLElement>(`#${button.getAttribute('aria-controls')}`)!;
    expect(body.hidden).toBe(false);
    for (const other of buttons.filter((item) => item !== button)) {
      expect(other.getAttribute('aria-selected')).toBe('false');
      expect(
        target.querySelector<HTMLElement>(`#${other.getAttribute('aria-controls')}`)!.hidden
      ).toBe(true);
    }
  }
  expect(target.textContent).toContain('Nota preservada');
  buttons[0].focus();
  buttons[0].click();
  flushSync();
  buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await vi.waitFor(() => expect(buttons[1].getAttribute('aria-selected')).toBe('true'));
  expect(document.activeElement).toBe(buttons[1]);
  await unmount(app);
});
