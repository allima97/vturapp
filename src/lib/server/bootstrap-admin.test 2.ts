import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashPassword, verifyPassword } from '@better-auth/utils/password';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BootstrapRefused,
  adminExistsSql,
  assertEmail,
  buildStatements,
  redactSecrets
} from '../../../scripts/bootstrap-admin-lib.mjs';
import {
  generatePassword,
  readModuleKeys,
  writeSecretFile
} from '../../../scripts/bootstrap-admin-fs.mjs';
const PLAIN = 'senha-de-teste-que-nao-vai-pro-sql';

describe('bootstrap admin (arquivo e SQL)', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    );
  });

  it('grava a senha so no arquivo 600 e o SQL fica com o hash do scrypt', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vtur-bootstrap-'));
    directories.push(directory);
    const path = await writeSecretFile(directory, 'staging', 'admin@vtur.com.br', PLAIN);
    const info = await stat(path);
    expect(info.mode & 0o777).toBe(0o600);
    const stored = await readFile(path, 'utf8');
    expect(stored).toContain('email=admin@vtur.com.br');
    expect(stored).toContain(`senha=${PLAIN}`);

    const passwordHash = await hashPassword(PLAIN);
    expect(passwordHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/i);
    expect(await verifyPassword(passwordHash, PLAIN)).toBe(true);
    const { statements } = buildStatements({
      email: 'Admin@VTUR.com.br',
      passwordHash,
      modules: readModuleKeys()
    });
    const sql = statements.join('\n');
    expect(sql).not.toContain(PLAIN);
    expect(sql).toContain(passwordHash);
    expect(sql).toContain("'admin@vtur.com.br'");
    expect(sql).toContain("'credential'");
    expect(readModuleKeys().length).toBeGreaterThan(10);
    expect(adminExistsSql()).not.toContain(';');
    expect(redactSecrets(`falha ${passwordHash}`)).toBe('falha [hash]');
  }, 30_000);

  it('recusa e-mail invalido e senha curta antes de gravar arquivo', async () => {
    expect(() => assertEmail('sem-arroba')).toThrow(BootstrapRefused);
    expect(generatePassword().length).toBeGreaterThanOrEqual(16);
  });
});
