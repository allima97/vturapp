/**
 * Ponto de entrada do módulo de banco de dados.
 *
 * Re-exporta tudo de schema e client para uso simplificado:
 *   import { getDb, empresas } from '$lib/server/db';
 */
export * from './schema';
export * from './client';
