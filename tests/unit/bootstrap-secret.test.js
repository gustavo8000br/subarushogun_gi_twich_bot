import { existsSync } from 'node:fs';
import { chmod, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const moduleUrl = new URL('../../apps/infra/src/bootstrap-secret.mjs', import.meta.url);
const moduleExists = existsSync(fileURLToPath(moduleUrl));
const bootstrap = moduleExists ? await import(moduleUrl.href) : {};
const temporaryRoots = [];

async function createSecretsDir() {
  const root = await mkdtemp(join(tmpdir(), 'aiox-secret-contract-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('local operational secret bootstrap', () => {
  it('provides a bootstrap helper for creating persistent database credentials', () => {
    expect(moduleExists, 'secret bootstrap behavior is not implemented yet').toBe(true);
  });

  it('creates a high-entropy password with restrictive reader permissions', async () => {
    const directory = await createSecretsDir();
    const { secretPath } = await bootstrap.ensureDatabaseSecret({ directory });
    const password = await readFile(secretPath, 'utf8');
    const permissions = (await stat(secretPath)).mode & 0o777;

    expect(password.trim().length).toBeGreaterThanOrEqual(40);
    expect(permissions).toBe(0o440);
  });

  it('preserves an existing password exactly across repeated bootstrap runs', async () => {
    const directory = await createSecretsDir();
    const first = await bootstrap.ensureDatabaseSecret({ directory });
    const password = await readFile(first.secretPath, 'utf8');
    const second = await bootstrap.ensureDatabaseSecret({ directory });

    expect(second.secretPath).toBe(first.secretPath);
    expect(await readFile(second.secretPath, 'utf8')).toBe(password);
  });

  it('fails closed on an existing empty secret instead of replacing a possibly active credential', async () => {
    const directory = await createSecretsDir();
    await bootstrap.ensureDatabaseSecret({ directory });
    const secretPath = join(directory, 'db_password');
    await chmod(secretPath, 0o600);
    await (await import('node:fs/promises')).writeFile(secretPath, '');

    await expect(bootstrap.ensureDatabaseSecret({ directory })).rejects.toThrow(/empty|invalid/i);
    expect(await readFile(secretPath, 'utf8')).toBe('');
  });
});
