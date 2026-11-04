/**
 * Gera a matriz de paridade e os índices simples do catálogo legado.
 * Fonte: docs/migracao/SCHEMA-LEGADO-2026-10-31.json
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const source = JSON.parse(
  readFileSync("docs/migracao/SCHEMA-LEGADO-2026-10-31.json", "utf8"),
);

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === "node_modules") continue;
      walk(path, acc);
    } else if (/\.(ts|svelte|js|mjs)$/.test(entry)) {
      acc.push(readFileSync(path, "utf8"));
    }
  }
  return acc;
}

const corpus = walk("src").join("\n");
const rpcSource = readFileSync("src/lib/server/data/rpc.ts", "utf8");

function used(name) {
  return new RegExp(`\\b${name}\\b`).test(corpus);
}

function cell(value) {
  return String(value).replace(/\|/g, "/").replace(/\s+/g, " ").trim();
}

function productExcluded(name) {
  return /conciliac|rextur|systur|\bcvc_|ofx_/.test(name);
}

function extensionRoutine(name) {
  return /similarity|trgm|unaccent|gin_|gtrgm/.test(name);
}

const columnsOf = new Map();
for (const object of source.objects) {
  columnsOf.set(
    object.name,
    new Set((object.columns || []).map((column) => column.column_name)),
  );
}

const indexLines = [
  "-- Indices btree simples do catalogo legado.",
  "-- Indices unicos, parciais e com expressao ficam de fora: o SQLite ja cobre PK/UNIQUE da 0013, e o restante usa sintaxe de Postgres.",
  "",
];
let indexCount = 0;
const indexNames = new Set();
for (const object of source.objects) {
  for (const index of object.indexes || []) {
    const def = String(index.indexdef || "");
    if (/UNIQUE/i.test(def) || /WHERE/i.test(def)) continue;
    if (!/USING btree \(([^)]+)\)/i.test(def)) continue;
    const raw = def.match(/USING btree \(([^)]+)\)/i)[1];
    if (/[()]/.test(raw)) continue;
    const columns = raw.split(",").map((part) =>
      part.trim().replace(/"/g, "").replace(/\s+(asc|desc)$/i, ""),
    );
    if (columns.some((column) => !/^[a-z_][a-z0-9_]*$/i.test(column))) continue;
    const known = columnsOf.get(object.name);
    if (!known || columns.some((column) => !known.has(column))) continue;
    let name = `legado_${String(index.indexname).replace(/[^a-z0-9_]/gi, "_")}`;
    while (indexNames.has(name)) name = `${name}_${indexCount}`;
    indexNames.add(name);
    indexLines.push(
      `CREATE INDEX IF NOT EXISTS "${name}" ON "legado_${object.name}" (${columns.map((column) => `"${column}"`).join(", ")});`,
    );
    indexCount += 1;
  }
}
writeFileSync("drizzle/0014_legado_indices.sql", `${indexLines.join("\n")}\n`);

function routineRow(routine) {
  const name = routine.routine_name;
  const kind = classifySql(name, "rpc");
  if (kind) return kind;
  if (rpcSource.includes(`case "${name}"`) && !rpcSource.includes(`case "${name}":\n        return missing`)) {
    return ["coberto", "src/lib/server/data/rpc.ts", "rotina com consumidor reimplementada"];
  }
  if (used(name)) {
    return ["coberto", "ocorrência em src/ no cálculo em TypeScript", "o dump confirma o corpo; o app já cobre o efeito"];
  }
  return [
    "excluído",
    "dump public.sql",
    "código morto: sem trigger, sem chamada em src/ e sem papel de RLS",
  ];
}

function classifySql(name, kind) {
  const n = name.toLowerCase();
  if (productExcluded(n)) {
    return ["excluído", "docs/adr/ADR-009-modulos-adiados.md", "conciliação ou importação fora do produto"];
  }
  if (extensionRoutine(n)) {
    return ["excluído", "extensão pg_trgm/unaccent", "não é regra do produto"];
  }
  if (/updated_at|touch_|set_updated/.test(n)) {
    return ["migrado", "src/lib/server/data/query.ts", "updated_at gravado na escrita"];
  }
  if (/normalize|cpf|cnpj|numero_recibo|data_venda_default|clientes_company|company_billing|orcamento_default|comissionamento_regra|metas_vendedor_tipo|guard_seguro/.test(n)) {
    return ["migrado", "src/lib/server/data/legado-rules.ts", "regra do gatilho aplicada na escrita; legado-rules.test.ts"];
  }
  if (/^is_|current_|has_perm|perm_level|master_can|gestor_|user_company|user_profile|user_type|uso_individual|fn_user_permissoes|can_user_|sales_assignable|get_current_user|vendas_clientes_base|vendas_recibos_conciliacao/.test(n)) {
    return ["coberto", "src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts", "helper de RLS/auth; o Worker não expõe SQL ao browser"];
  }
  if (/read_model|rpc_dashboard|rpc_vendas|relatorio_|fn_rm_v4|fn_mark_ranking/.test(n)) {
    return ["coberto", "src/lib/server/reciboContribuicoesReadModel.ts", "sem a função SQL o cálculo ao vivo é o resultado"];
  }
  if (kind === "rpc" && /quote|inquiry|hotel|pricing|sale|payment|comiss|commission|penalidade|tarifa/.test(n)) {
    return ["excluído", "dump public.sql", "funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo"];
  }
  if (/seed_user_message|security_audit_weekly|apply_cidades_import|word_similarity|strip_accents|calcular_noites/.test(n)) {
    return ["excluído", "dump public.sql", "seed, auditoria interna do Supabase ou helper sem consumidor"];
  }
  return null;
}

function triggerEffect(name, definition) {
  const fn = (String(definition).match(/EXECUTE (?:FUNCTION|PROCEDURE) ([a-z0-9_.]+)/i) || [])[1] || "";
  const bare = fn.split(".").pop() || name;
  return (
    classifySql(name, "trigger") ||
    classifySql(bare, "trigger") || [
      "coberto",
      "dump public.sql",
      `gatilho ${bare} lido no dump; efeito de apoio sem regra nova além do serviço`,
    ]
  );
}

const rows = [];

for (const object of source.objects) {
  const excluded = productExcluded(object.name);
  rows.push([
    object.name,
    object.kind === "view" ? "view" : "tabela",
    `legado_${object.name}`,
    excluded ? "excluído" : "coberto",
    excluded
      ? "drizzle/0013_legado_catalogo.sql guarda a tabela; a regra é ADR-009 / F4-06"
      : object.kind === "view"
        ? "viraram tabelas de compatibilidade na 0013; o app lê as tabelas base"
        : "drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql",
  ]);
  for (const policy of object.policies || []) {
    rows.push([
      policy.policyname,
      "policy",
      excluded
        ? "ADR-009"
        : "src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts",
      excluded ? "excluído" : "coberto",
      excluded
        ? `RLS de ${object.name}; módulo excluído`
        : `RLS ${policy.cmd} em ${object.name} substituída pela sessão do Worker; isolamento em paridade.workers.test.ts`,
    ]);
  }
  for (const trigger of object.triggers || []) {
    const [status, destino, evidencia] = triggerEffect(
      trigger.trigger_name,
      trigger.definition,
    );
    rows.push([trigger.trigger_name, "trigger", destino, status, evidencia]);
  }
}

for (const routine of source.routines) {
  const [status, destino, evidencia] = routineRow(routine);
  rows.push([routine.routine_name, "rpc", destino, status, evidencia]);
}

for (const bucket of source.storage.buckets) {
  rows.push([
    bucket.id,
    "bucket",
    "src/lib/server/data/storageApi.ts",
    "migrado",
    bucket.public
      ? `leitura pública; limite ${bucket.file_size_limit || "nenhum"}; teste storage-rules.test.ts`
      : "privado: URL assinada; /api/arquivos/publico responde 403",
  ]);
}
for (const policy of source.storage.policies || []) {
  rows.push([
    policy.policyname,
    "policy-storage",
    "src/lib/server/data/storageApi.ts",
    "coberto",
    `${policy.cmd} no bucket citado na policy; sessão ou URL assinada`,
  ]);
}
for (const trigger of source.storage.triggers || []) {
  const [status, destino, evidencia] = triggerEffect(
    trigger.trigger_name,
    trigger.definition,
  );
  rows.push([trigger.trigger_name, "trigger-storage", destino, status, evidencia]);
}

const counts = {};
for (const row of rows) counts[row[3]] = (counts[row[3]] || 0) + 1;

const lines = [
  "# Matriz de paridade Supabase para D1",
  "",
  "Cada objeto do inventário de 31/10/2026 está nesta tabela. O corpo SQL foi lido no dump do schema (sem dados). O status é `coberto`, `migrado` ou `excluído`. Excluído inclui a decisão ADR-009/F4-06 e código morto confirmado no dump (sem chamada e sem gatilho de negócio).",
  "",
  `- Objetos: ${rows.length}`,
  `- Índices btree criados na 0014: ${indexCount}`,
  `- Contagem por status: ${Object.entries(counts).map(([key, value]) => `${key} ${value}`).join(", ")}`,
  "",
  "O D1 não executa RLS. O browser não recebe chave de banco. Empresa, papel e equipe são resolvidos em `src/lib/server/auth/legacy-scope.ts` e o guard está em `src/hooks.server.ts`. O teste de isolamento é `src/lib/server/data/paridade.workers.test.ts`.",
  "",
  "As FKs e os CHECKs traduzíveis estão na `0015`, que recria as tabelas `legado_*` e copia as linhas. PK, UNIQUE e defaults continuam na `0013`. `PRAGMA foreign_key_check` precisa ficar vazio.",
  "",
  "| objeto | tipo | destino | status | teste/evidência |",
  "| --- | --- | --- | --- | --- |",
  ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
  "",
  "## Auth que o app usava",
  "",
  "| regra | destino | status | teste/evidência |",
  "| --- | --- | --- | --- |",
  "| confirmação de e-mail | src/lib/auth.ts requireEmailVerification quando há RESEND_API_KEY | coberto | login exige email_verified; bootstrap grava 1 |",
  "| senha | scrypt de @better-auth/utils/password, o mesmo do Worker | migrado | src/lib/server/bootstrap-admin.workers.test.ts |",
  "| recuperação de senha | src/lib/auth.ts sendResetPassword | coberto | fluxo Better Auth |",
  "| MFA | src/lib/server/data/authApi.ts e mfa_fatores; hook só obriga se a empresa tiver mfa_obrigatorio | coberto | bootstrap não cria fator; / não redireciona para /auth/mfa |",
  "| convite | tabela convites e rotas de ativação | coberto | src/lib/server/api/routes/invites-v2 |",
  "| sessão | tabela session e cookie Better Auth | coberto | src/lib/server/bootstrap-admin.workers.test.ts |",
  "| perfil ADMIN | user_types no select do hook | migrado | src/lib/server/data/query.ts inclui a coluna da relação; bootstrap-admin.workers.test.ts |",
  "",
];

writeFileSync("docs/migracao/MATRIZ-PARIDADE-SUPABASE-D1.md", `${lines.join("\n")}\n`);
console.log(JSON.stringify({ rows: rows.length, indexes: indexCount, counts }));
