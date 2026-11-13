import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const api = vi.hoisted(() => ({
  fetch: vi.fn(),
  url: 'https://example.test/operacao/passagens',
  subscribers: new Set<(value: { url: URL }) => void>(),
  extrair: vi.fn(),
  confirmar: vi.fn(),
  navigate(url: string) {
    this.url = new URL(url, this.url).href;
    for (const subscriber of this.subscribers) subscriber({ url: new URL(this.url) });
  }
}));
vi.mock('$lib/passagens/arquivo', () => ({ extrairTextoArquivo: api.extrair }));
vi.mock('$lib/airportCodeCityLookup', () => ({
  loadAirportCodeCityLookup: async () => ({ MCO: 'Orlando', GRU: 'São Paulo' })
}));
vi.mock('$app/stores', () => ({
  page: {
    subscribe: (run: (value: { url: URL }) => void) => {
      api.subscribers.add(run);
      run({ url: new URL(api.url) });
      return () => api.subscribers.delete(run);
    }
  }
}));
vi.mock('$app/navigation', () => ({
  goto: async (url: string) => api.navigate(url)
}));
vi.mock('$lib/services/api', async (original) => ({
  ...(await original<typeof import('$lib/services/api')>()),
  apiFetch: api.fetch
}));
vi.mock('$lib/stores/confirm', () => ({ confirmAction: api.confirmar }));
import Passagens from '../../../routes/(app)/operacao/passagens/+page.svelte';

function click(target: HTMLElement, label: string) {
  const found = [...target.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === label
  );
  if (!found) throw new Error(`Botão ${label} não encontrado`);
  found.click();
  flushSync();
}

function abrirPrimeiraPassagem(target: HTMLElement) {
  const row = target.querySelector<HTMLTableRowElement>('tbody tr');
  if (!row) throw new Error('Cartão de passagem não encontrado');
  row.click();
  flushSync();
}

afterEach(() => {
  api.fetch.mockReset();
  api.extrair.mockReset();
  api.confirmar.mockReset();
  api.url = 'https://example.test/operacao/passagens';
  document.body.replaceChildren();
});

it('abre o cartão pelo teclado e permite excluir nos detalhes', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  let excluida = false;
  api.confirmar.mockResolvedValue(true);
  api.fetch.mockImplementation(async (_path, options) => {
    if (options.method === 'DELETE') {
      excluida = true;
      return {};
    }
    if (options.query?.id) {
      return { item: { id, localizador: 'ABC123', emissao: '', trechos: [], passageiros: [] } };
    }
    return {
      items: excluida
        ? []
        : [
            {
              id,
              localizador: 'ABC123',
              primeiroPassageiro: 'Maria Exemplo',
              quantidadePassageiros: 2,
              dataVoo: '2027-01-27',
              rota: [{ origem: 'MCO', destino: 'GRU' }]
            }
          ]
    };
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  try {
    await vi.waitFor(() => expect(target.querySelector('tbody tr')).not.toBeNull());
    const row = target.querySelector<HTMLTableRowElement>('tbody tr')!;
    expect(row.textContent).toContain('MARIA EXEMPLO');
    expect(row.textContent).toContain('27/01/2027');
    expect(row.querySelector('button')).toBeNull();
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    flushSync();
    await vi.waitFor(() =>
      expect(target.querySelector<HTMLInputElement>('#passagem-localizador')?.value).toBe('ABC123')
    );
    expect(target.textContent).toContain('Editar');
    expect(target.textContent).toContain('Gerar comprovante');
    click(target, 'Excluir passagem');
    await vi.waitFor(() => expect(target.textContent).toContain('Nenhuma passagem salva.'));
    expect(api.confirmar).toHaveBeenCalledOnce();
    expect(api.fetch).toHaveBeenCalledWith(
      '/api/v1/passagens',
      expect.objectContaining({ method: 'DELETE', query: { id } })
    );
    expect(new URL(api.url).pathname).toBe('/operacao/passagens');
    expect(new URL(api.url).search).toBe('');
  } finally {
    await unmount(app);
  }
});

it('mostra o ícone de adição nos botões de criação e mantém suas ações', async () => {
  api.fetch.mockResolvedValue({ items: [] });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  try {
    await vi.waitFor(() => expect(target.textContent).toContain('Nenhuma passagem salva.'));
    const button = (label: string) =>
      [...target.querySelectorAll('button')].find((item) => item.textContent?.trim() === label)!;
    expect(button('Nova passagem').querySelector('svg')).not.toBeNull();
    click(target, 'Nova passagem');
    for (const label of ['Adicionar trecho', 'Adicionar passageiro']) {
      expect(button(label).querySelector('svg')).not.toBeNull();
      click(target, label);
    }
    expect(target.textContent).toContain('Trecho 1');
    expect(target.textContent).toContain('Passageiro 1');
  } finally {
    await unmount(app);
  }
});

it('preserva nome e sobrenome CVC na revisão e no salvamento', async () => {
  api.fetch.mockImplementation(async (_path, options) =>
    options.method === 'POST' ? { id: '00000000-0000-4000-8000-000000000001' } : { items: [] }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() => expect(target.textContent).toContain('Nenhuma passagem salva.'));
  click(target, 'Nova passagem');
  const text = target.querySelector<HTMLTextAreaElement>('#texto-reserva')!;
  text.value = `RESERVA CIA. AÉREA
CM - COMPANHIA EXEMPLO   ABC123   HST
TRECHOS
CM 841 GRU - GUARULHOS 15/01/2027 01:30 PTY - PANAMA CITY 15/01/2027 06:17 Economy Classic
PASSAGEIROS
Nome\tSobrenome\tTipo\tData de Nascimento
MARIA\tSILVA EXEMPLO\tADT\t4.228,86\t25/01/1951
CONTRATANTE`;
  text.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  click(target, 'Analisar texto');
  await vi.waitFor(() =>
    expect(target.querySelector<HTMLInputElement>('#passageiro-0')?.value).toBe(
      'MARIA SILVA EXEMPLO'
    )
  );
  click(target, 'Salvar passagem');
  await vi.waitFor(() =>
    expect(api.fetch).toHaveBeenCalledWith(
      '/api/v1/passagens',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          passageiros: [expect.objectContaining({ nome: 'MARIA SILVA EXEMPLO' })]
        })
      })
    )
  );
  await unmount(app);
});

