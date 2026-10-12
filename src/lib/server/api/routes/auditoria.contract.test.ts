/**
 * Fase 3.10: auditoria na tabela `logs` para os módulos além de Vendas.
 *
 * Confere, para cada ação, que o handler chama registrarLog com o MESMO módulo, a MESMA ação
 * e o MESMO formato de `detalhes` que o sistema antigo gravava (histórico da tabela `logs`),
 * e que a resposta e as gravações do handler continuam as mesmas.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, sortedQueryLog, type FakeSupabase } from '$lib/server/testing/fakeSupabase';

type LogCall = { userId?: string | null; modulo: string; acao: string; detalhes: unknown };

const state = vi.hoisted(() => ({
  db: null as unknown,
  scope: null as Record<string, unknown> | null,
  logs: [] as LogCall[],
  pending: [] as Promise<unknown>[],
}));

vi.mock('$lib/server/v1', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/server/v1')>();
  return {
    ...actual,
    getAdminClient: () => state.db,
    requireAuthenticatedUser: async () => ({ id: 'u-1' }),
    resolveUserScope: async () => state.scope,
  };
});

vi.mock('$lib/server/clientes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/server/clientes')>();
  return {
    ...actual,
    ensureClienteAccess: async () => ({ companyIds: ['c-1'], vendedorIds: [], accessibleClientIds: null }),
  };
});

vi.mock('$lib/server/auditLog', () => ({
  registrarLog: (_event: unknown, params: LogCall & { detalhes: unknown }) => {
    const entry: LogCall = { ...params };
    if (typeof params.detalhes === 'function') {
      state.pending.push(
        (params.detalhes as () => Promise<unknown>)().then((d) => {
          entry.detalhes = d;
        })
      );
    }
    state.logs.push(entry);
  },
}));

import { handleCidadesDelete, handleCidadesPost } from './cidades/root';
import { handleCidadesIdDelete, handleCidadesIdPatch } from './cidades/id';
import { handleClientesIdDelete } from './clientes/id';
import { handleUserProfilePatch } from './user/profile';
import { handleParametrosOrcamentosPdfPost } from './parametros/orcamentos-pdf';
import { handleParametrosEscalasPost } from './parametros/escalas';
import { handleAdminSystemModulesPost } from './admin/system-modules';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_SUB = '22222222-2222-4222-8222-222222222222';
const UUID_MES = '33333333-3333-4333-8333-333333333333';
const UUID_USU = '44444444-4444-4444-8444-444444444444';

const adminScope = {
  userId: 'u-1', isAdmin: true, isMaster: false, isGestor: false, isFinanceiro: false, isVendedor: false,
  papel: 'ADMIN', companyId: 'c-1', companyIds: ['c-1'], permissoes: {},
};

function evento(method: string, path: string, body?: unknown, params: Record<string, string> = {}) {
  const url = `https://vtur.app${path}`;
  const request = new Request(url, {
    method,
    headers: { origin: 'https://vtur.app', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    request,
    url: new URL(url),
    params,
    locals: { safeGetSession: async () => ({ session: {}, user: { id: 'u-1' } }) },
    getClientAddress: () => '10.0.0.1',
    platform: null,
  } as never;
}

async function logs() {
  await Promise.all(state.pending);
  return state.logs;
}

describe('auditoria (formato do histórico da tabela logs)', () => {
  let db: FakeSupabase;
  beforeEach(() => {
    db = createFakeSupabase({
      cidades: [{ id: UUID_A, nome: 'Lisboa', descricao: null, subdivisao_id: UUID_SUB }],
      escala_mes: [{ id: UUID_MES, company_id: 'c-1', gestor_id: 'g-1' }],
      escala_dia: [],
      quote_print_settings: [],
      system_module_settings: [],
      users: [{ id: 'u-1', uso_individual: false }],
      clientes: [{ id: UUID_A }],
    });
    state.db = db;
    state.scope = adminScope;
    state.logs = [];
    state.pending = [];
  });

  it('cidade_criada: payload { nome, descricao, subdivisao_id }', async () => {
    const res = await handleCidadesPost(evento('POST', '/api/v1/cidades', { nome: ' Porto ', subdivisao_id: UUID_SUB }));
    expect(res.status).toBe(200);
    expect(await logs()).toEqual([
      { userId: 'u-1', modulo: 'Cadastros', acao: 'cidade_criada', detalhes: { nome: 'Porto', subdivisao_id: UUID_SUB, descricao: null } },
    ]);
  });

  it('cidade_editada (POST com id): { id, payload }', async () => {
    await handleCidadesPost(evento('POST', '/api/v1/cidades', { id: UUID_A, nome: 'Lisboa', descricao: 'x', subdivisao_id: UUID_SUB }));
    expect(await logs()).toEqual([
      {
        userId: 'u-1', modulo: 'Cadastros', acao: 'cidade_editada',
        detalhes: { id: UUID_A, payload: { nome: 'Lisboa', subdivisao_id: UUID_SUB, descricao: 'x' } },
      },
    ]);
  });

  it('cidade_editada (PATCH /:id) e cidade_excluida (DELETE /:id e DELETE ?id=)', async () => {
    await handleCidadesIdPatch(evento('PATCH', `/api/v1/cidades/${UUID_A}`, { nome: 'Lisboa ' }, { id: UUID_A }));
    await handleCidadesIdDelete(evento('DELETE', `/api/v1/cidades/${UUID_A}`, undefined, { id: UUID_A }));
    await handleCidadesDelete(evento('DELETE', `/api/v1/cidades?id=${UUID_A}`));
    expect(await logs()).toEqual([
      { userId: 'u-1', modulo: 'Cadastros', acao: 'cidade_editada', detalhes: { id: UUID_A, payload: { nome: 'Lisboa' } } },
      { userId: 'u-1', modulo: 'Cadastros', acao: 'cidade_excluida', detalhes: { id: UUID_A } },
      { userId: 'u-1', modulo: 'Cadastros', acao: 'cidade_excluida', detalhes: { id: UUID_A } },
    ]);
  });

  it('erro de validação não gera log', async () => {
    const res = await handleCidadesPost(evento('POST', '/api/v1/cidades', { nome: '' }));
    expect(res.status).toBe(400);
    expect(await logs()).toEqual([]);
  });

  it('cliente_excluido: { id }', async () => {
    const res = await handleClientesIdDelete(evento('DELETE', `/api/v1/clientes/${UUID_A}`, undefined, { id: UUID_A }));
    expect(res.status).toBe(200);
    expect(await logs()).toEqual([
      { userId: 'u-1', modulo: 'Clientes', acao: 'cliente_excluido', detalhes: { id: UUID_A } },
    ]);
  });

  it('perfil_atualizado: o payload gravado em users', async () => {
    await handleUserProfilePatch(evento('PATCH', '/api/v1/user/profile', { cidade: 'São Paulo', estado: 'SP', papel: 'ADMIN' }));
    expect(await logs()).toEqual([
      { userId: 'u-1', modulo: 'perfil', acao: 'perfil_atualizado', detalhes: { cidade: 'São Paulo', estado: 'SP' } },
    ]);
  });

  it('quote_print_settings_salvos: campos da configuração, sem dono e empresa', async () => {
    await handleParametrosOrcamentosPdfPost(
      evento('POST', '/api/v1/parametros/orcamentos-pdf', { settings: { consultor_nome: 'Ana', logo_url: 'https://x/logo.png' } })
    );
    const [log] = await logs();
    expect(log.modulo).toBe('Parametros');
    expect(log.acao).toBe('quote_print_settings_salvos');
    expect(log.detalhes).not.toHaveProperty('owner_user_id');
    expect(log.detalhes).not.toHaveProperty('company_id');
    expect(log.detalhes).toMatchObject({ consultor_nome: 'Ana', logo_url: '/brand/vtur-symbol.png', logo_path: null });
  });

  it('escala_dia_salva: operação insert com empresa e gestor do mês', async () => {
    await handleParametrosEscalasPost(
      evento('POST', '/api/v1/parametros/escalas', {
        action: 'upsert_dia', escala_mes_id: UUID_MES, usuario_id: UUID_USU, data: '2026-10-05',
        tipo: 'TRABALHO', hora_inicio: '10:00', hora_fim: '20:00',
      })
    );
    const [log] = await logs();
    expect(log).toMatchObject({ modulo: 'Escalas', acao: 'escala_dia_salva' });
    expect(Object.keys(log.detalhes as object).sort()).toEqual(
      ['company_id', 'data', 'escala_dia_id', 'escala_mes_id', 'gestor_id', 'gestor_raw_id', 'hora_fim', 'hora_inicio', 'observacao', 'operacao', 'papel', 'tipo', 'usuario_id']
    );
    expect(log.detalhes).toMatchObject({ operacao: 'insert', company_id: 'c-1', gestor_id: 'g-1', tipo: 'TRABALHO', usuario_id: UUID_USU });
  });

  it('escala_dia_lote_salvo: mesmas chaves do histórico', async () => {
    await handleParametrosEscalasPost(
      evento('POST', '/api/v1/parametros/escalas', {
        action: 'apply_batch', escala_mes_id: UUID_MES, usuario_id: UUID_USU, datas: ['2026-10-05', '2026-10-06'], tipo: 'FERIAS',
      })
    );
    const [log] = await logs();
    expect(log).toMatchObject({ modulo: 'Escalas', acao: 'escala_dia_lote_salvo' });
    expect(Object.keys(log.detalhes as object).sort()).toEqual(
      ['company_id', 'datas', 'escala_mes_id', 'gestor_id', 'gestor_raw_id', 'hora_fim', 'hora_inicio', 'horario_informado', 'papel', 'tipo', 'total', 'usuario_id']
    );
    expect(log.detalhes).toMatchObject({ total: 2, tipo: 'FERIAS', horario_informado: false });
  });

  it('modulos_globais_atualizados: { disabled_modules }', async () => {
    await handleAdminSystemModulesPost(evento('POST', '/api/v1/admin/system-modules', { disabled: [{ module_key: 'crm' }] }));
    const [log] = await logs();
    expect(log).toMatchObject({ modulo: 'Admin', acao: 'modulos_globais_atualizados', detalhes: { disabled_modules: ['crm'] } });
  });

  it('as gravações de negócio continuam as mesmas (log de consultas)', async () => {
    await handleCidadesPost(evento('POST', '/api/v1/cidades', { nome: 'Porto', subdivisao_id: UUID_SUB }));
    expect(sortedQueryLog(db.log)).toEqual([
      `insert cidades [] {"nome":"Porto","subdivisao_id":"${UUID_SUB}","descricao":null}`,
    ]);
  });
});
