// OPS-22 FT-25 (#98), group G1 of the `@qa` plan: bounded retry, read-only re-verification and audited
// manual retry/resolution on an ISOLATED PostgreSQL with the real migrations (never SQLite, never Prisma mocks).
// Races use two real connections and a barrier, never a sleep. Time and jitter are injected.
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
import { twurpleHttpError } from '../helpers/twurple-real-instances.mjs';
import { createQueueRepository } from '../../apps/api/src/persistence/queue-repository.mjs';
import { createFinancialOutboxWorker } from '../../apps/api/src/outbox/financial-worker.mjs';
import { nominalRetryDelayMs } from '../../apps/api/src/outbox/financial-retry-policy.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const containerName = `queuebot-fin-retry-${process.pid}-${randomUUID().slice(0, 8)}`;
const RACE_ROUNDS = 50;
const FORBIDDEN_DETAIL_KEY = /user|login|name|token|header|input|body|uid/i;
const AUDIT_ALLOWLIST = Object.freeze({
  'financial.operation_retry_scheduled': ['operationType', 'attempt', 'cycleAttempt', 'maxAttempts', 'nextAttemptAt', 'httpStatus', 'reasonClass'],
  'financial.operation_attempts_exhausted': ['operationType', 'attempts', 'firstNonConclusiveAt', 'reasonClass'],
  'financial.operation_confirmed_by_reverification': ['operationType', 'attempts', 'remoteConfirmed', 'remoteStatus'],
  'financial.operation_retry_requested': ['operationType', 'previousAttempts', 'cycleStartAttempts'],
  'financial.operation_resolved_manually': ['remoteConfirmed', 'expectedStatus'],
});

let connectionString;
let prisma;
let otherPrisma;
let repository;
let otherRepository;
let now = new Date('2026-11-04T12:00:00.000Z');
const clock = () => now;

function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `docker ${args[0]} failed`);
  return result.stdout.trim();
}

/** Resolves every caller at once when `parties` callers arrived (no sleep). */
function barrier(parties) {
  let arrived = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  return () => { arrived += 1; if (arrived === parties) release(); return gate; };
}

async function seedFinancialTask({ status = 'pending', attempts = 0, payload = {}, operationType = 'redemption.cancel', syncStatus = 'pending', nextAttemptAt = now } = {}) {
  const queue = await repository.createQueue({ slug: `fin-${randomUUID().slice(0, 8)}`, title: 'Financial retry', cost: 1 });
  const redemptionId = `fin-${randomUUID()}`;
  await prisma.redemption.create({ data: {
    redemptionId, broadcasterId: 'broadcaster', rewardId: `reward-${queue.id}`, userId: 'viewer-id', queueId: queue.id,
    redeemedAt: now, remoteStatus: 'UNFULFILLED', expectedStatus: operationType === 'redemption.cancel' ? 'CANCELED' : 'FULFILLED', syncStatus,
  } });
  const task = await prisma.outbox.create({ data: {
    operationType, entityType: 'redemption', entityId: redemptionId, idempotencyKey: `financial:${redemptionId}`,
    redemptionId, status, attempts, payload, nextAttemptAt,
  } });
  return { queue, redemptionId, task };
}

function fakeTwitch(reads) {
  const calls = { reads: 0, writes: 0 };
  return {
    calls,
    async getRedemptionStatus() {
      const next = reads[Math.min(calls.reads, reads.length - 1)];
      calls.reads += 1;
      if (next instanceof Error) throw next;
      if (typeof next === 'function') return next();
      return next;
    },
    async setRedemptionStatus() { calls.writes += 1; throw new Error('re-verification must not write on a non-conclusive read'); },
  };
}

function worker(twitch, random = () => 0.5) {
  return createFinancialOutboxWorker({ repository, twitch, clock, random });
}

