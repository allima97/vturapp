/** Relatório de Performance: tela monta com os dados da API e esconde para quem não é master/gestor. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { montarRelatorioPerformance, type ContribuicaoPerformance } from '$lib/server/performance/performance';

const st = vi.hoisted(() => ({ perms: null as any, fetch: vi.fn() }));
vi.mock('$lib/stores/permissoes', async () => {
  const { writable } = await import('svelte/store');
  st.perms = writable({ ready: true, isSystemAdmin: false, isMaster: true, isGestor: false });
  return { permissoes: st.perms };
});
vi.mock('$lib/services/api', () => ({ apiFetch: (...a: unknown[]) => st.fetch(...a), isCanceledApiError: () => false }));
vi.mock('$app/navigation', () => ({ replaceState: vi.fn(), goto: vi.fn() }));
vi.mock('$app/stores', async () => {
  const { readable } = await import('svelte/store');
  return { page: readable({ url: new URL('https://vtur.app/relatorios/performance') }) };
});

import Pagina from '../../../routes/(app)/relatorios/performance/+page.svelte';

export function exemplo() {
  const vendedores = ['Marcio', 'Lucio', 'Lazaro', 'Anderson', 'Leonardo', 'Karine', 'Daiane', 'Silmara', 'Tatiana', 'Sandra'];
  const produtos = [['Passagem Aérea', 508695], ['Cruzeiro', 343471], ['Top', 330755], ['Hotel', 275936], ['Fretamento', 174505], ['Terrestre', 172433], ['Aéreo + Hotel', 104466], ['Seguro Viagem', 19424]] as const;
  const destinos = [['Brasil', 'Maceió'], ['Brasil', 'Recife'], ['Brasil', 'Natal'], ['United States', 'Orlando'], ['Spain', 'Madri'], ['Portugal', 'Lisboa']];
  const atual: ContribuicaoPerformance[] = [];
  let n = 0;
  for (const [nome, total] of produtos) {
    for (let i = 0; i < 6; i++) {
      const [pais, cidade] = destinos[(n + i) % destinos.length];
      atual.push({ vendaId: `v${n}-${i}`, vendaKey: `v${n}-${i}`, reciboNumero: i === 5 ? 'REXTUR' : `${n}${i}`, vendedorId: vendedores[(n + i) % 10], produtoNome: nome, bruto: total / 6, taxas: 0, destinoPais: pais, destinoCidade: cidade, embarque: `2026-${String(9 + (i % 4)).padStart(2, '0')}-10` });
    }
    n++;
  }
  const passageiros = atual.flatMap((c, i) => [{ vendaId: c.vendaId!, clienteId: `k${i}a`, nascimento: `19${50 + (i % 45)}-03-01` }, { vendaId: c.vendaId!, clienteId: `k${i}b`, nascimento: `19${60 + (i % 35)}-07-01` }]);
  const orc = (i: number) => ({ id: `q${i}`, status: (i % 9 === 0 ? 'fechado' : 'enviado') as any, produtos: [['Hotel', 'Aéreo', 'Aéreo + Hotel', 'Fretamento'][i % 4]], destinoPais: i % 3 ? 'Brasil' : 'Chile', destinoCidade: ['Maceió', 'Porto Seguro', 'Natal', 'Santiago'][i % 4], embarque: `2026-${String(10 + (i % 3)).padStart(2, '0')}-01` });
  return {
    empresa: { id: 'c1', nome: '5630 - LOJA SHOPPING CENTER NORTE', responsavel: 'KATIA NISHIDA' },
    mes: '2026-08',
    dadosAte: '2026-08-30',
    ...montarRelatorioPerformance({
      corte: '2026-08-30', diasNoMes: 31, diasAteCorte: 30, meta: 3_000_000, focoLiquido: false, usarTaxasNaMeta: true,
      nomesVendedores: Object.fromEntries(vendedores.map((v) => [v, v.toUpperCase()])),
      atual, anoAnterior: atual.map((c) => ({ ...c, bruto: c.bruto * 1.4 })), passageiros, passageirosAnoAnterior: passageiros,
      pagamentos: atual.map((c, i) => ({ vendaId: c.vendaId!, forma: ['MASTERCARD', 'VISA', 'MSC CARTÃO', 'DEPÓSITO DA AGÊNCIA', 'BOLETO Agência'][i % 5], valor: c.bruto })),
      orcamentos: Array.from({ length: 60 }, (_, i) => orc(i)), orcamentosMesAnterior: Array.from({ length: 50 }, (_, i) => orc(i)),
    }),
  };
}

let app: ReturnType<typeof mount> | null = null;
let target: HTMLElement | null = null;

beforeEach(() => {
  st.fetch.mockReset();
  st.fetch.mockImplementation(async (url: string) =>
    url.includes('/relatorios/base') ? { empresas: [{ id: 'c1', nome: 'Loja 1' }, { id: 'c2', nome: 'Loja 2' }] } : exemplo()
  );
  st.perms.set({ ready: true, isSystemAdmin: false, isMaster: true, isGestor: false });
});
afterEach(() => {
  if (app) unmount(app);
  target?.remove();
  app = null;
});

async function montar() {
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(Pagina as any, { target, props: { data: {} } });
  flushSync();
}

describe('Relatório de Performance (tela)', () => {
  it('master: escolhe a empresa e vê os blocos do relatório', async () => {
    await montar();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Relatório de Performance ·'));
    const chamada = st.fetch.mock.calls.find((c) => String(c[0]).includes('/performance'))!;
    expect(chamada[1].query).toMatchObject({ company_id: 'c1' });
    const texto = document.body.textContent || '';
    for (const t of ['Filial:', 'Responsável:', 'Venda Mês', 'Meta Mês (até D-1)', '% ICM Mês (total)', 'Passageiros Mês', 'Top 10 Vendedores', 'Faixa Etária', 'Top 5 Formas de Pagamento', 'Business Venda', 'Antecipação de Compra (Nacional)', 'Orçamentos']) {
      expect(texto).toContain(t);
    }
    expect(document.querySelector('#perf-empresa')).toBeTruthy();
    expect(document.querySelectorAll('[role="img"][aria-label^="% ICM"]')).toHaveLength(2);
  });

  it('vendedor: aviso, sem chamar o relatório', async () => {
    st.perms.set({ ready: true, isSystemAdmin: false, isMaster: false, isGestor: false });
    await montar();
    await new Promise((r) => setTimeout(r, 20));
    expect(document.body.textContent).toContain('disponível para master e gestor');
    expect(st.fetch.mock.calls.some((c) => String(c[0]).includes('/relatorios/performance'))).toBe(false);
  });
});
