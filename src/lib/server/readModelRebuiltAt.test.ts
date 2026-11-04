import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/v1', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/v1')>()),
  getAdminClient: () => ({})
}));

import { oldestRebuiltAt } from './reciboContribuicoesReadModel';

describe('oldestRebuiltAt ("Dados atualizados há X" do dashboard)', () => {
  it('usa a reconstrução mais antiga entre os meses/empresas exibidos', () => {
    expect(
      oldestRebuiltAt([
        { rebuilt_at: '2026-09-24T12:00:00.000Z' },
        { rebuilt_at: '2026-09-24T10:30:00.000Z' },
        { rebuilt_at: '2026-09-24T11:00:00.000Z' }
      ])
    ).toBe('2026-09-24T10:30:00.000Z');
  });

  it('ignora linhas sem rebuilt_at ou com data inválida', () => {
    expect(
      oldestRebuiltAt([
        { rebuilt_at: null },
        { rebuilt_at: 'x' },
        { rebuilt_at: '2026-09-24T09:00:00+00:00' }
      ])
    ).toBe('2026-09-24T09:00:00.000Z');
  });

  it('sem nenhuma data válida → null (a tela não mostra a indicação)', () => {
    expect(oldestRebuiltAt([])).toBeNull();
    expect(oldestRebuiltAt([{ rebuilt_at: null }])).toBeNull();
  });
});