it('permite revisar e salvar um roteiro CVC sem atribuir tipos desconhecidos', async () => {
  api.fetch.mockImplementation(async (_path, options) =>
    options.method === 'POST' ? { id: '00000000-0000-4000-8000-000000000001' } : { items: [] }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() => expect(target.textContent).toContain('Nenhuma passagem salva.'));
  click(target, 'Nova passagem');
  const text = target.querySelector<HTMLTextAreaElement>('#texto-reserva')!;
  text.value = `Consulta de Roteiro e Reserva
Fornecedores
1234567 Gol CLASSE TURÍSTICA (A/A) 1234 - MCO/MIA
Dados da Reserva
Passageiros Sobrenome Nome Nascimento Sexo Idade Local de Embarque Observação
Silva\tMaria\t25/01/1951\tFeminino\t76\tMCO Dados Pessoais
Voo CVC Cia.
G3 6064 MCO MIA 27/01/2027 20:04 27/01/2027 21:24 ABC123 ABC123 05/11/2026 CLASSIC
Reserva de Passagens Aéreas
Orçamento`;
  text.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  click(target, 'Analisar texto');
  await vi.waitFor(() =>
    expect(target.querySelector<HTMLInputElement>('#passageiro-0')?.value).toBe('MARIA SILVA')
  );
  expect(target.textContent).toContain('O roteiro não informa o tipo de passageiro');
  click(target, 'Salvar passagem');
  await vi.waitFor(() =>
    expect(api.fetch).toHaveBeenCalledWith(
      '/api/v1/passagens',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          localizador: 'ABC123',
          passageiros: [expect.objectContaining({ nome: 'MARIA SILVA', tipo: '' })],
          trechos: [expect.objectContaining({ voo: 'G3 6064', companhia: 'Gol' })]
        })
      })
    )
  );
  await unmount(app);
});

