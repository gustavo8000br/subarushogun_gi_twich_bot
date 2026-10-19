import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureDevelopmentEnvFile } from '../../apps/frontend/scripts/dev-env.mjs';
import { ensureDevelopmentDatabaseSecret, getDevelopmentComposeProject, migrateDevelopmentDatabase, startDevelopmentDatabase, stopDevelopmentDatabase } from '../../apps/frontend/scripts/dev-database.mjs';

let temporaryDirectory;
afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

describe('local development environment file', () => {
  it('creates the product-specific env file from its template only when it is missing', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'next-dev-env-'));
    await writeFile(join(temporaryDirectory, '.env.product.example'), 'DATABASE_URL=\n');
    const envPath = await ensureDevelopmentEnvFile(temporaryDirectory);
    expect(envPath).toBe(join(temporaryDirectory, '.env.product.local'));
    expect(await readFile(envPath, 'utf8')).toBe('DATABASE_URL=\n');
  });

  it('preserves a user-created product environment file', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'next-dev-env-'));
    await writeFile(join(temporaryDirectory, '.env.product.example'), 'DATABASE_URL=\n');
    await writeFile(join(temporaryDirectory, '.env.product.local'), 'DATABASE_URL=postgresql://local\n');
    const envPath = await ensureDevelopmentEnvFile(temporaryDirectory);
    expect(await readFile(envPath, 'utf8')).toBe('DATABASE_URL=postgresql://local\n');
  });

  it('creates and then preserves a private development database password', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'next-dev-env-'));
    const secretPath = await ensureDevelopmentDatabaseSecret(temporaryDirectory);
    const firstSecret = await readFile(secretPath, 'utf8');
    expect(firstSecret.length).toBeGreaterThanOrEqual(40);
    if (process.platform !== 'win32') expect((await stat(secretPath)).mode & 0o077).toBe(0);
    expect(await ensureDevelopmentDatabaseSecret(temporaryDirectory)).toBe(secretPath);
    expect(await readFile(secretPath, 'utf8')).toBe(firstSecret);
  });

  it('starts and stops only the isolated development database project', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'next-dev-env-'));
    const calls = [];
    const command = async (args, options) => { calls.push([args, options]); };
    const result = await startDevelopmentDatabase({ root: temporaryDirectory, env: {}, command });
    expect(result.databaseUrl).toMatch(/^postgresql:\/\/queuebot:.+@127\.0\.0\.1:55432\/queuebot\?schema=public$/);
    expect(result.projectName).toBe(getDevelopmentComposeProject(temporaryDirectory));
    expect(calls[0][0]).toEqual(['compose', '-f', join(temporaryDirectory, 'compose.dev.yaml'), '-p', result.projectName, 'up', '-d', '--wait', 'db']);
    await stopDevelopmentDatabase({ root: temporaryDirectory, env: {}, command });
    expect(calls[1][0].slice(-2)).toEqual(['stop', 'db']);
    expect(calls[1][0]).not.toContain('-v');
  });

  it('snapshots the isolated development database before applying migrations', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'next-dev-env-'));
    const calls = [];
    const docker = async (args, options) => {
      calls.push(['docker', args, options]);
      return { stdout: Buffer.from('custom-postgres-dump'), stderr: '' };
    };
    const prisma = async (args, options) => { calls.push(['prisma', args, options]); };
    await migrateDevelopmentDatabase('postgresql://queuebot:dev@127.0.0.1:55432/queuebot?schema=public', {
      root: temporaryDirectory,
      env: {},
      projectName: 'queuebot-dev-test',
      composeFile: join(temporaryDirectory, 'compose.dev.yaml'),
      command: docker,
      prismaCommand: prisma,
    });
    expect(calls.map(([name]) => name)).toEqual(['docker', 'prisma']);
    expect(calls[0][1].slice(-17)).toEqual(['compose', '-f', join(temporaryDirectory, 'compose.dev.yaml'), '-p', 'queuebot-dev-test', 'exec', '-T', 'db', 'pg_dump', '-U', 'queuebot', '-d', 'queuebot', '--format=custom', '--no-owner', '--no-acl']);
    expect(calls[1][1].slice(-2)).toEqual(['migrate', 'deploy']);
    const backupDirectory = join(temporaryDirectory, '.local/dev-db/backups');
    const { readdir } = await import('node:fs/promises');
    const [backupName] = await readdir(backupDirectory);
    expect(await readFile(join(backupDirectory, backupName))).toEqual(Buffer.from('custom-postgres-dump'));
  });
});
