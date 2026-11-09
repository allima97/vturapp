// Ativar somente após integrar os consumidores e validar a base mundial remota.
export const catalogoGeograficoAtivo = false;
// Exige editor completo, migrações aplicadas e base remota validada.
export const roteiroGeograficoAtivo = false;
// Ativar somente junto ao fluxo geográfico e após aplicar a migração de revisão.
export const revisaoRoteiroAtiva = false;
// Ativar somente após integrar todos os módulos e validar a base mundial remota.
export const vendasGeograficasAtivas = false;
// Ativar somente após integrar todos os módulos e validar a base mundial remota.
export const produtosGeograficosAtivos = false;
// Exige editor, proteção contra clientes antigos e migração de fornecedores.
export const fornecedoresGeograficosAtivos = false;
// Orçamentos, consultoria, viagens, vouchers, preferências e relatórios.
// Permanece desligada: não grava identidade geográfica nem altera dados existentes.
export const modulosOperacionaisGeograficosAtivos = false;

export function campoGeografico(
  id: string | null | undefined,
  nome = 'destino_geografico_id'
): Record<string, string> {
  if (!modulosOperacionaisGeograficosAtivos || !id) return {};
  return { [nome]: id };
}
