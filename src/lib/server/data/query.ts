import meta from './legado-meta.json';
import {
  applyLegadoAfterInsert,
  applyLegadoRowRules,
  applyLegadoWriteEffects
} from './legado-rules';
import type { DataClient, DataContext, QueryError, QueryResult } from './types';
import { runRpc } from './rpc';
import { createAuthApi } from './authApi';
import { createStorageApi } from './storageApi';

type ColumnMeta = { kind: string; nullable: boolean };
type TableMeta = { columns: Record<string, ColumnMeta>; primaryKey: string[] };
type Fk = {
  name: string;
  table: string;
  column: string;
  refTable: string;
  refColumn: string;
};

const tables = meta.tables as Record<string, TableMeta>;
const fks = meta.fks as Fk[];

type Filter =
  | { kind: 'cmp'; op: string; column: string; value: unknown }
  | { kind: 'in'; column: string; values: unknown[]; negate?: boolean }
  | { kind: 'null'; column: string; isNull: boolean }
  | { kind: 'or'; sql: string; binds: unknown[] }
  | { kind: 'raw'; sql: string; binds: unknown[] };

type Order = { column: string; ascending: boolean; nullsFirst: boolean };

type Embed = {
  alias: string;
  table: string;
  hint?: string;
  fields: SelectField[];
};

type SelectField = { column: string } | { embed: Embed };

const OPS = ['neq', 'gte', 'lte', 'ilike', 'like', 'eq', 'gt', 'lt', 'is', 'in'] as const;

function fail(message: string, code = 'PGRST000'): QueryError {
  return { message, code, details: null, hint: null };
}

function ident(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`identificador invalido: ${value}`);
  return `"${value}"`;
}

function physical(table: string) {
  return ident(`legado_${table}`);
}

