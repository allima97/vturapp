import { beforeEach, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const validarCidades = vi.hoisted(() => vi.fn(async () => null as string | null));
vi.mock('./cidades-busca', () => ({ validarCidadesRoteiro: validarCidades }));
const db = vi.hoisted(() => {
  const query: Record<string, any> = {};
  for (const method of ['select', 'eq', 'insert', 'update', 'single', 'maybeSingle'])
    query[method] = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: { id: '11111111-1111-4111-8111-111111111111' }, error: null }).then(
      resolve
    );
  return { query, from: vi.fn(() => query) };
});
vi.mock('$lib/server/v1', () => ({
  getAdminClient: () => db,
  requireAuthenticatedUser: async () => ({ id: 'user' }),
  resolveUserScope: async () => ({ userId: 'user', companyId: 'company', isAdmin: false }),
  ensureModuloAccess: vi.fn(),
  isUuid: () => true,
  toISODateLocal: (value: unknown) => value,
  toErrorResponse: () => new Response('Erro', { status: 500 })
}));
import { handleRoteirosSavePost } from './save';

function save(body: Record<string, unknown>) {
  return handleRoteirosSavePost({
    request: new Request('https://vtur.app/api/v1/roteiros/save', {
      method: 'POST',
      body: JSON.stringify({ nome: 'Europa', ...body }),
      headers: { 'content-type': 'application/json' }
    }),
    platform: { env: { DB: {} } }
  } as RequestEvent);
}
beforeEach(() => {
  vi.clearAllMocks();
  validarCidades.mockResolvedValue(null);
});
const opcionais = [
  { cidade: 'Paris', passeios: [{ nome: 'Sena', descricao: 'Cruzeiro noturno' }] }
];
it('salva opcionais na criação e na duplicação sem depender de registros filhos', async () => {
  expect((await save({ opcionais })).status).toBe(200);
  expect(db.query.insert).toHaveBeenCalledWith(
    expect.objectContaining({ opcionais, created_by: 'user' })
  );
});
it('atualiza e remove opcionais respeitando a verificação de proprietário', async () => {
  expect((await save({ id: 'existing', opcionais: [] })).status).toBe(200);
  expect(db.query.eq).toHaveBeenCalledWith('created_by', 'user');
  expect(db.query.update).toHaveBeenCalledWith(expect.objectContaining({ opcionais: [] }));
});
it('preserva opcionais quando clientes antigos não enviam o campo', async () => {
  expect((await save({ id: 'existing' })).status).toBe(200);
  expect(db.query.update.mock.calls[0][0]).not.toHaveProperty('opcionais');
});
it('cria roteiro com opcionais vazio quando o cliente não envia o campo', async () => {
  expect((await save({})).status).toBe(200);
  expect(db.query.insert.mock.calls[0][0]).toHaveProperty('opcionais', []);
});
it('rejeita opcionais inválidos antes de qualquer gravação', async () => {
  expect((await save({ opcionais: [{ cidade: '', passeios: [] }] })).status).toBe(400);
  expect(db.from).not.toHaveBeenCalled();
});
it('rejeita cidades fora do cadastro antes de qualquer gravação', async () => {
  validarCidades.mockResolvedValue('Selecione uma cidade do cadastro.');
  const response = await save({ dias: [{ cidade: 'Roma' }] });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Selecione uma cidade do cadastro.' });
  expect(db.from).not.toHaveBeenCalled();
});
