import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => [] as string[]);
const spy = vi.hoisted(() => (name: string) => async () => {
  calls.push(name);
  return new Response(name);
});

vi.mock('./root', () => ({
  handleDestinosBuscaGet: spy('busca'),
  handleDestinosExatosGet: spy('exata'),
  handleDestinoGet: spy('detalhes'),
  handleDestinoReferenciaPost: spy('referencia'),
  handleDestinoPost: spy('cadastro')
}));

import { apiApp } from '../../app';
import * as catchAll from '../../../../../routes/api/v1/[...path]/+server';

const cases = [
  ['GET', '/api/v1/destinos-geograficos/busca', 'busca'],
  ['GET', '/api/v1/destinos-geograficos/exata', 'exata'],
  ['GET', '/api/v1/destinos-geograficos/detalhes', 'detalhes'],
  ['POST', '/api/v1/destinos-geograficos/referencia', 'referencia'],
  ['POST', '/api/v1/destinos-geograficos', 'cadastro']
] as const;

function event(method: string, path: string) {
  const request = new Request(`https://vturapp.test${path}`, { method });
  return { request, url: new URL(request.url), params: {}, locals: {}, platform: undefined };
}

beforeEach(() => {
  calls.length = 0;
});

describe('roteamento dos destinos geográficos', () => {
  it.each(cases)('%s %s alcança %s', async (method, path, handler) => {
    const requestEvent = event(method, path);
    const response = await apiApp.fetch(requestEvent.request, { event: requestEvent as never });
    expect(await response.text()).toBe(handler);
    expect(calls).toEqual([handler]);
  });

  it('encaminha também pelo catch-all do SvelteKit', async () => {
    for (const [method, path, handler] of cases) {
      calls.length = 0;
      const response = await catchAll[method](event(method, path) as never);
      expect(await response.text()).toBe(handler);
      expect(calls).toEqual([handler]);
    }
  });
});
