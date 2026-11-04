import type { DataClient } from '$lib/dataClientTypes';

export const BAIXA_RAC_USER_NAME = 'Baixa RAC';
export const BAIXA_RAC_DESCRICAO = 'BAIXA DE RAC';

export const EQUIPE_VTUR_USER_NAME = 'Equipe vtur';
const EQUIPE_VTUR_USER_NAME_NORMALIZED = EQUIPE_VTUR_USER_NAME.toLowerCase();

export function isEquipeVturNome(value?: string | null) {
  return (
    String(value || '')
      .trim()
      .toLowerCase() === EQUIPE_VTUR_USER_NAME_NORMALIZED
  );
}

export async function findEquipeVturVendedor(client: DataClient, companyId: string | null) {
  if (!companyId) return null;

  const { data, error } = await client
    .from('users')
    .select('id, nome_completo')
    .eq('company_id', companyId)
    .eq('active', true)
    .ilike('nome_completo', EQUIPE_VTUR_USER_NAME)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data || !data.id) return null;

  return {
    id: String(data.id).trim(),
    nome_completo: String(data.nome_completo || EQUIPE_VTUR_USER_NAME).trim()
  };
}

export function normalizeBaixaRacText(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

const BAIXA_RAC_USER_NAME_NORMALIZED = normalizeBaixaRacText(BAIXA_RAC_USER_NAME);
const BAIXA_RAC_DESCRICAO_NORMALIZED = normalizeBaixaRacText(BAIXA_RAC_DESCRICAO);

export function isBaixaRacUserName(value?: string | null) {
  return normalizeBaixaRacText(value) === BAIXA_RAC_USER_NAME_NORMALIZED;
}

export function isBaixaRacDescricao(value?: string | null) {
  return normalizeBaixaRacText(value) === BAIXA_RAC_DESCRICAO_NORMALIZED;
}

export function isBaixaRacVendorId(
  vendedorId: string | null | undefined,
  baixaRacId?: string | null
) {
  if (!vendedorId || !baixaRacId) return false;
  const normalizedVendedorId = String(vendedorId).trim().toLowerCase();
  const normalizedBaixaRacId = String(baixaRacId).trim().toLowerCase();
  return normalizedVendedorId === normalizedBaixaRacId;
}

export async function findBaixaRacVendedor(client: DataClient, companyId: string | null) {
  if (!companyId) return null;

  const { data, error } = await client
    .from('users')
    .select('id, nome_completo, user_types(name)')
    .eq('company_id', companyId)
    .eq('active', true)
    .ilike('nome_completo', BAIXA_RAC_USER_NAME)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data || !data.id) return null;

  return {
    id: String(data.id).trim(),
    nome_completo: String(data.nome_completo || BAIXA_RAC_USER_NAME).trim(),
    user_types: data.user_types || null
  };
}
