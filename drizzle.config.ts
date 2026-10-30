import { defineConfig } from 'drizzle-kit';

/**
 * Configuração do Drizzle Kit para migrations D1.
 *
 * Uso:
 *   npm run drizzle:generate   — gera nova migration a partir do schema
 *   npm run drizzle:studio     — interface visual (requer wrangler dev)
 *
 * O driver "d1-http" é usado apenas para drizzle-studio; as migrations
 * são aplicadas via wrangler (d1:migrate:local / d1:migrate:staging).
 *
 * Referência: docs/f1/F1-03-drizzle.md
 */
export default defineConfig({
  out: './drizzle',
  schema: './src/lib/server/db/schema.ts',
  dialect: 'sqlite',

  // Para drizzle-studio com D1 remoto (opcional):
  // driver: 'd1-http',
  // dbCredentials: {
  //   accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  //   databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID!,
  //   token: process.env.CLOUDFLARE_D1_TOKEN!,
  // },
});
