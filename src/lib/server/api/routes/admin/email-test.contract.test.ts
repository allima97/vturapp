import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  settings: null as Record<string, unknown> | null,
  send: vi.fn()
}));
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/admin', () => ({
  loadEmailSettings: async () => state.settings,
  buildFromEmails: () => ({ admin: 'admin@example.test' })
}));
vi.mock('$lib/server/fetchWithTimeout', () => ({ fetchWithTimeout: state.send }));
vi.mock('$lib/server/persistentRateLimit', () => ({
  checkPersistentRateLimit: async () => ({ allowed: true })
}));
vi.mock('$lib/server/v1', () => ({
  getAdminClient: () => ({}),
  requireAuthenticatedUser: async () => ({ id: 'admin-1' }),
  resolveUserScope: async () => ({ isAdmin: true }),
  logServerError: vi.fn(),
  toErrorResponse: () => new Response('Erro interno', { status: 500 })
}));

import { handleAdminEmailTestPost } from './email-test';

function event(body: Record<string, unknown>, key = '') {
  return {
    request: new Request('https://vtur.app/api/v1/admin/email/test', {
      method: 'POST',
      headers: { origin: 'https://vtur.app', 'content-type': 'application/json' },
      body: JSON.stringify({ to: 'destino@example.test', ...body })
    }),
    platform: { env: { RESEND_API_KEY: key } }
  } as Parameters<typeof handleAdminEmailTestPost>[0];
}

beforeEach(() => {
  state.settings = null;
  state.send.mockReset();
  state.send.mockResolvedValue(new Response(JSON.stringify({ id: 'message-1' }), { status: 200 }));
});

it('usa a chave do ambiente quando não há chave cadastrada', async () => {
  const response = await handleAdminEmailTestPost(event({}, 're_environment'));
  expect(response.status).toBe(200);
  expect(state.send.mock.calls[0][1].headers.Authorization).toBe('Bearer re_environment');
});

it('preserva a prioridade da chave cadastrada sobre a do ambiente', async () => {
  state.settings = { resend_api_key: 're_saved' };
  const response = await handleAdminEmailTestPost(
    event({ resend_api_key: '••••••' }, 're_environment')
  );
  expect(response.status).toBe(200);
  expect(state.send.mock.calls[0][1].headers.Authorization).toBe('Bearer re_saved');
});

it('informa quando nenhuma chave está disponível', async () => {
  const response = await handleAdminEmailTestPost(event({}));
  expect(response.status).toBe(400);
  expect(await response.text()).toContain('Resend nao configurado');
  expect(state.send).not.toHaveBeenCalled();
});
