/** Fase 5.2: acessibilidade do DataTable (nome da tabela, busca rotulada, filtros, teclado, avisos). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import DataTable from '$lib/components/ui/DataTable.svelte';
import DataTableActionsHarness from './harness/DataTableActionsHarness.svelte';

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
  vi.unstubAllGlobals();
});

describe('DataTable: acessibilidade', () => {
  it('tabela com nome (caption) e busca com rótulo', () => {
    montar();
    expect(document.querySelector('table caption')?.textContent).toBe('Clientes');
    const busca = document.querySelector<HTMLInputElement>('input[placeholder="Buscar..."]')!;
    const rotulo = document.querySelector(`label[for="${busca.id}"]`);
    expect(rotulo?.textContent?.trim()).toBe('Buscar em Clientes');
  });

  describe('DataTable: ações dos cartões', () => {
    it('revela ações no mobile sem executar a abertura e permite acioná-las por teclado', () => {
      vi.stubGlobal('innerWidth', 375);
      const onOpen = vi.fn();
      const onDelete = vi.fn();
      target = document.createElement('div');
      document.body.appendChild(target);
      app = mount(DataTableActionsHarness, { target, props: { onOpen, onDelete } });
      flushSync();

      const [first, second] = target.querySelectorAll<HTMLTableRowElement>('tbody tr');
      expect(first.getAttribute('aria-expanded')).toBe('false');
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      flushSync();
      expect(first.getAttribute('aria-expanded')).toBe('true');
      expect(onOpen).not.toHaveBeenCalled();
      (first.querySelector('button') as HTMLButtonElement).click();
      expect(onOpen).toHaveBeenCalledWith({ id: 'a', nome: 'Ana' });
      (first.querySelectorAll('button')[1] as HTMLButtonElement).click();
      expect(onDelete).toHaveBeenCalledWith({ id: 'a', nome: 'Ana' });

      second.click();
      flushSync();
      expect(first.getAttribute('aria-expanded')).toBe('false');
      expect(second.getAttribute('aria-expanded')).toBe('true');
    });

    it('mantém a abertura direta da linha no desktop', () => {
      const onOpen = vi.fn();
      target = document.createElement('div');
      document.body.appendChild(target);
      app = mount(DataTableActionsHarness, {
        target,
        props: { onOpen, onDelete: vi.fn() }
      });
      flushSync();

      const row = target.querySelector<HTMLTableRowElement>('tbody tr')!;
      row.click();
      expect(onOpen).toHaveBeenCalledWith({ id: 'a', nome: 'Ana' });
      expect(row.hasAttribute('aria-expanded')).toBe(false);
    });

    it('permite revelar ações mesmo quando a linha não tem página de detalhes', () => {
      vi.stubGlobal('innerWidth', 375);
      const onDelete = vi.fn();
      target = document.createElement('div');
      document.body.appendChild(target);
      app = mount(DataTableActionsHarness, {
        target,
        props: { onOpen: vi.fn(), onDelete, clickable: false }
      });
      flushSync();

      const row = target.querySelector<HTMLTableRowElement>('tbody tr')!;
      row.click();
      flushSync();
      expect(row.getAttribute('aria-expanded')).toBe('true');
      expect(row.querySelectorAll('button')).toHaveLength(1);
      row.querySelector('button')!.click();
      expect(onDelete).toHaveBeenCalledWith({ id: 'a', nome: 'Ana' });
    });

    it('não oferece ações inexistentes e abre detalhes diretamente quando permitido', () => {
      vi.stubGlobal('innerWidth', 375);
      const onOpen = vi.fn();
      target = document.createElement('div');
      document.body.appendChild(target);
      app = mount(DataTableActionsHarness, {
        target,
        props: { onOpen, onDelete: vi.fn(), actionsFor: (row: { id: string }) => row.id === 'a' }
      });
      flushSync();
      const [first, second] = target.querySelectorAll<HTMLTableRowElement>('tbody tr');
      expect(first.getAttribute('aria-expanded')).toBe('false');
      expect(second.hasAttribute('aria-expanded')).toBe(false);
      second.click();
      expect(onOpen).toHaveBeenCalledWith({ id: 'b', nome: 'Bruno' });
    });

    it('não torna interativa uma linha sem detalhes nem ações permitidas', () => {
      vi.stubGlobal('innerWidth', 375);
      target = document.createElement('div');
      document.body.appendChild(target);
      app = mount(DataTableActionsHarness, {
        target,
        props: { onOpen: vi.fn(), onDelete: vi.fn(), clickable: false, actionsFor: () => false }
      });
      flushSync();
      const row = target.querySelector<HTMLTableRowElement>('tbody tr')!;
      expect(row.hasAttribute('aria-expanded')).toBe(false);
      expect(row.hasAttribute('tabindex')).toBe(false);
      row.click();
      expect(row.hasAttribute('aria-expanded')).toBe(false);
    });
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

  it('navega entre páginas e respeita os limites da tabela', () => {
    montar({ pageSize: 1 });
    const botao = (label: string) =>
      document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
    const pagina = () =>
      document.querySelector('.vtur-table-pagination__navigation span')?.textContent;

    expect(botao('Página anterior').disabled).toBe(true);
    botao('Próxima página').click();
    flushSync();
    expect(pagina()).toContain('Página 2 de 3');
    expect(document.querySelector('tbody')?.textContent).toContain('Bruno');

    botao('Última página').click();
    flushSync();
    expect(pagina()).toContain('Página 3 de 3');
    expect(botao('Próxima página').disabled).toBe(true);

    botao('Primeira página').click();
    flushSync();
    expect(pagina()).toContain('Página 1 de 3');
  });
});
