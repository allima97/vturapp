/**
 * Bootstrap do primeiro administrador global.
 * A senha entra só como argumento e sai apenas no arquivo 600.
 * O hash é o scrypt de @better-auth/utils/password (node:crypto),
 * o mesmo que o Worker usa com nodejs_compat.
 */
import { hashPassword } from "@better-auth/utils/password";
const EMAIL_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const HASH_PATTERN = /^[0-9a-f]{32}:[0-9a-f]{128}$/i;
const PLATFORM_SLUG = "vtur-plataforma";
const ADMIN_TYPE_NAME = "ADMIN";

export class BootstrapRefused extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = "BootstrapRefused";
  }
}

export const ENVIRONMENTS = {
  staging: {
    database: "vturapp-db-staging",
    args: ["--remote", "--env", "staging"],
  },
  production: {
    database: "vturapp-db",
    args: ["--remote", "--env", "production"],
  },
  local: {
    database: "vturapp-db",
    args: ["--local"],
  },
};

/**
 * @param {string} value
 */
function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

/**
 * @param {string} sql
 */
export function oneLine(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

/**
 * @param {string} text
 */
export function redactSecrets(text) {
  return String(text || "").replace(/[0-9a-f]{16,}:[0-9a-f]{32,}/gi, "[hash]");
}

/**
 * @param {unknown} email
 */
export function assertEmail(email) {
  const normalized = String(email || "")
    .trim()
    .toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) {
    throw new BootstrapRefused("E-mail invalido.");
  }
  return normalized;
}

/**
 * @param {string} source
 */
export function moduleKeys(source) {
  const text = String(source || "");
  const start = text.indexOf("export const MAPA_MODULOS");
  const end = text.indexOf("export const MODULO_ALIASES");
  if (start < 0 || end <= start) {
    throw new BootstrapRefused("Catalogo de modulos nao encontrado.");
  }
  const keys = [...text.slice(start, end).matchAll(/'([a-z0-9_]+)'/g)].map(
    (match) => match[1],
  );
  const unique = [...new Set(keys)];
  if (!unique.length) {
    throw new BootstrapRefused("Catalogo de modulos vazio.");
  }
  return unique;
}

export function adminExistsSql() {
  return oneLine(`
    SELECT 1 AS found
    FROM user_profiles AS profile
    JOIN user_types AS type ON type.id = profile.user_type_id
    WHERE upper(type.name) LIKE '%ADMIN%'
    UNION ALL
    SELECT 1
    FROM legado_users AS profile
    JOIN legado_user_types AS type ON type.id = profile.user_type_id
    WHERE upper(type.name) LIKE '%ADMIN%'
    LIMIT 1
  `);
}

/**
 * @param {string} email
 */
export function emailExistsSql(email) {
  const value = sqlString(assertEmail(email));
  return oneLine(`
    SELECT 1 AS found FROM user WHERE lower(email) = ${value}
    UNION ALL
    SELECT 1 FROM legado_users WHERE lower(email) = ${value}
    LIMIT 1
  `);
}

/**
 * @param {{ email: string, name?: string, passwordHash: string, modules?: string[], catalogSource?: string, now?: Date }} input
 */
