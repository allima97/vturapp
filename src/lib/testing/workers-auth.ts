/** Better Auth boundary for D1 integration tests. */
export function createAuth(d1: D1Database) {
  return {
    api: {
      async getSession({ headers }: { headers: Headers }) {
        const cookie = headers.get('cookie') ?? '';
        const token = cookie.match(/(?:^|;\s*)better-auth\.session_token=([^;]+)/)?.[1];
        if (!token) return null;

        const row = await d1
          .prepare(
            `SELECT s.id AS session_id, s.user_id, s.expires_at,
                    u.email, u.name
             FROM session s JOIN user u ON u.id = s.user_id
             WHERE s.token = ? AND s.expires_at > ? LIMIT 1`
          )
          .bind(decodeURIComponent(token), Date.now())
          .first<{ session_id: string; user_id: string; expires_at: number; email: string; name: string }>();

        if (!row) return null;
        return {
          user: { id: row.user_id, email: row.email, name: row.name },
          session: { id: row.session_id, userId: row.user_id, expiresAt: new Date(row.expires_at) },
        };
      },
    },
  };
}