function splitTop(input: string, separator: string) {
  const parts: string[] = [];
  let buf = '';
  let depth = 0;
  for (const char of input) {
    if (char === '(') depth += 1;
    if (char === ')' && depth > 0) depth -= 1;
    if (char === separator && depth === 0) {
      if (buf.trim()) parts.push(buf.trim());
      buf = '';
      continue;
    }
    buf += char;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

function parseSelect(input: string): SelectField[] {
  const source = String(input || '*').trim();
  if (!source || source === '*') return [];
  return splitTop(source, ',').map((part) => {
    const open = part.indexOf('(');
    if (open === -1) return { column: part.trim() };
    const head = part.slice(0, open).trim();
    const inner = part.slice(open + 1, part.lastIndexOf(')'));
    const match = head.match(
      /^(?:([A-Za-z_][A-Za-z0-9_]*):)?([A-Za-z_][A-Za-z0-9_]*)(?:!([A-Za-z_][A-Za-z0-9_]*))?$/
    );
    if (!match) throw new Error(`selecao invalida: ${head}`);
    return {
      embed: {
        alias: match[1] || match[2],
        table: match[2],
        hint: match[3],
        fields: parseSelect(inner)
      }
    };
  });
}

function coerce(column: ColumnMeta | undefined, value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!column) return value;
  if (column.kind === 'boolean') {
    if (value === true || value === 1 || value === '1' || value === 'true') return 1;
    if (value === false || value === 0 || value === '0' || value === 'false') return 0;
  }
  if (
    (column.kind === 'integer' || column.kind === 'real') &&
    typeof value === 'string' &&
    value.trim() !== '' &&
    Number.isFinite(Number(value))
  ) {
    return Number(value);
  }
  if (column.kind === 'json' && (typeof value === 'object' || Array.isArray(value)))
    return JSON.stringify(value);
  return value;
}

function present(column: ColumnMeta | undefined, value: unknown) {
  if (value === null || value === undefined) return value;
  if (column?.kind === 'boolean') return value === 1 || value === true;
  if (column?.kind === 'json' && typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function presentRow(table: string, row: Record<string, unknown>) {
  const columns = tables[table]?.columns || {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) out[key] = present(columns[key], value);
  return out;
}

function parseOrExpression(
  table: string,
  expression: string,
  joiner = ' OR '
): { sql: string; binds: unknown[] } {
  const parts = splitTop(expression, ',');
  const compiled = parts.map((part) => {
    if (part.startsWith('and(') && part.endsWith(')')) {
      const inner = parseOrExpression(table, part.slice(4, -1), ' AND ');
      return { sql: `(${inner.sql})`, binds: inner.binds };
    }
    if (part.startsWith('or(') && part.endsWith(')')) {
      return parseOrExpression(table, part.slice(3, -1), ' OR ');
    }
    const op = OPS.find((candidate) => part.includes(`.${candidate}.`));
    if (!op) throw new Error(`filtro invalido: ${part}`);
    const [column, rest] = part.split(`.${op}.`);
    const value = rest ?? '';
    if (op === 'is') {
      return {
        sql: `${ident(column)} IS ${value === 'null' ? 'NULL' : 'NOT NULL'}`,
        binds: [] as unknown[]
      };
    }
    if (op === 'in') {
      const values = value
        .replace(/^\(|\)$/g, '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      if (values.length === 0) return { sql: '0', binds: [] as unknown[] };
      return {
        sql: `${ident(column)} IN (${values.map(() => '?').join(', ')})`,
        binds: values
      };
    }
    const columnMeta = tables[table]?.columns[column];
    const sqlOp =
      op === 'eq'
        ? '='
        : op === 'neq'
          ? '!='
          : op === 'gt'
            ? '>'
            : op === 'gte'
              ? '>='
              : op === 'lt'
                ? '<'
                : op === 'lte'
                  ? '<='
                  : 'LIKE';
    if (op === 'ilike') return { sql: `lower(${ident(column)}) LIKE lower(?)`, binds: [value] };
    return {
      sql: `${ident(column)} ${sqlOp} ?`,
      binds: [coerce(columnMeta, value)]
    };
  });
  return {
    sql: compiled.map((item) => item.sql).join(joiner),
    binds: compiled.flatMap((item) => item.binds)
  };
}

function bound(db: D1Database, sql: string, binds: unknown[]) {
  const statement = db.prepare(sql);
  return binds.length ? statement.bind(...binds) : statement;
}

function whereSql(table: string, filters: Filter[]) {
  const binds: unknown[] = [];
  const clauses: string[] = [];
  for (const filter of filters) {
    if (filter.kind === 'or' || filter.kind === 'raw') {
      clauses.push(`(${filter.sql})`);
      binds.push(...filter.binds);
      continue;
    }
    const column = ident(filter.column);
    const metaColumn = tables[table]?.columns[filter.column];
    if (filter.kind === 'null') {
      clauses.push(`${column} IS ${filter.isNull ? 'NULL' : 'NOT NULL'}`);
      continue;
    }
    if (filter.kind === 'in') {
      if (filter.values.length === 0) {
        clauses.push(filter.negate ? '1' : '0');
        continue;
      }
      clauses.push(
        `${column} ${filter.negate ? 'NOT ' : ''}IN (${filter.values.map(() => '?').join(', ')})`
      );
      binds.push(...filter.values.map((value) => coerce(metaColumn, value)));
      continue;
    }
    const op =
      filter.op === 'eq'
        ? '='
        : filter.op === 'neq'
          ? '!='
          : filter.op === 'gt'
            ? '>'
            : filter.op === 'gte'
              ? '>='
              : filter.op === 'lt'
                ? '<'
                : filter.op === 'lte'
                  ? '<='
                  : 'LIKE';
    if (filter.op === 'ilike') {
      clauses.push(`lower(${column}) LIKE lower(?)`);
      binds.push(String(filter.value ?? ''));
      continue;
    }
    clauses.push(`${column} ${op} ?`);
    binds.push(coerce(metaColumn, filter.value));
  }
  return {
    sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '',
    binds
  };
}

function resolveRelation(parent: string, embed: Embed) {
  const byColumn = embed.hint
    ? undefined
    : fks.find((fk) => fk.table === parent && fk.column === embed.table);
  const hinted = embed.hint
    ? fks.find(
        (fk) =>
          (fk.name === embed.hint || fk.column === embed.hint) &&
          ((fk.table === parent && fk.refTable === embed.table) ||
            (fk.table === embed.table && fk.refTable === parent))
      )
    : byColumn;
  const candidates = hinted
    ? [hinted]
    : fks.filter(
        (fk) =>
          (fk.table === parent && fk.refTable === embed.table) ||
          (fk.table === embed.table && fk.refTable === parent)
      );
  const chosen = byColumn
    ? byColumn
    : candidates.find((fk) => fk.table === parent && fk.refTable === embed.table) ||
      candidates.find((fk) => fk.table === embed.table && fk.refTable === parent);
  if (!chosen) throw new Error(`relacao ${parent} -> ${embed.table} nao encontrada`);
  if (byColumn || (chosen.table === parent && chosen.refTable === embed.table)) {
    return {
      kind: 'one' as const,
      table: chosen.refTable,
      parentColumn: chosen.column,
      childColumn: chosen.refColumn
    };
  }
  return {
    kind: 'many' as const,
    table: chosen.table,
    parentColumn: chosen.refColumn,
    childColumn: chosen.column
  };
}

async function selectRows(
  db: D1Database,
  table: string,
  columns: string[],
  filters: Filter[],
  order: Order[],
  limit: number | null,
  offset: number | null
) {
  const known = tables[table].columns;
  const selected = columns.length ? columns.filter((column) => known[column]) : Object.keys(known);
  const projection = selected.length ? selected.map(ident).join(', ') : '*';
  const where = whereSql(table, filters);
  const orderSql = order.length
    ? ` ORDER BY ${order.map((item) => `${ident(item.column)} IS NULL ${item.nullsFirst ? 'DESC' : 'ASC'}, ${ident(item.column)} ${item.ascending ? 'ASC' : 'DESC'}`).join(', ')}`
    : '';
  const limitSql = limit != null ? ` LIMIT ${Math.max(0, Math.trunc(limit))}` : '';
  const offsetSql = offset != null ? ` OFFSET ${Math.max(0, Math.trunc(offset))}` : '';
  const sql = `SELECT ${projection} FROM ${physical(table)}${where.sql}${orderSql}${limitSql}${offsetSql}`;
  const result = await bound(db, sql, where.binds).all<Record<string, unknown>>();
  return (result.results || []).map((row) => presentRow(table, row));
}

async function hydrate(
  db: D1Database,
  table: string,
  rows: Array<Record<string, unknown>>,
  fields: SelectField[]
) {
  const embeds = fields.flatMap((field) => ('embed' in field ? [field.embed] : []));
  for (const embed of embeds) {
    const relation = resolveRelation(table, embed);
    const leafColumns = embed.fields.flatMap((field) => ('column' in field ? [field.column] : []));
    if (relation.kind === 'one') {
      const ids = [
        ...new Set(
          rows
            .map((row) => row[relation.parentColumn])
            .filter((value) => value != null)
            .map(String)
        )
      ];
      const related = ids.length
        ? await selectRows(
            db,
            relation.table,
            [...leafColumns, relation.childColumn],
            [{ kind: 'in', column: relation.childColumn, values: ids }],
            [],
            null,
            null
          )
        : [];
      await hydrate(db, relation.table, related, embed.fields);
      const byId = new Map(related.map((row) => [String(row[relation.childColumn]), row]));
      for (const row of rows) {
        const key = row[relation.parentColumn];
        row[embed.alias] = key == null ? null : (byId.get(String(key)) ?? null);
      }
      continue;
    }
    const ids = [
      ...new Set(
        rows
          .map((row) => row[relation.parentColumn])
          .filter((value) => value != null)
          .map(String)
      )
    ];
    const related = ids.length
      ? await selectRows(
          db,
          relation.table,
          [...leafColumns, relation.childColumn],
          [{ kind: 'in', column: relation.childColumn, values: ids }],
          [],
          null,
          null
        )
      : [];
    await hydrate(db, relation.table, related, embed.fields);
    const grouped = new Map<string, Array<Record<string, unknown>>>();
    for (const row of related) {
      const key = String(row[relation.childColumn]);
      grouped.set(key, [...(grouped.get(key) || []), row]);
    }
    for (const row of rows)
      row[embed.alias] = grouped.get(String(row[relation.parentColumn])) || [];
  }
}

function prepareWrite(
  table: string,
  value: Record<string, unknown>,
  mode: 'insert' | 'update' = 'insert'
) {
  const columns = tables[table].columns;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!columns[key] || raw === undefined || typeof raw === 'function') continue;
    if (raw && typeof raw === 'object' && columns[key].kind !== 'json') continue;
    out[key] = coerce(columns[key], raw);
  }
  applyLegadoRowRules(table, out, mode);
  if (columns.updated_at && mode === 'update') {
    out.updated_at = new Date().toISOString();
  }
  for (const key of Object.keys(out)) {
    if (!columns[key]) delete out[key];
  }
  // Em UPDATE nunca se gera id: trocaria a chave primária da linha (quebra FKs ou orfana filhos).
  if (
    mode === 'insert' &&
    columns.id &&
    (out.id === undefined || out.id === null) &&
    tables[table].primaryKey.includes('id')
  ) {
    out.id = crypto.randomUUID();
  }
  return out;
}

export function createDataClient(context: DataContext): DataClient {
  const { db } = context;

  function from(table: string) {
    if (!tables[table]) {
      const missing = {
        async then(resolve: (value: QueryResult) => unknown) {
          return resolve({
            data: null,
            error: fail(`relation "${table}" does not exist`, '42P01'),
            count: null
          });
        }
      };
      return new Proxy(missing, {
        get: (target, prop) =>
          prop in target ? target[prop as keyof typeof target] : () => missing
      });
    }

    let operation: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
    let fields: SelectField[] = [];
    let explicitColumns = false;
    const filters: Filter[] = [];
    const order: Order[] = [];
    let limit: number | null = null;
    let offset: number | null = null;
    let mode: 'many' | 'single' | 'maybe' = 'many';
    let countExact = false;
    let head = false;
    let payload: Array<Record<string, unknown>> = [];
    let onConflict = '';

    const builder = {
      select(columns?: string, options?: { count?: string; head?: boolean }) {
        fields = parseSelect(columns || '*');
        explicitColumns = Boolean(columns && columns.trim() !== '*');
        countExact = options?.count === 'exact';
        head = Boolean(options?.head);
        return builder;
      },
      insert(values: Record<string, unknown> | Array<Record<string, unknown>>) {
        operation = 'insert';
        payload = Array.isArray(values) ? values : [values];
        return builder;
      },
      update(values: Record<string, unknown>) {
        operation = 'update';
        payload = [values];
        return builder;
      },
      upsert(
        values: Record<string, unknown> | Array<Record<string, unknown>>,
        options?: { onConflict?: string }
      ) {
        operation = 'upsert';
        payload = Array.isArray(values) ? values : [values];
        onConflict = options?.onConflict || '';
        return builder;
      },
      delete() {
        operation = 'delete';
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push({ kind: 'cmp', op: 'eq', column, value });
        return builder;
      },
      neq(column: string, value: unknown) {
        filters.push({ kind: 'cmp', op: 'neq', column, value });
        return builder;
      },
      gt(column: string, value: unknown) {
        filters.push({ kind: 'cmp', op: 'gt', column, value });
        return builder;
      },
      gte(column: string, value: unknown) {
        filters.push({ kind: 'cmp', op: 'gte', column, value });
        return builder;
      },
      lt(column: string, value: unknown) {
        filters.push({ kind: 'cmp', op: 'lt', column, value });
        return builder;
      },
      lte(column: string, value: unknown) {
        filters.push({ kind: 'cmp', op: 'lte', column, value });
        return builder;
      },
      like(column: string, value: string) {
        filters.push({ kind: 'cmp', op: 'like', column, value });
        return builder;
      },
      ilike(column: string, value: string) {
        filters.push({ kind: 'cmp', op: 'ilike', column, value });
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters.push({ kind: 'in', column, values: values || [] });
        return builder;
      },
      is(column: string, value: unknown) {
        filters.push({ kind: 'null', column, isNull: value == null });
        return builder;
      },
      not(column: string, operator: string, value: unknown) {
        if (operator === 'is') filters.push({ kind: 'null', column, isNull: false });
        else if (operator === 'in')
          filters.push({
            kind: 'in',
            column,
            values: Array.isArray(value) ? value : [],
            negate: true
          });
        else
          filters.push({
            kind: 'cmp',
            op: operator === 'eq' ? 'neq' : operator,
            column,
            value
          });
        return builder;
      },
      or(expression: string) {
        const parsed = parseOrExpression(table, expression);
        filters.push({ kind: 'or', sql: parsed.sql, binds: parsed.binds });
        return builder;
      },
      match(values: Record<string, unknown>) {
        for (const [column, value] of Object.entries(values || {})) builder.eq(column, value);
        return builder;
      },
      order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
        order.push({
          column,
          ascending: options?.ascending !== false,
          nullsFirst: options?.nullsFirst === true
        });
        return builder;
      },
      limit(count: number) {
        limit = count;
        return builder;
      },
      range(fromIndex: number, toIndex: number) {
        offset = fromIndex;
        limit = toIndex - fromIndex + 1;
        return builder;
      },
      single() {
        mode = 'single';
        return builder.execute();
      },
      maybeSingle() {
        mode = 'maybe';
        return builder.execute();
      },
      then(resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) {
        return builder.execute().then(resolve, reject);
      },
      async execute(): Promise<QueryResult> {
        try {
          if (operation === 'select') {
            const columns = fields.flatMap((field) => ('column' in field ? [field.column] : []));
            const where = whereSql(table, filters);
            let count: number | null = null;
            if (countExact) {
              const counted = await bound(
                db,
                `SELECT COUNT(*) AS total FROM ${physical(table)}${where.sql}`,
                where.binds
              ).first<{ total: number }>();
              count = Number(counted?.total || 0);
            }
            if (head) return { data: null, error: null, count };
            const requested = new Set(columns);
            const relationColumns = [
              ...new Set(
                fields.flatMap((field) => {
                  if (!('embed' in field)) return [];
                  const relation = resolveRelation(table, field.embed);
                  return requested.has(relation.parentColumn) ? [] : [relation.parentColumn];
                })
              )
            ];
            const rows = await selectRows(
              db,
              table,
              explicitColumns ? [...columns, ...relationColumns] : [],
              filters,
              order,
              limit,
              offset
            );
            await hydrate(db, table, rows, fields);
            if (explicitColumns) {
              for (const row of rows) {
                for (const column of relationColumns) delete row[column];
              }
            }
            return finish(rows, count);
          }
          if (operation === 'insert' || operation === 'upsert') {
            const written: Array<Record<string, unknown>> = [];
            for (const row of payload) {
              const values = prepareWrite(table, row);
              await applyLegadoWriteEffects(db, table, values);
              const keys = Object.keys(values);
              if (keys.length === 0) continue;
              const binds = keys.map((key) => values[key]);
              let sql = `INSERT INTO ${physical(table)} (${keys.map(ident).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
              if (operation === 'upsert') {
                const conflict = (onConflict || tables[table].primaryKey.join(','))
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean);
                const updates = keys.filter((key) => !conflict.includes(key));
                sql += ` ON CONFLICT (${conflict.map(ident).join(', ')}) DO ${updates.length ? `UPDATE SET ${updates.map((key) => `${ident(key)} = excluded.${ident(key)}`).join(', ')}` : 'NOTHING'}`;
              }
              sql += ' RETURNING *';
              const rowResult = await bound(db, sql, binds).first<Record<string, unknown>>();
              if (rowResult) {
                written.push(presentRow(table, rowResult));
                if (operation === 'insert') await applyLegadoAfterInsert(db, table, values);
              }
            }
            return finish(written, null);
          }
          const values = prepareWrite(table, payload[0] || {}, 'update');
          await applyLegadoWriteEffects(db, table, values);
          const where = whereSql(table, filters);
          if (operation === 'update') {
            const keys = Object.keys(values);
            if (keys.length === 0) return { data: [], error: null, count: null };
            const sql = `UPDATE ${physical(table)} SET ${keys.map((key) => `${ident(key)} = ?`).join(', ')}${where.sql} RETURNING *`;
            const result = await bound(db, sql, [
              ...keys.map((key) => values[key]),
              ...where.binds
            ]).all<Record<string, unknown>>();
            return finish(
              (result.results || []).map((row) => presentRow(table, row)),
              null
            );
          }
          const deleted = await bound(
            db,
            `DELETE FROM ${physical(table)}${where.sql} RETURNING *`,
            where.binds
          ).all<Record<string, unknown>>();
          return finish(
            (deleted.results || []).map((row) => presentRow(table, row)),
            null
          );
        } catch (error) {
          return {
            data: null,
            error: fail(error instanceof Error ? error.message : 'falha na consulta'),
            count: null
          };
        }
      }
    };

    function finish(rows: Array<Record<string, unknown>>, count: number | null): QueryResult {
      if (mode === 'many') return { data: rows, error: null, count };
      if (rows.length === 1) return { data: rows[0], error: null, count };
      if (rows.length === 0 && mode === 'maybe') return { data: null, error: null, count };
      return {
        data: null,
        error: fail('JSON object requested, multiple (or no) rows returned', 'PGRST116'),
        count
      };
    }

    return builder;
  }

  return {
    from,
    rpc(name: string, args?: Record<string, unknown>) {
      return runRpc(db, name, args || {});
    },
    storage: createStorageApi(context),
    auth: createAuthApi(context),
    channel() {
      const channel = {
        on() {
          return channel;
        },
        subscribe(callback?: (status: string) => void) {
          callback?.('CLOSED');
          return channel;
        }
      };
      return channel;
    },
    removeChannel() {
      return undefined;
    }
  } as DataClient;
}