it.each(['application/pdf', 'image/png'])(
  'exige revisão dos dados antes de salvar arquivo %s',
  async (tipo) => {
    api.fetch.mockImplementation(async (_path, options) =>
      options.method === 'POST' ? { id: '00000000-0000-4000-8000-000000000001' } : { items: [] }
    );
    api.extrair.mockResolvedValue(
      'LOC: ABC123\nsegmentos\nCompanhia Exemplo XY 123 12/11/2026 - 15:00 12/11/2026 - 16:19 HK AAA - Aaa BBB - Bbb E90 01:19 W\npassageiros\nADT\tEXEMPLO\tMARIA\tFeminino\tEmitida'
    );
    const target = document.createElement('div');
    document.body.appendChild(target);
    const app = mount(Passagens, { target });
    await vi.waitFor(() => expect(target.textContent).toContain('Nenhuma passagem salva.'));
    click(target, 'Nova passagem');
    const entrada = target.querySelector<HTMLInputElement>('#arquivo-reserva')!;
    const file = new File(['teste'], tipo === 'application/pdf' ? 'reserva.pdf' : 'reserva.png', {
      type: tipo
    });
    Object.defineProperty(entrada, 'files', { configurable: true, value: [file] });
    entrada.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    click(target, 'Extrair texto do arquivo');
    await vi.waitFor(() =>
      expect(target.querySelector<HTMLTextAreaElement>('#texto-reserva')?.value).toContain('ABC123')
    );
    expect(api.extrair).toHaveBeenCalledWith(file, expect.any(Function));
    click(target, 'Analisar texto');
    await vi.waitFor(() => expect(target.textContent).toContain('Revisei e confirmei'));
    click(target, 'Salvar passagem');
    expect(api.fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
    const confirmacao = target.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    confirmacao.click();
    flushSync();
    click(target, 'Salvar passagem');
    await vi.waitFor(() =>
      expect(api.fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(true)
    );
    await unmount(app);
  }
);

it('informa falha de leitura sem modificar os dados da passagem', async () => {
  api.fetch.mockResolvedValue({ items: [] });
  api.extrair.mockRejectedValue(new Error('Arquivo ilegível'));
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() => expect(target.textContent).toContain('Nenhuma passagem salva.'));
  click(target, 'Nova passagem');
  const localizador = target.querySelector<HTMLInputElement>('#passagem-localizador')!;
  localizador.value = 'ABC123';
  localizador.dispatchEvent(new Event('input', { bubbles: true }));
  const entrada = target.querySelector<HTMLInputElement>('#arquivo-reserva')!;
  Object.defineProperty(entrada, 'files', {
    configurable: true,
    value: [new File(['inválido'], 'reserva.pdf', { type: 'application/pdf' })]
  });
  entrada.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  click(target, 'Extrair texto do arquivo');
  await vi.waitFor(() =>
    expect(target.querySelector('[role=alert]')?.textContent).toContain('Arquivo ilegível')
  );
  expect(localizador.value).toBe('ABC123');
  expect(target.querySelector('input[type=checkbox]')).toBeNull();
  await unmount(app);
});

it('permite importar, revisar, salvar e abrir comprovante', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  let saved: Record<string, unknown> = {};
  api.fetch.mockImplementation(async (_path, options) => {
    if (options.method === 'POST') {
      saved = options.body;
      return { id };
    }
    return options.query?.id ? { item: { ...saved, id } } : { items: [] };
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() => expect(target.textContent).toContain('Nenhuma passagem salva.'));
  click(target, 'Nova passagem');
  const importacao = target.querySelector<HTMLDetailsElement>('.importacao-editavel')!;
  expect(importacao.open).toBe(false);
  importacao.open = true;
  const text = target.querySelector<HTMLTextAreaElement>('#texto-reserva')!;
  text.value =
    'LOC: ABC123\nsegmentos\nCompanhia Exemplo XY 123 12/11/2026 - 15:00 12/11/2026 - 16:19 HK AAA - Aaa BBB - Bbb E90 01:19 W\npassageiros\nADT\tSOBRENOME EXEMPLO\tMARIA\tFeminino\tEmitida\nassentos\nSOBRENOME EXEMPLO/MARIA\t17D';
  text.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  click(target, 'Analisar texto');
  importacao.open = false;
  await vi.waitFor(() =>
    expect(target.querySelector<HTMLInputElement>('#passageiro-0')?.value).toBe(
      'SOBRENOME EXEMPLO, MARIA'
    )
  );
  expect(target.querySelector<HTMLDetailsElement>('.passageiro-editavel')?.open).toBe(false);
  importacao.open = true;
  expect(text.value).toContain('LOC: ABC123');
  const detalhes = target.querySelector<HTMLDetailsElement>('.trecho-editavel')!;
  expect(detalhes.open).toBe(false);
  detalhes.open = true;
  const origem = target.querySelector<HTMLInputElement>('#origem-0')!;
  origem.value = 'gru';
  origem.dispatchEvent(new Event('input', { bubbles: true }));
  const destino = target.querySelector<HTMLInputElement>('#destino-0')!;
  destino.value = 'lIs';
  destino.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(origem.value).toBe('GRU');
  expect(destino.value).toBe('LIS');
  detalhes.open = false;
  detalhes.open = true;
  expect(origem.value).toBe('GRU');
  expect(target.querySelector<HTMLInputElement>('#assento-0-0')?.value).toBe('17D');
  const cidade = target.querySelector<HTMLInputElement>('#cidade-origem-0')!;
  cidade.value = 'Cidade Exemplo';
  cidade.dispatchEvent(new Event('input', { bubbles: true }));
  const duracao = target.querySelector<HTMLInputElement>('#duracao-0')!;
  duracao.value = '1019';
  duracao.dispatchEvent(new Event('input', { bubbles: true }));
  const tarifa = target.querySelector<HTMLInputElement>('#tarifa-0')!;
  tarifa.value = 'Personalizada';
  tarifa.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(duracao.value).toBe('10:19');
  expect(
    [...target.querySelectorAll('#classe-0-list option')].map((e) => e.getAttribute('value'))
  ).toEqual(['Econômica', 'Econômica Premium', 'Executiva', 'Primeira Classe']);
  expect(
    [...target.querySelectorAll('#tarifa-0-list option')].map((e) => e.getAttribute('value'))
  ).toEqual(['Light', 'Standard', 'FULL', 'Classic']);
  click(target, 'Salvar passagem');
  await vi.waitFor(() =>
    expect(api.fetch).toHaveBeenCalledWith(
      '/api/v1/passagens',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          localizador: 'ABC123',
          trechos: [
            expect.objectContaining({
              cidadeOrigem: 'Cidade Exemplo',
              origem: 'GRU',
              destino: 'LIS',
              duracao: '10:19',
              tarifa: 'Personalizada'
            })
          ],
          passageiros: [
            expect.objectContaining({
              nome: 'SOBRENOME EXEMPLO, MARIA',
              tipo: 'ADT',
              assentos: ['17D']
            })
          ]
        })
      })
    )
  );
  await vi.waitFor(() => expect(target.textContent).toContain('Gerar comprovante'));
  expect(target.querySelector('#texto-reserva')).toBeNull();
  expect(
    target.querySelector<HTMLInputElement>('#passagem-localizador')?.matches(':disabled')
  ).toBe(true);
  const comprovante = [...target.querySelectorAll('a')].find(
    (link) => link.textContent?.trim() === 'Gerar comprovante'
  )!;
  expect(comprovante.getAttribute('href')).toBe(
    '/operacao/passagens/comprovante?id=00000000-0000-4000-8000-000000000001&origem=edicao'
  );
  expect(comprovante.getAttribute('target')).toBeNull();
  api.navigate('/operacao/passagens');
  flushSync();
  click(target, 'Nova passagem');
  expect(target.querySelector<HTMLInputElement>('#passagem-localizador')?.value).toBe('');
  expect(target.textContent).not.toContain('Gerar comprovante');
  await unmount(app);
});

