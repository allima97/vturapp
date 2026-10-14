/**
 * Fase 3.5: as abas do roteiro saíram da página para componentes próprios.
 * Estes testes montam cada aba numa página mínima (harness) com os mesmos bind: da página real
 * e conferem que o que a aba altera volta para a página. Sem o bind:, estes testes falham.
 */
import { describe, expect, it } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import OpcionaisHarness from './harness/RoteiroOpcionaisHarness.svelte';
import InvestimentoHarness from './harness/RoteiroInvestimentoHarness.svelte';
import ItinerarioHarness from './harness/RoteiroItinerarioHarness.svelte';

type AnyRecord = Record<string, any>;

function montar(Component: any) {
  let get: () => any = () => undefined;
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Component, { target, props: { expose: (g: () => any) => (get = g) } });
  flushSync();
  const botao = (texto: string, indice = 0) =>
    [...target.querySelectorAll('button')].filter((b) =>
      (b.getAttribute('aria-label') || b.textContent || '').includes(texto)
    )[indice] as HTMLButtonElement;
  const fim = () => {
    unmount(app);
    target.remove();
  };
  return { target, get: () => get(), botao, fim };
}

describe('roteiro: aba Investimento', () => {
  it('adicionar, editar, trocar tipo, mover e remover alteram a lista da página', async () => {
    const t = montar(InvestimentoHarness);
    t.botao('Adicionar linha').click();
    t.botao('Adicionar linha').click();
    flushSync();
    expect(t.get()).toHaveLength(2);

    const valor = t.target.querySelector('input[type="number"]') as HTMLInputElement;
    valor.value = '150';
    valor.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(t.get()[0].valor_por_pessoa).toBe(150);
    expect(t.target.querySelector('[data-testid="total"]')!.textContent).toBe('150');

    const tipo = t.target.querySelector('select') as HTMLSelectElement;
    tipo.value = 'Por casal';
    tipo.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    await tick();
    expect(t.get()[0].tipo).toBe('Por casal');

    t.botao('Mover linha de investimento para baixo', 0).click();
    flushSync();
    expect(t.get()[1].valor_por_pessoa).toBe(150);

    t.botao('Remover linha de investimento', 1).click();
    flushSync();
    expect(t.get()).toHaveLength(1);
    expect(t.get()[0].valor_por_pessoa ?? null).toBe(null);
    t.fim();
  });
});

describe('roteiro: aba Itinerário', () => {
  it('variáveis simples e a lista de dias voltam para a página', () => {
    const t = montar(ItinerarioHarness);
    t.botao('Importar dia a dia').click();
    flushSync();
    expect(t.get()).toMatchObject({ showDiasImport: true, diasImportError: null, diasImportMsg: null } as AnyRecord);

    t.botao('Buscar dias no banco').click();
    flushSync();
    expect(t.get().showDiasBusca).toBe(true);

    t.botao('Adicionar dia').click();
    t.botao('Adicionar dia').click();
    flushSync();
    expect(t.get().dias).toHaveLength(2);

    const cidade = t.target.querySelector('input') as HTMLInputElement;
    cidade.value = 'Lisboa';
    cidade.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(t.get().dias.map((d: AnyRecord) => d.cidade)).toContain('Lisboa');

    t.botao('Remover dia').click();
    flushSync();
    expect(t.get().dias).toHaveLength(1);
    t.fim();
  });
});


describe('roteiro: aba Opcionais', () => {
  it('edita cidades e passeios sem datas e mantém o vínculo com a página', () => {
    const t = montar(OpcionaisHarness);
    t.botao('Adicionar cidade').click();
    flushSync();
    const cidade = t.target.querySelector('input')!;
    cidade.value = 'Barcelona';
    cidade.dispatchEvent(new Event('input', { bubbles: true }));
    t.botao('Adicionar passeio opcional').click();
    flushSync();
    const nome = t.target.querySelectorAll('input')[1];
    nome.value = 'Bairro Gótico';
    nome.dispatchEvent(new Event('input', { bubbles: true }));
    const descricao = t.target.querySelector('textarea')!;
    descricao.value = 'Passeio e jantar';
    descricao.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(t.get()[0]).toEqual({ cidade: 'Barcelona', passeios: [{ nome: 'Bairro Gótico', descricao: 'Passeio e jantar' }] });
    expect(t.target.querySelector('input[type="date"]')).toBeNull();
    t.botao('Adicionar cidade').click();
    flushSync();
    t.botao('Descer cidade').click();
    flushSync();
    expect(t.get()[1].cidade).toBe('Barcelona');
    t.botao('Remover opcional').click();
    flushSync();
    expect(t.get()[1].passeios).toEqual([]);
    t.botao('Remover cidade', 1).click();
    flushSync();
    expect(t.get()).toHaveLength(1);
    t.fim();
  });
});
