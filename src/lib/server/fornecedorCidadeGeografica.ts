import { destinoIdValido } from '$lib/destinoIdentidade';
import { obterDestino } from '$lib/server/destinosBusca';
import { fornecedoresGeograficosAtivos } from '$lib/config/destinosGeograficos';

export class FornecedorCidadeInvalida extends Error {}

export async function resolverCidadeFornecedor(db: D1Database, geoDb: D1Database, id: unknown) {
  if (!destinoIdValido(id)) throw new FornecedorCidadeInvalida('ID do destino inválido.');
  const destino = await obterDestino(db, geoDb, id, 'pt');
  if (!destino) throw new FornecedorCidadeInvalida('Destino não encontrado.');
  const estado = destino.referencia.regiao?.trim();
  if (!estado)
    throw new FornecedorCidadeInvalida(
      'O destino não possui estado ou região no GeoNames; selecione outra localidade.'
    );
  return {
    cidade_geografica_id: destino.id.toLowerCase(),
    cidade: destino.nome,
    estado
  };
}

type CidadePreparada =
  | { ok: true; cidade?: { cidade_geografica_id: string; cidade: string; estado: string } }
  | { ok: false; status: 400 | 409 | 503; error: string };

export async function prepararCidadeFornecedor(
  body: Record<string, unknown>,
  existente: string | null,
  db: D1Database | undefined,
  geoDb: D1Database | undefined
): Promise<CidadePreparada> {
  const informada = Object.hasOwn(body, 'cidade_geografica_id');
  if (!fornecedoresGeograficosAtivos) {
    if (informada && body.cidade_geografica_id !== null)
      return { ok: false, status: 400, error: 'Cidade geográfica ainda não está disponível.' };
    return { ok: true };
  }
  if (!informada) {
    if (existente)
      return {
        ok: false,
        status: 409,
        error: 'Este fornecedor possui cidade geográfica. Recarregue o cadastro antes de editar.'
      };
    return { ok: true };
  }
  if (body.cidade_geografica_id === null) {
    if (existente)
      return {
        ok: false,
        status: 409,
        error: 'Selecione outra cidade geográfica para substituir o vínculo existente.'
      };
    return { ok: true };
  }
  if (!destinoIdValido(body.cidade_geografica_id))
    return { ok: false, status: 400, error: 'ID do destino inválido.' };
  if (!db || !geoDb)
    return { ok: false, status: 503, error: 'Busca geográfica ainda não está disponível.' };
  try {
    return {
      ok: true,
      cidade: await resolverCidadeFornecedor(db, geoDb, body.cidade_geografica_id)
    };
  } catch (error) {
    if (error instanceof FornecedorCidadeInvalida)
      return { ok: false, status: 400, error: error.message };
    throw error;
  }
}
