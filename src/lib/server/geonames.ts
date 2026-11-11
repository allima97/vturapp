export type GeoNamesPlace = {
  id: number;
  name: string;
  countryCode: string;
  admin1: string;
  admin2: string;
  population: number;
};

type PlaceRow = {
  id: number;
  name: string;
  country_code: string;
  admin1: string;
  admin2: string;
  population: number;
};

function toPlace(row: PlaceRow): GeoNamesPlace {
  return {
    id: row.id,
    name: row.name,
    countryCode: row.country_code,
    admin1: row.admin1,
    admin2: row.admin2,
    population: row.population
  };
}

export type GeoNamesLabel = GeoNamesPlace & {
  label: string;
  districtName: string | null;
  regionName: string | null;
  countryName: string;
};

export type GeoNamesSearchOptions = {
  exact?: boolean;
  countryCode?: string;
  offset?: number;
};

export function normalizeGeoName(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').trim().replace(/\s+/g, ' ');
}

export async function searchGeoNames(
  db: D1Database,
  text: string,
  limit = 8,
  options: GeoNamesSearchOptions = {}
): Promise<GeoNamesPlace[]> {
  const term = normalizeGeoName(text);
  const offset = options.offset ?? 0;
  const countryCode = options.countryCode?.trim().toUpperCase();
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new Error('Limite de busca inválido.');
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000)
    throw new Error('Deslocamento de busca inválido.');
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) throw new Error('Código de país inválido.');
  if (term.length > 200) throw new Error('Nome de cidade muito longo.');
  const length = Array.from(term).length;
  if (length < (options.exact ? 1 : 2)) return [];
  if (length <= 3 && countryCode && !options.exact)
    throw new Error('Para filtrar nomes curtos por país, use a busca exata.');
  let response: D1Result<PlaceRow>;
  const cachedPrefix =
    !options.exact && !countryCode && length === 4
      ? await db.prepare('SELECT 1 FROM short_search WHERE prefix = ? LIMIT 1').bind(term).first()
      : null;
  if (!options.exact && (length <= 3 || cachedPrefix)) {
    response = await db
      .prepare(
        `SELECT p.id, p.name, p.country_code, p.admin1, p.admin2, p.population
           FROM short_search s JOIN place p ON p.id = s.place_id
           WHERE s.prefix = ? AND p.feature_class = 'P'
           ORDER BY s.rank LIMIT ? OFFSET ?`
      )
      .bind(term, limit, offset)
      .all<PlaceRow>();
  } else {
    const statement = db.prepare(
      `SELECT p.id, p.name, p.country_code, p.admin1, p.admin2, p.population
       FROM search_name n JOIN place p ON p.id = n.place_id
       WHERE ${options.exact ? 'n.normalized = ?' : 'n.normalized >= ? AND n.normalized < ?'}
         AND p.feature_class = 'P'
         AND (? = '' OR p.country_code = ?)
       GROUP BY p.id
       ORDER BY MAX(n.normalized = ?) DESC,
                p.population / CASE MIN(n.priority) WHEN 0 THEN 1 WHEN 1 THEN 4 ELSE 20 END DESC,
                MIN(n.priority), p.population DESC, p.name, p.id
       LIMIT ? OFFSET ?`
    );
    const args = options.exact ? [term] : [term, `${term}\u{10ffff}`];
    response = await statement
      .bind(...args, countryCode ?? '', countryCode ?? '', term, limit, offset)
      .all<PlaceRow>();
  }
  return response.results.map(toPlace);
}

export async function getGeoNamesPlace(db: D1Database, id: number): Promise<GeoNamesPlace | null> {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('ID GeoNames inválido.');
  const place = await db
    .prepare(
      `SELECT id, name, country_code, admin1, admin2, population FROM place
       WHERE id = ? AND feature_class = 'P'`
    )
    .bind(id)
    .first<PlaceRow>();
  return place ? toPlace(place) : null;
}

