// OPS-31 P0 (Gate A, money baseline) on an ISOLATED PostgreSQL with the real migrations (never SQLite, never Prisma mocks):
// W3-1 guarded clear/delete, W3-2/O-1 audited manual exit of `conflict`/`failed`, W3-3 safe state in the deletion worker,
// W3-5 + the TS-20 probe (lock order of `retryOutboxManually`), and DB-11 (`lock_timeout`/`statement_timeout` per transaction).
// Races use real connections and a server-side condition (a waiter visible in `pg_locks`), never a fixed sleep.
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ISOLATED_POSTGRES_AFTER_ALL_TIMEOUT_MS, ISOLATED_POSTGRES_CLEANUP_CALL_TIMEOUT_MS, cleanupIsolatedPostgres,
} from '../helpers/isolated-postgres-cleanup.mjs';
import {
  ISOLATED_POSTGRES_BEFORE_ALL_TIMEOUT_MS, ISOLATED_POSTGRES_IMAGE, ISOLATED_POSTGRES_LABEL, ensurePostgresImage, runDockerCommand,
} from '../helpers/isolated-postgres-image.mjs';
import { createQueueRepository } from '../../apps/api/src/persistence/queue-repository.mjs';
import { databaseSqlState } from '../../apps/api/src/persistence/database-errors.mjs';
import { createQueueDomainService } from '../../apps/api/src/domain/queue-service.mjs';
import { createRewardOutboxWorker } from '../../apps/api/src/outbox/reward-worker.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const containerName = `queuebot-ops31-p0-${process.pid}-${randomUUID().slice(0, 8)}`;
const FAST_LIMITS = Object.freeze({ lockTimeoutMs: 300, statementTimeoutMs: 1_000, transactionTimeoutMs: 5_000 });
// Only `lock_timeout` is short here: if it were missing, the waiter would hang until the holder lets go (the test would time out).
const LOCK_ONLY_LIMITS = Object.freeze({ lockTimeoutMs: 300, statementTimeoutMs: 20_000, transactionTimeoutMs: 25_000 });

let connectionString;
let prisma;
let holderPrisma;
let fastPrisma;
let repository;
let fastRepository;
let lockOnlyRepository;
let now = new Date('2030-01-01T12:00:00.000Z');
const clock = () => now;

function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `docker ${args[0]} failed`);
  return result.stdout.trim();
}

