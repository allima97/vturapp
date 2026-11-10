import { expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => [] as string[]);
vi.mock('./root', () => ({
  handleOpcionaisGet: async () => {
    calls.push('get');
    return new Response('get');
  },
  handleOpcionaisPost: async () => {
    calls.push('post');
    return new Response('post');
  },
  handleOpcionaisDelete: async () => {
    calls.push('delete');
    return new Response('delete');
  }
}));
vi.mock('./cidades', () => ({
  handleOpcionaisCidadesGet: async () => {
    calls.push('cities');
    return new Response('cities');
  }
}));
vi.mock('./importar', () => ({
  handleOpcionaisImportarPost: async () => {
    calls.push('import');
    return new Response('import');
  }
}));
import { apiApp } from '../../app';

it.each([
  ['GET', '/api/v1/opcionais', 'get'],
  ['POST', '/api/v1/opcionais', 'post'],
  ['DELETE', '/api/v1/opcionais', 'delete'],
  ['GET', '/api/v1/opcionais/cidades', 'cities'],
  ['POST', '/api/v1/opcionais/importar', 'import']
])('encaminha %s %s', async (method, path, expected) => {
  calls.length = 0;
  const request = new Request(`https://vtur.app${path}`, { method });
  const event = { request, url: new URL(request.url), params: {}, locals: {} } as never;
  const response = await apiApp.fetch(request, { event });
  expect(response.status).toBe(200);
  expect(await response.text()).toBe(expected);
  expect(calls).toEqual([expected]);
});
