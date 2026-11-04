import { browser } from '$app/environment';
import { browserData } from '$lib/db/browserData';

const SESSION_SYNC_TIMEOUT_MS = 600;
const SESSION_SYNC_COOLDOWN_MS = 60_000;

let pendingServerSessionSync: Promise<void> | null = null;
let lastServerSessionSyncAttemptAt = 0;

export async function ensureServerSessionCookie() {
  if (!browser) return;
  const now = Date.now();
  if (pendingServerSessionSync) {
    await pendingServerSessionSync;
    return;
  }
  if (now - lastServerSessionSyncAttemptAt < SESSION_SYNC_COOLDOWN_MS) {
    return;
  }

  pendingServerSessionSync = (async () => {
    lastServerSessionSyncAttemptAt = Date.now();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), SESSION_SYNC_TIMEOUT_MS);
    try {
      const {
        data: { session }
      } = await browserData.auth.getSession();
      if (!session) return;

      await fetch('/api/auth/set-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        credentials: 'same-origin',
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        })
      });
    } catch {
      // Falha silenciosa: a tela chamadora deve tratar 401/403 no carregamento.
    } finally {
      window.clearTimeout(timeout);
    }
  })();

  try {
    await pendingServerSessionSync;
  } finally {
    pendingServerSessionSync = null;
  }
}
