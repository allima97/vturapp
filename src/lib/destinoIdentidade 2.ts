const PERSONALIZADO_ID =
  /^personalizado:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
const GEONAMES_ID = /^geonames:[1-9]\d{0,14}$/;

export function destinoIdValido(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (PERSONALIZADO_ID.test(value)) return true;
  return GEONAMES_ID.test(value) && Number.isSafeInteger(Number(value.slice(9)));
}
