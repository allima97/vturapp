import {
  buscarDestinosPersonalizados,
  obterDestinoPersonalizado,
  rotuloReferenciaIndisponivel,
  type DestinoPersonalizado
} from './destinosPersonalizados';
import { destinoIdValido } from '$lib/destinoIdentidade';
import {
  getGeoNamesPlace,
  getGeoNamesPlaces,
  labelGeoNamesPlace,
  labelGeoNamesPlaces,
  searchGeoNames
} from './geonames';
import type { GeoNamesLabel } from './geonames';

type ReferenciaAdministrativa = {
  localidade: string;
  subdivisao_secundaria: string | null;
  regiao: string | null;
  pais: string;
  codigo_pais: string;
};

export type DestinoBusca = {
  id: string;
  nome: string;
  label: string;
  origem: 'geonames' | 'personalizado';
  referencia: ReferenciaAdministrativa;
  referencia_id?: string;
  referencia_indisponivel?: boolean;
};

function destinoSemReferencia(destino: DestinoPersonalizado): DestinoBusca {
  return {
    id: `personalizado:${destino.id}`,
    nome: destino.nome,
    label: rotuloReferenciaIndisponivel(destino.nome),
    origem: 'personalizado',
    referencia_id: `geonames:${destino.referenciaGeoNamesId}`,
    referencia_indisponivel: true,
    referencia: {
      localidade: destino.nome,
      subdivisao_secundaria: null,
      regiao: null,
      pais: '',
      codigo_pais: ''
    }
  };
}

export function referenciaAdministrativa(resultado: GeoNamesLabel): ReferenciaAdministrativa {
  return {
    localidade: resultado.name,
    subdivisao_secundaria: resultado.districtName,
    regiao: resultado.regionName,
    pais: resultado.countryName,
    codigo_pais: resultado.countryCode
  };
}

export async function buscarDestinosExatos(
  geoDb: D1Database,
  texto: string,
  locale: string,
  pais: string,
  offset: number
): Promise<{ items: DestinoBusca[]; podeHaverMais: boolean }> {
  const lugares = await searchGeoNames(geoDb, texto, 9, {
    exact: true,
    countryCode: pais || undefined,
    offset
  });
  const labels = await labelGeoNamesPlaces(geoDb, lugares.slice(0, 8), locale);
  return {
    items: labels.map((resultado) => ({
      id: `geonames:${resultado.id}`,
      nome: resultado.name,
      label: resultado.label,
      origem: 'geonames',
      referencia: referenciaAdministrativa(resultado)
    })),
    podeHaverMais: lugares.length > 8
  };
}

export async function buscarDestinos(
  db: D1Database,
  geoDb: D1Database,
  texto: string,
  locale: string,
  limite = 8,
  somenteGeonames = false
): Promise<{ items: DestinoBusca[]; podeHaverMais: boolean }> {
  if (!Number.isInteger(limite) || limite < 1 || limite > 49)
    throw new Error('Limite de busca inválido.');
  const [locais, lugares] = await Promise.all([
    somenteGeonames ? Promise.resolve([]) : buscarDestinosPersonalizados(db, texto, limite + 1),
    searchGeoNames(geoDb, texto, limite + 1)
  ]);
  const locaisExibidos = locais.slice(0, limite);
  const lugaresExibidos = lugares.slice(0, limite - locaisExibidos.length);
  const referencias = await getGeoNamesPlaces(
    geoDb,
    locaisExibidos.map((destino) => destino.referenciaGeoNamesId)
  );
  const porId = new Map(referencias.map((place) => [place.id, place]));
  const places = [...new Map([...referencias, ...lugaresExibidos].map((p) => [p.id, p])).values()];
  const labels = [];
  for (let index = 0; index < places.length; index += 20) {
    labels.push(...(await labelGeoNamesPlaces(geoDb, places.slice(index, index + 20), locale)));
  }
  const rotulos = new Map(labels.map((label) => [label.id, label]));
  const resultadosLocais = locaisExibidos.map((destino): DestinoBusca => {
    if (!porId.has(destino.referenciaGeoNamesId)) return destinoSemReferencia(destino);
    const referencia = rotulos.get(destino.referenciaGeoNamesId);
    if (!referencia) throw new Error('Rótulo da localidade de referência indisponível.');
    return {
      id: `personalizado:${destino.id}`,
      nome: destino.nome,
      label: `${destino.nome}, ${referencia.label}`,
      origem: 'personalizado',
      referencia_id: `geonames:${destino.referenciaGeoNamesId}`,
      referencia: referenciaAdministrativa(referencia)
    };
  });
  const resultadosGeo = lugaresExibidos.map((place): DestinoBusca => {
    const resultado = rotulos.get(place.id);
    if (!resultado) throw new Error('Rótulo da localidade indisponível.');
    return {
      id: `geonames:${place.id}`,
      nome: resultado.name,
      label: resultado.label,
      origem: 'geonames',
      referencia_id: `geonames:${place.id}`,
      referencia: referenciaAdministrativa(resultado)
    };
  });
  const items = [...resultadosLocais, ...resultadosGeo];
  return {
    items,
    podeHaverMais: locais.length + lugares.length > limite
  };
}

export async function obterDestino(
  db: D1Database,
  geoDb: D1Database,
  id: string,
  locale: string
): Promise<DestinoBusca | null> {
  if (!destinoIdValido(id)) throw new Error('ID do destino inválido.');
  if (id.startsWith('geonames:')) {
    const raw = id.slice('geonames:'.length);
    const place = await getGeoNamesPlace(geoDb, Number(raw));
    if (!place) return null;
    const resultado = await labelGeoNamesPlace(geoDb, place, locale);
    return {
      id,
      nome: resultado.name,
      label: resultado.label,
      origem: 'geonames',
      referencia_id: id,
      referencia: referenciaAdministrativa(resultado)
    };
  }
  if (id.startsWith('personalizado:')) {
    const destino = await obterDestinoPersonalizado(db, id.slice('personalizado:'.length));
    if (!destino) return null;
    const referencia = await getGeoNamesPlace(geoDb, destino.referenciaGeoNamesId);
    if (!referencia) return destinoSemReferencia(destino);
    const resultado = await labelGeoNamesPlace(geoDb, referencia, locale);
    return {
      id,
      nome: destino.nome,
      label: `${destino.nome}, ${resultado.label}`,
      origem: 'personalizado',
      referencia_id: `geonames:${destino.referenciaGeoNamesId}`,
      referencia: referenciaAdministrativa(resultado)
    };
  }
  throw new Error('ID do destino inválido.');
}
