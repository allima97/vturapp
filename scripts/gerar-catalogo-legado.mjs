/**
 * Gera a migration D1 do catálogo legado e o metadado usado pelo cliente de dados.
 * Fonte: docs/migracao/SCHEMA-LEGADO-2026-10-31.json (somente metadados).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const source = JSON.parse(readFileSync('docs/migracao/SCHEMA-LEGADO-2026-10-31.json', 'utf8'));

const TYPE_MAP = {
  uuid: 'text',
  text: 'text',
  'character varying': 'text',
  character: 'text',
  name: 'text',
  date: 'text',
  'timestamp with time zone': 'text',
  'timestamp without time zone': 'text',
  'time with time zone': 'text',
  'time without time zone': 'text',
  interval: 'text',
  jsonb: 'json',
  json: 'json',
  bytea: 'blob',
  boolean: 'boolean',
  integer: 'integer',
  bigint: 'integer',
  smallint: 'integer',
  numeric: 'real',
  real: 'real',
  'double precision': 'real',
};

function sqliteType(column) {
  const udt = String(column.udt_name || '');
  if (udt.startsWith('_')) return 'json';
  return TYPE_MAP[column.data_type] || 'text';
}

function sqlType(kind) {
  if (kind === 'boolean' || kind === 'integer') return 'INTEGER';
  if (kind === 'real') return 'REAL';
  if (kind === 'blob') return 'BLOB';
  return 'TEXT';
}

function ident(value) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`identificador invalido: ${value}`);
  return `"${value}"`;
}

function parseColumnList(definition, keyword) {
  const match = definition.match(new RegExp(`${keyword}\\s*\\(([^)]+)\\)`, 'i'));
  if (!match) return null;
  const cols = match[1].split(',').map((item) => item.trim().replace(/"/g, ''));
  if (cols.some((col) => !/^[a-z_][a-z0-9_]*$/i.test(col))) return null;
  return cols;
}

const objects = source.objects.filter((item) => item.kind === 'table' || item.kind === 'view');
const tables = new Map();

for (const object of objects) {
  const columns = {};
  for (const column of object.columns || []) {
    columns[column.column_name] = {
      kind: sqliteType(column),
      nullable: column.is_nullable !== 'NO',
    };
  }
  const primaryKey = [];
  const uniques = [];
  for (const constraint of object.constraints || []) {
    if (constraint.constraint_type === 'p') {
      const cols = parseColumnList(constraint.definition, 'PRIMARY KEY');
      if (cols) primaryKey.push(...cols);
    }
    if (constraint.constraint_type === 'u') {
      const cols = parseColumnList(constraint.definition, 'UNIQUE');
      if (cols) uniques.push(cols);
    }
  }
  tables.set(object.name, { columns, primaryKey, uniques, kind: object.kind });
}

const fks = [];
for (const object of source.objects) {
  for (const constraint of object.constraints || []) {
    if (constraint.constraint_type !== 'f') continue;
    const match = constraint.definition.match(
      /FOREIGN KEY \(([^)]+)\) REFERENCES (?:auth\.)?([a-z_][a-z0-9_]*)\(([^)]+)\)/i,
    );
    if (!match) continue;
    if (constraint.definition.includes('auth.')) continue;
    const columns = match[1].split(',').map((item) => item.trim());
    const refColumns = match[3].split(',').map((item) => item.trim());
    if (columns.length !== 1 || refColumns.length !== 1) continue;
    if (!tables.has(object.name) || !tables.has(match[2])) continue;
    fks.push({
      name: constraint.constraint_name,
      table: object.name,
      column: columns[0],
      refTable: match[2],
      refColumn: refColumns[0],
    });
  }
}

const lines = [];
lines.push('-- Catalogo legado reproduzido em D1.');
lines.push('-- Tabelas fisicas usam o prefixo legado_ para nao colidir com o modelo novo.');
lines.push('-- Chaves primarias e unicidades simples foram preservadas.');
lines.push('-- Bancos novos comecam vazios: nenhum registro historico e importado.');
lines.push('');

for (const [name, table] of tables) {
  const physical = `legado_${name}`;
  const columnSql = [];
  for (const [columnName, column] of Object.entries(table.columns)) {
    const pieces = [`${ident(columnName)} ${sqlType(column.kind)}`];
    const isPk = table.primaryKey.length === 1 && table.primaryKey[0] === columnName;
    if (isPk) pieces.push('PRIMARY KEY');
    if (!column.nullable && !isPk) {
      pieces.push('NOT NULL');
      if (column.kind === 'boolean' || column.kind === 'integer' || column.kind === 'real') {
        pieces.push('DEFAULT 0');
      } else if (columnName === 'created_at' || columnName === 'updated_at') {
        pieces.push(`DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
      }
    }
    columnSql.push(`  ${pieces.join(' ')}`);
  }
  if (table.primaryKey.length > 1) {
    columnSql.push(`  PRIMARY KEY (${table.primaryKey.map(ident).join(', ')})`);
  }
  for (const unique of table.uniques) {
    columnSql.push(`  UNIQUE (${unique.map(ident).join(', ')})`);
  }
  lines.push(`CREATE TABLE IF NOT EXISTS ${ident(physical)} (`);
  lines.push(columnSql.join(',\n'));
  lines.push(');');
  lines.push('');
}

lines.push(`CREATE TABLE IF NOT EXISTS "mfa_fatores" (`);
lines.push(`  "id" TEXT PRIMARY KEY,`);
lines.push(`  "user_id" TEXT NOT NULL,`);
lines.push(`  "secret" TEXT NOT NULL,`);
lines.push(`  "friendly_name" TEXT,`);
lines.push(`  "status" TEXT NOT NULL DEFAULT 'unverified',`);
lines.push(`  "created_at" TEXT NOT NULL`);
lines.push(');');
lines.push('CREATE INDEX IF NOT EXISTS "idx_mfa_fatores_user" ON "mfa_fatores" ("user_id");');
lines.push('');

const meta = {
  tables: Object.fromEntries(
    [...tables.entries()].map(([name, table]) => [
      name,
      {
        columns: table.columns,
        primaryKey: table.primaryKey,
      },
    ]),
  ),
  fks,
};

function camel(name) {
  const raw = name.replace(/_([a-z0-9])/g, (_, ch) => ch.toUpperCase());
  return `legado${raw.charAt(0).toUpperCase()}${raw.slice(1)}`;
}

const schemaLines = [];
schemaLines.push('/**');
schemaLines.push(' * Espelho Drizzle do catalogo legado. Gerado por scripts/gerar-catalogo-legado.mjs.');
schemaLines.push(' * A migration SQL em drizzle/0013_legado_catalogo.sql e a fonte aplicada no D1.');
schemaLines.push(' */');
schemaLines.push("import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';");
schemaLines.push('');
for (const [name, table] of tables) {
  schemaLines.push(`export const ${camel(name)} = sqliteTable('legado_${name}', {`);
  for (const [columnName, column] of Object.entries(table.columns)) {
    const isPk = table.primaryKey.length === 1 && table.primaryKey[0] === columnName;
    if (column.kind === 'boolean') {
      schemaLines.push(`  ${camel(columnName).replace(/^legado/, '') || 'col'}: integer('${columnName}', { mode: 'boolean' })${isPk ? '.primaryKey()' : ''},`);
    } else if (column.kind === 'integer') {
      schemaLines.push(`  ${safeField(columnName)}: integer('${columnName}', { mode: 'number' })${isPk ? '.primaryKey()' : ''},`);
    } else if (column.kind === 'real') {
      schemaLines.push(`  ${safeField(columnName)}: real('${columnName}')${isPk ? '.primaryKey()' : ''},`);
    } else {
      schemaLines.push(`  ${safeField(columnName)}: text('${columnName}')${isPk ? '.primaryKey()' : ''},`);
    }
  }
  schemaLines.push('});');
  schemaLines.push('');
}
schemaLines.push(`export const mfaFatores = sqliteTable('mfa_fatores', {`);
schemaLines.push(`  id: text('id').primaryKey(),`);
schemaLines.push(`  userId: text('user_id').notNull(),`);
schemaLines.push(`  secret: text('secret').notNull(),`);
schemaLines.push(`  friendlyName: text('friendly_name'),`);
schemaLines.push(`  status: text('status').notNull(),`);
schemaLines.push(`  createdAt: text('created_at').notNull(),`);
schemaLines.push('});');
schemaLines.push('');