it('abre o comprovante de passagem salva na mesma aba', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  api.fetch.mockImplementation(async (_path, options) =>
    options.query?.id
      ? { item: { id, localizador: 'ABC123', emissao: '', trechos: [], passageiros: [] } }
      : { items: [{ id, localizador: 'ABC123' }] }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() => expect(target.querySelector('tbody tr')).not.toBeNull());
  expect(target.querySelector('#passagem-localizador')).toBeNull();
  abrirPrimeiraPassagem(target);
  await vi.waitFor(() => expect(target.querySelector('#passagem-localizador')).not.toBeNull());
  const comprovante = [...target.querySelectorAll('a')].find(
    (link) => link.textContent?.trim() === 'Gerar comprovante'
  )!;
  expect(comprovante.getAttribute('href')).toBe(
    `/operacao/passagens/comprovante?id=${id}&origem=edicao`
  );
  expect(comprovante.getAttribute('target')).toBeNull();
  await unmount(app);
});

it('mostra passageiro, quantidade, data e rota na lista sem inventar conexões', async () => {
  api.fetch.mockResolvedValue({
    items: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        localizador: 'ABC123',
        primeiroPassageiro: 'José Exemplo',
        quantidadePassageiros: 4,
        dataVoo: '2027-01-27T20:04',
        rota: [
          { origem: 'MCO', destino: 'MIA', cidadeOrigem: 'Orlando', cidadeDestino: 'Miami' },
          { origem: 'MIA', destino: 'GRU', cidadeDestino: 'São Paulo' }
        ]
      },
      {
        id: '00000000-0000-4000-8000-000000000002',
        localizador: 'DEF456',
        primeiroPassageiro: 'Ana Exemplo',
        quantidadePassageiros: 1,
        dataVoo: '2027-01-28T10:00',
        rota: [
          { origem: 'AAA', destino: 'BBB' },
          { origem: 'CCC', destino: 'DDD' }
        ]
      },
      {
        id: '00000000-0000-4000-8000-000000000003',
        localizador: 'GHI789',
        primeiroPassageiro: 'Maria Exemplo',
        quantidadePassageiros: 2,
        dataVoo: '2027-01-30T10:00',
        rota: [
          { origem: 'MCO', destino: 'GRU' },
          { origem: 'GRU', destino: 'MCO' }
        ]
      },
      {
        id: '00000000-0000-4000-8000-000000000004',
        localizador: 'JKL012',
        primeiroPassageiro: '',
        quantidadePassageiros: 0,
        dataVoo: '2027-02-30T10:00',
        rota: []
      }
    ]
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() => expect(target.querySelectorAll('tbody tr')).toHaveLength(4));
  const cells = (index: number) =>
    [...target.querySelectorAll('tbody tr')[index].querySelectorAll('td')].map((cell) =>
      cell.textContent?.trim()
    );
  expect(cells(0)).toEqual(['ABC123', 'JOSÉ EXEMPLO', '04', '27/01/2027', 'Orlando / São Paulo']);
  expect(cells(1)).toEqual(['DEF456', 'ANA EXEMPLO', '01', '28/01/2027', 'AAA / BBB e CCC / DDD']);
  await vi.waitFor(() =>
    expect(cells(2)).toEqual(['GHI789', 'MARIA EXEMPLO', '02', '30/01/2027', 'Orlando / São Paulo'])
  );
  expect(cells(3)).toEqual([
    'JKL012',
    'Passageiro não informado',
    '00',
    'Data não informada',
    'Rota não informada'
  ]);
  await unmount(app);
});

