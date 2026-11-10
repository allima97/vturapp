export function flagsGeograficasAtivas(env: Record<string, string | undefined>) {
  return (
    env.PUBLIC_DEPLOY_ENV === 'staging' &&
    (env.PUBLIC_GEONAMES_ATIVO === '1' || env.PUBLIC_GEONAMES_ATIVO === 'true')
  );
}

const geonamesAtivo = flagsGeograficasAtivas({
  PUBLIC_DEPLOY_ENV: import.meta.env.PUBLIC_DEPLOY_ENV,
  PUBLIC_GEONAMES_ATIVO: import.meta.env.PUBLIC_GEONAMES_ATIVO
});

// Ligadas somente no build de staging (`PUBLIC_DEPLOY_ENV=staging` e
// `PUBLIC_GEONAMES_ATIVO=1`). Produção não define essas variáveis.
export const catalogoGeograficoAtivo = geonamesAtivo;
export const roteiroGeograficoAtivo = geonamesAtivo;
export const revisaoRoteiroAtiva = geonamesAtivo;
export const vendasGeograficasAtivas = geonamesAtivo;
export const produtosGeograficosAtivos = geonamesAtivo;
export const fornecedoresGeograficosAtivos = geonamesAtivo;
export const modulosOperacionaisGeograficosAtivos = geonamesAtivo;

export function campoGeografico(
  id: string | null | undefined,
  nome = 'destino_geografico_id'
): Record<string, string> {
  if (!modulosOperacionaisGeograficosAtivos || !id) return {};
  return { [nome]: id };
}
