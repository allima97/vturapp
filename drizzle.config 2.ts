import { defineConfig } from 'drizzle-kit';

/**
 * Configuração do Drizzle Kit para inspeção/Studio.
 *
 * Uso:
 *   npm run drizzle:studio     — interface visual (requer wrangler dev)
 *
 * Wrangler SQL em ./drizzle é a fonte canônica aplicada por ambiente.
 * O journal/snapshots Drizzle estão atrás da história manual 0006–0010;
 * migrations geradas em outra pasta não devem ser aplicadas por Wrangler.
 *
 * Referência: docs/f1/F1-03-drizzle.md
 */
export default defineConfig({
  out: './drizzle-generated',
  schema: './src/lib/server/db/schema.ts',
  dialect: 'sqlite'

  // Para drizzle-studio com D1 remoto (opcional):
  // driver: 'd1-http',
  // dbCredentials: {
  //   accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  //   databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID!,
  //   token: process.env.CLOUDFLARE_D1_TOKEN!,
  // },
});
