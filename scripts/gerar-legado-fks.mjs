/**
 * Recria o catalogo legado com FKs e CHECKs do dump do Postgres.
 * Uso: node scripts/gerar-legado-fks.mjs /caminho/public.sql
 * Nao grava e-mails nem UUIDs do dump.
 */
import { readFileSync, writeFileSync } from "node:fs";

const dumpPath = process.argv[2];
if (!dumpPath) {
  console.error("Informe o SQL do schema public.");
  process.exit(1);
}
const dump = readFileSync(dumpPath, "utf8");
const catalog = readFileSync("drizzle/0013_legado_catalogo.sql", "utf8");
const indexes = readFileSync("drizzle/0014_legado_indices.sql", "utf8")
  .split("\n")
  .filter((line) => line.startsWith("CREATE INDEX"));

function parseCatalog() {
  const tables = new Map();
  const re = /CREATE TABLE IF NOT EXISTS "(legado_[^"]+)" \(([\s\S]*?)\n\);/g;
  for (const match of catalog.matchAll(re)) {
    const name = match[1].slice("legado_".length);
    const lines = match[2]
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const columns = [];
    const constraints = [];
    for (const line of lines) {
      const cleaned = line.replace(/,$/, "");
      if (cleaned.startsWith('"') || cleaned.startsWith("`")) columns.push(cleaned);
      else constraints.push(cleaned);
    }
    const columnNames = columns.map((line) => line.match(/^"([^"]+)"/)[1]);
    tables.set(name, { columns, constraints, columnNames });
  }
  return tables;
}

function parseChecks() {
  const checks = new Map();
  const re = /CREATE TABLE IF NOT EXISTS "public"\."([^"]+)" \(([\s\S]*?)\n\);/g;
  for (const match of dump.matchAll(re)) {
    const body = match[2];
    const found = [];
    const checkRe = /CONSTRAINT "([^"]+)" CHECK \(([\s\S]*?)\)(?=,|\s*$)/g;
    for (const check of body.matchAll(checkRe)) {
      const sql = translateCheck(check[2]);
      if (sql) found.push(`CONSTRAINT "${check[1]}" CHECK (${sql})`);
    }
    if (found.length) checks.set(match[1], found);
  }
  return checks;
}

