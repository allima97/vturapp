import { afterEach, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import { readable } from 'svelte/store';

const mocks = vi.hoisted(() => ({ api: vi.fn(), lookup: vi.fn() }));
vi.mock('$lib/services/api', () => ({ apiFetch: mocks.api }));
vi.mock('$lib/airportCodeCityLookup', () => ({ loadAirportCodeCityLookup: mocks.lookup }));
vi.mock('$app/stores', () => ({
  page: readable({ url: new URL('https://example.test/operacao/passagens/comprovante?id=abc') })
}));
import Comprovante from '../../../routes/(app)/operacao/passagens/comprovante/+page.svelte';

afterEach(() => {
  mocks.api.mockReset();
  mocks.lookup.mockReset();
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
          origem: 'GRU',
          destino: 'MIA',
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
        { nome: 'Pessoa Exemplo', bilhete: '12345', status: 'Emitido', assentos: ['33A', '34B'] }
      ]
    }
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Comprovante, { target });
  await vi.waitFor(() => expect(target.textContent).toContain('São Paulo'));
  expect(target.textContent).toContain('Miami');
  expect(target.textContent).toContain('Cidade corrigida');
  expect(target.textContent).toContain('Companhia Exemplo / Outra Companhia');
  expect(target.textContent).toContain('IDA');
  expect(target.textContent).toContain('VOLTA');
  expect(target.querySelectorAll('.trecho')[0].textContent).toContain('33A');
  expect(target.querySelectorAll('.trecho')[1].textContent).toContain('34B');
  expect(target.textContent).toContain('12345');
  expect(target.textContent).toContain('Light');
  expect(target.querySelector('.acoes a')?.getAttribute('href')).toBe(
    '/operacao/passagens?editar=abc'
  );
  expect(target.textContent).toContain('Não informado');
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
        { ...trecho, origem: 'AAA', destino: 'BBB' },
        { ...trecho, origem: 'BBB', destino: 'CCC' },
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
  await unmount(app);
});
