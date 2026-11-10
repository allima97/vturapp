export const QUERY_IN_BATCH_SIZE = 100;

export function chunkArray<T>(values: T[], size = QUERY_IN_BATCH_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export function filterBatches<T>(values: T[], size = QUERY_IN_BATCH_SIZE): T[][] {
  return values.length > size ? chunkArray(values, size) : [values];
}

export function dedupeById<T extends { id?: string | null }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    const id = String(row?.id || '').trim();
    if (id && !map.has(id)) map.set(id, row);
  }
  return Array.from(map.values());
}

export function uniqueValues<T>(values: readonly T[]): T[] {
  const unique = new Set<T>();
  for (const value of values) {
    unique.add(value);
  }
  return Array.from(unique);
}

export function uniqueCleanStrings(values?: unknown[] | null): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const value of values || []) {
    const text = String(value || '').trim();
    if (text && !seen.has(text)) {
      seen.add(text);
      cleaned.push(text);
    }
  }
  return cleaned;
}

export function cleanStringSet(values?: unknown[] | null): Set<string> {
  return new Set(uniqueCleanStrings(values));
}