/** Polls a server-side condition (never a fixed sleep) until it holds. */
async function until(check, label, { timeoutMs = 10_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for: ${label}`);
}

async function advisoryWaiters() {
  const rows = await prisma.$queryRaw`SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
  return rows[0].waiting;
}

/** Same key as `lockQueue` in the repository. */
async function holdQueueLock(tx, queueId) {
  await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${queueId}, 0))) AS queue_lock`;
}

async function seedQueue({ managed = false } = {}) {
  const created = await repository.createQueue({ slug: `p0-${randomUUID().slice(0, 8)}`, title: 'P0 money', cost: 5 });
  if (!managed) return created;
  return prisma.queue.update({ where: { id: created.id }, data: {
    rewardId: `reward-${randomUUID()}`, rewardOrigin: 'bot_created', queueMode: 'channel_points', remoteSyncStatus: 'synced', isOpen: false,
  } });
}

let seedCounter = 0;
/** An entry (optionally bound to a redemption and a financial task). */
async function seedEntry(queue, { status = 'waiting', task = null, remoteStatus = 'UNFULFILLED', expectedStatus = null, syncStatus = 'observed' } = {}) {
  seedCounter += 1;
  const redemptionId = `p0-red-${randomUUID()}`;
  await prisma.redemption.create({ data: {
    redemptionId, broadcasterId: 'broadcaster', rewardId: queue.rewardId ?? `reward-${queue.id}`, userId: `viewer-${seedCounter}`, queueId: queue.id,
    redeemedAt: now, remoteStatus, expectedStatus, syncStatus,
  } });
  const entry = await prisma.entry.create({ data: {
    queueId: queue.id, twitchUserId: `viewer-${seedCounter}`, userLogin: `viewer_${seedCounter}`, displayName: `Viewer ${seedCounter}`,
    source: 'redemption', redemptionId, status, position: status === 'waiting' ? seedCounter : null,
    ...(status === 'in_progress' ? { startedAt: now } : {}),
  } });
  const outbox = task ? await prisma.outbox.create({ data: {
    operationType: task.operationType ?? 'redemption.cancel', entityType: 'redemption', entityId: redemptionId,
    idempotencyKey: `financial:${redemptionId}`, redemptionId, entryId: entry.id, status: task.status ?? 'pending',
    attempts: task.attempts ?? 0, payload: task.payload ?? {}, lastError: task.lastError ?? null, nextAttemptAt: now,
  } }) : null;
  return { entry, redemptionId, outbox };
}

async function activeSnapshot(queueId) {
  const active = await prisma.entry.findMany({ where: { queueId, status: { in: ['waiting', 'called', 'in_progress'] } }, orderBy: { id: 'asc' } });
  return active.map(({ id, version, status, source, redemptionId }) => ({ id, version, status, source, redemptionId }));
}

async function financialTaskFor(redemptionId) {
  return prisma.outbox.findUnique({ where: { idempotencyKey: `financial:${redemptionId}` } });
}

describe('OPS-31 P0 money baseline on isolated PostgreSQL', () => {
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
    holderPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    fastPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    repository = createQueueRepository(prisma, { clock });
    fastRepository = createQueueRepository(fastPrisma, { clock, transactionLimits: FAST_LIMITS });
    lockOnlyRepository = createQueueRepository(fastPrisma, { clock, transactionLimits: LOCK_ONLY_LIMITS });
  }, ISOLATED_POSTGRES_BEFORE_ALL_TIMEOUT_MS);

  afterAll(async () => {
    await fastPrisma?.$disconnect();
    await holderPrisma?.$disconnect();
    await prisma?.$disconnect();
    await cleanupIsolatedPostgres({
      containerName,
      runDocker: (args) => runDockerCommand(args, { timeout: ISOLATED_POSTGRES_CLEANUP_CALL_TIMEOUT_MS }),
    });
  }, ISOLATED_POSTGRES_AFTER_ALL_TIMEOUT_MS);

  beforeEach(async () => {
    await prisma.outbox.updateMany({ where: { status: { in: ['pending', 'retry', 'processing'] } }, data: { status: 'cancelled', leaseToken: null, leaseUntil: null } });
    now = new Date(now.getTime() + 86_400_000);
  });

  describe('W3-1 guarded clear and delete (C7)', () => {
    it('PG-P0-01 clear with an in_progress entry (fulfill exists) succeeds, requests the other cancel and keeps the fulfill untouched', async () => {
      const queue = await seedQueue();
      const serving = await seedEntry(queue, { status: 'in_progress', task: { operationType: 'redemption.fulfill', status: 'pending' }, expectedStatus: 'FULFILLED', syncStatus: 'pending' });
      const waiting = await seedEntry(queue, { status: 'waiting' });
      const service = createQueueDomainService({ repository, getTwitch: () => null });

      const result = await service.clearActiveEntries({ queueId: queue.id, snapshot: await activeSnapshot(queue.id), actorId: 'operator-1' });

      expect(result).toMatchObject({ status: 'cleared', count: 2, refundsRequested: 1 });
      expect(await prisma.entry.findMany({ where: { queueId: queue.id }, select: { status: true } })).toEqual([{ status: 'removed' }, { status: 'removed' }]);
      expect(await financialTaskFor(serving.redemptionId)).toMatchObject({ id: serving.outbox.id, operationType: 'redemption.fulfill', status: 'pending' });
      expect(await financialTaskFor(waiting.redemptionId)).toMatchObject({ operationType: 'redemption.cancel' });
      expect(await prisma.redemption.findUnique({ where: { redemptionId: serving.redemptionId } })).toMatchObject({ expectedStatus: 'FULFILLED' });
    });

    it('PG-P0-02 the first deletion pass with an in_progress entry succeeds with the same guard (no UNIQUE rollback)', async () => {
      const queue = await seedQueue({ managed: true });
      const serving = await seedEntry(queue, { status: 'in_progress', task: { operationType: 'redemption.fulfill', status: 'pending' }, expectedStatus: 'FULFILLED', syncStatus: 'pending' });
      const waiting = await seedEntry(queue, { status: 'waiting' });
      const service = createQueueDomainService({ repository, getTwitch: () => null });

      const result = await service.deleteQueue({ queueId: queue.id, actorId: 'operator-1' });

      expect(result).toMatchObject({ status: 'pending', activeRemoved: 2, refundsRequested: 1 });
      expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({ lifecycleStatus: 'deleting' });
      expect(await financialTaskFor(serving.redemptionId)).toMatchObject({ id: serving.outbox.id, operationType: 'redemption.fulfill' });
      expect(await financialTaskFor(waiting.redemptionId)).toMatchObject({ operationType: 'redemption.cancel' });
      expect(await prisma.entry.count({ where: { queueId: queue.id, status: 'removed' } })).toBe(2);
    });
  });

  describe('O-1 / W3-2 audited manual exit of conflict and failed', () => {
    async function seedDeletingQueueWithTask(taskStatus, extra = {}) {
      const queue = await seedQueue({ managed: true });
      await prisma.queue.update({ where: { id: queue.id }, data: { lifecycleStatus: 'deleting', isArchived: true, remoteSyncStatus: 'delete_pending' } });
      const deletion = await prisma.outbox.create({ data: {
        operationType: 'reward.delete', entityType: 'queue', entityId: queue.id, idempotencyKey: `queue:${queue.id}:reward.delete`,
        payload: { requestMayHaveReachedTwitch: false, safeToDelete: false }, status: 'retry', lastError: 'queue_deletion_blocked_by_review',
        nextAttemptAt: new Date(now.getTime() + 300_000),
      } });
      const seeded = await seedEntry(queue, { status: 'removed', task: { status: taskStatus, attempts: 6, lastError: 'x' }, expectedStatus: 'CANCELED', syncStatus: 'pending', ...extra });
      return { queue, deletion, ...seeded };
    }

    it.each([
      ['conflict', { remoteStatus: 'FULFILLED' }],
      ['failed', { remoteStatus: 'UNFULFILLED' }],
    ])('PG-P0-03 %s: the person records a manual resolution, remoteConfirmed is false, the deletion resumes', async (status, extra) => {
      const { queue, deletion, outbox, redemptionId } = await seedDeletingQueueWithTask(status, extra);
      expect(await repository.getQueueDeletionBlockers(queue.id)).toMatchObject({ blocked: 1 });

      await expect(repository.resolveUnknownFinancialOperation(outbox.id, undefined)).rejects.toMatchObject({ code: 'ACTOR_REQUIRED' });
      expect(await prisma.outbox.findUnique({ where: { id: outbox.id } })).toMatchObject({ status });

      await expect(repository.resolveUnknownFinancialOperation(outbox.id, 'operator-1')).resolves.toEqual({ status: 'resolved_manual', redemptionId });

      expect(await prisma.outbox.findUnique({ where: { id: outbox.id } })).toMatchObject({ status: 'resolved_manual', leaseToken: null });
      expect(await prisma.redemption.findUnique({ where: { redemptionId } })).toMatchObject({ syncStatus: 'operator_resolved', remoteStatus: extra.remoteStatus });
      const audit = await prisma.auditLog.findFirst({ where: { redemptionId, event: 'financial.operation_resolved_manually' } });
      expect(audit).toMatchObject({ actorId: 'operator-1', previousState: status, nextState: 'resolved_manual', reason: `operator_acknowledged_${status}` });
      expect(audit.safeDetail).toEqual(status === 'conflict'
        ? { remoteConfirmed: false, expectedStatus: 'CANCELED', remoteStatus: 'FULFILLED' }
        : { remoteConfirmed: false, expectedStatus: 'CANCELED' });
      expect(await repository.getQueueDeletionBlockers(queue.id)).toEqual({ pending: 0, blocked: 0 });
      expect(await prisma.outbox.findUnique({ where: { id: deletion.id } })).toMatchObject({ status: 'retry', nextAttemptAt: now, lastError: null });
      // A second click is a no-op, not a second audit row.
      await expect(repository.resolveUnknownFinancialOperation(outbox.id, 'operator-1')).resolves.toEqual({ status: 'not_unknown' });
      expect(await prisma.auditLog.count({ where: { redemptionId, event: 'financial.operation_resolved_manually' } })).toBe(1);
    });

    it('PG-P0-04 the operations read model carries the stored remote status and the detection time only for a conflict', async () => {
      const conflict = await seedDeletingQueueWithTask('conflict', { remoteStatus: 'CANCELED' });
      const failed = await seedDeletingQueueWithTask('failed');
      const operations = await repository.listFinancialOperations();
      const conflictRow = operations.find(({ id }) => id === conflict.outbox.id);
      const failedRow = operations.find(({ id }) => id === failed.outbox.id);
      expect(conflictRow).toMatchObject({ status: 'conflict', remoteStatus: 'CANCELED' });
      expect(conflictRow.conflictDetectedAt).toBeInstanceOf(Date);
      expect(failedRow).not.toHaveProperty('remoteStatus');
      expect(failedRow).not.toHaveProperty('conflictDetectedAt');
    });
  });

  describe('W3-3 safe state in the deletion worker (C9)', () => {
    it('PG-P0-05 a database failure while recording the redemptions leaves the task in retry with a fixed code, then it recovers', async () => {
      const queue = await seedQueue({ managed: true });
      await prisma.queue.update({ where: { id: queue.id }, data: { lifecycleStatus: 'deleting', isArchived: true, remoteSyncStatus: 'delete_pending' } });
      const deletion = await prisma.outbox.create({ data: {
        operationType: 'reward.delete', entityType: 'queue', entityId: queue.id, idempotencyKey: `queue:${queue.id}:reward.delete`,
        payload: { requestMayHaveReachedTwitch: false, safeToDelete: false }, status: 'pending', nextAttemptAt: now,
      } });
      const reward = { id: queue.rewardId, title: queue.title, cost: queue.cost, prompt: queue.rewardPrompt ?? '', isPaused: true, isEnabled: true,
        userInputRequired: queue.uidMode === 'visible', autoFulfill: false, shouldRedemptionsSkipRequestQueue: false,
        maxRedemptionsPerStream: null, maxRedemptionsPerUserPerStream: null, globalCooldown: null };
      const twitch = { getReward: async () => reward, listUnfulfilledRedemptions: async () => [], deleteReward: async () => { throw new Error('must not delete'); } };
      const failing = { ...repository, claimNextRewardOperation: (...args) => repository.claimNextRewardOperation(...args), recordQueueDeletionRedemptions: async () => { throw new Error('violates check constraint "x"'); } };
      const worker = createRewardOutboxWorker({ repository: failing, twitch, clock, random: () => 0 });

      await expect(worker.processOne()).resolves.toBe('retry');

      const stored = await prisma.outbox.findUnique({ where: { id: deletion.id } });
      expect(stored).toMatchObject({ status: 'retry', lastError: 'queue_delete_local_error', leaseToken: null, leaseUntil: null, attempts: 1 });
      expect(stored.nextAttemptAt.getTime()).toBeGreaterThan(now.getTime());
      // Not claimable before its backoff: no endless re-claim loop.
      expect(await repository.claimNextRewardOperation({ now })).toBeNull();
    });
  });

  describe('W3-5 and the TS-20 probe: lock order of retryOutboxManually', () => {
    async function seedFailedTask() {
      const queue = await seedQueue();
      const seeded = await seedEntry(queue, { status: 'removed', task: { status: 'failed', attempts: 6, lastError: 'x' }, expectedStatus: 'CANCELED', syncStatus: 'pending' });
      return { queue, ...seeded };
    }

    // Session B is a settlement-like transaction: queue advisory lock FIRST, then the same outbox row (`FOR UPDATE`).
    // Session A is `retryOutboxManually`. Before W3-5, A locked the outbox row and THEN asked for the queue lock: B holds the
    // queue lock and wants the row, A holds the row and wants the lock -> deadlock (40P01). After: A asks for the queue
    // lock first, never holds the row while waiting, so B gets the row and both finish.
    /** Session B: takes the queue lock, signals, waits for A to queue on it, then locks `rowId` FOR UPDATE and commits. */
    function settlementLikeSession(queueId, rowId) {
      let signalHeld;
      const held = new Promise((resolve) => { signalHeld = resolve; });
      const done = holderPrisma.$transaction(async (tx) => {
        await holdQueueLock(tx, queueId);
        signalHeld();
        await until(async () => (await advisoryWaiters()) >= 1, 'session A waits for the queue lock');
        // Lockable only if A holds nothing on the row while it waits for the queue lock.
        return (await tx.$queryRaw`SELECT id FROM outbox WHERE id = ${rowId}::uuid FOR UPDATE`).length;
      }, { timeout: 30_000 });
      return { held, done };
    }

    it('PG-P0-06 TS20-01 probe: retryOutboxManually against a queue-lock-then-row transaction never deadlocks and both commit', async () => {
      const { queue, outbox } = await seedFailedTask();
      const sessionB = settlementLikeSession(queue.id, outbox.id);
      await sessionB.held;
      const sessionA = repository.retryOutboxManually(outbox.id, { actorId: 'operator-1' });

      const [bResult, aResult] = await Promise.allSettled([sessionB.done, sessionA]);

      expect(bResult.status, bResult.reason?.message).toBe('fulfilled');
      expect(bResult.value).toBe(1);
      expect(aResult.status, aResult.reason?.message).toBe('fulfilled');
      expect(aResult.value).toMatchObject({ count: 1 });
      expect(await prisma.outbox.findUnique({ where: { id: outbox.id } })).toMatchObject({ status: 'pending' });
    }, 40_000);

    it('PG-P0-07 the same probe on a reward task (queue id in entityId) takes the queue lock first as well', async () => {
      const queue = await seedQueue({ managed: true });
      await prisma.queue.update({ where: { id: queue.id }, data: { lifecycleStatus: 'deleting', isArchived: true, remoteSyncStatus: 'delete_failed' } });
      const task = await prisma.outbox.create({ data: {
        operationType: 'reward.delete', entityType: 'queue', entityId: queue.id, idempotencyKey: `queue:${queue.id}:reward.delete`,
        payload: {}, status: 'failed', lastError: 'x', nextAttemptAt: now,
      } });
      const sessionB = settlementLikeSession(queue.id, task.id);
      await sessionB.held;
      const sessionA = repository.retryOutboxManually(task.id, { actorId: 'operator-1' });

      const [bResult, aResult] = await Promise.allSettled([sessionB.done, sessionA]);

      expect(bResult.status, bResult.reason?.message).toBe('fulfilled');
      expect(aResult.status, aResult.reason?.message).toBe('fulfilled');
      expect(aResult.value).toMatchObject({ count: 1 });
    }, 40_000);
  });

  describe('DB-11 lock_timeout and statement_timeout (TS20-02..04)', () => {
    it('PG-P0-08 HYPOTHESIS proven: lock_timeout also bounds the wait on pg_advisory_xact_lock and surfaces SQLSTATE 55P03 through Prisma', async () => {
      const queue = await seedQueue();
      let release;
      const hold = new Promise((resolve) => { release = resolve; });
      let held;
      const holder = new Promise((resolve) => { held = resolve; });
      const sessionB = holderPrisma.$transaction(async (tx) => { await holdQueueLock(tx, queue.id); held(); await hold; }, { timeout: 30_000 });
      await holder;
      try {
        const started = Date.now();
        const failure = await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT set_config('lock_timeout', '200ms', true)`;
          await holdQueueLock(tx, queue.id);
        }).then(() => null, (error) => error);
        expect(failure, 'the advisory lock wait must fail').not.toBeNull();
        expect(databaseSqlState(failure)).toBe('55P03');
        expect(Date.now() - started).toBeLessThan(5_000);
      } finally {
        release();
        await sessionB;
      }
    }, 30_000);

    it('PG-P0-09 TS20-02 lock_timeout is real: a held queue lock fails the repository transaction with DATABASE_TIMEOUT and writes nothing', async () => {
      const queue = await seedQueue();
      const { outbox, redemptionId } = await seedEntry(queue, { status: 'removed', task: { status: 'failed', attempts: 6 }, expectedStatus: 'CANCELED', syncStatus: 'pending' });
      const auditBefore = await prisma.auditLog.count();
      let release;
      const hold = new Promise((resolve) => { release = resolve; });
      let held;
      const holder = new Promise((resolve) => { held = resolve; });
      const sessionB = holderPrisma.$transaction(async (tx) => { await holdQueueLock(tx, queue.id); held(); await hold; }, { timeout: 30_000 });
      await holder;
      try {
        const started = Date.now();
        const failure = await lockOnlyRepository.retryOutboxManually(outbox.id, { actorId: 'operator-1' }).then(() => null, (error) => error);
        // Not the timeout value: only that the wait ended long before the statement/transaction limits (20 s / 25 s) could.
        expect(Date.now() - started).toBeLessThan(10_000);
        expect(failure).toMatchObject({ code: 'DATABASE_TIMEOUT', retryable: true });
        expect(failure.message).toBe('The database did not answer in time');
        expect(failure.stack).not.toMatch(/55P03|advisory/);
        expect(failure.cause).toBeUndefined();
      } finally {
        release();
        await sessionB;
      }
      expect(await prisma.outbox.findUnique({ where: { id: outbox.id } })).toMatchObject({ status: 'failed' });
      expect(await prisma.auditLog.count()).toBe(auditBefore);
      expect(await prisma.redemption.findUnique({ where: { redemptionId } })).toMatchObject({ syncStatus: 'pending' });
      // The outcome class is asserted, never the duration; the repository is usable again right after.
      await expect(fastRepository.retryOutboxManually(outbox.id, { actorId: 'operator-1' })).resolves.toMatchObject({ count: 1 });
    }, 30_000);

    async function withSlowAuditTrigger(event, run) {
      const name = `p0_slow_${randomUUID().replaceAll('-', '')}`;
      await prisma.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event = '${event}' THEN PERFORM pg_sleep(3); END IF; RETURN NEW; END $$`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${name}()`);
      try { return await run(); } finally {
        await prisma.$executeRawUnsafe(`DROP TRIGGER ${name} ON audit_logs`);
        await prisma.$executeRawUnsafe(`DROP FUNCTION ${name}()`);
      }
    }

    it('PG-P0-10 TS20-03 statement_timeout (57014) maps to DATABASE_TIMEOUT and rolls the whole transaction back', async () => {
      const queue = await seedQueue();
      const { outbox } = await seedEntry(queue, { status: 'removed', task: { status: 'failed', attempts: 6 }, expectedStatus: 'CANCELED', syncStatus: 'pending' });
      const auditBefore = await prisma.auditLog.count({ where: { event: 'financial.operation_retry_requested' } });
      const failure = await withSlowAuditTrigger('financial.operation_retry_requested', () => fastRepository.retryOutboxManually(outbox.id, { actorId: 'operator-1' }).then(() => null, (error) => error));
      expect(failure).toMatchObject({ code: 'DATABASE_TIMEOUT', retryable: true });
      expect(await prisma.outbox.findUnique({ where: { id: outbox.id } })).toMatchObject({ status: 'failed' });
      expect(await prisma.auditLog.count({ where: { event: 'financial.operation_retry_requested' } })).toBe(auditBefore);
    }, 30_000);

    it('PG-P0-11 TS20-04 the limits are SET LOCAL: defaults 2s/4s inside the transaction, nothing leaks to the pooled connection', async () => {
      const queue = await seedQueue();
      const { outbox } = await seedEntry(queue, { status: 'removed', task: { status: 'failed', attempts: 6 }, expectedStatus: 'CANCELED', syncStatus: 'pending' });
      const name = `p0_show_${randomUUID().replaceAll('-', '')}`;
      await prisma.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event = 'financial.operation_retry_requested' THEN RAISE EXCEPTION 'limits=%/%', current_setting('lock_timeout'), current_setting('statement_timeout'); END IF; RETURN NEW; END $$`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${name}()`);
      try {
        const failure = await repository.retryOutboxManually(outbox.id, { actorId: 'operator-1' }).then(() => null, (error) => error);
        expect(String(failure?.message)).toContain('limits=2s/4s');
      } finally {
        await prisma.$executeRawUnsafe(`DROP TRIGGER ${name} ON audit_logs`);
        await prisma.$executeRawUnsafe(`DROP FUNCTION ${name}()`);
      }
      for (let index = 0; index < 20; index += 1) {
        const [{ lock_timeout: lock, statement_timeout: statement }] = await prisma.$queryRaw`SELECT current_setting('lock_timeout') AS lock_timeout, current_setting('statement_timeout') AS statement_timeout`;
        expect([lock, statement]).toEqual(['0', '0']);
      }
    }, 30_000);

    it('PG-P0-12 the order lock_timeout < statement_timeout < transaction timeout is enforced when the repository is built', () => {
      for (const bad of [
        { lockTimeoutMs: 4_000, statementTimeoutMs: 4_000 }, { lockTimeoutMs: 5_000 }, { transactionTimeoutMs: 3_000 }, { lockTimeoutMs: 0 }, { statementTimeoutMs: 1.5 },
      ]) {
        expect(() => createQueueRepository(prisma, { transactionLimits: bad })).toThrow(expect.objectContaining({ code: 'INVALID_TRANSACTION_LIMITS' }));
      }
    });
  });
});