async function forceAuditFailure(event, run) {
  const name = `test_fail_${randomUUID().replaceAll('-', '')}`;
  await prisma.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event = '${event}' THEN RAISE EXCEPTION 'forced audit failure'; END IF; RETURN NEW; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${name}()`);
  try { return await run(); } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER ${name} ON audit_logs`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION ${name}()`);
  }
}

describe('OPS-22 FT-25 financial retry on isolated PostgreSQL', () => {
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
    otherPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    repository = createQueueRepository(prisma, { clock });
    otherRepository = createQueueRepository(otherPrisma, { clock });
  }, ISOLATED_POSTGRES_BEFORE_ALL_TIMEOUT_MS);

  afterAll(async () => {
    await otherPrisma?.$disconnect();
    await prisma?.$disconnect();
    await cleanupIsolatedPostgres({
      containerName,
      runDocker: (args) => runDockerCommand(args, { timeout: ISOLATED_POSTGRES_CLEANUP_CALL_TIMEOUT_MS }),
    });
  }, ISOLATED_POSTGRES_AFTER_ALL_TIMEOUT_MS);

  beforeEach(async () => {
    // Park every claimable financial task of earlier tests so each test owns the claim.
    await prisma.outbox.updateMany({
      where: { operationType: { in: ['redemption.cancel', 'redemption.fulfill'] }, status: { in: ['pending', 'retry', 'processing'] } },
      data: { status: 'cancelled', leaseToken: null, leaseUntil: null },
    });
    now = new Date(now.getTime() + 86_400_000);
  });

  it(`PG25-01 claim race: two connections, barrier, ${RACE_ROUNDS} rounds, exactly one claim and attempts +1 once`, async () => {
    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const { task } = await seedFinancialTask();
      const arrive = barrier(2);
      const [first, second] = await Promise.all([
        arrive().then(() => repository.claimNext({ now })),
        arrive().then(() => otherRepository.claimNext({ now })),
      ]);
      const winners = [first, second].filter(Boolean);
      expect(winners).toHaveLength(1);
      expect(winners[0].id).toBe(task.id);
      const stored = await prisma.outbox.findUnique({ where: { id: task.id } });
      expect(stored).toMatchObject({ status: 'processing', attempts: 1, leaseToken: winners[0].leaseToken });
      await prisma.outbox.update({ where: { id: task.id }, data: { status: 'cancelled', leaseToken: null, leaseUntil: null } });
    }
  });

  it('PG25-02 stale lease: the old token gets count=0 on retry/confirm/unknown and the row reflects only the new owner', async () => {
    const { task, redemptionId } = await seedFinancialTask();
    const first = await repository.claimNext({ now, leaseMs: 30_000 });
    const second = await otherRepository.claimNext({ now: new Date(now.getTime() + 31_000), leaseMs: 30_000 });
    expect(second?.id).toBe(task.id);
    expect(second.leaseToken).not.toBe(first.leaseToken);
    expect(await repository.retry(task.id, { nextAttemptAt: now, errorCode: 'remote_lookup_failed', reasonClass: 'remote_read_transient' }, first.leaseToken)).toMatchObject({ count: 0 });
    expect(await repository.confirm(task.id, 'CANCELED', first.leaseToken)).toBe(false);
    expect(await repository.unknown(task.id, 'attempts_exhausted', first.leaseToken, { reasonClass: 'remote_read_transient' })).toMatchObject({ count: 0 });
    expect(await repository.unknown(task.id, 'authorization_required', first.leaseToken)).toMatchObject({ count: 0 });
    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'processing', attempts: 2, leaseToken: second.leaseToken, payload: {} });
    expect(await prisma.redemption.findUnique({ where: { redemptionId } })).toMatchObject({ remoteStatus: 'UNFULFILLED', syncStatus: 'pending' });
    expect(await prisma.auditLog.count({ where: { redemptionId } })).toBe(0);
  });

  it('PG25-03 six attempts: waits in bounds, non-decreasing to the cap, firstNonConclusiveAt fixed, 6th = unknown/attempts_exhausted', async () => {
    const { task, redemptionId } = await seedFinancialTask();
    const randoms = [0, 1, 0.3, 0.9, 0.5, 0.1];
    const twitch = fakeTwitch(['UNKNOWN']);
    let previousNext = null;
    let firstNonConclusiveAt = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const claimedAt = now;
      expect(await worker(twitch, () => randoms[attempt - 1]).processOne()).toBe('retry');
      const stored = await prisma.outbox.findUnique({ where: { id: task.id } });
      expect(stored).toMatchObject({ status: 'retry', attempts: attempt, lastError: 'remote_status_unrecognized' });
      const wait = stored.nextAttemptAt.getTime() - claimedAt.getTime();
      expect(wait).toBeGreaterThanOrEqual(Math.floor(nominalRetryDelayMs(attempt) * 0.8));
      expect(wait).toBeLessThanOrEqual(Math.ceil(nominalRetryDelayMs(attempt) * 1.2));
      if (previousNext) expect(stored.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(previousNext.getTime());
      previousNext = stored.nextAttemptAt;
      firstNonConclusiveAt ??= stored.payload.firstNonConclusiveAt;
      expect(stored.payload).toMatchObject({ firstNonConclusiveAt, reasonClass: 'remote_read_unrecognized' });
      expect(await prisma.redemption.findUnique({ where: { redemptionId } })).toMatchObject({ syncStatus: 'pending', remoteStatus: 'UNFULFILLED' });
      expect(await repository.claimNext({ now: new Date(stored.nextAttemptAt.getTime() - 1) })).toBeNull();
      now = stored.nextAttemptAt;
    }
    expect(firstNonConclusiveAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await worker(twitch, () => randoms[5]).processOne()).toBe('unknown');
    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'unknown', attempts: 6, lastError: 'attempts_exhausted', leaseToken: null });
    expect(await prisma.redemption.findUnique({ where: { redemptionId } })).toMatchObject({ syncStatus: 'unknown', remoteStatus: 'UNFULFILLED' });
    const exhausted = await prisma.auditLog.findMany({ where: { redemptionId, event: 'financial.operation_attempts_exhausted' } });
    expect(exhausted).toHaveLength(1);
    expect(exhausted[0]).toMatchObject({ origin: 'system', previousState: 'processing', nextState: 'unknown', reason: 'attempts_exhausted', safeDetail: { operationType: 'redemption.cancel', attempts: 6, firstNonConclusiveAt, reasonClass: 'remote_read_unrecognized' } });
    expect(await prisma.auditLog.count({ where: { redemptionId, event: 'financial.operation_retry_scheduled' } })).toBe(5);
    expect(twitch.calls).toEqual({ reads: 6, writes: 0 });
    expect(await repository.claimNext({ now: new Date(now.getTime() + 86_400_000) })).toBeNull();
  });

  it('PG25-04 no confirmation without a positive read after any failed or exhausted sequence', async () => {
    const sequences = [
      [twurpleHttpError(503, 'Service Unavailable')],
      [twurpleHttpError(404, 'Not Found')],
      [Object.assign(new Error('socket'), { code: 'ETIMEDOUT' })],
      ['UNKNOWN', twurpleHttpError(500, 'Server Error'), twurpleHttpError(404, 'Not Found')],
    ];
    const redemptionIds = [];
    for (const reads of sequences) {
      const { task, redemptionId } = await seedFinancialTask();
      redemptionIds.push(redemptionId);
      const twitch = fakeTwitch(reads);
      let outcome;
      for (let attempt = 1; attempt <= 6; attempt += 1) {
        outcome = await worker(twitch).processOne();
        const stored = await prisma.outbox.findUnique({ where: { id: task.id } });
        expect(stored.status).not.toBe('confirmed');
        if (stored.status === 'retry') now = stored.nextAttemptAt;
      }
      expect(outcome).toBe('unknown');
      expect(twitch.calls.writes).toBe(0);
      await prisma.outbox.update({ where: { id: task.id }, data: { status: 'cancelled' } });
    }
    expect(await prisma.outbox.count({ where: { redemptionId: { in: redemptionIds }, status: 'confirmed' } })).toBe(0);
    expect(await prisma.redemption.count({ where: { redemptionId: { in: redemptionIds }, remoteStatus: { not: 'UNFULFILLED' } } })).toBe(0);
    expect(await prisma.redemption.count({ where: { redemptionId: { in: redemptionIds }, syncStatus: 'confirmed' } })).toBe(0);
  });

  it('PG25-05 positive re-verification at attempt 3 confirms outbox, redemption and audit in ONE transaction', async () => {
    const { task, redemptionId } = await seedFinancialTask();
    const twitch = fakeTwitch(['UNKNOWN', 'UNKNOWN', 'CANCELED']);
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      expect(await worker(twitch).processOne()).toBe('retry');
      now = (await prisma.outbox.findUnique({ where: { id: task.id } })).nextAttemptAt;
    }
    expect(await worker(twitch).processOne()).toBe('confirmed');
    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'confirmed', attempts: 3 });
    expect(await prisma.redemption.findUnique({ where: { redemptionId } })).toMatchObject({ syncStatus: 'confirmed', remoteStatus: 'CANCELED' });
    expect(await prisma.auditLog.findFirst({ where: { redemptionId, event: 'financial.operation_confirmed_by_reverification' } })).toMatchObject({
      origin: 'system', previousState: 'processing', nextState: 'confirmed', reason: 'remote_read_positive',
      safeDetail: { operationType: 'redemption.cancel', attempts: 3, remoteConfirmed: true, remoteStatus: 'CANCELED' },
    });
    expect(twitch.calls.writes).toBe(0);

    const atomic = await seedFinancialTask();
    const atomicTwitch = fakeTwitch(['UNKNOWN', 'CANCELED']);
    expect(await worker(atomicTwitch).processOne()).toBe('retry');
    now = (await prisma.outbox.findUnique({ where: { id: atomic.task.id } })).nextAttemptAt;
    await forceAuditFailure('financial.operation_confirmed_by_reverification', async () => {
      await expect(worker(atomicTwitch).processOne()).rejects.toThrow();
    });
    expect(await prisma.outbox.findUnique({ where: { id: atomic.task.id } })).toMatchObject({ status: 'processing', attempts: 2 });
    expect(await prisma.redemption.findUnique({ where: { redemptionId: atomic.redemptionId } })).toMatchObject({ syncStatus: 'pending', remoteStatus: 'UNFULFILLED' });
    expect(await prisma.auditLog.count({ where: { redemptionId: atomic.redemptionId, event: 'financial.operation_confirmed_by_reverification' } })).toBe(0);
  });

  it('PG25-06 reconciliation never touches a processing task with a live lease, nor pending/retry tasks', async () => {
    const live = await seedFinancialTask();
    const claimed = await repository.claimNext({ now, leaseMs: 30_000 });
    expect(claimed.id).toBe(live.task.id);
    const waiting = await seedFinancialTask({ status: 'retry', attempts: 2, nextAttemptAt: new Date(now.getTime() + 60_000) });
    const fresh = await seedFinancialTask({ status: 'pending', nextAttemptAt: new Date(now.getTime() + 60_000) });

    for (const seeded of [live, waiting, fresh]) await repository.markRedemptionUnknown(seeded.redemptionId, 'remote_history_unavailable');

    expect(await prisma.outbox.findUnique({ where: { id: live.task.id } })).toMatchObject({ status: 'processing', leaseToken: claimed.leaseToken, attempts: 1 });
    expect(await prisma.outbox.findUnique({ where: { id: waiting.task.id } })).toMatchObject({ status: 'retry', attempts: 2 });
    expect(await prisma.outbox.findUnique({ where: { id: fresh.task.id } })).toMatchObject({ status: 'pending', attempts: 0 });
    for (const seeded of [live, waiting, fresh]) {
      expect(await prisma.redemption.findUnique({ where: { redemptionId: seeded.redemptionId } })).toMatchObject({ syncStatus: 'unknown' });
      expect(await prisma.auditLog.count({ where: { redemptionId: seeded.redemptionId, event: 'redemption.state_unknown' } })).toBe(1);
    }
    expect(await repository.retry(live.task.id, { nextAttemptAt: new Date(now.getTime() + 60_000), errorCode: 'remote_lookup_failed', reasonClass: 'remote_read_transient' }, claimed.leaseToken)).toMatchObject({ count: 1 });
  });

  it('PG25-07 manual retry: unknown to pending with cycleStartAttempts = attempts, attempts kept, audited with the actor', async () => {
    const { task, redemptionId, queue } = await seedFinancialTask({ status: 'unknown', attempts: 6, syncStatus: 'unknown', payload: {} });
    await expect(repository.retryOutboxManually(task.id)).rejects.toMatchObject({ code: 'ACTOR_REQUIRED' });
    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'unknown', attempts: 6, payload: {} });

    expect(await repository.retryOutboxManually(task.id, { actorId: 'operator-7' })).toMatchObject({ count: 1 });

    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'pending', attempts: 6, lastError: null, payload: { cycleStartAttempts: 6 } });
    const audits = await prisma.auditLog.findMany({ where: { redemptionId, event: 'financial.operation_retry_requested' } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      queueId: queue.id, actorId: 'operator-7', origin: 'panel', previousState: 'unknown', nextState: 'pending', reason: 'operator_retry_now',
    });
    expect(audits[0].safeDetail).toEqual({ operationType: 'redemption.cancel', previousAttempts: 6, cycleStartAttempts: 6 });
    expect(await repository.retryOutboxManually(task.id, { actorId: 'operator-7' })).toMatchObject({ count: 0 });
    expect(await prisma.auditLog.count({ where: { redemptionId, event: 'financial.operation_retry_requested' } })).toBe(1);
  });

  it('PG25-08 manual resolution is audited with remoteConfirmed:false and a later positive observation still closes it', async () => {
    const { task, redemptionId } = await seedFinancialTask({ status: 'unknown', attempts: 6, syncStatus: 'unknown' });
    expect(await repository.resolveUnknownFinancialOperation(task.id, 'operator-8')).toMatchObject({ status: 'resolved_manual' });
    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'resolved_manual' });
    expect(await prisma.redemption.findUnique({ where: { redemptionId } })).toMatchObject({ remoteStatus: 'UNFULFILLED', syncStatus: 'operator_resolved' });
    expect(await prisma.auditLog.findFirst({ where: { redemptionId, event: 'financial.operation_resolved_manually' } })).toMatchObject({ actorId: 'operator-8', safeDetail: { remoteConfirmed: false } });
    expect(await repository.claimNext({ now: new Date(now.getTime() + 86_400_000) })).toBeNull();
    await repository.recordExternalRedemptionState({ id: redemptionId, broadcasterId: 'broadcaster', rewardId: 'reward', userId: 'viewer-id', redeemedAt: now, status: 'CANCELED' });
    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'confirmed' });
    expect(await prisma.redemption.findUnique({ where: { redemptionId } })).toMatchObject({ remoteStatus: 'CANCELED', syncStatus: 'confirmed' });
  });

  it('PG25-09 legacy rows: payload {} reads with fallbacks; an unknown row stays terminal until "retry now"; an old retry row exhausts', async () => {
    const legacyUnknown = await seedFinancialTask({ status: 'unknown', attempts: 1, payload: {}, syncStatus: 'unknown' });
    expect(await repository.claimNext({ now: new Date(now.getTime() + 86_400_000) })).toBeNull();
    expect(await repository.retryOutboxManually(legacyUnknown.task.id, { actorId: 'operator-9' })).toMatchObject({ count: 1 });
    const reclaimed = await repository.claimNext({ now });
    expect(reclaimed).toMatchObject({ id: legacyUnknown.task.id, attempts: 2, payload: { cycleStartAttempts: 1 } });
    await prisma.outbox.update({ where: { id: legacyUnknown.task.id }, data: { status: 'cancelled', leaseToken: null } });

    const legacyRetry = await seedFinancialTask({ status: 'retry', attempts: 6, payload: {} });
    expect(await worker(fakeTwitch(['UNKNOWN'])).processOne()).toBe('unknown');
    expect(await prisma.outbox.findUnique({ where: { id: legacyRetry.task.id } })).toMatchObject({ status: 'unknown', attempts: 7, lastError: 'attempts_exhausted' });
  });

  it('PG25-11 T-C3: after 6 exhausted attempts "retry now" gives exactly 6 more; a 401 in the middle consumes none; attempts never decreases', async () => {
    const { task } = await seedFinancialTask();
    const history = [];
    const record = async () => {
      const stored = await prisma.outbox.findUnique({ where: { id: task.id } });
      history.push(stored.attempts);
      if (stored.status === 'retry') now = stored.nextAttemptAt;
      return stored;
    };
    const unknownRead = fakeTwitch(['UNKNOWN']);
    for (let attempt = 1; attempt <= 6; attempt += 1) { await worker(unknownRead).processOne(); await record(); }
    expect(await record()).toMatchObject({ status: 'unknown', lastError: 'attempts_exhausted', attempts: 6 });

    expect(await repository.retryOutboxManually(task.id, { actorId: 'operator-11' })).toMatchObject({ count: 1 });
    await record();
    let nonConclusive = 0;
    let authorizationFailures = 0;
    for (let claim = 1; claim <= 20; claim += 1) {
      const stored = await prisma.outbox.findUnique({ where: { id: task.id } });
      if (stored.status === 'unknown' && stored.lastError === 'attempts_exhausted') break;
      if (claim === 3) {
        expect(await worker(fakeTwitch([twurpleHttpError(401, 'Unauthorized')])).processOne()).toBe('blocked_auth');
        authorizationFailures += 1;
        const blocked = await record();
        expect(blocked).toMatchObject({ status: 'unknown', lastError: 'authorization_required' });
        expect(blocked.payload.cycleStartAttempts).toBe(7);
        // Stand-in for the re-authorization re-arm (FT-26, AC 16): keep the payload, only make the row due again.
        await prisma.outbox.update({ where: { id: task.id }, data: { status: 'retry', nextAttemptAt: now, lastError: null } });
        continue;
      }
      await worker(unknownRead).processOne();
      nonConclusive += 1;
      await record();
    }
    expect(authorizationFailures).toBe(1);
    expect(nonConclusive).toBe(6);
    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'unknown', lastError: 'attempts_exhausted', attempts: 13, payload: { cycleStartAttempts: 7 } });
    for (let index = 1; index < history.length; index += 1) expect(history[index]).toBeGreaterThanOrEqual(history[index - 1]);
  });

  it('PG25-12 payload merge never replaces the object; claimNext RETURNING includes payload', async () => {
    const original = { firstNonConclusiveAt: '2026-11-04T10:00:00.000Z', reasonClass: 'remote_read_transient', unrelatedKey: 'kept' };
    const { task } = await seedFinancialTask({ status: 'unknown', attempts: 4, payload: original });
    expect(await repository.retryOutboxManually(task.id, { actorId: 'operator-12' })).toMatchObject({ count: 1 });
    expect((await prisma.outbox.findUnique({ where: { id: task.id } })).payload).toEqual({ ...original, cycleStartAttempts: 4 });
    const claimed = await repository.claimNext({ now });
    expect(claimed.payload).toEqual({ ...original, cycleStartAttempts: 4 });
    expect(await repository.unknown(task.id, 'authorization_required', claimed.leaseToken)).toMatchObject({ count: 1 });
    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'unknown', lastError: 'authorization_required', attempts: 5, payload: { ...original, cycleStartAttempts: 5 } });

    const queue = await repository.createQueue({ slug: `reward-${randomUUID().slice(0, 8)}`, title: 'Reward payload', cost: 1 });
    const rewardPayload = { requestMayHaveReachedTwitch: true, safeToDelete: true, queueVersion: 3 };
    const rewardTask = await prisma.outbox.create({ data: {
      operationType: 'reward.delete', entityType: 'queue', entityId: queue.id, idempotencyKey: `queue:${queue.id}:reward.delete`,
      status: 'unknown', attempts: 2, payload: rewardPayload,
    } });
    expect(await repository.retryOutboxManually(rewardTask.id, { actorId: 'operator-12' })).toMatchObject({ count: 1 });
    expect((await prisma.outbox.findUnique({ where: { id: rewardTask.id } })).payload).toEqual(rewardPayload);
    const rewardAudit = await prisma.auditLog.findFirst({ where: { queueId: queue.id, event: 'financial.operation_retry_requested' } });
    expect(rewardAudit).toMatchObject({ actorId: 'operator-12', previousState: 'unknown', nextState: 'pending' });
    expect(rewardAudit.safeDetail).toEqual({ operationType: 'reward.delete', previousAttempts: 2 });
  });

  it(`PG25-13 retry now is one guarded transaction: forced audit failure leaves nothing; ${RACE_ROUNDS} concurrent pairs win once`, async () => {
    const { task, redemptionId } = await seedFinancialTask({ status: 'failed', attempts: 3, payload: { reasonClass: 'remote_read_transient' } });
    await forceAuditFailure('financial.operation_retry_requested', async () => {
      await expect(repository.retryOutboxManually(task.id, { actorId: 'operator-13' })).rejects.toThrow();
    });
    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'failed', attempts: 3, payload: { reasonClass: 'remote_read_transient' } });
    expect(await prisma.auditLog.count({ where: { redemptionId, event: 'financial.operation_retry_requested' } })).toBe(0);

    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const seeded = await seedFinancialTask({ status: 'unknown', attempts: 6 });
      const arrive = barrier(2);
      const results = await Promise.all([
        arrive().then(() => repository.retryOutboxManually(seeded.task.id, { actorId: 'operator-a' })),
        arrive().then(() => otherRepository.retryOutboxManually(seeded.task.id, { actorId: 'operator-b' })),
      ]);
      expect(results.map(({ count }) => count).sort()).toEqual([0, 1]);
      expect(await prisma.auditLog.count({ where: { redemptionId: seeded.redemptionId, event: 'financial.operation_retry_requested' } })).toBe(1);
      expect(await prisma.outbox.findUnique({ where: { id: seeded.task.id } })).toMatchObject({ status: 'pending', attempts: 6, payload: { cycleStartAttempts: 6 } });
      await prisma.outbox.update({ where: { id: seeded.task.id }, data: { status: 'cancelled' } });
    }
  });

  it('PG25-14 the 401 refund is atomic: a forced failure leaves neither change, a success writes both', async () => {
    const { task } = await seedFinancialTask({ payload: { cycleStartAttempts: 0, reasonClass: 'remote_read_transient' } });
    const claimed = await repository.claimNext({ now });
    const name = `test_fail_${randomUUID().replaceAll('-', '')}`;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.last_error = 'authorization_required' THEN RAISE EXCEPTION 'forced outbox failure'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE UPDATE ON outbox FOR EACH ROW EXECUTE FUNCTION ${name}()`);
    try {
      await expect(repository.unknown(task.id, 'authorization_required', claimed.leaseToken)).rejects.toThrow();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER ${name} ON outbox`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION ${name}()`);
    }
    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'processing', attempts: 1, leaseToken: claimed.leaseToken, payload: { cycleStartAttempts: 0, reasonClass: 'remote_read_transient' } });
    expect(await repository.unknown(task.id, 'authorization_required', claimed.leaseToken)).toMatchObject({ count: 1 });
    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'unknown', lastError: 'authorization_required', attempts: 1, payload: { cycleStartAttempts: 1, reasonClass: 'remote_read_transient' } });
  });

  it('PG25-10 audit allowlist: every FT-25 financial event keeps safe_detail inside its allowlist, with no viewer or secret key', async () => {
    const rows = await prisma.auditLog.findMany({ where: { event: { startsWith: 'financial.' } } });
    const events = new Set(rows.map(({ event }) => event));
    for (const event of ['financial.operation_retry_scheduled', 'financial.operation_attempts_exhausted', 'financial.operation_confirmed_by_reverification', 'financial.operation_retry_requested', 'financial.operation_resolved_manually']) {
      expect(events.has(event), `${event} was produced by this file`).toBe(true);
    }
    for (const row of rows) {
      const allowed = AUDIT_ALLOWLIST[row.event];
      expect(allowed, `unexpected financial event ${row.event}`).toBeDefined();
      for (const key of Object.keys(row.safeDetail ?? {})) {
        expect(allowed).toContain(key);
        expect(key).not.toMatch(FORBIDDEN_DETAIL_KEY);
      }
      expect(JSON.stringify(row.safeDetail)).not.toMatch(/viewer-id|oauth|Bearer/);
    }
  });
});
