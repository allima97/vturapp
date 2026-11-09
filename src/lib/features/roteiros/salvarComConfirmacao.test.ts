import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '$lib/services/api';

const mocks = vi.hoisted(() => ({ post: vi.fn(), confirm: vi.fn() }));
vi.mock('$lib/services/api', async (original) => ({
  ...(await original<typeof import('$lib/services/api')>()),
  apiPost: mocks.post
}));
vi.mock('$lib/stores/confirm', () => ({ confirmAction: mocks.confirm }));
import { salvarRoteiroComConfirmacao } from './salvarComConfirmacao';

const removidas = [{ colecao: 'dias', cidade_id: 'geonames:1', quantidade: 1 }];

beforeEach(() => {
  mocks.post.mockReset();
  mocks.confirm.mockReset();
});

it('não repete a gravação quando o usuário cancela', async () => {
  mocks.post.mockRejectedValue(new ApiError('Confirme', 409, { identidades_removidas: removidas }));
  mocks.confirm.mockResolvedValue(false);
  expect(
    await salvarRoteiroComConfirmacao({ id: 'roteiro', revisao: 'a', dias: [] }, true)
  ).toBeNull();
  expect(mocks.post).toHaveBeenCalledTimes(1);
  expect(mocks.confirm).toHaveBeenCalledWith(
    expect.objectContaining({ message: expect.stringContaining('geonames:1') })
  );
});

it('repete o mesmo conteúdo e revisão somente após confirmação', async () => {
  const payload: { id: string; revisao: string; dias: { cidade_id: string | null }[] } = {
    id: 'roteiro',
    revisao: 'a',
    dias: [{ cidade_id: null }]
  };
  mocks.post
    .mockRejectedValueOnce(new ApiError('Confirme', 409, { identidades_removidas: removidas }))
    .mockResolvedValueOnce({ revisao: 'b' });
  mocks.confirm.mockImplementation(async () => {
    payload.dias[0].cidade_id = 'geonames:2';
    return true;
  });
  expect(await salvarRoteiroComConfirmacao(payload, true)).toEqual({ revisao: 'b' });
  expect(mocks.post).toHaveBeenLastCalledWith('/api/v1/roteiros/save', {
    id: 'roteiro',
    revisao: 'a',
    dias: [{ cidade_id: null }],
    identidades_removidas_confirmadas: removidas
  });
});

it('não interpreta conflitos comuns, dados inválidos ou flag desligada como confirmação', async () => {
  const errors = [
    new ApiError('Conflito', 409, {}),
    new ApiError('Inválido', 409, { identidades_removidas: [{ ...removidas[0], quantidade: -1 }] }),
    new ApiError('Indisponível', 503, { identidades_removidas: removidas })
  ];
  for (const error of errors) {
    mocks.post.mockRejectedValueOnce(error);
    await expect(salvarRoteiroComConfirmacao({}, true)).rejects.toBe(error);
  }
  const error = new ApiError('Confirme', 409, { identidades_removidas: removidas });
  mocks.post.mockRejectedValueOnce(error);
  await expect(salvarRoteiroComConfirmacao({}, false)).rejects.toBe(error);
  expect(mocks.confirm).not.toHaveBeenCalled();
});