function translateCheck(expression) {
  const text = expression.replace(/"([a-z0-9_]+)"/gi, '"$1"');
  if (/~|auth\.|select|::|ANY \(ARRAY\[\]\)/i.test(text) && !/ANY \(ARRAY\[/.test(text)) {
    if (!/ANY \(ARRAY\[/.test(text)) return null;
  }
  const list = text.match(/ANY \(ARRAY\[([\s\S]*?)\]/);
  if (list) {
    const column = text.match(/"([a-z0-9_]+)"/i)?.[1];
    const values = [...list[1].matchAll(/'([^']*)'/g)].map((item) => item[1]);
    if (!column || values.length === 0) return null;
    return `"${column}" IN (${values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ")})`;
  }
  if (/[~()]/.test(text) && !/>=|<=/.test(text)) return null;
  const compare = text
    .replace(/::[a-z0-9_ ]+/gi, "")
    .replace(/\((\d+)\)::numeric/gi, "$1")
    .replace(/"([a-z0-9_]+)"/gi, '"$1"');
  if (!/^[\s"()0-9a-z_.<>=!ANDORISNULL-]+$/i.test(compare)) return null;
  return compare.replace(/\s+/g, " ").trim();
}

function parseFks() {
  const fks = [];
  const re =
    /ALTER TABLE ONLY "public"\."([^"]+)"\s+ADD CONSTRAINT "([^"]+)" FOREIGN KEY \(([^)]+)\) REFERENCES "public"\."([^"]+)"\(([^)]+)\)([^;]*);/g;
  for (const match of dump.matchAll(re)) {
    const columns = match[3].split(",").map((item) => item.trim().replace(/"/g, ""));
    const refs = match[5].split(",").map((item) => item.trim().replace(/"/g, ""));
    const tail = match[6].toUpperCase();
    let onDelete = "NO ACTION";
    if (tail.includes("ON DELETE CASCADE")) onDelete = "CASCADE";
    else if (tail.includes("ON DELETE SET NULL")) onDelete = "SET NULL";
    else if (tail.includes("ON DELETE RESTRICT")) onDelete = "RESTRICT";
    fks.push({
      table: match[1],
      name: match[2],
      columns,
      ref: match[4],
      refs,
      onDelete,
    });
  }
  return fks;
}

const tables = parseCatalog();
const checks = parseChecks();
function parentKeys(table) {
  const keys = [];
  for (const column of table.columns) {
    if (/PRIMARY KEY/i.test(column)) {
      const name = column.match(/^"([^"]+)"/);
      if (name) keys.push([name[1]]);
    }
  }
  for (const constraint of table.constraints) {
    const match = constraint.match(/(?:PRIMARY KEY|UNIQUE) \(([^)]+)\)/i);
    if (!match) continue;
    keys.push(match[1].split(",").map((item) => item.trim().replace(/"/g, "")));
  }
  return keys;
}

const fks = parseFks().filter((fk) => {
  const table = tables.get(fk.table);
  const ref = tables.get(fk.ref);
  if (!table || !ref) return false;
  if (fk.columns.some((column) => !table.columnNames.includes(column))) return false;
  if (fk.refs.some((column) => !ref.columnNames.includes(column))) return false;
  const keys = parentKeys(ref);
  return keys.some(
    (key) => key.length === fk.refs.length && key.every((column, index) => column === fk.refs[index]),
  );
});

const graph = new Map([...tables.keys()].map((name) => [name, new Set()]));
const deferred = new Set();
for (const fk of fks) {
  if (fk.table === fk.ref) {
    deferred.add(fk.name);
    continue;
  }
  graph.get(fk.table).add(fk.ref);
}
const visiting = new Set();
const visited = new Set();
function walk(name) {
  if (visited.has(name)) return;
  if (visiting.has(name)) return;
  visiting.add(name);
  for (const dep of graph.get(name) || []) {
    if (visiting.has(dep)) {
      for (const fk of fks) {
        if (fk.table === name && fk.ref === dep) deferred.add(fk.name);
      }
      continue;
    }
    walk(dep);
  }
  visiting.delete(name);
  visited.add(name);
}
for (const name of tables.keys()) walk(name);

const order = [];
const pending = new Set(tables.keys());
const done = new Set();
while (pending.size) {
  let moved = false;
  for (const name of pending) {
    const deps = [...(graph.get(name) || [])].filter((dep) => {
      const edge = fks.find((fk) => fk.table === name && fk.ref === dep && !deferred.has(fk.name));
      return edge && !done.has(dep);
    });
    if (deps.length === 0) {
      order.push(name);
      done.add(name);
      pending.delete(name);
      moved = true;
    }
  }
  if (!moved) {
    const leftover = [...pending][0];
    order.push(leftover);
    done.add(leftover);
    pending.delete(leftover);
  }
}

const lines = [
  "-- Recria o catalogo legado com FKs e CHECKs equivalentes ao Postgres.",
  "-- Copia as linhas existentes, recria as tabelas e restaura.",
  "-- FKs em ciclo ou auto-referencia ficam DEFERRABLE.",
  "PRAGMA foreign_keys = OFF;",
  "",
];
for (const name of tables.keys()) {
  lines.push(
    `CREATE TABLE IF NOT EXISTS "legado_bak_${name}" AS SELECT * FROM "legado_${name}";`,
  );
  lines.push(`DROP TABLE "legado_${name}";`);
}
lines.push("");

for (const name of order) {
  const table = tables.get(name);
  const extras = [...(checks.get(name) || [])].filter((check) => {
    const names = [...check.matchAll(/"([a-z0-9_]+)"/gi)].map((item) => item[1]);
    return names.every((column) => table.columnNames.includes(column));
  });
  for (const fk of fks.filter((item) => item.table === name)) {
    const defer = deferred.has(fk.name) ? " DEFERRABLE INITIALLY DEFERRED" : "";
    extras.push(
      `CONSTRAINT "${fk.name}" FOREIGN KEY (${fk.columns.map((column) => `"${column}"`).join(", ")}) REFERENCES "legado_${fk.ref}" (${fk.refs.map((column) => `"${column}"`).join(", ")}) ON DELETE ${fk.onDelete}${defer}`,
    );
  }
  const body = [...table.columns.map((column) => `  ${column}`), ...table.constraints.map((item) => `  ${item}`), ...extras.map((item) => `  ${item}`)];
  // commas between parts
  const sqlBody = body
    .map((line, index) => (index < body.length - 1 && !line.endsWith(",") ? `${line},` : line))
    .join("\n");
  lines.push(`CREATE TABLE "legado_${name}" (\n${sqlBody}\n);`);
  const cols = table.columnNames.map((column) => `"${column}"`).join(", ");
  lines.push(
    `INSERT INTO "legado_${name}" (${cols}) SELECT ${cols} FROM "legado_bak_${name}";`,
  );
  lines.push(`DROP TABLE "legado_bak_${name}";`);
  lines.push("");
}
lines.push("PRAGMA foreign_keys = ON;");
lines.push(...indexes);
lines.push("");
writeFileSync("drizzle/0015_legado_fks.sql", `${lines.join("\n")}\n`);
console.log(JSON.stringify({ tables: tables.size, fks: fks.length, deferred: deferred.size, checks: [...checks.values()].reduce((sum, item) => sum + item.length, 0) }));