it('mostra apenas a lista ao retornar para Passagem após abrir uma passagem', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  api.fetch.mockImplementation(async (_path, options) =>
    options.query?.id
      ? { item: { id, localizador: 'ABC123', emissao: '', trechos: [], passageiros: [] } }
      : {
          items: [
            { id, localizador: 'ABC123' },
            { id: '00000000-0000-4000-8000-000000000002', localizador: 'DEF456' }
          ]
        }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() => expect(target.querySelector('tbody tr')).not.toBeNull());
  abrirPrimeiraPassagem(target);
  expect(target.textContent).not.toContain('Passagens salvas');
  expect(target.querySelector('tbody tr')).toBeNull();
  await vi.waitFor(() =>
    expect(target.querySelector<HTMLInputElement>('#passagem-localizador')?.value).toBe('ABC123')
  );
  expect(target.textContent).not.toContain('Passagens salvas');
  expect(target.textContent).not.toContain('DEF456');
  const voltar = [...target.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'Voltar');
  expect(voltar?.getAttribute('href')).toBe('/operacao/passagens');
  api.navigate('/operacao/passagens');
  flushSync();
  expect(target.querySelector('#passagem-localizador')).toBeNull();
  expect(target.textContent).toContain('ABC123');
  expect(target.textContent).toContain('DEF456');
  await unmount(app);
});

it('retorna ao comprovante ao editar a partir dele', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  api.navigate(`/operacao/passagens?editar=${id}&origem=comprovante`);
  api.fetch.mockImplementation(async (_path, options) =>
    options.query?.id
      ? { item: { id, localizador: 'ABC123', emissao: '', trechos: [], passageiros: [] } }
      : { items: [] }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() => expect(target.querySelector('#passagem-localizador')).not.toBeNull());
  expect(target.textContent).not.toContain('Passagens salvas');
  const voltar = [...target.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'Voltar');
  expect(voltar?.getAttribute('href')).toBe(`/operacao/passagens/comprovante?id=${id}`);
  await unmount(app);
});

it('abre passagem salva bloqueada e desbloqueia somente até salvar', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  api.navigate(`/operacao/passagens?editar=${id}`);
  api.fetch.mockImplementation(async (_path, options) => {
    if (options.method === 'POST') return { id };
    if (options.query?.id)
      return {
        item: {
          id,
          localizador: 'ABC123',
          emissao: '2027-01-15',
          trechos: [
            {
              companhia: 'Exemplo',
              voo: 'XY 123',
              origem: 'AAA',
              destino: 'BBB',
              saida: '2027-01-15T10:00',
              chegada: '2027-01-15T12:00',
              status: '',
              duracao: '',
              classe: '',
              tarifa: ''
            }
          ],
          passageiros: [
            { nome: 'Maria Exemplo', tipo: 'ADT', bilhete: '123', status: '', assentos: ['12A'] }
          ]
        }
      };
    return { items: [] };
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() => expect(target.querySelector('#passageiro-0')).not.toBeNull());
  expect(target.querySelector<HTMLInputElement>('#passageiro-0')?.value).toBe('MARIA EXEMPLO');
  expect(target.querySelector('.importacao-editavel')).toBeNull();
  const localizador = target.querySelector<HTMLInputElement>('#passagem-localizador')!;
  const emissao = target.querySelector<HTMLInputElement>('#passagem-emissao')!;
  expect(localizador.closest('fieldset')).toBe(emissao.closest('fieldset'));
  expect(localizador.closest('fieldset')?.className).toContain('grid-cols-2');
  for (const selector of [
    '#passagem-localizador',
    '#passagem-emissao',
    '#companhia-0',
    '#classe-0',
    '#passageiro-0',
    '#tipo-passageiro-0',
    '#assento-0-0'
  ]) {
    expect(target.querySelector(selector)?.matches(':disabled')).toBe(true);
  }
  expect(target.textContent).not.toContain('Adicionar passageiro');
  expect(target.textContent).not.toContain('Remover trecho');
  click(target, 'Editar');
  expect(target.querySelector('.importacao-editavel')).toBeNull();
  expect(localizador.matches(':disabled')).toBe(false);
  expect(target.querySelector('#assento-0-0')?.matches(':disabled')).toBe(false);
  localizador.value = 'DEF456';
  localizador.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  click(target, 'Salvar passagem');
  await vi.waitFor(() => expect(target.textContent).toContain('Dados da passagem'));
  expect(
    target.querySelector<HTMLInputElement>('#passagem-localizador')?.matches(':disabled')
  ).toBe(true);
  expect(target.querySelector<HTMLInputElement>('#passagem-localizador')?.value).toBe('DEF456');
  expect(api.fetch).toHaveBeenCalledWith(
    '/api/v1/passagens',
    expect.objectContaining({
      method: 'POST',
      body: expect.objectContaining({
        id,
        localizador: 'DEF456',
        passageiros: [expect.objectContaining({ assentos: ['12A'] })]
      })
    })
  );
  expect(target.textContent).not.toContain('Salvar passagem');
  await unmount(app);
});