export async function getGeoNamesPlaces(db: D1Database, ids: number[]): Promise<GeoNamesPlace[]> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.some((id) => !Number.isSafeInteger(id) || id < 1))
    throw new Error('ID GeoNames inválido.');
  if (uniqueIds.length > 49) throw new Error('Quantidade de localidades inválida.');
  if (!uniqueIds.length) return [];
  const placeholders = uniqueIds.map(() => '?').join(', ');
  const result = await db
    .prepare(
      `SELECT id, name, country_code, admin1, admin2, population FROM place
       WHERE id IN (${placeholders}) AND feature_class = 'P'`
    )
    .bind(...uniqueIds)
    .all<PlaceRow>();
  return result.results.map(toPlace);
}

async function localizedNames(db: D1Database, ids: number[], language: string) {
  const placeholders = ids.map(() => '?').join(', ');
  const result = await db
    .prepare(
      `SELECT place_id, name FROM alternate_name
       WHERE place_id IN (${placeholders}) AND language IN (?, 'pt')
         AND historic = 0 AND colloquial = 0
       ORDER BY place_id, (language = ?) DESC, preferred DESC, short ASC, id`
    )
    .bind(...ids, language, language)
    .all<{ place_id: number; name: string }>();
  const names = new Map<number, string>();
  for (const row of result.results) {
    if (!names.has(row.place_id)) names.set(row.place_id, row.name);
  }
  return names;
}

export async function labelGeoNamesPlace(
  db: D1Database,
  place: GeoNamesPlace,
  locale: string
): Promise<GeoNamesLabel> {
  const [label] = await labelGeoNamesPlaces(db, [place], locale);
  return label;
}

export async function labelGeoNamesPlaces(
  db: D1Database,
  places: GeoNamesPlace[],
  locale: string
): Promise<GeoNamesLabel[]> {
  const language = locale.toLowerCase().split(/[-_]/)[0];
  if (!/^[a-z]{2,3}$/.test(language)) throw new Error('Idioma inválido.');
  if (places.length > 20) throw new Error('Quantidade de localidades inválida.');
  if (!places.length) return [];
  const administrative = await db.batch<{
    district_id: number | null;
    district_name: string | null;
    region_id: number | null;
    region_name: string | null;
    country_id: number | null;
    country_name: string | null;
  }>(
    places.map((place) =>
      db
        .prepare(
          `SELECT d.id AS district_id, d.name AS district_name,
                r.id AS region_id, r.name AS region_name,
                c.id AS country_id, c.name AS country_name
         FROM place p
         LEFT JOIN place d ON d.id = (
           SELECT id FROM place WHERE feature_code = 'ADM2' AND country_code = p.country_code
             AND admin1 = p.admin1 AND admin2 = p.admin2 AND admin2 != '' ORDER BY id LIMIT 1
         )
         LEFT JOIN place r ON r.id = (
           SELECT id FROM place WHERE feature_code = 'ADM1' AND country_code = p.country_code
             AND admin1 = p.admin1 AND admin1 != '' ORDER BY id LIMIT 1
         )
         LEFT JOIN place c ON c.id = (
           SELECT id FROM place WHERE feature_code IN ('PCLI', 'PCLD', 'PCLF', 'PCLS', 'PCL')
             AND country_code = p.country_code ORDER BY (feature_code = 'PCLI') DESC, id LIMIT 1
         )
         WHERE p.id = ?`
        )
        .bind(place.id)
    )
  );
  const ids = new Set<number>();
  for (const [index, place] of places.entries()) {
    const row = administrative[index].results[0];
    if (!row) throw new Error('Localidade não está disponível no GeoNames.');
    ids.add(place.id);
    for (const id of [row.district_id, row.region_id, row.country_id]) {
      if (id !== null) ids.add(id);
    }
  }
  const names = await localizedNames(db, [...ids], language);
  return places.map((place, index) => {
    const row = administrative[index].results[0];
    const cityName = names.get(place.id) || place.name;
    const districtName = (row.district_id && names.get(row.district_id)) || row.district_name || '';
    const regionName = (row.region_id && names.get(row.region_id)) || row.region_name || '';
    const countryName =
      (row.country_id && names.get(row.country_id)) || row.country_name || place.countryCode;
    return {
      ...place,
      name: cityName,
      districtName: districtName || null,
      regionName: regionName || null,
      countryName,
      label: [
        cityName,
        normalizeGeoName(districtName) === normalizeGeoName(cityName) ? '' : districtName,
        regionName,
        countryName
      ]
        .filter(Boolean)
        .join(', ')
    };
  });
}