function safeField(columnName) {
  const field = columnName.replace(/_([a-z0-9])/g, (_, ch) => ch.toUpperCase());
  if (/^[0-9]/.test(field) || field === 'default') return `col_${field}`;
  return field;
}

// Reescreve o bloco das colunas com nomes de campo validos.
const fixed = [];
fixed.push(schemaLines[0], schemaLines[1], schemaLines[2], schemaLines[3], schemaLines[4], '');
for (const [name, table] of tables) {
  fixed.push(`export const ${camel(name)} = sqliteTable('legado_${name}', {`);
  for (const [columnName, column] of Object.entries(table.columns)) {
    const isPk = table.primaryKey.length === 1 && table.primaryKey[0] === columnName;
    const field = safeField(columnName);
    const pk = isPk ? '.primaryKey()' : '';
    if (column.kind === 'boolean') fixed.push(`  ${field}: integer('${columnName}', { mode: 'boolean' })${pk},`);
    else if (column.kind === 'integer') fixed.push(`  ${field}: integer('${columnName}', { mode: 'number' })${pk},`);
    else if (column.kind === 'real') fixed.push(`  ${field}: real('${columnName}')${pk},`);
    else fixed.push(`  ${field}: text('${columnName}')${pk},`);
  }
  fixed.push('});');
  fixed.push('');
}
fixed.push(`export const mfaFatores = sqliteTable('mfa_fatores', {`);
fixed.push(`  id: text('id').primaryKey(),`);
fixed.push(`  userId: text('user_id').notNull(),`);
fixed.push(`  secret: text('secret').notNull(),`);
fixed.push(`  friendlyName: text('friendly_name'),`);
fixed.push(`  status: text('status').notNull(),`);
fixed.push(`  createdAt: text('created_at').notNull(),`);
fixed.push('});');
fixed.push('');

writeFileSync('drizzle/0013_legado_catalogo.sql', `${lines.join('\n')}\n`);
writeFileSync('src/lib/server/data/legado-meta.json', JSON.stringify(meta));
writeFileSync('src/lib/server/db/legadoSchema.ts', `${fixed.join('\n')}\n`);
console.log(`tabelas=${tables.size} fks=${fks.length} bytes=${lines.join('\n').length}`);