it('converte nome digitado em maiúsculas preservando acentos e posição do cursor', async () => {
  api.fetch.mockResolvedValue({ items: [] });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() => expect(target.textContent).toContain('Nenhuma passagem salva.'));
  click(target, 'Nova passagem');
  click(target, 'Adicionar passageiro');
  const input = target.querySelector<HTMLInputElement>('#passageiro-0')!;
  input.value = 'josé silva';
  input.setSelectionRange(4, 4);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(input.value).toBe('JOSÉ SILVA');
  expect(input.selectionStart).toBe(4);
  expect(target.querySelector('.passageiro-editavel summary')?.textContent).toContain('JOSÉ SILVA');
  await unmount(app);
});

it('mantém a edição aberta quando o salvamento falha', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  api.navigate(`/operacao/passagens?editar=${id}`);
  api.fetch.mockImplementation(async (_path, options) => {
    if (options.method === 'POST') throw new Error('Falha ao salvar');
    if (options.query?.id)
      return { item: { id, localizador: 'ABC123', emissao: '', trechos: [], passageiros: [] } };
    return { items: [] };
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() => expect(target.querySelector('#passagem-localizador')).not.toBeNull());
  click(target, 'Editar');
  click(target, 'Salvar passagem');
  await vi.waitFor(() =>
    expect(
      target.querySelector<HTMLInputElement>('#passagem-localizador')?.matches(':disabled')
    ).toBe(false)
  );
  expect(target.textContent).toContain('Salvar passagem');
  await unmount(app);
});

it('exibe erro e retorno sem apresentar a lista se falhar ao abrir passagem', async () => {
  api.navigate('/operacao/passagens?editar=inexistente');
  api.fetch.mockImplementation(async (_path, options) => {
    if (options.query?.id) throw new Error('Passagem indisponível');
    return { items: [] };
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() =>
    expect(target.querySelector('[role=alert]')?.textContent).toContain('Passagem indisponível')
  );
  expect(target.textContent).not.toContain('Passagens salvas');
  expect(
    [...target.querySelectorAll('a')]
      .find((a) => a.textContent?.trim() === 'Voltar')
      ?.getAttribute('href')
  ).toBe('/operacao/passagens');
  await unmount(app);
});

it('não reabre o formulário se a consulta da passagem terminar após voltar à lista', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  let concluir: (value: unknown) => void = () => {};
  const resposta = new Promise((resolve) => {
    concluir = resolve;
  });
  api.fetch.mockImplementation(async (_path, options) =>
    options.query?.id ? resposta : { items: [{ id, localizador: 'ABC123' }] }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() => expect(target.querySelector('tbody tr')).not.toBeNull());
  abrirPrimeiraPassagem(target);
  api.navigate('/operacao/passagens');
  flushSync();
  concluir({ item: { id, localizador: 'ABC123', emissao: '', trechos: [], passageiros: [] } });
  await resposta;
  await new Promise((resolve) => setTimeout(resolve, 0));
  flushSync();
  expect(target.querySelector('#passagem-localizador')).toBeNull();
  await unmount(app);
});

it('mantém os avisos de análise visíveis com a importação fechada', async () => {
  api.fetch.mockResolvedValue({ items: [] });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() => expect(target.textContent).toContain('Nenhuma passagem salva.'));
  click(target, 'Nova passagem');
  const importacao = target.querySelector<HTMLDetailsElement>('.importacao-editavel')!;
  importacao.open = true;
  const text = target.querySelector<HTMLTextAreaElement>('#texto-reserva')!;
  text.value = 'Texto sem reserva reconhecida';
  text.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  click(target, 'Analisar texto');
  await vi.waitFor(() => expect(target.textContent).toContain('Localizador não reconhecido'));
  importacao.open = false;
  const aviso = [...target.querySelectorAll('[role="status"]')].find((item) =>
    item.textContent?.includes('Localizador não reconhecido')
  );
  expect(aviso).toBeDefined();
  expect(importacao.contains(aviso!)).toBe(false);
  await unmount(app);
});

