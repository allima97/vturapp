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
import ServicosHarness from './harness/RoteiroServicosHarness.svelte';
import TabsHarness from './harness/RoteiroTabsHarness.svelte';

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

describe('roteiro: navegação entre abas', () => {
  it('troca o conteúdo ao selecionar outra aba', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const app = mount(TabsHarness, { target });
    flushSync();

    expect(target.querySelector('[data-testid="aba-atual"]')?.textContent).toBe('itinerario');
    const hoteis = [...target.querySelectorAll('[role="tab"]')].find((tab) =>
      tab.textContent?.includes('Hotéis')
    );
    expect(hoteis).toBeDefined();
    hoteis!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(target.querySelector('[data-testid="aba-atual"]')?.textContent).toBe('hoteis');

    unmount(app);
    target.remove();
  });
});

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
  it('mantém os dias recolhidos e permite abrir, editar e fechar sem perder os dados', () => {
    const t = montar(ItinerarioHarness);
    t.botao('Importar dia a dia').click();
    flushSync();
    expect(t.get()).toMatchObject({
      showDiasImport: true,
      diasImportError: null,
      diasImportMsg: null
    } as AnyRecord);

    t.botao('Buscar dias no banco').click();
    flushSync();
    expect(t.get().showDiasBusca).toBe(true);

    t.botao('Adicionar dia').click();
    t.botao('Adicionar dia').click();
    flushSync();
    expect(t.get().dias).toHaveLength(2);

    const dias = [...t.target.querySelectorAll<HTMLDetailsElement>('details')];
    expect(dias.map((dia) => dia.open)).toEqual([false, false]);
    expect(dias[0].querySelector('summary')!.textContent).toContain('Dia 1');
    expect(dias[1].querySelector('summary')!.textContent).toContain('Dia 2');
    dias[0].querySelector('summary')!.click();
    expect(dias[0].open).toBe(true);
    expect(dias[0].querySelector('summary')!.textContent).toContain('−');

    const cidade = t.target.querySelector('input') as HTMLInputElement;
    cidade.value = 'Lisboa';
    cidade.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(t.get().dias.map((d: AnyRecord) => d.cidade)).toContain('Lisboa');

    const percurso = t.target.querySelectorAll('input')[1] as HTMLInputElement;
    percurso.value = 'São Paulo - Roma';
    percurso.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(t.get().dias[0].percurso).toBe('São Paulo - Roma');
    expect(dias[0].querySelector('summary')!.textContent).toContain('São Paulo - Roma');

    dias[0].querySelector('summary')!.click();
    expect(dias[0].open).toBe(false);
    dias[0].querySelector('summary')!.click();
    expect((t.target.querySelector('input') as HTMLInputElement).value).toBe('Lisboa');
    expect(dias[0].querySelector('summary')!.textContent).toContain('São Paulo - Roma');

    t.botao('Remover dia').click();
    flushSync();
    expect(t.get().dias).toHaveLength(1);
    t.fim();
  });
});

describe('roteiro: abas Hotéis, Passeios e Aéreo', () => {
  it('inicia os itens recolhidos, mostra os nomes e permite expandir e recolher', () => {
    const t = montar(ServicosHarness);
    const paineis = [...t.target.querySelectorAll<HTMLDetailsElement>('details')];

    expect(paineis).toHaveLength(3);
    expect(paineis.map((painel) => painel.open)).toEqual([false, false, false]);
    expect(paineis[0].querySelector('summary')!.textContent).toContain('Hotel Ciutat Vella');
    expect(paineis[1].querySelector('summary')!.textContent).toContain('Sagrada Família');
    expect(paineis[2].querySelector('summary')!.textContent).toContain('GRU → LIS');

    for (const painel of paineis) {
      expect(painel.querySelector('.indicador-mais')).not.toBeNull();
      expect(painel.querySelector('.indicador-menos')).not.toBeNull();
      painel.querySelector('summary')!.click();
      expect(painel.open).toBe(true);
      painel.querySelector('summary')!.click();
      expect(painel.open).toBe(false);
    }

    paineis[1].querySelector('summary')!.click();
    const ingressos = [...paineis[1].querySelectorAll('select')].find((select) =>
      [...select.options].some((option) => option.value === 'Incluído')
    )!;
    expect(ingressos.value).toBe('Não incluído');
    expect([...ingressos.options].map((option) => option.value)).toEqual([
      'Incluído',
      'Não incluído'
    ]);
    ingressos.value = 'Incluído';
    ingressos.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(t.get().passeios[0].ingressos).toBe('Incluído');
    paineis[1].querySelector('summary')!.click();

    t.botao('Adicionar hotel').click();
    t.botao('Adicionar passeio').click();
    t.botao('Adicionar trecho').click();
    flushSync();
    const todosPaineis = [...t.target.querySelectorAll<HTMLDetailsElement>('details')];
    const novosPaineis = [todosPaineis[1], todosPaineis[3], todosPaineis[5]];
    expect(novosPaineis.map((painel) => painel.open)).toEqual([false, false, false]);
    expect(novosPaineis.map((painel) => painel.querySelector('summary')!.textContent)).toEqual([
      expect.stringContaining('Hotel 2'),
      expect.stringContaining('Passeio 2'),
      expect.stringContaining('Trecho 2')
    ]);
    const novosIngressos = [...novosPaineis[1].querySelectorAll('select')].find((select) =>
      [...select.options].some((option) => option.value === 'Incluído')
    )!;
    expect(novosIngressos.value).toBe('Não incluído');

    t.fim();
  });
});

