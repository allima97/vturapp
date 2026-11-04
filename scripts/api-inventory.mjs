// scripts/api-inventory.mjs
//
// Gera o inventario de contrato das APIs (src/routes/api/**/+server.ts):
//   - rota e metodos HTTP exportados
//   - guardas (auth, escopo, perfis exigidos, CSRF, limite de body, cron secret)
//   - tabelas tocadas por operacao (select/insert/update/upsert/delete) e RPCs
//   - invalidacoes de cache/read model
//
// Base da migracao para Hono (Fase 2): cada rota migrada precisa manter
// exatamente o mesmo contrato listado aqui.
//
// Uso:  node scripts/api-inventory.mjs            -> docs/api-inventory.{md,json}
//       node scripts/api-inventory.mjs --check    -> falha (exit 1) se o JSON
//                                                    versionado estiver desatualizado

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const API_DIR = join(ROOT, 'src', 'routes', 'api');
const OUT_DIR = join(ROOT, 'docs');
const CHECK = process.argv.includes('--check');

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (name === '+server.ts' || name === '+server.js') acc.push(full);
  }
  return acc;
}

function routeFromFile(file) {
  const rel = relative(join(ROOT, 'src', 'routes'), file)
    .split(sep)
    .join('/');
  return '/' + rel.replace(/\/\+server\.(ts|js)$/, '');
}

const uniqSorted = (arr) => Array.from(new Set(arr)).sort();

