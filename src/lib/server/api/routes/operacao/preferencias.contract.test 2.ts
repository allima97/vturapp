import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDados, type FakeDados } from '$lib/server/testing/fakeDados';

const state = vi.hoisted(() => ({
  db: null as unknown,
  scope: { userId: 'user-1', companyId: null as string | null, usoIndividual: true, isAdmin: false }
}));
vi.mock('$lib/server/v1', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/v1')>()),
  getAdminClient: () => state.db,
  requireAuthenticatedUser: async () => ({ id: 'user-1' }),
  resolveUserScope: async () => state.scope,
  ensureModuloAccess: () => undefined
}));

import { handleOperacaoPreferenciasPost } from './preferencias';
import { handlePreferenciasSavePost } from '../preferencias/save';

function event(path: string) {
  return {
    request: new Request(`https://vtur.app${path}`, {
      method: 'POST',
      headers: { origin: 'https://vtur.app', 'content-type': 'application/json' },
      body: JSON.stringify({ nome: 'Hotel' })
    })
  } as never;
}

describe('preferências pessoais', () => {
  let db: FakeDados;
  beforeEach(() => {
    db = createFakeDados({ minhas_preferencias: [] });
    state.db = db;
    state.scope = { userId: 'user-1', companyId: null, usoIndividual: true, isAdmin: false };
  });

  it.each([
    [handleOperacaoPreferenciasPost, '/api/v1/operacao/preferencias'],
    [handlePreferenciasSavePost, '/api/v1/preferencias/save']
  ])('permite usuário individual sem empresa em %s', async (handler, path) => {
    const response = await handler(event(path));
    expect(response.status).toBe(200);
    expect(db.log).toContainEqual(
      expect.objectContaining({
        table: 'minhas_preferencias',
        op: 'insert',
        values: expect.objectContaining({ company_id: null, created_by: 'user-1', nome: 'Hotel' })
      })
    );
  });

  it.each([
    [handleOperacaoPreferenciasPost, '/api/v1/operacao/preferencias'],
    [handlePreferenciasSavePost, '/api/v1/preferencias/save']
  ])('recusa usuário corporativo sem empresa em %s', async (handler, path) => {
    state.scope.usoIndividual = false;
    const response = await handler(event(path));
    expect(response.status).toBe(400);
    expect(db.log.some((entry) => entry.op === 'insert')).toBe(false);
  });

  it.each([
    [handleOperacaoPreferenciasPost, '/api/v1/operacao/preferencias'],
    [handlePreferenciasSavePost, '/api/v1/preferencias/save']
  ])('mantém a empresa para usuários corporativos em %s', async (handler, path) => {
    state.scope.usoIndividual = false;
    state.scope.companyId = 'company-1';
    const response = await handler(event(path));
    expect(response.status).toBe(200);
    expect(db.log).toContainEqual(
      expect.objectContaining({
        table: 'minhas_preferencias',
        op: 'insert',
        values: expect.objectContaining({ company_id: 'company-1', created_by: 'user-1' })
      })
    );
  });

  it.each([
    [handleOperacaoPreferenciasPost, '/api/v1/operacao/preferencias'],
    [handlePreferenciasSavePost, '/api/v1/preferencias/save']
  ])('permite administrador sem empresa em %s', async (handler, path) => {
    state.scope.usoIndividual = false;
    state.scope.isAdmin = true;
    const response = await handler(event(path));
    expect(response.status).toBe(200);
    expect(db.log).toContainEqual(
      expect.objectContaining({
        table: 'minhas_preferencias',
        op: 'insert',
        values: expect.objectContaining({ company_id: null, created_by: 'user-1' })
      })
    );
  });
});
