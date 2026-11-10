import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { withRouteParams } from '../../params';
import { handleAdminAuthMfaStatusPost } from './auth-mfa-status';
import { handleAdminAuthResetMfaPost } from './auth-reset-mfa';
import { handleAdminAuthSetPasswordPost } from './auth-set-password';
import { handleAdminAvisosGet, handleAdminAvisosPost } from './avisos';
import { handleAdminAvisosSendPost } from './avisos-send';
import { handleAdminCrmGet, handleAdminCrmPost } from './crm';
import { handleAdminEmailGet, handleAdminEmailPost } from './email';
import { handleAdminEmailTestPost } from './email-test';
import { handleAdminEmpresasGet, handleAdminEmpresasPost } from './empresas';
import { handleAdminEmpresasIdGet, handleAdminEmpresasIdPatch } from './empresas-id';
import { handleAdminFixRecibosGet, handleAdminFixRecibosPost } from './fix-recibos';
import { handleAdminLogsGet } from './logs';
import { handleAdminMaintenanceGet, handleAdminMaintenancePost } from './maintenance';
import { handleAdminMasterEmpresasGet, handleAdminMasterEmpresasPost } from './master-empresas';
import { handleAdminModulosSistemaGet, handleAdminModulosSistemaPost } from './modulos-sistema';
import { handleAdminPermissoesGet, handleAdminPermissoesPost } from './permissoes';
import { handleAdminPermissoesIdGet, handleAdminPermissoesIdPost } from './permissoes-id';
import { handleAdminPlanosGet, handleAdminPlanosPost, handleAdminPlanosDelete } from './planos';
import { handleAdminSummaryGet } from './summary';
import { handleAdminSystemModulesGet, handleAdminSystemModulesPost } from './system-modules';
import { handleAdminTiposUsuarioGet, handleAdminTiposUsuarioPost } from './tipos-usuario';
import { handleAdminTiposUsuarioIdGet } from './tipos-usuario-id';
import { handleAdminUsuariosGet, handleAdminUsuariosPost } from './usuarios';
import { handleAdminUsuariosIdGet, handleAdminUsuariosIdPatch } from './usuarios-id';
import {
  handleAdminTiposUsuarioIdPermissoesGet,
  handleAdminTiposUsuarioIdPermissoesPost
} from './tipos-usuario-id-permissoes';

// /api/v1/admin/* atendido pelo Hono (gerado por migrate_domain.py). Estáticas antes de '/:param'.
export const adminRoutes = new Hono<ApiEnv>()
  .post('/auth/mfa-status', (c) => handleAdminAuthMfaStatusPost(c.env.event))
  .post('/auth/reset-mfa', (c) => handleAdminAuthResetMfaPost(c.env.event))
  .post('/auth/set-password', (c) => handleAdminAuthSetPasswordPost(c.env.event))
  .post('/avisos/send', (c) => handleAdminAvisosSendPost(c.env.event))
  .post('/email/test', (c) => handleAdminEmailTestPost(c.env.event))
  .get('/avisos', (c) => handleAdminAvisosGet(c.env.event))
  .post('/avisos', (c) => handleAdminAvisosPost(c.env.event))
  .get('/crm', (c) => handleAdminCrmGet(c.env.event))
  .post('/crm', (c) => handleAdminCrmPost(c.env.event))
  .get('/email', (c) => handleAdminEmailGet(c.env.event))
  .post('/email', (c) => handleAdminEmailPost(c.env.event))
  .get('/empresas', (c) => handleAdminEmpresasGet(c.env.event))
  .post('/empresas', (c) => handleAdminEmpresasPost(c.env.event))
  .get('/fix-recibos', (c) => handleAdminFixRecibosGet(c.env.event))
  .post('/fix-recibos', (c) => handleAdminFixRecibosPost(c.env.event))
  .get('/logs', (c) => handleAdminLogsGet(c.env.event))
  .get('/maintenance', (c) => handleAdminMaintenanceGet(c.env.event))
  .post('/maintenance', (c) => handleAdminMaintenancePost(c.env.event))
  .get('/master-empresas', (c) => handleAdminMasterEmpresasGet(c.env.event))
  .post('/master-empresas', (c) => handleAdminMasterEmpresasPost(c.env.event))
  .get('/modulos-sistema', (c) => handleAdminModulosSistemaGet(c.env.event))
  .post('/modulos-sistema', (c) => handleAdminModulosSistemaPost(c.env.event))
  .get('/permissoes', (c) => handleAdminPermissoesGet(c.env.event))
  .post('/permissoes', (c) => handleAdminPermissoesPost(c.env.event))
  .get('/planos', (c) => handleAdminPlanosGet(c.env.event))
  .post('/planos', (c) => handleAdminPlanosPost(c.env.event))
  .delete('/planos', (c) => handleAdminPlanosDelete(c.env.event))
  .get('/summary', (c) => handleAdminSummaryGet(c.env.event))
  .get('/system-modules', (c) => handleAdminSystemModulesGet(c.env.event))
  .post('/system-modules', (c) => handleAdminSystemModulesPost(c.env.event))
  .get('/tipos-usuario', (c) => handleAdminTiposUsuarioGet(c.env.event))
  .post('/tipos-usuario', (c) => handleAdminTiposUsuarioPost(c.env.event))
  .get('/usuarios', (c) => handleAdminUsuariosGet(c.env.event))
  .post('/usuarios', (c) => handleAdminUsuariosPost(c.env.event))
  // rota profunda migrada no lote 3 (antes ficava no SvelteKit: +8 níveis de pasta no Windows)
  .get('/tipos-usuario/:id/permissoes', (c) =>
    handleAdminTiposUsuarioIdPermissoesGet(withRouteParams(c.env.event, c.req.param()))
  )
  .post('/tipos-usuario/:id/permissoes', (c) =>
    handleAdminTiposUsuarioIdPermissoesPost(withRouteParams(c.env.event, c.req.param()))
  )
  .get('/empresas/:id', (c) =>
    handleAdminEmpresasIdGet(withRouteParams(c.env.event, c.req.param()))
  )
  .patch('/empresas/:id', (c) =>
    handleAdminEmpresasIdPatch(withRouteParams(c.env.event, c.req.param()))
  )
  .get('/permissoes/:id', (c) =>
    handleAdminPermissoesIdGet(withRouteParams(c.env.event, c.req.param()))
  )
  .post('/permissoes/:id', (c) =>
    handleAdminPermissoesIdPost(withRouteParams(c.env.event, c.req.param()))
  )
  .get('/tipos-usuario/:id', (c) =>
    handleAdminTiposUsuarioIdGet(withRouteParams(c.env.event, c.req.param()))
  )
  .get('/usuarios/:id', (c) =>
    handleAdminUsuariosIdGet(withRouteParams(c.env.event, c.req.param()))
  )
  .patch('/usuarios/:id', (c) =>
    handleAdminUsuariosIdPatch(withRouteParams(c.env.event, c.req.param()))
  );
