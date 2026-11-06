import type { DataClient } from '$lib/dataClientTypes';
/**
 * Fase 6.1: aviso em tempo real de recado novo/alterado no mural (Dados Realtime).
 *
 * Só avisa que algo mudou; quem busca os dados continua sendo a API do mural
 * (/api/v1/mural/recados), com as mesmas regras de visibilidade. O Realtime respeita o RLS
 * de `mural_recados` (cada usuário só recebe o que pode ver). A tabela já está na publicação
 * `dados_realtime`. Se o Realtime não conectar, a tela segue com a atualização periódica.
 */

type CanalMinimo = {
  on: (...args: unknown[]) => CanalMinimo;
  subscribe: (cb?: (status: string) => void) => unknown;
};

export type ClienteRealtime = Pick<DataClient, 'channel' | 'removeChannel'>;

export function assinarRecadosDaEmpresa(
  client: ClienteRealtime | null | undefined,
  companyId: string,
  onMudanca: () => void,
  onStatus?: (status: string) => void
): () => void {
  if (!client || typeof client.channel !== 'function' || !companyId) return () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;
  // Várias mudanças seguidas (ex.: recado + anexo) viram uma busca só.
  const avisar = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onMudanca();
    }, 300);
  };

  let canal: ReturnType<DataClient['channel']> | null = null;
  try {
    canal = client.channel(`mural-recados:${companyId}:${Math.random().toString(36).slice(2, 8)}`);
    (canal as unknown as CanalMinimo)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mural_recados',
          filter: `company_id=eq.${companyId}`
        },
        avisar
      )
      .subscribe((status: string) => onStatus?.(status));
  } catch {
    canal = null;
  }

  return () => {
    if (timer) clearTimeout(timer);
    if (canal) {
      try {
        void client.removeChannel(canal);
      } catch {
        // canal já encerrado
      }
    }
  };
}
