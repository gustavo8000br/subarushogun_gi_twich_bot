import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

  afterAll(async () => {
    await prisma?.$disconnect();
    if (containerStarted) spawnSync('docker', ['stop', containerName], { cwd: root, encoding: 'utf8', timeout: 30_000 });
  });

  it('loads defaults, persists policy and audit atomically, then reloads after repository reconstruction', async () => {
    await expect(repository.getCommandPolicyState()).resolves.toEqual({ schemaVersion: 1, version: 1, policies: {} });
    const actorId = `local-session-${randomUUID()}`;
    await expect(repository.updateCommandPolicies({ expectedVersion: 1, policies: { 'queue:lista': { mode: 'minimum_role', minimumRole: 'subscriber' } }, actorId }))
      .resolves.toMatchObject({ schemaVersion: 2, version: 2, policies: { 'queue:lista': { mode: 'minimum_role', minimumRole: 'subscriber' } } });

    const freshRepository = createQueueRepository(prisma);
    await expect(freshRepository.getCommandPolicyState()).resolves.toEqual({ schemaVersion: 2, version: 2, policies: { 'queue:lista': { mode: 'minimum_role', minimumRole: 'subscriber' } } });
    const audit = await prisma.auditLog.findFirst({ where: { event: 'command.policies_updated', actorId } });
    expect(audit).toMatchObject({ origin: 'panel', reason: 'command_role_policy_changed', safeDetail: { commandIds: ['queue:lista'], version: 2 } });
  });

  it('rejects attempts to configure protected actions at the persistence boundary', async () => {
    await expect(repository.updateCommandPolicies({ expectedVersion: 2, policies: { 'queue:add': { mode: 'minimum_role', minimumRole: 'everyone' } }, actorId: 'operator' }))
      .rejects.toMatchObject({ code: 'INVALID_COMMAND_POLICY' });
    await expect(repository.updateCommandPolicies({ expectedVersion: 2, policies: { 'global:conta:set': { mode: 'minimum_role', minimumRole: 'everyone' } }, actorId: 'operator' }))
      .rejects.toMatchObject({ code: 'INVALID_COMMAND_POLICY' });
    await expect(repository.getCommandPolicyState()).resolves.toMatchObject({ schemaVersion: 2, version: 2, policies: { 'queue:lista': { mode: 'minimum_role', minimumRole: 'subscriber' } } });
  });

  it('serializes concurrent updates and rejects the stale policy version', async () => {
    const expectedVersion = 2;
    const attempts = await Promise.allSettled([
      repository.updateCommandPolicies({ expectedVersion, policies: { 'queue:lista': { mode: 'minimum_role', minimumRole: 'moderator' } }, actorId: 'operator-a' }),
      repository.updateCommandPolicies({ expectedVersion, policies: { 'queue:posicao': { mode: 'minimum_role', minimumRole: 'subscriber' } }, actorId: 'operator-b' }),
    ]);
    expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(({ status, reason }) => status === 'rejected' && reason?.code === 'COMMAND_POLICY_VERSION_CONFLICT')).toHaveLength(1);
  });

  it('commits an OAuth-staged follower policy in the caller transaction and rolls it back with that transaction', async () => {
    const current = await repository.getCommandPolicyState();
    const beforeAudit = await prisma.auditLog.count({ where: { event: 'command.policies_updated' } });
    await expect(prisma.$transaction(async (tx) => {
      await repository.updateCommandPoliciesInTransaction(tx, {
        expectedVersion: current.version,
        policies: { 'queue:lista': { mode: 'minimum_role', minimumRole: 'follower' } },
        actorId: 'oauth-session-actor', origin: 'oauth_follower_consent',
      });
      throw new Error('force_transaction_rollback');
    })).rejects.toThrow('force_transaction_rollback');
    await expect(repository.getCommandPolicyState()).resolves.toEqual(current);
    await expect(prisma.auditLog.count({ where: { event: 'command.policies_updated' } })).resolves.toBe(beforeAudit);

    await expect(prisma.$transaction((tx) => repository.updateCommandPoliciesInTransaction(tx, {
      expectedVersion: current.version,
      policies: { 'queue:lista': { mode: 'minimum_role', minimumRole: 'follower' } },
      actorId: 'oauth-session-actor', origin: 'oauth_follower_consent',
    }))).resolves.toMatchObject({ version: current.version + 1 });
    await expect(repository.getCommandPolicyState()).resolves.toMatchObject({ policies: {
      'queue:lista': { mode: 'minimum_role', minimumRole: 'follower' },
    } });
    await expect(prisma.auditLog.findFirst({ where: { actorId: 'oauth-session-actor' } }))
      .resolves.toMatchObject({ origin: 'oauth_follower_consent' });
  });

  it('identifies legacy schema and does not rewrite saved v1 policy while reading it', async () => {
    const legacy = { version: 17, policies: { 'queue:lista': ['subscriber', 'moderator'] } };
    await prisma.setting.upsert({
      where: { key: 'chat_command_policies' },
      create: { key: 'chat_command_policies', value: legacy },
      update: { value: legacy },
    });

    await expect(repository.getCommandPolicyState()).resolves.toEqual({
      schemaVersion: 1,
      version: 17,
      policies: legacy.policies,
    });
    await expect(prisma.setting.findUnique({ where: { key: 'chat_command_policies' } }))
      .resolves.toMatchObject({ value: legacy });
  });

  it('reads v2 schema and concurrency revision as separate fields', async () => {
    const stored = {
      schemaVersion: 2,
      revision: 18,
      policies: {
        'queue:lista': { mode: 'minimum_role', minimumRole: 'subscriber' },
        'queue:posicao': { mode: 'legacy_exact', allowedRoles: ['subscriber', 'moderator'] },
      },
    };
    await prisma.setting.upsert({
      where: { key: 'chat_command_policies' },
      create: { key: 'chat_command_policies', value: stored },
      update: { value: stored },
    });

    await expect(repository.getCommandPolicyState()).resolves.toEqual({
      schemaVersion: 2,
      version: 18,
      policies: stored.policies,
    });
  });

  it('converts only an explicitly saved command and retains other v1 lists as legacy-exact', async () => {
    const legacy = {
      version: 23,
      policies: {
        'queue:lista': ['subscriber', 'moderator'],
        'queue:posicao': ['everyone'],
      },
    };
    await prisma.setting.upsert({
      where: { key: 'chat_command_policies' },
      create: { key: 'chat_command_policies', value: legacy },
      update: { value: legacy },
    });

    await expect(repository.updateCommandPolicies({
      expectedVersion: 23,
      policies: { 'queue:lista': { mode: 'minimum_role', minimumRole: 'subscriber' } },
      actorId: 'operator-convert',
    })).resolves.toEqual({
      schemaVersion: 2,
      version: 24,
      policies: {
        'queue:lista': { mode: 'minimum_role', minimumRole: 'subscriber' },
        'queue:posicao': { mode: 'legacy_exact', allowedRoles: ['everyone'] },
      },
    });
    await expect(prisma.setting.findUnique({ where: { key: 'chat_command_policies' } }))
      .resolves.toMatchObject({ value: {
        schemaVersion: 2,
        revision: 24,
        policies: {
          'queue:lista': { mode: 'minimum_role', minimumRole: 'subscriber' },
          'queue:posicao': { mode: 'legacy_exact', allowedRoles: ['everyone'] },
        },
      } });
  });
});
