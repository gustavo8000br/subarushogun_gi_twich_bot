import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createQueueRepository } from '../../apps/api/src/persistence/queue-repository.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const migrationDirectory = '20261007120000_unified_command_policy';
const migrationPath = `${root}/apps/api/prisma/migrations/${migrationDirectory}/migration.sql`;
const containerName = `queuebot-policy-v3-${process.pid}-${randomUUID().slice(0, 8)}`;
let prisma;
let repository;
let containerStarted = false;

function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `docker ${args[0]} failed`);
  return result.stdout.trim();
}

describe('unified command policy PostgreSQL migration', () => {
  beforeAll(async () => {
    docker(['run', '--detach', '--rm', '--name', containerName,
      '--env', 'POSTGRES_USER=queuebot', '--env', 'POSTGRES_PASSWORD=isolated-test-password', '--env', 'POSTGRES_DB=queuebot',
      '--publish', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql:rw,noexec,nosuid,size=512m', 'postgres:18.6-bookworm']);
    containerStarted = true;
    const port = docker(['port', containerName, '5432/tcp']).split(':').at(-1);
    const connectionString = `postgresql://queuebot:isolated-test-password@127.0.0.1:${port}/queuebot?schema=public`;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const probe = spawnSync('docker', ['exec', containerName, 'pg_isready', '-U', 'queuebot', '-d', 'queuebot'], { cwd: root, encoding: 'utf8', timeout: 3000 });
      if (probe.status === 0) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    expect(ready, 'isolated PostgreSQL did not become healthy').toBe(true);
    const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { cwd: root, encoding: 'utf8', timeout: 60_000, env: { ...process.env, DATABASE_URL: connectionString } });
    expect(migration.status, migration.stderr || migration.stdout).toBe(0);
    const pool = new pg.Pool({ connectionString });
    await pool.query('SELECT 1');
    await pool.end();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    repository = createQueueRepository(prisma);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (containerStarted) spawnSync('docker', ['stop', containerName], { cwd: root, encoding: 'utf8', timeout: 30_000 });
  });

  it('uses the single current permission schema for an empty installation', async () => {
    await prisma.setting.deleteMany({ where: { key: 'chat_command_policies' } });
    await expect(repository.getCommandPolicyState()).resolves.toEqual({ schemaVersion: 3, version: 1, policies: {} });
  });

  it('resets only command policy preferences, advances revision, audits, and is idempotent', async () => {
    const previous = { schemaVersion: 2, revision: 8, policies: { 'queue:posicao': { minimumRole: 'subscriber' } } };
    const unrelated = { locale: 'en', revision: 4 };
    await prisma.setting.upsert({ where: { key: 'chat_command_policies' }, create: { key: 'chat_command_policies', value: previous }, update: { value: previous } });
    await prisma.setting.upsert({ where: { key: 'unrelated_test_setting' }, create: { key: 'unrelated_test_setting', value: unrelated }, update: { value: unrelated } });

    expect(existsSync(migrationPath), 'the policy reset must be a versioned PostgreSQL migration').toBe(true);
    const migrationSql = await readFile(migrationPath, 'utf8');
    await prisma.$executeRawUnsafe(migrationSql);

    await expect(repository.getCommandPolicyState()).resolves.toEqual({ schemaVersion: 3, version: 9, policies: {} });
    await expect(prisma.setting.findUnique({ where: { key: 'unrelated_test_setting' } })).resolves.toMatchObject({ value: unrelated });
    await expect(prisma.auditLog.count({ where: { event: 'command.permission_policy_migrated', reason: 'unified_access_rules' } })).resolves.toBe(1);

    await prisma.$executeRawUnsafe(migrationSql);
    await expect(repository.getCommandPolicyState()).resolves.toEqual({ schemaVersion: 3, version: 9, policies: {} });
    await expect(prisma.auditLog.count({ where: { event: 'command.permission_policy_migrated', reason: 'unified_access_rules' } })).resolves.toBe(1);
  });
});
