/**
 * Client Drizzle para D1.
 *
 * Como usar nos handlers SvelteKit:
 *   import { getDb } from '$lib/server/db/client';
 *
 *   export const GET: RequestHandler = async ({ platform }) => {
 *     const db = getDb(platform);
 *     const rows = await db.select().from(empresas).all();
 *     return json(rows);
 *   };
 *
 * Como usar nos handlers Hono:
 *   app.get('/empresas', async (c) => {
 *     const db = getDb(c.env.DB);
 *     // ...
 *   });
 *
 * Em desenvolvimento com `vite dev` (sem wrangler), `platform?.env?.DB`
 * é undefined — use `npm run dev:cf` (wrangler dev --local) para ter
 * o D1 local disponível.
 */

import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

/**
 * Cria uma instância Drizzle conectada ao D1.
 *
 * @param db - D1Database binding, obtido de:
 *   - event.platform?.env?.DB  (em SvelteKit +server.ts)
 *   - c.env.DB                 (em Hono handlers)
 */
export function getDb(db: D1Database) {
  return drizzle(db, { schema });
}

/**
 * Helper para handlers SvelteKit que recebem `platform`.
 * Lança se D1 não estiver disponível (dev sem wrangler).
 */
export function getDbFromPlatform(platform: App.Platform | undefined) {
  const d1 = platform?.env?.DB;
  if (!d1) {
    throw new Error(
      'D1 não disponível: use `npm run dev:cf` (wrangler dev --local) em desenvolvimento.'
    );
  }
  return getDb(d1);
}

export type DrizzleDb = ReturnType<typeof getDb>;
