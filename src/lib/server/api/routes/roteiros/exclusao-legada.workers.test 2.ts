/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, expect, it, vi } from 'vitest';
import { createDataClient } from '$lib/server/data/query';

const state = vi.hoisted(() => ({ client: null as ReturnType<typeof createDataClient> | null }));
vi.mock('$lib/server/v1', async (original) => ({
  ...(await original<typeof import('$lib/server/v1')>()),
  getAdminClient: () => state.client,
  requireAuthenticatedUser: async () => ({ id: 'owner' }),
  resolveUserScope: async () => ({ userId: 'owner', isAdmin: false }),
  ensureModuloAccess: () => undefined,
  isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value)
}));

import { handleRoteirosDelete } from './root';
import { handleRoteirosDeleteDelete } from './delete';

beforeAll(async () => {
  await applyD1Migrations(
    env.DB,
    env.TEST_MIGRATIONS.filter((migration) => migration.name < '0019_')
  );
  state.client = createDataClient({
    db: env.DB,
    r2: env.R2,
    secret: 'segredo-de-teste-com-32-caracteres',
    origin: 'https://vtur.app',
    headers: new Headers()
  });
});

it.each(['root', 'delete'] as const)(
  'exclui pela rota %s sem revisão em banco legado, mas não exclui roteiro de outro usuário',
  async (route) => {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais) VALUES (?, 'other', 'Protegido', '[]')"
    )
      .bind(id)
      .run();
    const url = new URL(`https://vtur.app/api/v1/roteiros${route === 'delete' ? '/delete' : ''}`);
    url.searchParams.set('id', id);
    const event = {
      url,
      request: new Request(url, { method: 'DELETE', headers: { origin: 'https://vtur.app' } }),
      locals: {
        dados: state.client,
        safeGetSession: async () => ({ session: { id: 'sessao' }, user: { id: 'owner' } })
      }
    } as never;
    const excluir = () =>
      route === 'delete' ? handleRoteirosDeleteDelete(event) : handleRoteirosDelete(event);

    expect((await excluir()).status).toBe(route === 'delete' ? 404 : 200);
    expect(
      await env.DB.prepare('SELECT id FROM legado_roteiro_personalizado WHERE id = ?')
        .bind(id)
        .first()
    ).toEqual({ id });
    await env.DB.prepare(
      "UPDATE legado_roteiro_personalizado SET created_by = 'owner' WHERE id = ?"
    )
      .bind(id)
      .run();
    expect((await excluir()).status).toBe(200);
    expect(
      await env.DB.prepare('SELECT id FROM legado_roteiro_personalizado WHERE id = ?')
        .bind(id)
        .first()
    ).toBeNull();
  }
);
