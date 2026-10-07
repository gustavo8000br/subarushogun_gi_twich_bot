import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createQueueRepository } from '../../apps/api/src/persistence/queue-repository.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const containerName = `queuebot-policy-${process.pid}-${randomUUID().slice(0, 8)}`;
let prisma;
let repository;
let containerStarted = false;

function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `docker ${args[0]} failed`);
  return result.stdout.trim();
}

describe('command policy PostgreSQL persistence', () => {
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

  beforeEach(async () => {
    await prisma.setting.deleteMany({ where: { key: 'chat_command_policies' } });
    await prisma.auditLog.deleteMany({ where: { event: 'command.policies_updated' } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (containerStarted) spawnSync('docker', ['stop', containerName], { cwd: root, encoding: 'utf8', timeout: 30_000 });
  });

  it('persists a schema v3 threshold and audit atomically across repository reconstruction', async () => {
    await expect(repository.getCommandPolicyState()).resolves.toEqual({ schemaVersion: 3, version: 1, policies: {} });
    const actorId = `local-session-${randomUUID()}`;
    await expect(repository.updateCommandPolicies({ expectedVersion: 1, policies: { 'queue:lista': { minimumRole: 'subscriber' } }, actorId }))
      .resolves.toEqual({ schemaVersion: 3, version: 2, policies: { 'queue:lista': { minimumRole: 'subscriber' } } });
    await expect(createQueueRepository(prisma).getCommandPolicyState()).resolves.toEqual({ schemaVersion: 3, version: 2, policies: { 'queue:lista': { minimumRole: 'subscriber' } } });
    await expect(prisma.auditLog.findFirst({ where: { event: 'command.policies_updated', actorId } }))
      .resolves.toMatchObject({ origin: 'panel', reason: 'command_role_policy_changed', safeDetail: { commandIds: ['queue:lista'], version: 2 } });
  });

  it('rejects edits to fixed floors and malformed policy properties', async () => {
    await expect(repository.updateCommandPolicies({ expectedVersion: 1, policies: { 'queue:add': { minimumRole: 'everyone' } }, actorId: 'operator' }))
      .rejects.toMatchObject({ code: 'INVALID_COMMAND_POLICY' });
    await expect(repository.updateCommandPolicies({ expectedVersion: 1, policies: { 'queue:lista': { minimumRole: 'subscriber', extra: true } }, actorId: 'operator' }))
      .rejects.toMatchObject({ code: 'INVALID_COMMAND_POLICY' });
    await expect(repository.getCommandPolicyState()).resolves.toEqual({ schemaVersion: 3, version: 1, policies: {} });
  });

  it('serializes concurrent edits and rejects the stale revision', async () => {
    const attempts = await Promise.allSettled([
      repository.updateCommandPolicies({ expectedVersion: 1, policies: { 'queue:lista': { minimumRole: 'moderator' } }, actorId: 'operator-a' }),
      repository.updateCommandPolicies({ expectedVersion: 1, policies: { 'queue:posicao': { minimumRole: 'subscriber' } }, actorId: 'operator-b' }),
    ]);
    expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(({ status, reason }) => status === 'rejected' && reason?.code === 'COMMAND_POLICY_VERSION_CONFLICT')).toHaveLength(1);
  });

  it('commits OAuth-staged follower thresholds in the caller transaction', async () => {
    await expect(prisma.$transaction((tx) => repository.updateCommandPoliciesInTransaction(tx, {
      expectedVersion: 1, policies: { 'queue:lista': { minimumRole: 'follower' } }, actorId: 'oauth-session-actor', origin: 'oauth_follower_consent',
    }))).resolves.toEqual({ schemaVersion: 3, version: 2, policies: { 'queue:lista': { minimumRole: 'follower' } } });
    await expect(prisma.auditLog.findFirst({ where: { actorId: 'oauth-session-actor' } }))
      .resolves.toMatchObject({ origin: 'oauth_follower_consent' });
  });
});
