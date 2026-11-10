/**
 * Rotas legadas de relatório (vendas-por-*, ranking-vendas) continuam chamando
 * o handler da rota nova com inicio/fim/company_id traduzidos para
 * data_inicio/data_fim/empresa_id — agora direto no módulo Hono.
 */
import { describe, expect, it, vi } from 'vitest';

const seen = vi.hoisted(() => [] as Array<{ name: string; search: string }>);
const spy = vi.hoisted(() => (name: string) => async (event: { url: URL }) => {
  seen.push({ name, search: event.url.search });
  return new Response(name);
});
vi.mock('./ranking', () => ({ handleRelatoriosRankingGet: spy('ranking') }));
vi.mock('./clientes', () => ({ handleRelatoriosClientesGet: spy('clientes') }));
vi.mock('./destinos', () => ({ handleRelatoriosDestinosGet: spy('destinos') }));
vi.mock('./produtos', () => ({ handleRelatoriosProdutosGet: spy('produtos') }));

import { handleRelatoriosRankingVendasGet } from './ranking-vendas';
import { handleRelatoriosVendasPorClienteGet } from './vendas-por-cliente';
import { handleRelatoriosVendasPorDestinoGet } from './vendas-por-destino';
import { handleRelatoriosVendasPorProdutoGet } from './vendas-por-produto';

function ev(qs: string) {
  const url = new URL(`https://vturapp.test/x?${qs}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { url, request: new Request(url), params: {}, locals: {} } as any;
}

describe('relatórios legados → rota nova', () => {
  it.each([
    [handleRelatoriosRankingVendasGet, 'ranking'],
    [handleRelatoriosVendasPorClienteGet, 'clientes'],
    [handleRelatoriosVendasPorDestinoGet, 'destinos'],
    [handleRelatoriosVendasPorProdutoGet, 'produtos']
  ])('%#', async (handler, name) => {
    seen.length = 0;
    const res = await handler(ev('inicio=2026-09-01&fim=2026-09-30&company_id=c1'));
    expect(await res.text()).toBe(name);
    expect(seen).toEqual([
      {
        name,
        search:
          '?inicio=2026-09-01&fim=2026-09-30&company_id=c1&data_inicio=2026-09-01&data_fim=2026-09-30&empresa_id=c1'
      }
    ]);
  });

  it('não sobrescreve data_inicio já informado', async () => {
    seen.length = 0;
    await handleRelatoriosVendasPorClienteGet(ev('inicio=2026-01-01&data_inicio=2025-01-01'));
    expect(seen[0].search).toBe('?inicio=2026-01-01&data_inicio=2025-01-01');
  });
});
