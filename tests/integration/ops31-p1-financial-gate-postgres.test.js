// OPS-31 P1 (Gate A): the single financial gate on an ISOLATED PostgreSQL with the real migrations (never SQLite, never
// Prisma mocks). The existing financial suites (queue-repository, ops31-p0-money, deletion) are the "no behavior change"
// proof; this file adds the gate contract: created / already_same / contradictory, the race on one redemption, the audit
// of a contradictory request by a person, and the callers that now go through the gate.
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ISOLATED_POSTGRES_AFTER_ALL_TIMEOUT_MS, ISOLATED_POSTGRES_CLEANUP_CALL_TIMEOUT_MS, cleanupIsolatedPostgres,
} from '../helpers/isolated-postgres-cleanup.mjs';
import {
  ISOLATED_POSTGRES_BEFORE_ALL_TIMEOUT_MS, ISOLATED_POSTGRES_IMAGE, ISOLATED_POSTGRES_LABEL, ensurePostgresImage, runDockerCommand,
} from '../helpers/isolated-postgres-image.mjs';
import { createQueueRepository } from '../../apps/api/src/persistence/queue-repository.mjs';
import { createQueueDomainService } from '../../apps/api/src/domain/queue-service.mjs';
import { recordFinancialIntent } from '../../apps/api/src/persistence/financial-gate.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const containerName = `queuebot-ops31-p1-${process.pid}-${randomUUID().slice(0, 8)}`;
let connectionString;
let prisma;
let repository;
const now = new Date('2030-01-01T12:00:00.000Z');
const clock = () => now;

function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `docker ${args[0]} failed`);
  return result.stdout.trim();
}

let counter = 0;
async function seedRedemption({ remoteStatus = 'UNFULFILLED', queueId = null, task = null } = {}) {
  counter += 1;
  const redemptionId = `p1-red-${randomUUID()}`;
  await prisma.redemption.create({ data: {
    redemptionId, broadcasterId: 'broadcaster', rewardId: 'reward-p1', userId: `viewer-${counter}`, queueId, redeemedAt: now, remoteStatus,
  } });
  if (task) {
    await prisma.outbox.create({ data: {
      operationType: task, entityType: 'redemption', entityId: redemptionId, idempotencyKey: `financial:${redemptionId}`, redemptionId, payload: {},
    } });
  }
  return redemptionId;
}

const gate = (input) => prisma.$transaction((tx) => recordFinancialIntent(tx, input));
const tasksOf = (redemptionId) => prisma.outbox.findMany({ where: { redemptionId } });

