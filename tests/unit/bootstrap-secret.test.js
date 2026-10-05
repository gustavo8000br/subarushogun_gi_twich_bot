import { existsSync } from 'node:fs';
import { chmod, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
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

  it('creates persistent localhost TLS material with SANs and exports only the public CA certificate', async () => {
    const directory = await createSecretsDir();
    const exportDirectory = join(directory, 'host-export');
    const result = await bootstrap.ensureLocalTlsCertificate({ directory, exportDirectory });
    const verification = spawnSync('openssl', ['verify', '-CAfile', result.caCertificatePath, result.certificatePath], { encoding: 'utf8' });
    const details = spawnSync('openssl', ['x509', '-in', result.certificatePath, '-noout', '-ext', 'subjectAltName'], { encoding: 'utf8' });

    expect(verification.status, verification.stderr).toBe(0);
    expect(details.stdout).toContain('DNS:localhost');
    expect(details.stdout).toContain('IP Address:127.0.0.1');
    expect(await readFile(join(exportDirectory, 'localhost-ca.crt'), 'utf8')).toBe(await readFile(result.caCertificatePath, 'utf8'));
    expect(existsSync(join(exportDirectory, 'localhost-ca.key'))).toBe(false);
    expect((await stat(result.privateKeyPath)).mode & 0o777).toBe(0o440);
  });

  it('preserves the same localhost certificate and exported CA across bootstrap runs', async () => {
    const directory = await createSecretsDir();
    const exportDirectory = join(directory, 'host-export');
    const first = await bootstrap.ensureLocalTlsCertificate({ directory, exportDirectory });
    const certificate = await readFile(first.certificatePath, 'utf8');
    const privateKey = await readFile(first.privateKeyPath, 'utf8');
    const second = await bootstrap.ensureLocalTlsCertificate({ directory, exportDirectory });

    expect(await readFile(second.certificatePath, 'utf8')).toBe(certificate);
    expect(await readFile(second.privateKeyPath, 'utf8')).toBe(privateKey);
  });
});