export function buildStatements(input) {
  if (!HASH_PATTERN.test(String(input.passwordHash || ""))) {
    throw new BootstrapRefused("Hash de senha invalido.");
  }
  const email = assertEmail(input.email);
  const name = String(input.name || "Administrador VTUR");
  const userId = crypto.randomUUID();
  const typeId = "00000000-0000-4000-8000-0000000000a1";
  const now = input.now ?? new Date();
  const iso = now.toISOString();
  const millis = now.getTime();
  const modules = [
    ...new Set(
      (input.modules?.length
        ? input.modules
        : moduleKeys(input.catalogSource || "")
      ).map((item) => String(item)),
    ),
  ].filter((item) => /^[a-z0-9_]+$/.test(item));
  if (!modules.length) {
    throw new BootstrapRefused("Catalogo de modulos vazio.");
  }
  const passwordHash = String(input.passwordHash);
  const statements = [
    oneLine(`
      INSERT INTO empresas (nome, slug, plano, limite_usuarios, timezone, ativo, criado_em, atualizado_em)
      SELECT 'VTUR Plataforma', ${sqlString(PLATFORM_SLUG)}, 'interno', 50, 'America/Sao_Paulo', 1, ${sqlString(iso)}, ${sqlString(iso)}
      WHERE NOT EXISTS (SELECT 1 FROM empresas WHERE slug = ${sqlString(PLATFORM_SLUG)})
    `),
    oneLine(`
      INSERT INTO user (id, name, email, email_verified, two_factor_enabled, empresa_id, created_at, updated_at)
      SELECT ${sqlString(userId)}, ${sqlString(name)}, ${sqlString(email)}, 1, 0, id, ${millis}, ${millis}
      FROM empresas WHERE slug = ${sqlString(PLATFORM_SLUG)}
    `),
    oneLine(`
      INSERT INTO account (id, user_id, account_id, provider_id, password, created_at, updated_at)
      VALUES (${sqlString(crypto.randomUUID())}, ${sqlString(userId)}, ${sqlString(userId)}, 'credential', ${sqlString(passwordHash)}, ${millis}, ${millis})
    `),
    oneLine(`
      INSERT INTO membros_empresa (empresa_id, user_id, papel, ativo, criado_em, atualizado_em)
      SELECT id, ${sqlString(userId)}, 'admin', 1, ${sqlString(iso)}, ${sqlString(iso)}
      FROM empresas WHERE slug = ${sqlString(PLATFORM_SLUG)}
    `),
    oneLine(`
      INSERT OR IGNORE INTO user_types (id, name, description, created_at)
      VALUES (${sqlString(typeId)}, ${sqlString(ADMIN_TYPE_NAME)}, 'Administrador global', ${sqlString(iso)})
    `),
    oneLine(`
      INSERT INTO user_profiles (user_id, user_type_id, uso_individual, ativo, participa_ranking, updated_at)
      VALUES (${sqlString(userId)}, ${sqlString(typeId)}, 0, 1, 0, ${sqlString(iso)})
    `),
    oneLine(`
      INSERT OR IGNORE INTO legado_user_types (id, name)
      VALUES (${sqlString(typeId)}, ${sqlString(ADMIN_TYPE_NAME)})
    `),
    oneLine(`
      INSERT INTO legado_users (
        id, nome_completo, email, user_type_id, uso_individual, active,
        telefone, cidade, estado, must_change_password, participa_ranking,
        welcome_email_sent, created_by_gestor
      ) VALUES (
        ${sqlString(userId)}, ${sqlString(name)}, ${sqlString(email)}, ${sqlString(typeId)},
        0, 1, '11300000000', 'Sao Paulo', 'SP', 0, 0, 1, 0
      )
    `),
  ];
  for (const modulo of modules) {
    statements.push(
      oneLine(`
        INSERT INTO modulo_acesso (id, usuario_id, modulo, permissao, ativo, created_at, updated_at)
        VALUES (${sqlString(crypto.randomUUID())}, ${sqlString(userId)}, ${sqlString(modulo)}, 'admin', 1, ${sqlString(iso)}, ${sqlString(iso)})
      `),
    );
    statements.push(
      oneLine(`
        INSERT INTO legado_modulo_acesso (id, usuario_id, modulo, permissao, ativo, created_at, updated_at)
        VALUES (${sqlString(crypto.randomUUID())}, ${sqlString(userId)}, ${sqlString(modulo)}, 'admin', 1, ${sqlString(iso)}, ${sqlString(iso)})
      `),
    );
  }
  return { userId, statements };
}

/**
 * @param {{ prepare: Function, batch: Function }} db
 * @param {{ email: string, password: string, name?: string, modules?: string[] }} input
 */
export async function applyBootstrap(db, input) {
  const password = String(input.password || "");
  if (password.length < 16) {
    throw new BootstrapRefused("A senha precisa ter pelo menos 16 caracteres.");
  }
  const email = assertEmail(input.email);
  const existing = await db.prepare(adminExistsSql()).all();
  if ((existing.results || []).length > 0) {
    throw new BootstrapRefused(
      "Ja existe um administrador global. Nada foi alterado.",
    );
  }
  const emailTaken = await db.prepare(emailExistsSql(email)).all();
  if ((emailTaken.results || []).length > 0) {
    throw new BootstrapRefused(
      "O e-mail ja esta cadastrado. Nada foi alterado.",
    );
  }
  const passwordHash = await hashPassword(password);
  const { userId, statements } = buildStatements({
    email,
    name: input.name,
    passwordHash,
    modules: input.modules,
  });
  await db.batch(statements.map((sql) => db.prepare(sql)));
  const created = await db
    .prepare("SELECT id FROM user WHERE id = ?")
    .bind(userId)
    .first();
  if (!created) {
    throw new BootstrapRefused("O administrador nao foi gravado.");
  }
  return { userId, email };
}

/**
 * @param {string} stdout
 */
export function rowsFromWrangler(stdout) {
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start < 0 || end < start) return [];
  const parsed = JSON.parse(stdout.slice(start, end + 1));
  const rows = [];
  for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
    if (Array.isArray(item?.results)) rows.push(...item.results);
  }
  return rows;
}