describe('OPS-31 P1 single financial gate on isolated PostgreSQL', () => {
  beforeAll(async () => {
    ensurePostgresImage();
    docker(['run', '--detach', '--rm', '--pull', 'never', '--label', ISOLATED_POSTGRES_LABEL, '--name', containerName,
      '--env', 'POSTGRES_USER=queuebot', '--env', 'POSTGRES_PASSWORD=isolated-test-password', '--env', 'POSTGRES_DB=queuebot',
      '--publish', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql:rw,noexec,nosuid,size=512m',
      ISOLATED_POSTGRES_IMAGE]);
    const published = docker(['port', containerName, '5432/tcp']).split(':').at(-1);
    connectionString = `postgresql://queuebot:isolated-test-password@127.0.0.1:${published}/queuebot?schema=public`;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const probe = spawnSync('docker', ['exec', containerName, 'pg_isready', '-U', 'queuebot', '-d', 'queuebot'], { cwd: root, encoding: 'utf8', timeout: 3000 });
      if (probe.status === 0) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    expect(ready, 'isolated PostgreSQL did not become healthy').toBe(true);
    const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
      cwd: root, encoding: 'utf8', timeout: 60_000, env: { ...process.env, DATABASE_URL: connectionString },
    });
    expect(migration.status, migration.stderr || migration.stdout).toBe(0);
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    repository = createQueueRepository(prisma, { clock });
  }, ISOLATED_POSTGRES_BEFORE_ALL_TIMEOUT_MS);

  afterAll(async () => {
    await prisma?.$disconnect();
    await cleanupIsolatedPostgres({
      containerName,
      runDocker: (args) => runDockerCommand(args, { timeout: ISOLATED_POSTGRES_CLEANUP_CALL_TIMEOUT_MS }),
    });
  }, ISOLATED_POSTGRES_AFTER_ALL_TIMEOUT_MS);

  it('PG-P1-01 created: one outbox row with the single key, expected status and pending sync', async () => {
    const redemptionId = await seedRedemption();
    const outcome = await gate({ redemptionId, operation: 'cancel', cause: 'queue_cleared', origin: 'panel', actorId: 'op-1' });

    expect(outcome.status).toBe('created');
    expect(await tasksOf(redemptionId)).toMatchObject([{ operationType: 'redemption.cancel', idempotencyKey: `financial:${redemptionId}`, status: 'pending', entityId: redemptionId }]);
    expect(await prisma.redemption.findUnique({ where: { redemptionId } })).toMatchObject({ expectedStatus: 'CANCELED', syncStatus: 'pending' });
    const fulfilled = await seedRedemption();
    expect((await gate({ redemptionId: fulfilled, operation: 'fulfill', cause: 'transition_completed' })).status).toBe('created');
    expect(await prisma.redemption.findUnique({ where: { redemptionId: fulfilled } })).toMatchObject({ expectedStatus: 'FULFILLED' });
  });

  it('PG-P1-02 the second identical request is already_same and never throws on the UNIQUE key', async () => {
    const redemptionId = await seedRedemption();
    await gate({ redemptionId, operation: 'cancel', cause: 'queue_cleared' });
    const again = await gate({ redemptionId, operation: 'cancel', cause: 'queue_cleared' });

    expect(again.status).toBe('already_same');
    expect(await tasksOf(redemptionId)).toHaveLength(1);
  });

  it('PG-P1-03 a different operation is contradictory: nothing is written, and a person origin leaves an audit row without free text', async () => {
    const redemptionId = await seedRedemption({ task: 'redemption.fulfill' });
    const byPerson = await gate({ redemptionId, operation: 'cancel', cause: 'queue_cleared', origin: 'panel', actorId: 'op-1' });
    const bySystem = await gate({ redemptionId, operation: 'cancel', cause: 'queue_deleting_relist', origin: 'system' });

    expect(byPerson.status).toBe('contradictory');
    expect(bySystem.status).toBe('contradictory');
    expect(await tasksOf(redemptionId)).toMatchObject([{ operationType: 'redemption.fulfill' }]);
    expect(await prisma.redemption.findUnique({ where: { redemptionId } })).toMatchObject({ expectedStatus: null });
    const audits = await prisma.auditLog.findMany({ where: { redemptionId, event: 'redemption.financial_intent_contradictory' } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ origin: 'panel', actorId: 'op-1', reason: 'contradictory_intent', safeDetail: { operation: 'cancel', cause: 'queue_cleared' } });
  });

  it('PG-P1-04 a terminal remote status writes nothing: same terminal is already_same, the opposite is contradictory', async () => {
    const canceled = await seedRedemption({ remoteStatus: 'CANCELED' });
    const fulfilled = await seedRedemption({ remoteStatus: 'FULFILLED' });
    expect((await gate({ redemptionId: canceled, operation: 'cancel', cause: 'queue_cleared' })).status).toBe('already_same');
    expect((await gate({ redemptionId: fulfilled, operation: 'cancel', cause: 'queue_cleared' })).status).toBe('contradictory');
    expect(await tasksOf(canceled)).toHaveLength(0);
    expect(await tasksOf(fulfilled)).toHaveLength(0);
  });

  it('PG-P1-05 a missing redemption fails with a stable code and writes nothing', async () => {
    await expect(gate({ redemptionId: `missing-${randomUUID()}`, operation: 'cancel', cause: 'queue_cleared' })).rejects.toMatchObject({ code: 'REDEMPTION_NOT_FOUND' });
  });

  it('PG-P1-06 race: 12 concurrent transactions on one redemption produce exactly one row and 11 already_same, no error', async () => {
    for (let round = 0; round < 5; round += 1) {
      const redemptionId = await seedRedemption();
      const outcomes = await Promise.all(Array.from({ length: 12 }, () => gate({ redemptionId, operation: 'cancel', cause: 'queue_cleared' })));
      expect(outcomes.filter(({ status }) => status === 'created')).toHaveLength(1);
      expect(outcomes.filter(({ status }) => status === 'already_same')).toHaveLength(11);
      expect(await tasksOf(redemptionId)).toHaveLength(1);
    }
  }, 60_000);

  it('PG-P1-07 race between a cancel and a fulfill on one redemption: exactly one wins, the other is contradictory', async () => {
    const redemptionId = await seedRedemption();
    const outcomes = await Promise.all([
      gate({ redemptionId, operation: 'cancel', cause: 'queue_cleared' }),
      gate({ redemptionId, operation: 'fulfill', cause: 'transition_completed' }),
    ]);
    expect(outcomes.map(({ status }) => status).sort()).toEqual(['contradictory', 'created']);
    expect(await tasksOf(redemptionId)).toHaveLength(1);
  });

  it('PG-P1-08 reassertExisting re-arms the same operation with the patch; a rollback leaves no trace', async () => {
    const redemptionId = await seedRedemption({ task: 'redemption.cancel' });
    const outcome = await gate({ redemptionId, operation: 'cancel', cause: 'queue_deleting_relist', redemptionPatch: { rejectionReason: 'queue_deleting' }, reassertExisting: true });
    expect(outcome.status).toBe('already_same');
    expect(await prisma.redemption.findUnique({ where: { redemptionId } })).toMatchObject({ expectedStatus: 'CANCELED', syncStatus: 'pending', rejectionReason: 'queue_deleting' });

    const rolled = await seedRedemption();
    await expect(prisma.$transaction(async (tx) => {
      await recordFinancialIntent(tx, { redemptionId: rolled, operation: 'cancel', cause: 'queue_cleared' });
      throw new Error('abort');
    })).rejects.toThrow('abort');
    expect(await tasksOf(rolled)).toHaveLength(0);
    expect(await prisma.redemption.findUnique({ where: { redemptionId: rolled } })).toMatchObject({ expectedStatus: null });
  });

  it('PG-P1-09 G-14 end to end: a panel transition labelled queue_cleared on an in_progress entry does not cancel', async () => {
    const queue = await repository.createQueue({ slug: `p1-${randomUUID().slice(0, 8)}`, title: 'P1', cost: 5 });
    const redemptionId = await seedRedemption({ queueId: queue.id, task: 'redemption.fulfill' });
    const entry = await prisma.entry.create({ data: {
      queueId: queue.id, twitchUserId: 'v-g14', userLogin: 'v_g14', displayName: 'G14', source: 'redemption', redemptionId, status: 'in_progress', startedAt: now,
    } });
    const service = createQueueDomainService({ repository, getTwitch: () => null });

    await expect(service.transitionEntry({ entryId: entry.id, to: 'removed', origin: 'panel', trigger: 'queue_cleared', reason: 'operator_removed' }))
      .rejects.toMatchObject({ code: 'INVALID_ENTRY_TRIGGER' });
    const result = await service.transitionEntry({ entryId: entry.id, to: 'removed', origin: 'panel', reason: 'queue_cleared' });

    expect(result.financialDecision).toBe('no_operation');
    expect(await tasksOf(redemptionId)).toMatchObject([{ operationType: 'redemption.fulfill' }]);
  });

  it('PG-P1-10 a transition whose intent is contradictory reports no_operation in the audit and the result (as before the gate)', async () => {
    const queue = await repository.createQueue({ slug: `p1-${randomUUID().slice(0, 8)}`, title: 'P1b', cost: 5 });
    const redemptionId = await seedRedemption({ queueId: queue.id, task: 'redemption.fulfill' });
    const entry = await prisma.entry.create({ data: {
      queueId: queue.id, twitchUserId: 'v-ctr', userLogin: 'v_ctr', displayName: 'Ctr', source: 'redemption', redemptionId, status: 'called', position: null, calledAt: now,
    } });
    const service = createQueueDomainService({ repository, getTwitch: () => null });

    const result = await service.transitionEntry({ entryId: entry.id, to: 'in_progress', origin: 'panel', reason: 'service_started' });

    expect(result.financialDecision).toBe('no_operation');
    const audit = await prisma.auditLog.findFirst({ where: { entryId: entry.id, event: 'entry.transitioned' } });
    expect(audit.safeDetail).toMatchObject({ financialDecision: 'no_operation' });
    expect(await tasksOf(redemptionId)).toHaveLength(1);
  });
});
