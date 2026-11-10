/** Fase 5.2: acessibilidade do DataTable (nome da tabela, busca rotulada, filtros, teclado, avisos). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import DataTable from '$lib/components/ui/DataTable.svelte';

let app: ReturnType<typeof mount> | null = null;
let target: HTMLElement | null = null;

const data = [
  { id: 'a', nome: 'Ana', cidade: 'Lisboa' },
  { id: 'b', nome: 'Bruno', cidade: 'Rio' },
  { id: 'c', nome: 'Carla', cidade: 'Lisboa' }
];

function montar(props: Record<string, unknown> = {}) {
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(DataTable as any, {
    target,
    props: {
      title: 'Clientes',
      data,
      columns: [
        { key: 'nome', label: 'Nome', sortable: true },
        { key: 'cidade', label: 'Cidade' }
      ],
      filters: [{ key: 'cidade', label: 'Cidade', type: 'text' }],
      ...props
    }
  });
  flushSync();
}

afterEach(() => {
  if (app) unmount(app);
  target?.remove();
  app = null;
});

describe('DataTable: acessibilidade', () => {
  it('tabela com nome (caption) e busca com rótulo', () => {
    montar();
    expect(document.querySelector('table caption')?.textContent).toBe('Clientes');
    const busca = document.querySelector<HTMLInputElement>('input[placeholder="Buscar..."]')!;
    const rotulo = document.querySelector(`label[for="${busca.id}"]`);
    expect(rotulo?.textContent?.trim()).toBe('Buscar em Clientes');
  });

  it('botão Filtros diz se o painel está aberto e aponta para ele', async () => {
    montar();
    const botao = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.includes('Filtros') && b.hasAttribute('aria-controls')
    )!;
    expect(botao.getAttribute('aria-expanded')).toBe('false');
    botao.click();
    flushSync();
    await tick();
    expect(botao.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(botao.getAttribute('aria-controls')!)).toBeTruthy();
  });

  it('linha clicável abre com Enter e Espaço, só quando o foco está na linha', () => {
    const onRowClick = vi.fn();
    montar({ onRowClick });
    const linha = document.querySelector('tbody tr')! as HTMLElement;
    expect(linha.getAttribute('tabindex')).toBe('0');
    expect(linha.className).toContain('focus-visible:outline-2');
    linha.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    linha.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(onRowClick).toHaveBeenCalledTimes(2);
    expect(onRowClick.mock.calls[0][0]).toEqual(data[0]);
  });

  it('busca anuncia quantos registros encontrou; ordenação marcada no cabeçalho', async () => {
    montar();
    expect(document.querySelector('[role="status"]')).toBeNull();
    const busca = document.querySelector<HTMLInputElement>('input[placeholder="Buscar..."]')!;
    busca.value = 'lisboa';
    busca.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    await tick();
    expect(document.querySelector('[role="status"]')?.textContent?.trim()).toBe(
      '2 registros encontrados'
    );
    expect(document.querySelectorAll('tbody tr')).toHaveLength(2);

    const th = document.querySelector('th[aria-sort]')!;
    expect(th.getAttribute('aria-sort')).toBe('none');
    th.querySelector('button')!.click();
    flushSync();
    await tick();
    expect(th.getAttribute('aria-sort')).toBe('ascending');
  });

  it('carregando: tabela marcada como ocupada', () => {
    montar({ loading: true });
    expect(document.querySelector('table')?.getAttribute('aria-busy')).toBe('true');
  });
});
