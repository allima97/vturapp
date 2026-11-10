import { browser, dev } from '$app/environment';
import { auth, type Session } from '$lib/stores/auth';
import { permissoes } from '$lib/stores/permissoes';
import { createBrowserDataClient } from '$lib/db/browserData';
import { toUserMessage } from '$lib/utils/errors';

let authListenerInitialized = false;

export const load = async () => {
  if (browser) {
    const dados = createBrowserDataClient();

    const {
      data: { session }
    } = await dados.auth.getSession();

    if (session?.user) {
      auth.setAuth(session.user, session);
      // Permissões são inicializadas pelo (app)/+layout.svelte após sessionSynced
      // mas garantimos que o auth store esteja pronto para o listener abaixo
    } else {
      auth.setLoading(false);
      permissoes.reset();
    }

    if (!authListenerInitialized) {
      authListenerInitialized = true;

      dados.auth.onAuthStateChange(async (event: string, session) => {
        if (
          (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') &&
          session
        ) {
          auth.setAuth(session.user, session);
          // Reinicializa permissões quando auth muda
          try {
            await permissoes.init(dados);
          } catch (err) {
            if (dev) {
              console.error('[layout.ts] Erro ao reinicializar permissoes', {
                message: toUserMessage(err, '')
              });
            }
          }
          return;
        }

        if (event === 'SIGNED_OUT') {
          auth.clear();
          permissoes.reset();
        }
      });
    }
  }

  return {};
};
