import { configDefaults, defineWorkspace } from 'vitest/config';
import { defineWorkersProject, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

const d1Migrations = (await readD1Migrations('./drizzle')).filter((migration) =>
  migration.queries.some((query) => query.trim() && !query.trim().startsWith('--'))
);

/**
 * Três grupos de testes:
 * - unit: os testes de sempre, em Node (arquivos *.test.ts).
 * - dom:  testes que montam componentes Svelte num navegador simulado (jsdom).
 *         Só arquivos *.dom.test.ts. Usam a versão "browser" do Svelte (mount/flushSync).
 * - workers: testes de integração no runtime Workers real (workerd via Miniflare),
 *         com D1 e R2 locais. Só arquivos *.workers.test.ts. (F0-05 / F1-03b / F3-01)
 */
export default defineWorkspace([
  {
    extends: './vite.config.ts',
    test: {
      name: 'unit',
      environment: 'node',
      exclude: [...configDefaults.exclude, '**/*.dom.test.ts', '**/*.workers.test.ts']
    }
  },
  {
    extends: './vite.config.ts',
    resolve: { conditions: ['browser'] },
    test: {
      name: 'dom',
      environment: 'jsdom',
      include: ['**/*.dom.test.ts'],
      setupFiles: ['./src/lib/testing/dom/setup.ts']
    }
  },
  defineWorkersProject({
    resolve: {
      alias: {
        '$lib/server/v1': new URL('./src/lib/testing/workers-v1.ts', import.meta.url).pathname,
        '$lib/auth': new URL('./src/lib/testing/workers-auth.ts', import.meta.url).pathname,
        $lib: new URL('./src/lib', import.meta.url).pathname
      }
    },
    test: {
      name: 'workers',
      include: ['**/*.workers.test.ts'],
      poolOptions: {
        workers: {
          wrangler: { configPath: './wrangler.test.toml' },
          miniflare: {
            bindings: {
              // Migrations Drizzle lidas do disco e aplicadas no D1 de teste
              TEST_MIGRATIONS: d1Migrations
            }
          }
        }
      }
    }
  })
]);
