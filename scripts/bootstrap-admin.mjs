/**
 * Cria o primeiro administrador global num D1 vazio.
 *
 * A senha aleatoria vai para .secrets/ com modo 600. Ela nao entra no SQL,
 * no stdout nem no stderr. O hash e o scrypt do Better Auth.
 *
 *   npm run bootstrap:admin -- --env staging --email admin@vtur.com.br
 *   npm run bootstrap:admin -- --env production --email admin@vtur.com.br
 *
 * Recusa com codigo 2 se ja existir um perfil global cujo tipo contem ADMIN.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '@better-auth/utils/password';
import {
  assertEmail,
  BootstrapRefused,
  ENVIRONMENTS,
  adminExistsSql,
  buildStatements,
  emailExistsSql,
  redactSecrets,
  rowsFromWrangler
} from './bootstrap-admin-lib.mjs';
import { generatePassword, readModuleKeys, writeSecretFile } from './bootstrap-admin-fs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const args = { env: '', email: 'admin@vtur.com.br', stdin: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--env') args.env = argv[++index] || '';
    else if (token === '--email') args.email = argv[++index] || '';
    else if (token === '--password-stdin') args.stdin = true;
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new BootstrapRefused(`Argumento desconhecido: ${token}`);
  }
  return args;
}

/**
 * @param {string} database
 * @param {string[]} extraArgs
 * @param {string[]} commandArgs
 */
function runWrangler(database, extraArgs, commandArgs) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [WRANGLER, 'd1', 'execute', database, ...extraArgs, '--json', '--yes', ...commandArgs],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(redactSecrets(stderr.trim() || `wrangler encerrou com codigo ${code}`)));
        return;
      }
      resolvePromise(stdout);
    });
  });
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      'Uso: npm run bootstrap:admin -- --env staging|production|local [--email admin@vtur.com.br] [--password-stdin]\n'
    );
    return;
  }
  const target = ENVIRONMENTS[args.env];
  if (!target) {
    throw new BootstrapRefused('Informe --env staging, production ou local.');
  }
  const email = assertEmail(args.email);
  process.stderr.write(`Consultando administradores em ${args.env}...\n`);
  const adminRows = rowsFromWrangler(
    await runWrangler(target.database, target.args, ['--command', adminExistsSql()])
  );
  if (adminRows.length > 0) {
    throw new BootstrapRefused('Ja existe um administrador global. Nada foi alterado.');
  }
  const emailRows = rowsFromWrangler(
    await runWrangler(target.database, target.args, ['--command', emailExistsSql(email)])
  );
  if (emailRows.length > 0) {
    throw new BootstrapRefused('O e-mail ja esta cadastrado. Nada foi alterado.');
  }

  const password = args.stdin ? await readStdin() : generatePassword();
  if (password.length < 16) {
    throw new BootstrapRefused('A senha precisa ter pelo menos 16 caracteres.');
  }
  const secretDir = join(ROOT, '.secrets');
  const secretPath = await writeSecretFile(secretDir, args.env, email, password);
  const sqlPath = join(tmpdir(), `bootstrap-admin-${randomUUID()}.sql`);
  try {
    const passwordHash = await hashPassword(password);
    const { statements } = buildStatements({
      email,
      passwordHash,
      modules: readModuleKeys()
    });
    await writeFile(sqlPath, `${statements.join(';\n')};\n`, { mode: 0o600 });
    await runWrangler(target.database, target.args, ['--file', sqlPath]);
    const quotedEmail = `'${email.replaceAll("'", "''")}'`;
    const created = rowsFromWrangler(
      await runWrangler(target.database, target.args, [
        '--command',
        `SELECT id FROM user WHERE lower(email) = ${quotedEmail} LIMIT 1`
      ])
    );
    if (!created.length) {
      throw new Error('O SQL terminou sem gravar o usuario.');
    }
  } catch (error) {
    await rm(secretPath, { force: true });
    throw error;
  } finally {
    await rm(sqlPath, { force: true });
  }
  const info = await stat(secretPath);
  if ((info.mode & 0o777) !== 0o600) {
    throw new Error('O arquivo da senha nao ficou com permissao 600.');
  }
  process.stdout.write(
    `Administrador criado.\nE-mail: ${email}\nSenha gravada em: ${secretPath}\n`
  );
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((error) => {
    const message = redactSecrets(error instanceof Error ? error.message : 'Falha no bootstrap.');
    process.stderr.write(`${message}\n`);
    process.exitCode = error instanceof BootstrapRefused ? 2 : 1;
  });
}
