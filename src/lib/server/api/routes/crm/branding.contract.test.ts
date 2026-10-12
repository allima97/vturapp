import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { createFakeSupabase, type FakeSupabase } from '$lib/server/testing/fakeSupabase';
import { VTUR_LOGO_PATH } from '$lib/brand';

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('$lib/server/v1', async (importOriginal) => ({
  ...await importOriginal<typeof import('$lib/server/v1')>(),
  getAdminClient: () => state.db,
  requireAuthenticatedUser: async () => ({ id: 'user-1' }),
  resolveUserScope: async () => ({ isAdmin: true, papel: 'ADMIN', companyId: 'company-1' }),
}));
import { handleCrmLibraryGet } from './library';
import { handleParametrosEmpresaGet } from '../parametros/empresa';
import { handleParametrosOrcamentosPdfGet } from '../parametros/orcamentos-pdf';

let db: FakeSupabase;
const oldLogo = 'https://example.com/legacy-logo.png';
function event(): RequestEvent {
  return { locals: { supabase: db }, request: new Request('https://vtur.test/api/v1/crm/library') } as unknown as RequestEvent;
}
beforeEach(() => {
  db = createFakeSupabase({
    companies: [{ id: 'company-1', nome_empresa: 'Agência de viagens', logo_url: oldLogo }],
    users: [{ id: 'user-1', company_id: 'company-1', nome_completo: 'Consultor' }],
    quote_print_settings: [{ owner_user_id: 'user-1', consultor_nome: 'Consultor', logo_url: oldLogo, logo_path: 'legacy/logo.png' }],
    crm_template_categories: [], user_crm_assinaturas: [], user_message_templates: [],
    user_message_template_themes: [{ id: 'theme-1', nome: 'Tema personalizado', user_id: 'user-1', scope: 'user', logo_url: oldLogo, logo_path: 'legacy/logo.png' }],
  });
  state.db = db;
});

describe('identidade VTur em configurações antigas', () => {
  it('padroniza os modelos e configurações da biblioteca sem buscar logos externos', async () => {
    const response = await handleCrmLibraryGet(event());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.settings).toMatchObject({ consultor_nome: 'Consultor', logo_url: VTUR_LOGO_PATH, logo_path: null });
    expect(body.themes.length).toBeGreaterThan(0);
    expect(body.themes.every((theme: { logo_url: string; logo_path: null }) => theme.logo_url === VTUR_LOGO_PATH && theme.logo_path === null)).toBe(true);
    expect(JSON.stringify(body)).not.toContain(oldLogo);
    expect(JSON.stringify(body)).not.toContain('legacy/logo.png');
  });
  it.each([handleParametrosEmpresaGet, handleParametrosOrcamentosPdfGet])('retorna somente a marca VTur nos parâmetros', async (handler) => {
    const response = await handler(event());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect((body.settings || body).logo_url).toBe(VTUR_LOGO_PATH);
    expect(JSON.stringify(body)).not.toContain(oldLogo);
  });
});