it('permite abrir e fechar passageiros preservando seus dados', async () => {
  api.fetch.mockImplementation(async (_path, options) =>
    options.method === 'POST' ? { id: '00000000-0000-4000-8000-000000000001' } : { items: [] }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() => expect(target.textContent).toContain('Nenhuma passagem salva.'));
  click(target, 'Nova passagem');
  click(target, 'Adicionar trecho');
  click(target, 'Adicionar passageiro');
  click(target, 'Adicionar passageiro');
  const detalhes = target.querySelectorAll<HTMLDetailsElement>('.passageiro-editavel');
  expect([...detalhes].map((item) => item.open)).toEqual([false, false]);
  detalhes[1].open = true;
  for (const [selector, value] of [
    ['#passageiro-1', 'Pessoa Exemplo'],
    ['#bilhete-1', '123456'],
    ['#assento-1-0', '17A']
  ]) {
    const input = target.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const tipo = [...target.getElementsByTagName('select')].find(
    (select) => select.id === 'tipo-passageiro-1'
  )!;
  tipo.value = 'CHD';
  tipo.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(detalhes[1].querySelector('summary')?.textContent).toContain('PESSOA EXEMPLO');
  detalhes[1].open = false;
  detalhes[1].open = true;
  expect(target.querySelector<HTMLInputElement>('#assento-1-0')?.value).toBe('17A');
  detalhes[0].open = true;
  [...detalhes[0].querySelectorAll('button')]
    .find((button) => button.textContent?.trim() === 'Remover passageiro')!
    .click();
  flushSync();
  expect(target.querySelectorAll('.passageiro-editavel')).toHaveLength(1);
  expect(target.querySelector<HTMLInputElement>('#passageiro-0')?.value).toBe('PESSOA EXEMPLO');
  expect(target.querySelector<HTMLInputElement>('#bilhete-0')?.value).toBe('123456');
  expect(
    [...target.getElementsByTagName('select')].find((s) => s.id === 'tipo-passageiro-0')?.value
  ).toBe('CHD');
  expect(target.querySelector<HTMLInputElement>('#assento-0-0')?.value).toBe('17A');
  click(target, 'Salvar passagem');
  await vi.waitFor(() =>
    expect(api.fetch).toHaveBeenCalledWith(
      '/api/v1/passagens',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          passageiros: [
            expect.objectContaining({
              nome: 'PESSOA EXEMPLO',
              tipo: 'CHD',
              bilhete: '123456',
              assentos: ['17A']
            })
          ]
        })
      })
    )
  );
  await unmount(app);
});

it('reordena passageiros preservando campos, assentos e estado aberto', async () => {
  api.fetch.mockImplementation(async (_path, options) =>
    options.method === 'POST' ? { id: '00000000-0000-4000-8000-000000000001' } : { items: [] }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() => expect(target.textContent).toContain('Nenhuma passagem salva.'));
  click(target, 'Nova passagem');
  click(target, 'Adicionar trecho');
  click(target, 'Adicionar trecho');
  click(target, 'Adicionar passageiro');
  click(target, 'Adicionar passageiro');
  const detalhes = target.querySelectorAll<HTMLDetailsElement>('.passageiro-editavel');
  detalhes[0].open = true;
  for (const [selector, value] of [
    ['#passageiro-0', 'Maria Exemplo'],
    ['#bilhete-0', '123456'],
    ['#status-bilhete-0', 'Emitido'],
    ['#assento-0-0', '12A'],
    ['#assento-0-1', '14B'],
    ['#passageiro-1', 'Ana Exemplo'],
    ['#bilhete-1', '987654'],
    ['#assento-1-0', '15C'],
    ['#assento-1-1', '16D']
  ]) {
    const input = target.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const tipo = [...target.getElementsByTagName('select')].find(
    (select) => select.id === 'tipo-passageiro-0'
  )!;
  tipo.value = 'CHD';
  tipo.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(
    detalhes[0].querySelector<HTMLButtonElement>('[aria-label="Mover passageiro 1 para cima"]')
      ?.disabled
  ).toBe(true);
  expect(
    detalhes[1].querySelector<HTMLButtonElement>('[aria-label="Mover passageiro 2 para baixo"]')
      ?.disabled
  ).toBe(true);
  detalhes[0]
    .querySelector<HTMLButtonElement>('[aria-label="Mover passageiro 1 para baixo"]')!
    .click();
  flushSync();
  const ordenados = target.querySelectorAll<HTMLDetailsElement>('.passageiro-editavel');
  expect([...ordenados].map((item) => item.open)).toEqual([false, true]);
  expect(target.querySelector<HTMLInputElement>('#passageiro-0')?.value).toBe('ANA EXEMPLO');
  expect(target.querySelector<HTMLInputElement>('#passageiro-1')?.value).toBe('MARIA EXEMPLO');
  expect(
    [...target.getElementsByTagName('select')].find((select) => select.id === 'tipo-passageiro-1')
      ?.value
  ).toBe('CHD');
  expect(target.querySelector<HTMLInputElement>('#status-bilhete-1')?.value).toBe('Emitido');
  expect(target.querySelector<HTMLInputElement>('#assento-0-1')?.value).toBe('16D');
  expect(target.querySelector<HTMLInputElement>('#assento-1-0')?.value).toBe('12A');
  ordenados[1]
    .querySelector<HTMLButtonElement>('[aria-label="Mover passageiro 2 para cima"]')!
    .click();
  flushSync();
  expect(target.querySelector<HTMLInputElement>('#passageiro-0')?.value).toBe('MARIA EXEMPLO');
  expect(target.querySelector<HTMLInputElement>('#assento-0-1')?.value).toBe('14B');
  target.querySelector<HTMLButtonElement>('[aria-label="Mover passageiro 1 para baixo"]')!.click();
  flushSync();
  click(target, 'Salvar passagem');
  await vi.waitFor(() =>
    expect(api.fetch).toHaveBeenCalledWith(
      '/api/v1/passagens',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          passageiros: [
            expect.objectContaining({
              nome: 'ANA EXEMPLO',
              bilhete: '987654',
              assentos: ['15C', '16D']
            }),
            expect.objectContaining({
              nome: 'MARIA EXEMPLO',
              tipo: 'CHD',
              bilhete: '123456',
              status: 'Emitido',
              assentos: ['12A', '14B']
            })
          ]
        })
      })
    )
  );
  await unmount(app);
});

