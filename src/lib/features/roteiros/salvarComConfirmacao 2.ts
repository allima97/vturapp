import { isIdentidadesRemovidas } from '$lib/roteiroIdentidadesRemovidas';
import { ApiError, apiPost } from '$lib/services/api';
import { confirmAction } from '$lib/stores/confirm';

export async function salvarRoteiroComConfirmacao(
  payload: Record<string, unknown>,
  revisaoAtiva: boolean
): Promise<{ revisao?: string } | null> {
  const snapshot: Record<string, unknown> = JSON.parse(JSON.stringify(payload));
  try {
    return await apiPost<{ revisao?: string }>('/api/v1/roteiros/save', snapshot);
  } catch (error) {
    const dados =
      error instanceof ApiError &&
      error.status === 409 &&
      error.payload &&
      typeof error.payload === 'object' &&
      'identidades_removidas' in error.payload
        ? error.payload.identidades_removidas
        : null;
    if (!revisaoAtiva || !isIdentidadesRemovidas(dados)) throw error;
    const lista = dados
      .map((item) => `${item.colecao}: ${item.cidade_id} (${item.quantidade})`)
      .join('\n');
    if (
      !(await confirmAction({
        title: 'Confirmar alteração de destinos',
        message: `Este salvamento remove ou substitui vínculos geográficos:\n${lista}\nConfirme apenas se essas alterações foram intencionais.`,
        confirmLabel: 'Confirmar alterações',
        color: 'orcamentos'
      }))
    )
      return null;
    return apiPost<{ revisao?: string }>('/api/v1/roteiros/save', {
      ...snapshot,
      identidades_removidas_confirmadas: dados
    });
  }
}
