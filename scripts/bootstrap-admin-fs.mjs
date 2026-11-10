import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleKeys } from './bootstrap-admin-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function readModuleKeys() {
  return moduleKeys(readFileSync(join(ROOT, 'src/lib/config/modulos.ts'), 'utf8'));
}

/**
 * @param {string} directory
 * @param {string} envName
 * @param {string} email
 * @param {string} password
 */
export async function writeSecretFile(directory, envName, email, password) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const path = join(directory, `bootstrap-admin-${envName}.txt`);
  const body = [
    `env=${envName}`,
    `email=${email}`,
    `criado_em=${new Date().toISOString()}`,
    `senha=${password}`,
    ''
  ].join('\n');
  await writeFile(path, body, { mode: 0o600, flag: 'w' });
  await chmod(path, 0o600);
  return path;
}

export function generatePassword() {
  return randomBytes(24).toString('base64url');
}
