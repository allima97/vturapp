import { afterEach, expect, it, vi } from 'vitest';
import { apiDelete } from '$lib/services/api';
import { codificarRevisaoExclusao, decodificarRevisaoExclusao } from './roteiroRevisaoExclusao';

afterEach(() => vi.unstubAllGlobals());

it.each(['', 'abc-123'])('transporta revisão %s sem perder valor vazio', async (revisao) => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' }
    })
  );
  vi.stubGlobal('fetch', fetch);
  await apiDelete('/api/v1/roteiros', {
    id: 'id-1',
    revisao: codificarRevisaoExclusao(revisao)
  });
  const url = new URL(fetch.mock.calls[0][0], 'https://vtur.app');
  expect(decodificarRevisaoExclusao(url.searchParams.get('revisao'))).toBe(revisao);
  expect(decodificarRevisaoExclusao(null)).toBeNull();
  expect(decodificarRevisaoExclusao('')).toBeNull();
});
