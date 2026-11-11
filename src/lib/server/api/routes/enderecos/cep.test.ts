import type { RequestEvent } from '@sveltejs/kit';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('$lib/server/persistentRateLimit', () => ({
  checkPersistentRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
}));
vi.mock('$lib/server/v1', () => ({ logServerError: vi.fn() }));
import { handleEnderecosCepGet } from './cep';

function event(fetcher: typeof fetch, cep = '02244010'): RequestEvent {
  return {
    url: new URL(`https://vturapp.test/api/v1/enderecos/cep?cep=${cep}`),
    fetch: fetcher,
    getClientAddress: () => '127.0.0.1',
    platform: undefined
  } as RequestEvent;
}

afterEach(() => {
  vi.useRealTimers();
});

it('aguarda o ViaCEP por mais de quatro segundos e retorna o endereço completo', async () => {
  vi.useFakeTimers();
  const fetcher: typeof fetch = async (_input, init) => {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 10_000);
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('timeout'));
      });
    });
    return Response.json({
      cep: '02244-010',
      logradouro: 'Rua Miyano Oba',
      bairro: 'Vila Dom Pedro II',
      localidade: 'São Paulo',
      uf: 'SP'
    });
  };
  const result = handleEnderecosCepGet(event(fetcher));
  await vi.advanceTimersByTimeAsync(10_000);
  const response = await result;
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    cep: '02244-010',
    logradouro: 'Rua Miyano Oba',
    complemento: '',
    bairro: 'Vila Dom Pedro II',
    localidade: 'São Paulo',
    uf: 'SP'
  });
});

it('retorna erro explícito ao esgotar o tempo de consulta', async () => {
  vi.useFakeTimers();
  const fetcher: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('timeout')));
    });
  const result = handleEnderecosCepGet(event(fetcher));
  await vi.advanceTimersByTimeAsync(15_000);
  const response = await result;
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: 'Nao foi possivel consultar o CEP.' });
});

it('distingue CEP inexistente de CEP inválido', async () => {
  const fetcher: typeof fetch = async () => Response.json({ erro: true });
  expect((await handleEnderecosCepGet(event(fetcher, '99999999'))).status).toBe(404);
  expect((await handleEnderecosCepGet(event(fetcher, '123'))).status).toBe(400);
});