describe('roteiro: aba Opcionais', () => {
  it('inicia com cidades e passeios existentes recolhidos e mantém os dados ao fechar', async () => {
    const target = document.createElement('div');
    let get = () => [] as { cidade: string; passeios: { nome: string; descricao: string }[] }[];
    const app = mount(OpcionaisHarness, {
      target,
      props: {
        expose: (value) => (get = value),
        inicial: [
          {
            cidade: 'Lisboa',
            passeios: [
              { nome: 'Belém', descricao: 'Passeio pelo bairro' },
              { nome: 'Sintra', descricao: 'Visita aos palácios' }
            ]
          },
          { cidade: 'Porto', passeios: [{ nome: 'Ribeira', descricao: 'Passeio à beira-rio' }] }
        ]
      }
    });
    flushSync();
    const cidades = [...target.querySelectorAll<HTMLDetailsElement>(':scope > * details')].filter(
      (painel) => !painel.parentElement?.closest('details')
    );
    expect(cidades).toHaveLength(2);
    expect(cidades.map((cidade) => cidade.open)).toEqual([false, false]);
    expect(cidades[0].querySelector('summary')!.textContent).toContain('Lisboa (+2)');
    expect(cidades[1].querySelector('summary')!.textContent).toContain('Porto (+1)');
    cidades[0].querySelector('summary')!.click();
    const passeios = [...cidades[0].querySelectorAll('details')];
    expect(passeios.map((passeio) => passeio.open)).toEqual([false, false]);
    expect(passeios[0].querySelector('summary')!.textContent).toContain('Belém');
    passeios[0].querySelector('summary')!.click();
    expect(passeios[0].open).toBe(true);
    cidades[0].querySelector('summary')!.click();
    expect(cidades[0].open).toBe(false);
    expect(get()[0].passeios[0]).toEqual({ nome: 'Belém', descricao: 'Passeio pelo bairro' });
    await unmount(app);
  });

  it('edita cidades e passeios sem datas e mantém o vínculo com a página', () => {
    const t = montar(OpcionaisHarness);
    t.botao('Adicionar cidade').click();
    flushSync();
    const cidadePainel = t.target.querySelector('details')!;
    expect(cidadePainel.open).toBe(false);
    cidadePainel.querySelector('summary')!.click();
    expect(cidadePainel.open).toBe(true);
    const cidade = t.target.querySelector('input')!;
    cidade.value = 'Barcelona';
    cidade.dispatchEvent(new Event('input', { bubbles: true }));
    t.botao('Adicionar passeio opcional').click();
    flushSync();
    expect(cidadePainel.querySelector('summary')!.textContent).toContain('Barcelona (+1)');
    const passeioPainel = cidadePainel.querySelector('details')!;
    expect(passeioPainel.open).toBe(false);
    passeioPainel.querySelector('summary')!.click();
    expect(passeioPainel.open).toBe(true);
    const nome = t.target.querySelectorAll('input')[1];
    nome.value = 'Bairro Gótico';
    nome.dispatchEvent(new Event('input', { bubbles: true }));
    const descricao = t.target.querySelector('textarea')!;
    descricao.value = 'Passeio e jantar';
    descricao.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(t.get()[0]).toEqual({
      cidade: 'Barcelona',
      passeios: [{ nome: 'Bairro Gótico', descricao: 'Passeio e jantar' }]
    });
    expect(t.target.querySelector('input[type="date"]')).toBeNull();
    expect(passeioPainel.querySelector('summary')!.textContent).toContain('Bairro Gótico');
    passeioPainel.querySelector('summary')!.click();
    expect(passeioPainel.open).toBe(false);
    passeioPainel.querySelector('summary')!.click();
    expect(passeioPainel.open).toBe(true);
    t.botao('Adicionar cidade').click();
    flushSync();
    t.botao('Descer cidade').click();
    flushSync();
    expect(t.get()[1].cidade).toBe('Barcelona');
    expect(t.target.querySelectorAll('details')[1]).toBe(cidadePainel);
    expect(cidadePainel.open).toBe(true);
    expect(passeioPainel.open).toBe(true);
    t.botao('Remover opcional').click();
    flushSync();
    expect(t.get()[1].passeios).toEqual([]);
    t.botao('Remover cidade').click();
    flushSync();
    expect(t.get()).toHaveLength(1);
    t.fim();
  });
});
