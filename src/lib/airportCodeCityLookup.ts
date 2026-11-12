import { getKnownAirportCities } from '$lib/roteiroAereoImport';

export type AirportCodeCityLookup = Record<string, string>;

const AIRPORT_CODE_CITY_LOOKUP_URL = '/data/airports-iata-city.json';
const IATA_CODE_PATTERN = /^[A-Z]{3}$/;
const PORTUGUESE_AIRPORT_CITIES: AirportCodeCityLookup = {
  ...getKnownAirportCities(),
  ATH: 'Atenas',
  BER: 'Berlim',
  BUD: 'Budapeste',
  CAI: 'Cairo',
  CPH: 'Copenhague',
  EDI: 'Edimburgo',
  LGW: 'Londres',
  LTN: 'Londres',
  STN: 'Londres',
  LCY: 'Londres',
  ORY: 'Paris',
  CIA: 'Roma',
  PEK: 'Pequim',
  PKX: 'Pequim',
  PRG: 'Praga',
  SVO: 'Moscou',
  DME: 'Moscou',
  VKO: 'Moscou',
  VIE: 'Viena',
  WAW: 'Varsóvia'
};

let airportLookupCache: AirportCodeCityLookup | null = null;
let airportLookupPromise: Promise<AirportCodeCityLookup> | null = null;

function normalizeAirportLookup(raw: unknown): AirportCodeCityLookup {
  if (!raw || typeof raw !== 'object') return {};
  const out: AirportCodeCityLookup = {};
  for (const [code, city] of Object.entries(raw as Record<string, unknown>)) {
    const normalizedCode = String(code || '')
      .trim()
      .toUpperCase();
    const normalizedCity = String(city || '').trim();
    if (!IATA_CODE_PATTERN.test(normalizedCode) || !normalizedCity) continue;
    out[normalizedCode] = PORTUGUESE_AIRPORT_CITIES[normalizedCode] || normalizedCity;
  }
  return out;
}

export function getAirportCodeCityLookupCache() {
  return airportLookupCache || {};
}

export async function loadAirportCodeCityLookup(): Promise<AirportCodeCityLookup> {
  if (airportLookupCache) return airportLookupCache;
  if (airportLookupPromise) return airportLookupPromise;
  if (typeof window === 'undefined') return {};

  airportLookupPromise = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4_000);
    try {
      const response = await fetch(AIRPORT_CODE_CITY_LOOKUP_URL, {
        cache: 'force-cache',
        signal: controller.signal
      });
      if (!response.ok) return {};
      const json = await response.json();
      return normalizeAirportLookup(json);
    } catch {
      return {};
    } finally {
      window.clearTimeout(timeout);
    }
  })();

  const loaded = await airportLookupPromise;
  airportLookupCache = loaded;
  airportLookupPromise = null;
  return loaded;
}