// Rota migrada para Hono: o +server.ts só repassa (apiHandler). A análise de
// tabelas/guardas passa a ler o módulo em src/lib/server/api/routes/<rota>.ts.
function honoModuleFor(file) {
  const rel = relative(API_DIR, file)
    .split(sep)
    .join('/')
    .replace(/\/\+server\.(ts|js)$/, '');
  const segs = rel
    .replace(/^v1\/?/, '')
    .split('/')
    .filter(Boolean);
  const [dom, ...rest] = segs;
  const routesDir = join(ROOT, 'src', 'lib', 'server', 'api', 'routes');
  // Convenção dos geradores (migrate_*.py): routes/<dominio>/<segmentos-sem-[]-unidos-por-hifen>.ts
  // ('root' para a raiz do domínio). Mantém o formato antigo (pastas aninhadas) como alternativa.
  const flat = rest.length ? rest.map((s) => s.replace(/^\[|\]$/g, '')).join('-') : 'root';
  const candidates = dom
    ? [
        join(routesDir, dom, `${flat}.ts`),
        join(routesDir, ...segs) + '.ts',
        join(routesDir, ...segs, 'index.ts')
      ]
    : [];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function analyze(file) {
  const routeSrc = readFileSync(file, 'utf-8');
  const isHono = /\bapiHandler\b/.test(routeSrc);
  const honoModule = isHono ? honoModuleFor(file) : null;
  const src = honoModule ? `${routeSrc}\n${readFileSync(honoModule, 'utf-8')}` : routeSrc;
  const methods = uniqSorted(
    [
      ...routeSrc.matchAll(
        /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|fallback)\b/g
      )
    ].map((m) => m[1])
  );
  // re-exports: export { GET } from '...'  /  export { GET as POST }
  for (const m of routeSrc.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name && /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/.test(name)) methods.push(name);
    }
  }

  const tables = {};
  for (const m of src.matchAll(/\.from\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)([\s\S]{0,400})/g)) {
    const table = m[1];
    const tail = m[2];
    const op = (tail.match(/^\s*\.(select|insert|update|upsert|delete)\b/) || [])[1] || 'select';
    tables[table] ??= new Set();
    tables[table].add(op);
  }
  const tablesOut = Object.fromEntries(
    Object.entries(tables)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([t, ops]) => [t, [...ops].sort()])
  );

  const rpcs = uniqSorted(
    [...src.matchAll(/\.rpc\(\s*['"`]([a-zA-Z0-9_]+)['"`]/g)].map((m) => m[1])
  );

  const has = (re) => re.test(src);
  const roles = uniqSorted(
    [...src.matchAll(/scope\.(isAdmin|isMaster|isGestor|isFinanceiro|isVendedor)\b/g)].map(
      (m) => m[1]
    )
  );
  const invalidations = uniqSorted(
    [
      ...src.matchAll(
        /\b(invalidate[A-Za-z]*ReadModels?|invalidateReadModelCache|publishKvInvalidationAsync|triggerRebuildAsync|markDirtyForCompany|markRankingReadModelDirty)\b/g
      )
    ].map((m) => m[1])
  );
  const imports = uniqSorted([...src.matchAll(/from\s+['"](\$lib\/[^'"]+)['"]/g)].map((m) => m[1]));

  return {
    route: routeFromFile(file),
    file: relative(ROOT, file).split(sep).join('/'),
    hono: isHono
      ? relative(ROOT, honoModule || file)
          .split(sep)
          .join('/')
      : null,
    methods: uniqSorted(methods),
    guards: {
      // sessao validada: helper padrao, wrappers de escopo (_shared.ts) ou safeGetSession
      requireAuthenticatedUser: has(
        /requireAuthenticatedUser\s*\(|\brequire\w+Scope\s*\(|locals\.safeGetSession\s*\(/
      ),
      resolveUserScope: has(/resolveUserScope\s*\(/),
      roles,
      rejectCrossOrigin: has(/rejectCrossOriginRequest\s*\(/),
      bodyLimit: has(/read(Json|Text)BodyLimited\s*\(/),
      cronSecret: has(/x-cron-secret|CRON_SECRET/),
      turnstile: has(/turnstile/i),
      adminClient: has(/getAdminClient\s*\(/),
      debugOnly: has(/isDebugEndpointEnabled|isProductionRuntime/)
    },
    tables: tablesOut,
    rpcs,
    invalidations,
    imports,
    mutates: Object.values(tablesOut).some((ops) => ops.some((o) => o !== 'select')),
    lines: src.split('\n').length
  };
}

const files = walk(API_DIR).sort();
const endpoints = files.map(analyze);

const json =
  JSON.stringify(
    { generatedBy: 'scripts/api-inventory.mjs', count: endpoints.length, endpoints },
    null,
    2
  ) + '\n';

if (CHECK) {
  const current = existsSync(join(OUT_DIR, 'api-inventory.json'))
    ? readFileSync(join(OUT_DIR, 'api-inventory.json'), 'utf-8').replace(/\r\n/g, '\n')
    : '';
  if (current !== json) {
    console.error(
      '[api-inventory] docs/api-inventory.json desatualizado. Rode: node scripts/api-inventory.mjs'
    );
    process.exit(1);
  }
  console.log(`[api-inventory] OK (${endpoints.length} endpoints)`);
  process.exit(0);
}

// ---------------- Markdown ----------------
const byDomain = new Map();
for (const e of endpoints) {
  const parts = e.route.split('/').filter(Boolean); // api, v1, dominio...
  const domain = parts[1] === 'v1' ? parts[2] || 'v1' : parts[1] || 'api';
  if (!byDomain.has(domain)) byDomain.set(domain, []);
  byDomain.get(domain).push(e);
}

const yes = (b) => (b ? '✔' : '');
const OP_LABEL = { select: 'R', insert: 'C', update: 'U', upsert: 'UP', delete: 'D' };
const mutating = endpoints.filter((e) => e.mutates);
const mutatingSemAuth = mutating.filter(
  (e) => !e.guards.requireAuthenticatedUser && !e.guards.cronSecret
);
const mutatingSemCsrf = mutating.filter(
  (e) => e.methods.some((m) => m !== 'GET') && !e.guards.rejectCrossOrigin
);
const vendasTables = [
  'vendas',
  'vendas_recibos',
  'vendas_recibos_rateio',
  'vendas_pagamentos',
  'conciliacao_recibos',
  'vendas_recibos_complementares'
];
const salesMutSemInvalid = mutating.filter(
  (e) =>
    Object.entries(e.tables).some(
      ([t, ops]) => vendasTables.includes(t) && ops.some((o) => o !== 'select')
    ) && e.invalidations.length === 0
);

let md = `# Inventário de contrato das APIs\n\n`;
md += `Gerado por \`node scripts/api-inventory.mjs\` — **não editar à mão**. JSON completo em \`docs/api-inventory.json\`.\n\n`;
md += `- Endpoints: **${endpoints.length}** (${mutating.length} gravam no banco)\n`;
md += `- Domínios: ${byDomain.size}\n`;
md += `- Migrados para Hono: **${endpoints.filter((e) => e.hono).length}** (marcados com <sub>hono</sub>)\n\n`;

md += `## Pontos de atenção (detectados automaticamente)\n\n`;
md += `Heurística por análise de texto — confirmar manualmente antes de agir.\n\n`;
md += `### Gravam no banco sem \`requireAuthenticatedUser\` (${mutatingSemAuth.length})\n`;
md += mutatingSemAuth.length
  ? mutatingSemAuth.map((e) => `- \`${e.route}\` (${e.methods.join(', ')})`).join('\n') + '\n\n'
  : '- nenhum\n\n';
md += `### Métodos de escrita sem \`rejectCrossOriginRequest\` (${mutatingSemCsrf.length})\n`;
md += mutatingSemCsrf.length
  ? mutatingSemCsrf.map((e) => `- \`${e.route}\` (${e.methods.join(', ')})`).join('\n') + '\n\n'
  : '- nenhum\n\n';
md += `### Gravam em tabelas de venda/conciliação sem invalidação explícita de cache (${salesMutSemInvalid.length})\n`;
md += `Desde a migration 20260924184114 o read model v4 é marcado dirty por trigger; ainda assim o cache em memória/KV depende da invalidação na aplicação.\n\n`;
md += salesMutSemInvalid.length
  ? salesMutSemInvalid
      .map(
        (e) =>
          `- \`${e.route}\` → ${Object.keys(e.tables)
            .filter((t) => vendasTables.includes(t))
            .join(', ')}`
      )
      .join('\n') + '\n\n'
  : '- nenhum\n\n';

md += `## Endpoints por domínio\n\n`;
md += `Legenda: **Auth** = requireAuthenticatedUser · **Escopo** = resolveUserScope · **CSRF** = rejectCrossOriginRequest · **Body** = limite de tamanho do corpo\n\n`;
for (const [domain, list] of [...byDomain.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  md += `### ${domain} (${list.length})\n\n`;
  md += `| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |\n`;
  md += `|---|---|:-:|:-:|---|:-:|:-:|---|---|---|\n`;
  for (const e of list) {
    const tables = Object.entries(e.tables)
      .map(([t, ops]) => `${t}(${ops.map((o) => OP_LABEL[o] || o).join('/')})`)
      .join(', ');
    const extra = [
      e.hono && 'hono',
      e.guards.cronSecret && 'cron-secret',
      e.guards.turnstile && 'turnstile',
      e.guards.debugOnly && 'debug-only'
    ]
      .filter(Boolean)
      .join(' ');
    md += `| \`${e.route.replace('/api', '')}\`${extra ? ` <sub>${extra}</sub>` : ''} | ${e.methods.join(' ')} | ${yes(e.guards.requireAuthenticatedUser)} | ${yes(e.guards.resolveUserScope)} | ${e.guards.roles.map((r) => r.replace(/^is/, '')).join(' ')} | ${yes(e.guards.rejectCrossOrigin)} | ${yes(e.guards.bodyLimit)} | ${tables || '—'} | ${e.rpcs.join(', ') || '—'} | ${e.invalidations.join(', ') || '—'} |\n`;
  }
  md += `\n`;
}
md += `Operações: R = select · C = insert · U = update · UP = upsert · D = delete\n`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'api-inventory.json'), json);
writeFileSync(join(OUT_DIR, 'api-inventory.md'), md);
console.log(`[api-inventory] ${endpoints.length} endpoints -> docs/api-inventory.{md,json}`);
