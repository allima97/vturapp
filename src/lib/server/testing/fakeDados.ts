/**
 * Banco falso para testes de contrato (Fase 3.4).
 *
 * - Responde a from(tabela).select/eq/in/gte/lte/order/limit/single/maybeSingle/update/upsert/insert/delete.
 *   (insert/delete: Fase 3.10, testes de auditoria; devolvem as linhas inseridas, com `id` gerado.)
 * - Filtra as linhas da tabela por eq/in (a projeção do select é ignorada:
 *   o teste compara a resposta da versão antiga com a nova usando o mesmo banco).
 * - Cada consulta espera `delayMs`, e o banco registra quantas ficaram abertas ao
 *   mesmo tempo (maxInFlight) e a lista de consultas feitas (log).
 */
type Row = Record<string, unknown>;

export type FakeQueryLog = {
  table: string;
  op: 'select' | 'update' | 'upsert' | 'insert' | 'delete';
  filters: string[];
  values?: Row | Row[];
};

export type FakeSupabase = {
  from: (table: string) => FakeBuilder;
  log: FakeQueryLog[];
  stats: { inFlight: number; maxInFlight: number };
};

type Result = { data: unknown; error: unknown; count?: number | null };

export interface FakeBuilder extends PromiseLike<Result> {
  select: (columns?: string) => FakeBuilder;
  update: (values: Row) => FakeBuilder;
  upsert: (values: Row | Row[], options?: unknown) => FakeBuilder;
  insert: (values: Row | Row[]) => FakeBuilder;
  delete: () => FakeBuilder;
  eq: (column: string, value: unknown) => FakeBuilder;
  in: (column: string, values: unknown[]) => FakeBuilder;
  gte: (column: string, value: string | number) => FakeBuilder;
  lte: (column: string, value: string | number) => FakeBuilder;
  order: (column: string, options?: unknown) => FakeBuilder;
  limit: (n: number) => FakeBuilder;
  single: () => Promise<Result>;
  maybeSingle: () => Promise<Result>;
}

export function createFakeSupabase(
  tables: Record<string, Row[]>,
  { delayMs = 5 }: { delayMs?: number } = {}
): FakeSupabase {
  const log: FakeQueryLog[] = [];
  const stats = { inFlight: 0, maxInFlight: 0 };

  const from = (table: string): FakeBuilder => {
    const predicates: Array<(row: Row) => boolean> = [];
    const filters: string[] = [];
    let op: 'select' | 'update' | 'upsert' | 'insert' | 'delete' = 'select';
    let updateValues: Row | Row[] | undefined;
    let limitN: number | null = null;

    const run = async (mode: 'many' | 'single' | 'maybeSingle'): Promise<Result> => {
      log.push({ table, op, filters: [...filters].sort(), values: updateValues });
      stats.inFlight += 1;
      stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      stats.inFlight -= 1;

      if (op === 'insert') {
        const inserted = (Array.isArray(updateValues) ? updateValues : [updateValues || {}]).map((row, index) => ({
          id: `novo-${table}-${index + 1}`,
          ...row
        }));
        if (mode === 'many') return { data: inserted, error: null };
        return { data: inserted[0] ?? null, error: null };
      }
      if (op !== 'select') return { data: null, error: null };

      let rows = (tables[table] || []).filter((row) => predicates.every((p) => p(row)));
      if (limitN != null) rows = rows.slice(0, limitN);
      rows = rows.map((row) => structuredClone(row));

      if (mode === 'many') return { data: rows, error: null };
      if (rows.length === 1) return { data: rows[0], error: null };
      if (rows.length === 0 && mode === 'maybeSingle') return { data: null, error: null };
      return {
        data: null,
        error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }
      };
    };

    const builder: FakeBuilder = {
      select: () => builder,
      update: (values) => {
        op = 'update';
        updateValues = { ...values, updated_at: '<ts>' };
        return builder;
      },
      upsert: (values) => {
        op = 'upsert';
        updateValues = Array.isArray(values) ? values.map((v) => ({ ...v })) : { ...values };
        return builder;
      },
      insert: (values) => {
        op = 'insert';
        updateValues = Array.isArray(values) ? values.map((v) => ({ ...v })) : { ...values };
        return builder;
      },
      delete: () => {
        op = 'delete';
        return builder;
      },
      eq: (column, value) => {
        filters.push(`${column}=${String(value)}`);
        predicates.push((row) => row[column] === value);
        return builder;
      },
      in: (column, values) => {
        filters.push(`${column} in ${[...values].map(String).sort().join(',')}`);
        predicates.push((row) => values.includes(row[column]));
        return builder;
      },
      // Comparação simples (texto ou número), suficiente para datas ISO.
      gte: (column, value) => {
        filters.push(`${column}>=${String(value)}`);
        predicates.push((row) => row[column] != null && String(row[column]) >= String(value));
        return builder;
      },
      lte: (column, value) => {
        filters.push(`${column}<=${String(value)}`);
        predicates.push((row) => row[column] != null && String(row[column]) <= String(value));
        return builder;
      },
      order: () => builder,
      limit: (n) => {
        limitN = n;
        return builder;
      },
      single: () => run('single'),
      maybeSingle: () => run('maybeSingle'),
      then: (onFulfilled, onRejected) => run('many').then(onFulfilled, onRejected)
    };
    return builder;
  };

  return { from, log, stats };
}

/** Lista de consultas em ordem estável, para comparar antes/depois sem depender da ordem. */
export function sortedQueryLog(log: FakeQueryLog[]) {
  return log
    .map((entry) => `${entry.op} ${entry.table} [${entry.filters.join(' & ')}]${entry.values ? ' ' + JSON.stringify(entry.values) : ''}`)
    .sort();
}
