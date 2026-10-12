/**
 * Geocoding automático de cidades via Nominatim (OpenStreetMap) — gratuito, sem chave de API.
 * Mesmo princípio do astrologiapessoal: busca externa em vez de catálogo pré-populado.
 *
 * Nominatim ToS: https://operations.osmfoundation.org/policies/nominatim/
 *   - User-Agent obrigatório
 *   - Max 1 req/s (resolvido pelo cache da camada de cima)
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'VturApp/1.0 (contato@sgvtur.com.br)';

export type CidadeGeoResult = {
  /** Nome da cidade (localidade) */
  nome: string;
  /** Estado / região administrativa */
  estado?: string | null;
  /** Código curto do estado (ex: "SP") */
  estado_codigo?: string | null;
  /** Nome do país */
  pais?: string | null;
  /** ISO 3166-1 alpha-2 */
  pais_codigo?: string | null;
  lat: number;
  lng: number;
  /** Label formatado para exibição */
  label: string;
};

type NominatimResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    state_code?: string;
    country?: string;
    country_code?: string;
    [key: string]: string | undefined;
  };
  type?: string;
  class?: string;
};

function extractCity(address: NominatimResult['address']): string | undefined {
  if (!address) return undefined;
  return (
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county
  );
}

function makeLabel(nome: string, estado?: string | null, pais?: string | null): string {
  const parts = [nome, estado, pais].filter(Boolean);
  return parts.join(', ');
}

function toGeoResult(result: NominatimResult): CidadeGeoResult | null {
  const lat = Number(result.lat);
  const lng = Number(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const address = result.address ?? {};
  const nome = extractCity(address);
  if (!nome) return null;

  const estado = address.state ?? null;
  const estadoCodigo = address.state_code?.toUpperCase() ?? null;
  const pais = address.country ?? null;
  const paisCodigo = address.country_code?.toUpperCase() ?? null;

  return {
    nome,
    estado,
    estado_codigo: estadoCodigo,
    pais,
    pais_codigo: paisCodigo,
    lat,
    lng,
    label: makeLabel(nome, estadoCodigo ?? estado, pais),
  };
}

function deduplicateResults(items: CidadeGeoResult[]): CidadeGeoResult[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.nome.toLowerCase()}|${item.lat.toFixed(2)}|${item.lng.toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Busca cidades no Nominatim pelo texto digitado pelo usuário.
 * Retorna sugestões ordenadas por relevância (Nominatim já faz isso).
 */
export async function buscarCidadesGeo(
  query: string,
  limite = 8
): Promise<CidadeGeoResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  try {
    const params = new URLSearchParams({
      q,
      format: 'json',
      limit: String(Math.min(limite * 2, 20)), // pede mais para depois deduplicar
      addressdetails: '1',
      featuretype: 'city',
    });

    const response = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
    });

    if (!response.ok) {
      console.warn(`[geocoding] Nominatim retornou ${response.status}`);
      return [];
    }

    const data = (await response.json()) as NominatimResult[];
    const results = data
      .map(toGeoResult)
      .filter((item): item is CidadeGeoResult => item !== null);

    return deduplicateResults(results).slice(0, limite);
  } catch (err) {
    console.warn('[geocoding] Falha ao buscar cidades:', err);
    return [];
  }
}
