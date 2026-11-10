export function flagsGeograficasAtivas(env: Record<string, string | undefined>) {
  const ambientePublicado =
    env.PUBLIC_DEPLOY_ENV === 'production' || env.PUBLIC_DEPLOY_ENV === 'staging';
  const geonamesPedido = env.PUBLIC_GEONAMES_ATIVO === '1' || env.PUBLIC_GEONAMES_ATIVO === 'true';
  return ambientePublicado && geonamesPedido;
}

const geonamesAtivo = flagsGeograficasAtivas({
  PUBLIC_DEPLOY_ENV: import.meta.env.PUBLIC_DEPLOY_ENV,
  PUBLIC_GEONAMES_ATIVO: import.meta.env.PUBLIC_GEONAMES_ATIVO
});

// Ligadas no build de produção (`PUBLIC_DEPLOY_ENV=production`) e no de staging
// (`PUBLIC_DEPLOY_ENV=staging`), sempre com `PUBLIC_GEONAMES_ATIVO=1`.
// Um build sem essas variáveis permanece desligado.
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