it('abre para edição a passagem indicada pelo comprovante', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  api.url = `https://example.test/operacao/passagens?editar=${id}&origem=comprovante`;
  api.fetch.mockImplementation(async (_path, options) =>
    options.query?.id
      ? { item: { id, localizador: 'ABC123', emissao: '', trechos: [], passageiros: [] } }
      : { items: [] }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() =>
    expect(target.querySelector<HTMLInputElement>('#passagem-localizador')?.value).toBe('ABC123')
  );
  expect(target.textContent).toContain('Editar passagem');
  expect(target.querySelector('.importacao-editavel')).toBeNull();
  expect(
    target.querySelector<HTMLInputElement>('#passagem-localizador')?.matches(':disabled')
  ).toBe(false);
  api.url = 'https://example.test/operacao/passagens';
  await unmount(app);
});

it('recolhe trechos novos e preserva os demais ao remover um trecho', async () => {
  api.fetch.mockResolvedValue({ items: [] });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() => expect(target.textContent).toContain('Nenhuma passagem salva.'));
  click(target, 'Nova passagem');
  click(target, 'Adicionar trecho');
  click(target, 'Adicionar trecho');
  const detalhes = target.querySelectorAll<HTMLDetailsElement>('.trecho-editavel');
  expect([...detalhes].map((item) => item.open)).toEqual([false, false]);
  detalhes[1].open = true;
  const origem = target.querySelector<HTMLInputElement>('#origem-1')!;
  origem.value = 'lis';
  origem.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  detalhes[0].open = true;
  const remover = [...detalhes[0].querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === 'Remover trecho'
  )!;
  remover.click();
  flushSync();
  expect(target.querySelectorAll('.trecho-editavel')).toHaveLength(1);
  expect(target.querySelector<HTMLInputElement>('#origem-0')?.value).toBe('LIS');
  await unmount(app);
});

it('reordena os trechos preservando os assentos de cada passageiro', async () => {
  api.fetch.mockImplementation(async (_path, options) =>
    options.method === 'POST' ? { id: '00000000-0000-4000-8000-000000000001' } : { items: [] }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() => expect(target.textContent).toContain('Nenhuma passagem salva.'));
  click(target, 'Nova passagem');
  click(target, 'Adicionar trecho');
  click(target, 'Adicionar trecho');
  click(target, 'Adicionar passageiro');
  for (const [selector, value] of [
    ['#origem-0', 'gru'],
    ['#origem-1', 'lis'],
    ['#assento-0-0', '12A'],
    ['#assento-0-1', '23B']
  ]) {
    const input = target.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  flushSync();
  const details = target.querySelectorAll<HTMLDetailsElement>('.trecho-editavel');
  details[0].open = true;
  expect(
    details[0].querySelector<HTMLButtonElement>('[aria-label="Mover trecho 1 para cima"]')?.disabled
  ).toBe(true);
  details[0].querySelector<HTMLButtonElement>('[aria-label="Mover trecho 1 para baixo"]')!.click();
  flushSync();
  expect(target.querySelector<HTMLInputElement>('#origem-0')?.value).toBe('LIS');
  expect(target.querySelector<HTMLInputElement>('#origem-1')?.value).toBe('GRU');
  expect(target.querySelector<HTMLInputElement>('#assento-0-0')?.value).toBe('23B');
  expect(target.querySelector<HTMLInputElement>('#assento-0-1')?.value).toBe('12A');
  expect(target.querySelectorAll<HTMLDetailsElement>('.trecho-editavel')[1].open).toBe(true);
  click(target, 'Salvar passagem');
  await vi.waitFor(() =>
    expect(api.fetch).toHaveBeenCalledWith(
      '/api/v1/passagens',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          trechos: [
            expect.objectContaining({ origem: 'LIS' }),
            expect.objectContaining({ origem: 'GRU' })
          ],
          passageiros: [expect.objectContaining({ assentos: ['23B', '12A'] })]
        })
      })
    )
  );
  await unmount(app);
});
