import { beforeEach, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const state = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('$lib/server/v1', () => ({
  getAdminClient: () => ({ from: state.from }),
  requireAuthenticatedUser: async () => ({ id: 'user' }),
  resolveUserScope: async () => ({ isAdmin: true, companyId: 'company', companyIds: ['company'] }),
  resolveScopedCompanyIds: () => ['company'],
  ensureModuloAccess: vi.fn(),
  toErrorResponse: (error: unknown) => {
    throw error;
  }
}));
vi.mock('$lib/server/admin', () => ({
  ensureCanManageCompanies: vi.fn(),
  getAccessibleCompanyIds: () => ['company']
}));
vi.mock('$lib/server/clientes', () => ({ ensureClienteAccess: vi.fn() }));
vi.mock('$lib/server/auditLog', () => ({ registrarLog: vi.fn() }));
vi.mock('$lib/server/fornecedorCidadeGeografica', () => ({
  prepararCidadeFornecedor: async () => ({
    ok: true,
    cidade: { cidade: 'São Paulo', estado: 'SP' }
  })
}));
vi.mock('$lib/server/fornecedores', () => ({
  fetchFornecedorById: async () => ({ id: 'id', company_id: 'company' }),
  sanitizeFornecedorPayload: (body: Record<string, unknown>) => ({ ...body, company_id: 'company' })
}));

import { handleUserProfilePatch } from './user/profile';
import { handleParametrosEmpresaPatch } from './parametros/empresa';
import { handleAdminEmpresasPost } from './admin/empresas';
import { handleAdminEmpresasIdPatch } from './admin/empresas-id';
import { handleClientesIdAcompanhantesPost } from './clientes/id-acompanhantes';
import { handleClientesIdAcompanhantesAcompanhanteIdPatch } from './clientes/id-acompanhantes-acompanhanteId';
import { handleFornecedoresCreatePost } from './fornecedores/create';
import { handleFornecedoresIdPut } from './fornecedores/id';
import { handleClientesResolveImportPost } from './clientes/resolve-import';

function event(method: string, body: object): RequestEvent {
  const url = new URL('https://vtur.app/api/v1/test');
  return {
    request: new Request(url, {
      method,
      headers: { origin: url.origin, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }),
    url,
    params: { id: 'id', acompanhanteId: 'acompanhante' }
  } as RequestEvent;
}

beforeEach(() => state.from.mockReset());

const fornecedor = {
  nome_completo: 'Teste',
  nome_fantasia: 'Teste',
  localizacao: 'brasil',
  telefone: '1',
  whatsapp: '1',
  telefone_emergencia: '1',
  responsavel: 'Teste',
  principais_servicos: 'Teste',
  cep: '12345678'
};

it.each([
  {
    nome: 'perfil',
    handler: handleUserProfilePatch,
    method: 'PATCH',
    body: { cpf: '52998224724' }
  },
  {
    nome: 'empresa',
    handler: handleParametrosEmpresaPatch,
    method: 'PATCH',
    body: { cnpj: '04252011000111' }
  },
  {
    nome: 'admin empresa',
    handler: handleAdminEmpresasPost,
    method: 'POST',
    body: { cnpj: '04252011000111' }
  },
  {
    nome: 'admin empresa edição',
    handler: handleAdminEmpresasIdPatch,
    method: 'PATCH',
    body: { cnpj: '04252011000111' }
  },
  {
    nome: 'acompanhante novo',
    handler: handleClientesIdAcompanhantesPost,
    method: 'POST',
    body: { nome_completo: 'Teste', cpf: '52998224724' }
  },
  {
    nome: 'acompanhante edição',
    handler: handleClientesIdAcompanhantesAcompanhanteIdPatch,
    method: 'PATCH',
    body: { nome_completo: 'Teste', cpf: '52998224724' }
  },
  {
    nome: 'fornecedor novo',
    handler: handleFornecedoresCreatePost,
    method: 'POST',
    body: { ...fornecedor, cnpj: '04252011000111' }
  },
  {
    nome: 'fornecedor edição',
    handler: handleFornecedoresIdPut,
    method: 'PUT',
    body: { ...fornecedor, cnpj: '04252011000111' }
  }
])('API de $nome rejeita documento inválido antes de gravar', async ({ handler, method, body }) => {
  const response = await handler(event(method, body));
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: expect.stringContaining('inválido') });
  expect(state.from).not.toHaveBeenCalled();
});

it.each(['529.982.247-25', '', null])(
  'API de perfil aceita CPF válido ou opcional vazio: %s',
  async (cpf) => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    state.from.mockReturnValue({ update });
    const response = await handleUserProfilePatch(event('PATCH', { cpf }));
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ cpf: cpf === '' ? null : cpf });
  }
);

it('rejeita CPF inválido também na importação de cliente', async () => {
  const response = await handleClientesResolveImportPost(event('POST', { cpf: '52998224724' }));
  expect(response.status).toBe(400);
  expect(await response.text()).toContain('CPF inválido');
  expect(state.from).not.toHaveBeenCalled();
});
