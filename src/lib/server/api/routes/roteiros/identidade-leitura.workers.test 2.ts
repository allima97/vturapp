/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import { createDataClient } from '$lib/server/data/query';

const state = vi.hoisted(() => ({ client: null as ReturnType<typeof createDataClient> | null }));
vi.mock('$lib/server/v1', async (original) => ({
  ...(await original<typeof import('$lib/server/v1')>()),
  getAdminClient: () => state.client,
  requireAuthenticatedUser: async () => ({ id: 'owner' }),
  resolveUserScope: async () => ({ userId: 'owner', isAdmin: false }),
  ensureModuloAccess: () => undefined,
  isUuid: () => true,
  sanitizePostgrestSearchTerm: (value: string | null) => value ?? '',
  toErrorResponse: () => new Response('Erro ao carregar roteiro.', { status: 500 })
}));
import { handleRoteirosIdGet } from './id';
import { handleRoteirosDiasBuscaGet } from './dias-busca';

it('retorna identidades nas leituras e não esconde falhas de consulta como listas vazias', async () => {
  const migration = env.TEST_MIGRATIONS.find((item) => item.name.startsWith('0020_'));
  if (!migration) throw new Error('Migração 0020 não encontrada.');
  await applyD1Migrations(
    env.DB,
    env.TEST_MIGRATIONS.filter((item) => !item.name.startsWith('0020_'))
  );
  const roteiro = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais) VALUES (?, 'owner', 'Viagem', '[]')"
    ).bind(roteiro),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_dia (id, created_by, roteiro_id, cidade, descricao, percurso) VALUES (?, 'owner', ?, 'Roma', 'Dia', 'Passeio')"
    ).bind(crypto.randomUUID(), roteiro),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_hotel (id, roteiro_id, cidade, hotel) VALUES (?, ?, 'Roma', 'Hotel')"
    ).bind(crypto.randomUUID(), roteiro),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_passeio (id, roteiro_id, cidade, passeio) VALUES (?, ?, 'Roma', 'Museu')"
    ).bind(crypto.randomUUID(), roteiro)
  ]);
  state.client = createDataClient({
    db: env.DB,
    r2: env.R2,
    secret: 'segredo-de-teste-com-32-caracteres',
    origin: 'http://localhost',
    headers: new Headers()
  });
  const event = { params: { id: roteiro } } as Parameters<typeof handleRoteirosIdGet>[0];
  await applyD1Migrations(env.DB, [migration]);
  await env.DB.batch([
    env.DB.prepare("UPDATE legado_roteiro_dia SET cidade_id = 'geonames:3169070'"),
    env.DB.prepare("UPDATE legado_roteiro_hotel SET cidade_id = 'geonames:3169070'"),
    env.DB.prepare("UPDATE legado_roteiro_passeio SET cidade_id = 'geonames:3169070'")
  ]);
  const response = await handleRoteirosIdGet(event);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    roteiro: {
      dias: [{ cidade: 'Roma', cidade_id: 'geonames:3169070' }],
      hoteis: [{ cidade: 'Roma', cidade_id: 'geonames:3169070' }],
      passeios: [{ cidade: 'Roma', cidade_id: 'geonames:3169070' }]
    }
  });
  const busca = await handleRoteirosDiasBuscaGet({
    url: new URL('https://vtur.app/api/v1/roteiros/dias-busca?q=Passeio')
  } as Parameters<typeof handleRoteirosDiasBuscaGet>[0]);
  expect(busca.status).toBe(200);
  expect(await busca.json()).toMatchObject({
    dias: [{ cidade: 'Roma', cidade_id: 'geonames:3169070' }]
  });
  await env.DB.prepare('ALTER TABLE legado_roteiro_hotel RENAME TO teste_roteiro_hotel').run();
  expect((await handleRoteirosIdGet(event)).status).toBe(500);
});
