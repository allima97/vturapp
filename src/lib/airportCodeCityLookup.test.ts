import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('usa nomes conhecidos em português e preserva cidades não traduzidas', async () => {
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        LIS: 'Lisbon',
        LHR: 'London',
        JFK: 'New York',
        GRU: 'Sao Paulo',
        FCO: 'Rome',
        NRT: 'Tokyo',
        VIE: 'Vienna',
        XYZ: 'Cidade Desconhecida'
      })
    })
  );
  const { loadAirportCodeCityLookup } = await import('./airportCodeCityLookup');
  expect(await loadAirportCodeCityLookup()).toMatchObject({
    LIS: 'Lisboa',
    LHR: 'Londres',
    JFK: 'Nova Iorque',
    GRU: 'São Paulo',
    FCO: 'Roma',
    NRT: 'Tóquio',
    VIE: 'Viena',
    XYZ: 'Cidade Desconhecida'
  });
});
