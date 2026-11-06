/** Fase 5.3: Placar de vendas — mesmos números da API do ranking, sem cálculo próprio. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import { writable } from 'svelte/store';

const st = vi.hoisted(() => ({
  perms: null as any,
  fetch: vi.fn()
}));

vi.mock('$lib/stores/permissoes', async () => {
  const { writable } = await import('svelte/store');
  st.perms = writable({
    ready: true,
    isSystemAdmin: false,
    isMaster: false,
    isGestor: true,
    isVendedor: false
  });
  return { permissoes: st.perms };
});
vi.mock('$lib/services/api', () => ({
  apiFetch: (...args: unknown[]) => st.fetch(...args),
  isCanceledApiError: () => false
}));
vi.mock('$app/stores', async () => {
  const { readable } = await import('svelte/store');
  return { page: readable({ url: new URL('https://vtur.app/relatorios/ranking/placar') }) };
});

import Placar from '../../../routes/(app)/relatorios/ranking/placar/+page.svelte';

const resposta = {
  items: [
    {
      posicao: 1,
      vendedor_id: 'a',
      vendedor_nome: 'Ana',
      total_vendas: 5,
      total_receita: 12000,
      total_seguro: 300,
      alcance_meta: 120,
      meta: 10000,
      tendencia: 'up'
    },
    {
      posicao: 2,
      vendedor_id: 'b',
      vendedor_nome: 'Bruno',
      total_vendas: 3,
      total_receita: 8000,
      total_seguro: 0,
      alcance_meta: 80,
      meta: 10000,
      tendencia: 'down'
    },
    {
      posicao: 3,
      vendedor_id: 'c',
      vendedor_nome: 'Carla',
      total_vendas: 2,
      total_receita: 4000,
      total_seguro: 0,
      alcance_meta: 0,
      meta: 0,
      tendencia: 'stable'
    },
    {
      posicao: 4,
      vendedor_id: 'd',
      vendedor_nome: 'Davi',
      total_vendas: 1,
      total_receita: 1000,
      total_seguro: 0,
      alcance_meta: 10,
      meta: 10000,
      tendencia: 'stable'
    }
  ],
  resumo: {
    meta_mes: 30000,
    meta_seguro: 1000,
    total_receita: 25000,
    total_seguro: 300,
    total_vendas: 11
  }
};

let app: ReturnType<typeof mount> | null = null;
let target: HTMLElement | null = null;

async function montar() {
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(Placar as any, { target, props: { data: {} } });
  flushSync();
  await vi.waitFor(() => expect(document.body.textContent).toContain('Atualizado às'));
  flushSync();
}

beforeEach(() => {
  st.fetch.mockReset();
  st.fetch.mockResolvedValue(resposta);
  st.perms.set({
    ready: true,
    isSystemAdmin: false,
    isMaster: false,
    isGestor: true,
    isVendedor: false
  });
});
afterEach(() => {
  if (app) unmount(app);
  target?.remove();
  app = null;
  vi.useRealTimers();
});

describe('Placar de vendas', () => {
  it('usa a API do ranking do mês e mostra o pódio na ordem da API', async () => {
    await montar();
    const [url, opts] = st.fetch.mock.calls[0];
    expect(url).toBe('/api/v1/relatorios/ranking');
    expect(opts.query.data_inicio).toMatch(/^\d{4}-\d{2}-01$/);
    const podio = [...document.querySelectorAll('ol[aria-label="Pódio"] > li')].map(
      (li) => li.querySelector('p')?.textContent
    );
    expect(podio).toEqual(['Ana', 'Bruno', 'Carla']);
    const equipe = [...document.querySelectorAll('ol[aria-label="Classificação da equipe"] > li')];
    expect(equipe).toHaveLength(4);
    expect(equipe[0].className).toContain('bg-emerald-50');
    expect(equipe[1].className).not.toContain('bg-emerald-50');
  });

  it('totais: percentual do resumo e quantos bateram a meta', async () => {
    await montar();
    const barras = [...document.querySelectorAll('[role="progressbar"]')];
    expect(barras.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Vendas da equipe: 83.3% da meta',
      'Seguro viagem: 30.0% da meta'
    ]);
    expect(document.body.textContent).toMatch(/Bateram a meta\s*1/);
  });

  it('atualiza sozinho a cada minuto com a aba visível; "Atualizar" ignora o cache', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await montar();
    expect(st.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(st.fetch).toHaveBeenCalledTimes(2);
    expect(st.fetch.mock.calls[1][1].noCache).toBe(false);
    const botao = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Atualizar')
    )!;
    botao.click();
    await tick();
    expect(st.fetch).toHaveBeenCalledTimes(3);
    expect(st.fetch.mock.calls[2][1].noCache).toBe(true);
  });

  it('vendedor não vê o placar da equipe', async () => {
    st.perms.set({
      ready: true,
      isSystemAdmin: false,
      isMaster: false,
      isGestor: false,
      isVendedor: true
    });
    target = document.createElement('div');
    document.body.appendChild(target);
    app = mount(Placar as any, { target, props: { data: {} } });
    flushSync();
    expect(document.querySelector('ol[aria-label="Pódio"]')).toBeNull();
    expect(document.body.textContent).toContain('disponível para gestores');
  });
});
