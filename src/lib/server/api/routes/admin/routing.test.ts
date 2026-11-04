/**
 * Roteamento de /api/v1/admin/* no Hono (gerado por gen_routing_test.py).
 *
 * Os handlers foram movidos SEM alteração dos +server.ts originais (identidade
 * textual verificada na migração). Este teste garante que cada método + URL
 * chega no handler certo, com os mesmos params, tanto pelo app quanto pelo
 * catch-all, e que método não exportado antes continua sem handler (404).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => [] as Array<{ name: string; params: Record<string, unknown> }>);
const spy = vi.hoisted(
  () => (name: string) => async (event: { params: Record<string, unknown> }) => {
    calls.push({ name, params: { ...event.params } });
    return new Response(name, { status: 200 });
  }
);

vi.mock('./tipos-usuario-id-permissoes', () => ({
  handleAdminTiposUsuarioIdPermissoesGet: spy('handleAdminTiposUsuarioIdPermissoesGet'),
  handleAdminTiposUsuarioIdPermissoesPost: spy('handleAdminTiposUsuarioIdPermissoesPost')
}));
vi.mock('./auth-mfa-status', () => ({
  handleAdminAuthMfaStatusPost: spy('handleAdminAuthMfaStatusPost')
}));
vi.mock('./auth-reset-mfa', () => ({
  handleAdminAuthResetMfaPost: spy('handleAdminAuthResetMfaPost')
}));
vi.mock('./auth-set-password', () => ({
  handleAdminAuthSetPasswordPost: spy('handleAdminAuthSetPasswordPost')
}));
vi.mock('./avisos', () => ({
  handleAdminAvisosGet: spy('handleAdminAvisosGet'),
  handleAdminAvisosPost: spy('handleAdminAvisosPost')
}));
vi.mock('./avisos-send', () => ({ handleAdminAvisosSendPost: spy('handleAdminAvisosSendPost') }));
vi.mock('./crm', () => ({
  handleAdminCrmGet: spy('handleAdminCrmGet'),
  handleAdminCrmPost: spy('handleAdminCrmPost')
}));
vi.mock('./email', () => ({
  handleAdminEmailGet: spy('handleAdminEmailGet'),
  handleAdminEmailPost: spy('handleAdminEmailPost')
}));
vi.mock('./email-test', () => ({ handleAdminEmailTestPost: spy('handleAdminEmailTestPost') }));
vi.mock('./empresas', () => ({
  handleAdminEmpresasGet: spy('handleAdminEmpresasGet'),
  handleAdminEmpresasPost: spy('handleAdminEmpresasPost')
}));
vi.mock('./empresas-id', () => ({
  handleAdminEmpresasIdGet: spy('handleAdminEmpresasIdGet'),
  handleAdminEmpresasIdPatch: spy('handleAdminEmpresasIdPatch')
}));
vi.mock('./fix-recibos', () => ({
  handleAdminFixRecibosGet: spy('handleAdminFixRecibosGet'),
  handleAdminFixRecibosPost: spy('handleAdminFixRecibosPost')
}));
vi.mock('./logs', () => ({ handleAdminLogsGet: spy('handleAdminLogsGet') }));
vi.mock('./maintenance', () => ({
  handleAdminMaintenanceGet: spy('handleAdminMaintenanceGet'),
  handleAdminMaintenancePost: spy('handleAdminMaintenancePost')
}));
vi.mock('./master-empresas', () => ({
  handleAdminMasterEmpresasGet: spy('handleAdminMasterEmpresasGet'),
  handleAdminMasterEmpresasPost: spy('handleAdminMasterEmpresasPost')
}));
vi.mock('./modulos-sistema', () => ({
  handleAdminModulosSistemaGet: spy('handleAdminModulosSistemaGet'),
  handleAdminModulosSistemaPost: spy('handleAdminModulosSistemaPost')
}));
vi.mock('./permissoes', () => ({
  handleAdminPermissoesGet: spy('handleAdminPermissoesGet'),
  handleAdminPermissoesPost: spy('handleAdminPermissoesPost')
}));
vi.mock('./permissoes-id', () => ({
  handleAdminPermissoesIdGet: spy('handleAdminPermissoesIdGet'),
  handleAdminPermissoesIdPost: spy('handleAdminPermissoesIdPost')
}));
vi.mock('./planos', () => ({
  handleAdminPlanosGet: spy('handleAdminPlanosGet'),
  handleAdminPlanosPost: spy('handleAdminPlanosPost'),
  handleAdminPlanosDelete: spy('handleAdminPlanosDelete')
}));
vi.mock('./summary', () => ({ handleAdminSummaryGet: spy('handleAdminSummaryGet') }));
vi.mock('./system-modules', () => ({
  handleAdminSystemModulesGet: spy('handleAdminSystemModulesGet'),
  handleAdminSystemModulesPost: spy('handleAdminSystemModulesPost')
}));
vi.mock('./tipos-usuario', () => ({
  handleAdminTiposUsuarioGet: spy('handleAdminTiposUsuarioGet'),
  handleAdminTiposUsuarioPost: spy('handleAdminTiposUsuarioPost')
}));
vi.mock('./tipos-usuario-id', () => ({
  handleAdminTiposUsuarioIdGet: spy('handleAdminTiposUsuarioIdGet')
}));
vi.mock('./usuarios', () => ({
  handleAdminUsuariosGet: spy('handleAdminUsuariosGet'),
  handleAdminUsuariosPost: spy('handleAdminUsuariosPost')
}));
vi.mock('./usuarios-id', () => ({
  handleAdminUsuariosIdGet: spy('handleAdminUsuariosIdGet'),
  handleAdminUsuariosIdPatch: spy('handleAdminUsuariosIdPatch')
}));

import { apiApp } from '../../app';
import * as catchAll from '../../../../../routes/api/v1/[...path]/+server';

const CASES: Array<[string, string, string, Record<string, string>]> = [
  [
    'GET',
    '/api/v1/admin/tipos-usuario/id-123/permissoes',
    'handleAdminTiposUsuarioIdPermissoesGet',
    { id: 'id-123' }
  ],
  [
    'POST',
    '/api/v1/admin/tipos-usuario/id-123/permissoes',
    'handleAdminTiposUsuarioIdPermissoesPost',
    { id: 'id-123' }
  ],
  ['POST', '/api/v1/admin/auth/mfa-status', 'handleAdminAuthMfaStatusPost', {}],
  ['POST', '/api/v1/admin/auth/reset-mfa', 'handleAdminAuthResetMfaPost', {}],
  ['POST', '/api/v1/admin/auth/set-password', 'handleAdminAuthSetPasswordPost', {}],
  ['GET', '/api/v1/admin/avisos', 'handleAdminAvisosGet', {}],
  ['POST', '/api/v1/admin/avisos', 'handleAdminAvisosPost', {}],
  ['POST', '/api/v1/admin/avisos/send', 'handleAdminAvisosSendPost', {}],
  ['GET', '/api/v1/admin/crm', 'handleAdminCrmGet', {}],
  ['POST', '/api/v1/admin/crm', 'handleAdminCrmPost', {}],
  ['GET', '/api/v1/admin/email', 'handleAdminEmailGet', {}],
  ['POST', '/api/v1/admin/email', 'handleAdminEmailPost', {}],
  ['POST', '/api/v1/admin/email/test', 'handleAdminEmailTestPost', {}],
  ['GET', '/api/v1/admin/empresas', 'handleAdminEmpresasGet', {}],
  ['POST', '/api/v1/admin/empresas', 'handleAdminEmpresasPost', {}],
  ['GET', '/api/v1/admin/empresas/id-123', 'handleAdminEmpresasIdGet', { id: 'id-123' }],
  ['PATCH', '/api/v1/admin/empresas/id-123', 'handleAdminEmpresasIdPatch', { id: 'id-123' }],
  ['GET', '/api/v1/admin/fix-recibos', 'handleAdminFixRecibosGet', {}],
  ['POST', '/api/v1/admin/fix-recibos', 'handleAdminFixRecibosPost', {}],
  ['GET', '/api/v1/admin/logs', 'handleAdminLogsGet', {}],
  ['GET', '/api/v1/admin/maintenance', 'handleAdminMaintenanceGet', {}],
  ['POST', '/api/v1/admin/maintenance', 'handleAdminMaintenancePost', {}],
  ['GET', '/api/v1/admin/master-empresas', 'handleAdminMasterEmpresasGet', {}],
  ['POST', '/api/v1/admin/master-empresas', 'handleAdminMasterEmpresasPost', {}],
  ['GET', '/api/v1/admin/modulos-sistema', 'handleAdminModulosSistemaGet', {}],
  ['POST', '/api/v1/admin/modulos-sistema', 'handleAdminModulosSistemaPost', {}],
  ['GET', '/api/v1/admin/permissoes', 'handleAdminPermissoesGet', {}],
  ['POST', '/api/v1/admin/permissoes', 'handleAdminPermissoesPost', {}],
  ['GET', '/api/v1/admin/permissoes/id-123', 'handleAdminPermissoesIdGet', { id: 'id-123' }],
  ['POST', '/api/v1/admin/permissoes/id-123', 'handleAdminPermissoesIdPost', { id: 'id-123' }],
  ['GET', '/api/v1/admin/planos', 'handleAdminPlanosGet', {}],
  ['POST', '/api/v1/admin/planos', 'handleAdminPlanosPost', {}],
  ['DELETE', '/api/v1/admin/planos', 'handleAdminPlanosDelete', {}],
  ['GET', '/api/v1/admin/summary', 'handleAdminSummaryGet', {}],
  ['GET', '/api/v1/admin/system-modules', 'handleAdminSystemModulesGet', {}],
  ['POST', '/api/v1/admin/system-modules', 'handleAdminSystemModulesPost', {}],
  ['GET', '/api/v1/admin/tipos-usuario', 'handleAdminTiposUsuarioGet', {}],
  ['POST', '/api/v1/admin/tipos-usuario', 'handleAdminTiposUsuarioPost', {}],
  ['GET', '/api/v1/admin/tipos-usuario/id-123', 'handleAdminTiposUsuarioIdGet', { id: 'id-123' }],
  ['GET', '/api/v1/admin/usuarios', 'handleAdminUsuariosGet', {}],
  ['POST', '/api/v1/admin/usuarios', 'handleAdminUsuariosPost', {}],
  ['GET', '/api/v1/admin/usuarios/id-123', 'handleAdminUsuariosIdGet', { id: 'id-123' }],
  ['PATCH', '/api/v1/admin/usuarios/id-123', 'handleAdminUsuariosIdPatch', { id: 'id-123' }]
];

const SEM_HANDLER: Array<[string, string]> = [
  ['PUT', '/api/v1/admin/auth/mfa-status'],
  ['PUT', '/api/v1/admin/auth/reset-mfa'],
  ['PUT', '/api/v1/admin/auth/set-password'],
  ['PUT', '/api/v1/admin/avisos'],
  ['PUT', '/api/v1/admin/avisos/send'],
  ['PUT', '/api/v1/admin/crm'],
  ['PUT', '/api/v1/admin/email'],
  ['PUT', '/api/v1/admin/email/test'],
  ['PUT', '/api/v1/admin/empresas'],
  ['PUT', '/api/v1/admin/empresas/id-123'],
  ['PUT', '/api/v1/admin/fix-recibos'],
  ['PUT', '/api/v1/admin/logs'],
  ['PUT', '/api/v1/admin/maintenance'],
  ['PUT', '/api/v1/admin/master-empresas'],
  ['PUT', '/api/v1/admin/modulos-sistema'],
  ['PUT', '/api/v1/admin/permissoes'],
  ['PUT', '/api/v1/admin/permissoes/id-123'],
  ['PUT', '/api/v1/admin/planos'],
  ['PUT', '/api/v1/admin/summary'],
  ['PUT', '/api/v1/admin/system-modules'],
  ['PUT', '/api/v1/admin/tipos-usuario'],
  ['PUT', '/api/v1/admin/tipos-usuario/id-123'],
  ['PUT', '/api/v1/admin/usuarios'],
  ['PUT', '/api/v1/admin/usuarios/id-123']
];

function ev(method: string, path: string) {
  const request = new Request(`https://vturapp.test${path}`, { method });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { request, url: new URL(request.url), params: {}, locals: {}, platform: undefined } as any;
}

beforeEach(() => {
  calls.length = 0;
});

describe('admin → handler', () => {
  it.each(CASES)('%s %s → %s', async (method, path, handler, params) => {
    const e = ev(method, path);
    const res = await apiApp.fetch(e.request, { event: e });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(handler);
    expect(calls).toEqual([{ name: handler, params }]);
  });

  it('catch-all também encaminha', async () => {
    for (const [method, path, handler, params] of CASES) {
      calls.length = 0;
      const fn = (catchAll as Record<string, (e: unknown) => Promise<Response>>)[method];
      const res = await fn(ev(method, path));
      expect(await res.text()).toBe(handler);
      expect(calls).toEqual([{ name: handler, params }]);
    }
  });

  it('método que não existia continua sem handler', async () => {
    for (const [method, path] of SEM_HANDLER) {
      const e = ev(method, path);
      const res = await apiApp.fetch(e.request, { event: e });
      expect(res.status).toBe(404);
    }
    expect(calls).toEqual([]);
  });
});
