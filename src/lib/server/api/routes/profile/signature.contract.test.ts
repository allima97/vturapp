import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDados, type FakeDados } from '$lib/server/testing/fakeDados';

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('$lib/server/v1', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/v1')>()),
  getAdminClient: () => state.db,
  requireAuthenticatedUser: async () => ({ id: 'user-1' }),
  resolveUserScope: async () => ({ isAdmin: true })
}));

import { handleProfileSignaturePatch } from './signature';

function event() {
  return {
    request: new Request('https://vtur.app/api/v1/profile/signature', {
      method: 'PATCH',
      headers: { origin: 'https://vtur.app', 'content-type': 'application/json' },
      body: JSON.stringify({ signature: ' Nova Assinatura ' })
    })
  } as never;
}

describe('assinatura do perfil', () => {
  let db: FakeDados;
  beforeEach(() => {
    db = createFakeDados({
      users: [{ id: 'user-1', company_id: null }],
      quote_print_settings: []
    });
    state.db = db;
  });

  it('insere configurações para o usuário sem assinatura anterior', async () => {
    const response = await handleProfileSignaturePatch(event());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, signature: 'Nova Assinatura' });
    expect(db.log).toContainEqual(
      expect.objectContaining({
        table: 'quote_print_settings',
        op: 'insert',
        values: { owner_user_id: 'user-1', company_id: null, consultor_nome: 'Nova Assinatura' }
      })
    );
  });

  it('atualiza somente a configuração existente sem apagar os outros campos', async () => {
    db = createFakeDados({
      users: [{ id: 'user-1', company_id: 'company-1' }],
      quote_print_settings: [{ id: 'settings-1', owner_user_id: 'user-1', telefone: '123' }]
    });
    state.db = db;
    const response = await handleProfileSignaturePatch(event());
    expect(response.status).toBe(200);
    expect(db.log).toContainEqual(
      expect.objectContaining({
        table: 'quote_print_settings',
        op: 'update',
        filters: ['id=settings-1'],
        values: expect.objectContaining({
          owner_user_id: 'user-1',
          company_id: 'company-1',
          consultor_nome: 'Nova Assinatura'
        })
      })
    );
    expect(db.log.find((entry) => entry.op === 'update')?.values).not.toHaveProperty('telefone');
  });

  it('não escreve quando existem configurações duplicadas', async () => {
    db = createFakeDados({
      users: [{ id: 'user-1' }],
      quote_print_settings: [
        { id: 'one', owner_user_id: 'user-1' },
        { id: 'two', owner_user_id: 'user-1' }
      ]
    });
    state.db = db;
    const response = await handleProfileSignaturePatch(event());
    expect(response.status).toBe(500);
    expect(db.log.some((entry) => entry.op === 'insert' || entry.op === 'update')).toBe(false);
  });
});
