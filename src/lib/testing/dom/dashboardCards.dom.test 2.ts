import { afterEach, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';

const api = vi.hoisted(() => ({ fetch: vi.fn(), get: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$lib/services/api', () => ({
  apiFetch: api.fetch,
  apiGet: api.get,
  apiPost: vi.fn(),
  isCanceledApiError: () => false
}));
import Dashboard from '$lib/dashboard/UnifiedDashboard.svelte';

afterEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  document.body.replaceChildren();
});

it.each([
  { orcamentos: true, consultorias: true, permission: true, atividades: false },
  { orcamentos: true, consultorias: true, permission: true, atividades: true },
  { orcamentos: true, consultorias: false, permission: true, atividades: false },
  { orcamentos: false, consultorias: true, permission: true, atividades: false },
  { orcamentos: true, consultorias: true, permission: false, atividades: false }
])('agrupa somente os cards visíveis e autorizados: %o', async (cenario) => {
  api.fetch.mockResolvedValue({
    podeVerConsultoria: cenario.permission,
    widgetPrefs: [
      { widget: 'orcamentos', visivel: cenario.orcamentos },
      { widget: 'consultorias', visivel: cenario.consultorias },
      { widget: 'atividades_recentes', visivel: cenario.atividades }
    ]
  });
  api.get.mockResolvedValue({ items: [] });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Dashboard, { target });
  await vi.waitFor(() => expect(api.fetch).toHaveBeenCalled());
  await vi.waitFor(() => {
    expect(target.textContent?.includes('Consultorias agendadas')).toBe(
      cenario.consultorias && cenario.permission
    );
    expect(target.textContent?.includes('Orçamentos Recentes')).toBe(cenario.orcamentos);
  });
  const cards = [...target.querySelectorAll('.vtur-card')];
  const orcamentos = cards.find((card) => card.textContent?.includes('Orçamentos Recentes'));
  const consultorias = cards.find((card) => card.textContent?.includes('Consultorias agendadas'));
  const grid = (orcamentos || consultorias)?.parentElement;
  expect(grid?.classList.contains('grid-cols-1')).toBe(true);
  expect(grid?.classList.contains('lg:grid-cols-2')).toBe(Boolean(orcamentos && consultorias));
  if (orcamentos && consultorias) expect(orcamentos.parentElement).toBe(consultorias.parentElement);
  if (cenario.atividades) {
    const atividades = cards.find((card) => card.textContent?.includes('Atividades Recentes'));
    expect(atividades).toBeDefined();
    expect(atividades?.parentElement).not.toBe(grid);
  }
  await unmount(app);
});
