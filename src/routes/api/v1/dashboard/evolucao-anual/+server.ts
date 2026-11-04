// Migrado para Hono: implementação em src/lib/server/api/routes/dashboard/evolucao-anual.ts
import { apiHandler } from '$lib/server/api/sveltekit';
export type {
  MesBucket,
  AnoEvolucao,
  EvolucaoAnualResult
} from '$lib/server/api/routes/dashboard/evolucao-anual';

export const GET = apiHandler;
