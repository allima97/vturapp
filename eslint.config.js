// @ts-check
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import svelteConfig from './svelte.config.js';

export default ts.config(
  {
    ignores: [
      'node_modules/**',
      '.svelte-kit/**',
      '.wrangler/**',
      'dist/**',
      'build/**',
      'static/**',
      'drizzle/**',
      'supabase/**',
      'tmp/**',
      'docs/**',
      'scripts/**',
      'vite.config.ts.timestamp-*.mjs',
      '*.cjs',
      'src/lib/components/ui/flowbite-legacy/**',
      'src/lib/icons/**'
    ]
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  prettier,
  ...svelte.configs['flat/prettier'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      // Tipos do TS (RequestInfo etc.) não existem como globals; o tsc cobre
      'no-undef': 'off',
      // Débito legado visível sem bloquear o lint
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      // @ts-nocheck/@ts-ignore pontuais são deliberados (legado e testes de paridade)
      '@typescript-eslint/ban-ts-comment': 'off',
      // Comentários svelte-ignore podem servir ao svelte-check mesmo sem aviso do plugin
      'svelte/no-unused-svelte-ignore': 'off'
    }
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
        svelteConfig
      }
    },
    rules: {
      // O parser do Svelte produz nós que quebram a regra TS (incompatibilidade
      // typescript-eslint × svelte-eslint-parser); unused em .svelte é coberto
      // pelo svelte-check
      '@typescript-eslint/no-unused-vars': 'off',
      // Expressões soltas em blocos $: são idiomáticas para forçar reatividade
      '@typescript-eslint/no-unused-expressions': 'off'
    }
  }
);
