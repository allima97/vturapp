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
  isUuid: (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}));
import { handleRoteirosSavePost } from './save';
import { handleRoteirosPost } from './root';

it('rejeita IDs nos dois salvamentos quando a funcionalidade está desligada', async () => {
  await applyD1Migrations(
    env.DB,
    env.TEST_MIGRATIONS.filter((migration) => !migration.name.startsWith('0022_'))
  );
  state.client = createDataClient({
    db: env.DB,
    r2: env.R2,
    secret: 'segredo-de-teste-com-32-caracteres',
    origin: 'https://vtur.app',
    headers: new Headers()
  });
  const body = {
    nome: 'Não gravar',
    dias: [{ cidade: 'Roma', cidade_id: 'geonames:1' }]
  };
  const request = () =>
    new Request('https://vtur.app/api/v1/roteiros', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  const regular = await handleRoteirosSavePost({
    request: request(),
    platform: { env: { DB: env.DB } }
  } as Parameters<typeof handleRoteirosSavePost>[0]);
  const simplified = await handleRoteirosPost({
    request: request(),
    platform: { env: { DB: env.DB } },
    locals: {
      dados: state.client,
      safeGetSession: async () => ({ session: { id: 'sessao' }, user: { id: 'owner' } })
    }
  } as never);
  expect(regular.status).toBe(400);
  expect(simplified.status).toBe(400);
  expect(await regular.json()).toMatchObject({
    error: expect.stringContaining('ainda não está disponível')
  });
  expect(await simplified.json()).toMatchObject({
    error: expect.stringContaining('ainda não está disponível')
  });
  expect(
    await env.DB.prepare('SELECT count(*) AS total FROM legado_roteiro_personalizado').first()
  ).toEqual({ total: 0 });

  const legacy = () =>
    new Request('https://vtur.app/api/v1/roteiros', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nome: 'Roteiro legado' })
    });
  const created = await handleRoteirosSavePost({
    request: legacy(),
    platform: { env: { DB: env.DB } }
  } as Parameters<typeof handleRoteirosSavePost>[0]);
  expect(created.status).toBe(200);
  const { id } = await created.json<{ id: string }>();
  const { data: row, error } = await state.client
    .from('roteiro_personalizado')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  expect(error).toBeNull();
  expect(row).toMatchObject({ id });
  const edited = await handleRoteirosSavePost({
    request: new Request('https://vtur.app/api/v1/roteiros/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, nome: 'Roteiro editado' })
    }),
    platform: { env: { DB: env.DB } }
  } as Parameters<typeof handleRoteirosSavePost>[0]);
  expect(edited.status).toBe(200);
  expect(
    await env.DB.prepare('SELECT nome FROM legado_roteiro_personalizado WHERE id = ?')
      .bind(id)
      .first()
  ).toEqual({ nome: 'Roteiro Editado' });
  expect(
    (
      await handleRoteirosPost({
        request: legacy(),
        platform: { env: { DB: env.DB } },
        locals: {
          dados: state.client,
          safeGetSession: async () => ({ session: { id: 'sessao' }, user: { id: 'owner' } })
        }
      } as never)
    ).status
  ).toBe(200);
});
