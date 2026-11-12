import { afterEach, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import { readable } from 'svelte/store';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  lookup: vi.fn(),
  url: 'https://example.test/operacao/passagens/comprovante?id=abc'
}));
vi.mock('$lib/services/api', () => ({ apiFetch: mocks.api }));
vi.mock('$lib/airportCodeCityLookup', () => ({ loadAirportCodeCityLookup: mocks.lookup }));
vi.mock('$app/stores', () => ({
  page: {
    subscribe: (run: (value: { url: URL }) => void) =>
      readable({ url: new URL(mocks.url) }).subscribe(run)
  }
}));
import Comprovante from '../../../routes/(app)/operacao/passagens/comprovante/+page.svelte';

afterEach(() => {
  mocks.api.mockReset();
  mocks.lookup.mockReset();
  mocks.url = 'https://example.test/operacao/passagens/comprovante?id=abc';
  document.body.replaceChildren();
});

it('mostra cidades, dados da reserva e assentos nos trechos sem inventar informações', async () => {
  mocks.lookup.mockResolvedValue({ GRU: 'São Paulo', MIA: 'Miami' });
  mocks.api.mockResolvedValue({
    item: {
      localizador: 'ABC123',
      emissao: '2026-07-08',
      trechos: [
        {
          companhia: 'Companhia Exemplo',
          voo: 'XY 123',
          origem: 'gru',
          destino: 'mia',
          saida: '2026-11-20T00:05',
          chegada: '2026-11-20T06:50',
          status: 'HK',
          duracao: '08:45',
          classe: 'O',
          tarifa: 'Light'
        },
        {
          companhia: 'Outra Companhia',
          voo: 'ZQ 999',
          origem: 'MIA',
          destino: 'GRU',
          cidadeOrigem: 'Cidade corrigida',
          saida: '2026-11-30T21:00',
          chegada: '2026-12-01T07:35',
          status: '',
          duracao: '08:35',
          classe: ''
        }
      ],
      passageiros: [
        {
          nome: 'Pessoa Exemplo',
          tipo: 'ADT',
          bilhete: '12345',
          status: 'Emitido',
          assentos: ['33A', '34B']
        },
        { nome: 'Criança Exemplo', tipo: 'CHD', bilhete: '', status: '', assentos: [] },
        { nome: 'Infant Exemplo', tipo: 'INF', bilhete: '', status: '', assentos: [] },
        { nome: 'Tipo Ausente', bilhete: '', status: '', assentos: [] }
      ]
    }
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Comprovante, { target });
  await vi.waitFor(() => expect(target.textContent).toContain('São Paulo'));
  expect(target.querySelectorAll('.codigo')[0].textContent).toBe('GRU');
  expect(target.querySelectorAll('.codigo')[1].textContent).toBe('MIA');
  expect(target.textContent).toContain('Miami');
  expect(target.textContent).toContain('Cidade corrigida');
  expect(target.textContent).toContain('Companhia Exemplo / Outra Companhia');
  expect(target.textContent).toContain('IDA');
  expect(target.textContent).toContain('VOLTA');
  expect(target.querySelector('.resumo p')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
    'Rota: São Paulo (GRU) / Miami (MIA)'
  );
  expect(target.querySelectorAll('.trecho')[0].textContent).toContain('33A');
  expect(target.querySelectorAll('.trecho')[1].textContent).toContain('34B');
  expect(target.querySelectorAll('.duracao')[0].textContent).not.toContain('Chegada no dia');
  expect(target.querySelectorAll('.duracao')[1].textContent).toContain(
    'Chegada no dia seguinte (+1)'
  );
  expect(target.querySelectorAll('.duracao')[0].querySelector('.aviso-chegada')).toBeNull();
  expect(target.querySelectorAll('.duracao')[1].querySelector('.aviso-chegada')?.textContent).toBe(
    'Chegada no dia seguinte (+1)'
  );
  expect(target.textContent).toContain('12345');
  expect(target.querySelector('tbody tr td')?.textContent).toBe('PESSOA EXEMPLO');
  const resumo = target.querySelector('.resumo')?.textContent?.replace(/\s+/g, ' ');
  expect(resumo).toContain('Passageiros: 1 Adulto + 1 Criança + 1 Infant + 1 Não informado');
  expect(
    [...target.querySelectorAll('tbody tr')].map((row) => row.children[1].textContent)
  ).toEqual(['Adulto', 'Criança', 'Infant', 'Não informado']);
  const tabela = target.querySelector('table');
  expect(tabela?.querySelectorAll('tbody tr')).toHaveLength(4);
  const aviso = tabela?.nextElementSibling;
  expect(aviso?.classList.contains('aviso-embarque')).toBe(true);
  expect(aviso?.textContent?.replace(/\s+/g, ' ')).toContain('Atenção ao horário de seu embarque!');
  expect(aviso?.textContent?.replace(/\s+/g, ' ')).toContain(
    'Apresente-se no aeroporto indicado com pelo menos 3 horas de antecedência para voos internacionais e 2 horas de antecedência para voos nacionais.'
  );
  expect(aviso?.querySelectorAll('strong')[1]?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
    'Para um maior controle, baixe o aplicativo da companhia aérea e acompanhe a situação de seu voo.'
  );
  const tarifas = [...target.querySelectorAll('.trecho')].map(
    (trecho) =>
      [...trecho.querySelectorAll('.detalhes > div')]
        .find((detalhe) => detalhe.querySelector('.rotulo')?.textContent === 'TARIFA')
        ?.querySelector('strong')?.textContent
  );
  expect(tarifas).toEqual(['Light', '-']);
  const links = [...target.querySelectorAll('.acoes a')];
  expect(links.map((link) => link.textContent?.trim())).toEqual(['Voltar', 'Editar']);
  expect(links[0].getAttribute('href')).toBe('/operacao/passagens');
  expect(links[1].getAttribute('href')).toBe('/operacao/passagens?editar=abc&origem=comprovante');
  expect(target.textContent).toContain('Não informado');
  await unmount(app);
});

it('retorna à edição quando o comprovante foi aberto pelo formulário', async () => {
  mocks.url = 'https://example.test/operacao/passagens/comprovante?id=abc&origem=edicao';
  mocks.lookup.mockResolvedValue({});
  mocks.api.mockResolvedValue({
    item: { localizador: 'ABC123', emissao: '', trechos: [], passageiros: [] }
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Comprovante, { target });
  await vi.waitFor(() => expect(target.textContent).toContain('COMPROVANTE DE VIAGEM'));
  expect(target.querySelector('.acoes a')?.getAttribute('href')).toBe(
    '/operacao/passagens?editar=abc'
  );
  await unmount(app);
});

it.each([
  {
    trechos: [
      { origem: 'MSN', destino: 'ORD' },
      { origem: 'LHR', destino: 'GRU' }
    ],
    esperado: 'Madison (MSN) / Chicago (ORD) e Londres (LHR) / São Paulo (GRU)'
  },
  {
    trechos: [
      { origem: 'MSN', destino: 'ORD' },
      { origem: 'ord', destino: 'LHR' },
      { origem: 'GRU', destino: 'AAA' },
      { origem: 'BBB', destino: 'CCC' }
    ],
    esperado: 'Madison (MSN) / Londres (LHR) e São Paulo (GRU) / AAA e BBB / CCC'
  },
  {
    trechos: [
      { origem: 'MSN', destino: 'ORD' },
      { origem: 'ORD', destino: 'MSN' },
      { origem: 'MSN', destino: 'GRU' }
    ],
    esperado: 'Madison (MSN) / São Paulo (GRU)'
  }
])('separa rotas descontínuas sem inventar conexões', async ({ trechos, esperado }) => {
  mocks.lookup.mockResolvedValue({
    MSN: 'Madison',
    ORD: 'Chicago',
    LHR: 'Londres',
    GRU: 'São Paulo'
  });
  mocks.api.mockResolvedValue({
    item: {
      localizador: 'ABC123',
      emissao: '',
      trechos: trechos.map((trecho) => ({
        companhia: 'Exemplo',
        voo: 'XY 1',
        saida: '2026-11-20T00:05',
        chegada: '2026-11-20T06:50',
        status: '',
        duracao: '',
        classe: '',
        ...trecho
      })),
      passageiros: [{ nome: 'Pessoa Exemplo', bilhete: '', status: '', assentos: [] }]
    }
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Comprovante, { target });
  await vi.waitFor(() => expect(target.querySelector('.resumo p')).not.toBeNull());
  expect(target.querySelector('.resumo p')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
    `Rota: ${esperado}`
  );
  await unmount(app);
});

it.each([
  [['ADT', 'ADT'], '2 Adultos'],
  [['ADT', 'CHD'], '1 Adulto + 1 Criança'],
  [['CHD', 'CHD', 'INF', 'INF'], '2 Crianças + 2 Infants'],
  [[undefined, undefined], '2 Não informados'],
  [['ADT', undefined], '1 Adulto + 1 Não informado']
])('resume somente categorias presentes: %s', async (tipos, esperado) => {
  mocks.lookup.mockResolvedValue({ AAA: 'Origem', BBB: 'Destino' });
  mocks.api.mockResolvedValue({
    item: {
      localizador: 'ABC123',
      emissao: '',
      trechos: [
        {
          companhia: 'Exemplo',
          voo: 'XY 1',
          origem: 'AAA',
          destino: 'BBB',
          saida: '2026-11-20T00:05',
          chegada: '2026-11-20T06:50',
          status: '',
          duracao: '',
          classe: ''
        }
      ],
      passageiros: tipos.map((tipo) => ({
        nome: 'Pessoa Exemplo',
        tipo,
        bilhete: '',
        status: '',
        assentos: []
      }))
    }
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Comprovante, { target });
  await vi.waitFor(() => expect(target.querySelectorAll('.resumo p')).toHaveLength(2));
  expect(target.querySelectorAll('.resumo p')[1].textContent?.replace(/\s+/g, ' ').trim()).toBe(
    `Passageiros: ${esperado}`
  );
  await unmount(app);
});

it('indica vários dias de diferença e não avisa para chegada anterior à saída', async () => {
  mocks.lookup.mockResolvedValue({ AAA: 'Origem', BBB: 'Destino' });
  const trecho = {
    companhia: 'Exemplo',
    voo: 'XY 1',
    origem: 'AAA',
    destino: 'BBB',
    saida: '2026-12-31T23:00',
    chegada: '2027-01-02T08:00',
    status: '',
    duracao: '',
    classe: ''
  };
  mocks.api.mockResolvedValue({
    item: {
      localizador: 'ABC123',
      emissao: '',
      trechos: [trecho, { ...trecho, saida: '2027-01-01T10:00', chegada: '2026-12-31T20:00' }],
      passageiros: [{ nome: 'Pessoa Exemplo', bilhete: '', status: '', assentos: [] }]
    }
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Comprovante, { target });
  await vi.waitFor(() => expect(target.textContent).toContain('Chegada 2 dias depois (+2)'));
  expect(target.querySelectorAll('.duracao')[0].querySelector('.aviso-chegada')?.textContent).toBe(
    'Chegada 2 dias depois (+2)'
  );
  expect(target.querySelectorAll('.duracao')[1].querySelector('small')).toBeNull();
  await unmount(app);
});

it('avisa quando a base de aeroportos não está disponível', async () => {
  mocks.lookup.mockResolvedValue({});
  mocks.api.mockResolvedValue({
    item: {
      localizador: 'ABC123',
      emissao: '',
      trechos: [
        {
          companhia: 'Exemplo',
          voo: 'XY 1',
          origem: 'XYZ',
          destino: 'ABC',
          saida: '2026-11-20T00:05',
          chegada: '2026-11-20T06:50',
          status: '',
          duracao: '',
          classe: ''
        }
      ],
      passageiros: [{ nome: 'Pessoa Exemplo', bilhete: '', status: '', assentos: [] }]
    }
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Comprovante, { target });
  await vi.waitFor(() =>
    expect(target.textContent).toContain('Não foi possível consultar as cidades')
  );
  expect(target.textContent).toContain('Cidade não informada');
  await unmount(app);
});

it('mostra o destino final da ida quando há conexão', async () => {
  mocks.lookup.mockResolvedValue({ AAA: 'Origem', BBB: 'Conexão', CCC: 'Destino final' });
  const trecho = {
    companhia: 'Exemplo',
    voo: 'XY 1',
    saida: '2026-11-20T00:05',
    chegada: '2026-11-20T06:50',
    status: '',
    duracao: '',
    classe: ''
  };
  mocks.api.mockResolvedValue({
    item: {
      localizador: 'ABC123',
      emissao: '',
      trechos: [
        { ...trecho, origem: 'AAA', destino: 'BBB', tarifa: '' },
        { ...trecho, origem: 'BBB', destino: 'CCC', tarifa: '   ' },
        { ...trecho, origem: 'CCC', destino: 'AAA' }
      ],
      passageiros: [{ nome: 'Pessoa Exemplo', bilhete: '', status: '', assentos: [] }]
    }
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Comprovante, { target });
  await vi.waitFor(() =>
    expect(target.querySelector('.resumo')?.textContent).toContain(
      'Origem (AAA) / Destino final (CCC)'
    )
  );
  expect(
    [...target.querySelectorAll('.trecho')].map(
      (trecho) =>
        [...trecho.querySelectorAll('.detalhes > div')]
          .find((detalhe) => detalhe.querySelector('.rotulo')?.textContent === 'TARIFA')
          ?.querySelector('strong')?.textContent
    )
  ).toEqual(['-', '-', '-']);
  await unmount(app);
});
