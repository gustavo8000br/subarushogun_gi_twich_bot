// OPS-22 FT-26 (#99), group G2 of the `@qa` plan: queue deletion order and states on an ISOLATED PostgreSQL with the
// real migrations (never SQLite, never Prisma mocks). Races use two real connections and a barrier, never a sleep.
// Time and jitter are injected; Twitch is a fake that records every read and write.
import Fastify from 'fastify';
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
import { registerLocalSession } from '../../apps/api/src/http/local-session.mjs';
import { registerQueueRoutes } from '../../apps/api/src/http/queue-routes.mjs';
import { createQueueRepository } from '../../apps/api/src/persistence/queue-repository.mjs';
import { createQueueDomainService } from '../../apps/api/src/domain/queue-service.mjs';
import { createFinancialOutboxWorker } from '../../apps/api/src/outbox/financial-worker.mjs';
import { createRewardOutboxWorker } from '../../apps/api/src/outbox/reward-worker.mjs';
import { getQueueDeletionProjection } from '../../apps/shared/panel/queue-action-state.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const containerName = `queuebot-del-order-${process.pid}-${randomUUID().slice(0, 8)}`;
const RACE_ROUNDS = 50;
const FORBIDDEN_DETAIL_KEY = /user|login|name|token|header|input|body|uid/i;

let connectionString;
let prisma;
let otherPrisma;
let repository;
let otherRepository;
let now = new Date('2030-01-01T12:00:00.000Z');
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

function minutesFromNow(minutes) {
  return new Date(now.getTime() + (minutes * 60_000));
}

/** A Channel Points queue in `deleting` with its reward paused and a `reward.delete` task. */
async function seedDeletingQueue({ deleteStatus = 'pending', deleteLastError = null, deletePayload = { requestMayHaveReachedTwitch: false, safeToDelete: false } } = {}) {
  const created = await repository.createQueue({ slug: `del-${randomUUID().slice(0, 8)}`, title: 'Deletion order', cost: 7 });
  const rewardId = `reward-${randomUUID()}`;
  const queue = await prisma.queue.update({ where: { id: created.id }, data: {
    rewardId, rewardOrigin: 'bot_created', queueMode: 'channel_points', lifecycleStatus: 'deleting',
    isArchived: true, isOpen: false, remoteSyncStatus: 'delete_pending',
  } });
  const deletion = await prisma.outbox.create({ data: {
    operationType: 'reward.delete', entityType: 'queue', entityId: queue.id, idempotencyKey: `queue:${queue.id}:reward.delete`,
    payload: deletePayload, status: deleteStatus, lastError: deleteLastError, nextAttemptAt: now,
  } });
  return { queue, deletion };
}

/** One redemption of the queue's reward, optionally with its local financial task. */
async function seedRedemption(queue, { remoteStatus = 'UNFULFILLED', expectedStatus = 'CANCELED', syncStatus = 'pending', task = null } = {}) {
  const redemptionId = `red-${randomUUID()}`;
  await prisma.redemption.create({ data: {
    redemptionId, broadcasterId: 'broadcaster', rewardId: queue.rewardId, userId: `viewer-${randomUUID().slice(0, 8)}`, queueId: queue.id,
    redeemedAt: now, remoteStatus, expectedStatus, syncStatus,
  } });
  const outbox = task ? await prisma.outbox.create({ data: {
    operationType: task.operationType ?? 'redemption.cancel', entityType: 'redemption', entityId: redemptionId,
    idempotencyKey: `financial:${redemptionId}`, redemptionId, status: task.status ?? 'pending', attempts: task.attempts ?? 0,
    lastError: task.lastError ?? null, payload: task.payload ?? {}, nextAttemptAt: task.nextAttemptAt ?? now,
  } }) : null;
  return { redemptionId, outbox };
}

/**
 * Fake Twitch shared by both workers. `open` holds the redemptions still UNFULFILLED on Twitch; every DELETE records
 * whether an UNFULFILLED redemption was still open at that moment (it must never be).
 */
function fakeTwitch(queue, { open = [] } = {}) {
  const state = {
    rewardExists: true, open: new Set(open), remote: new Map(), deletes: 0, deletesWithOpenRedemptions: 0,
    writes: [], rewardError: null, listError: null, deleteError: null, readError: null,
  };
  const reward = () => ({
    id: queue.rewardId, title: queue.title, cost: queue.cost, prompt: queue.rewardPrompt ?? '', isPaused: true, isEnabled: true,
    userInputRequired: queue.uidMode === 'visible', autoFulfill: false, shouldRedemptionsSkipRequestQueue: false,
    maxRedemptionsPerStream: queue.maxRedemptionsPerStream ?? null, maxRedemptionsPerUserPerStream: queue.maxRedemptionsPerUserPerStream ?? null,
    globalCooldown: queue.globalCooldownSeconds ?? null,
  });
  return {
    state,
    async getReward() {
      if (state.rewardError) throw state.rewardError;
      return state.rewardExists ? reward() : null;
    },
    async listUnfulfilledRedemptions(rewardId) {
      if (state.listError) throw state.listError;
      return [...state.open].map((id) => ({ id, broadcasterId: 'broadcaster', rewardId, userId: `viewer-${id.slice(-8)}`, redeemedAt: now, status: 'UNFULFILLED' }));
    },
    async deleteReward() {
      if (state.deleteError) throw state.deleteError;
      state.deletes += 1;
      if (state.open.size) state.deletesWithOpenRedemptions += 1;
      state.rewardExists = false;
    },
    async getRedemptionStatus(redemptionId) {
      if (state.readError) throw state.readError;
      if (state.open.has(redemptionId)) return 'UNFULFILLED';
      return state.remote.get(redemptionId) ?? 'UNFULFILLED';
    },
    async setRedemptionStatus(redemptionId, status) {
      state.writes.push({ redemptionId, status });
      state.open.delete(redemptionId);
      state.remote.set(redemptionId, status);
      return { status };
    },
  };
}

function workers(twitch) {
  return {
    reward: createRewardOutboxWorker({ repository, twitch, clock, random: () => 0 }),
    financial: createFinancialOutboxWorker({ repository, twitch, clock, random: () => 0.5 }),
  };
}

async function auditRows(queueId, event) {
  return prisma.auditLog.findMany({ where: { queueId, event }, orderBy: { createdAt: 'asc' } });
}

async function projectionOf(queueId) {
  const queue = (await repository.listQueueProjection()).find(({ id }) => id === queueId);
  return getQueueDeletionProjection(queue, queue?.deletion);
}

describe('OPS-22 FT-26 queue deletion order on isolated PostgreSQL', () => {
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
    // Park every claimable task of earlier tests so each test owns its claims.
    await prisma.outbox.updateMany({
      where: { status: { in: ['pending', 'retry', 'processing'] } },
      data: { status: 'cancelled', leaseToken: null, leaseUntil: null },
    });
    now = new Date(now.getTime() + 86_400_000);
  });

  it('PG26-01 (DATA 9): blockers hold reward.delete, a confirming read resumes it, a manual resolution is re-checked by a later re-list', async () => {
    const { queue, deletion } = await seedDeletingQueue();
    const openId = `open-${randomUUID()}`;
    const unknown = await seedRedemption(queue, { task: { status: 'unknown', attempts: 6, lastError: 'attempts_exhausted', payload: { reasonClass: 'remote_read_unrecognized' } } });
    await seedRedemption(queue, { remoteStatus: 'CANCELED', syncStatus: 'confirmed', task: { status: 'confirmed', attempts: 1 } });
    await seedRedemption(queue, { remoteStatus: 'FULFILLED', expectedStatus: 'FULFILLED', syncStatus: 'confirmed', task: { operationType: 'redemption.fulfill', status: 'confirmed', attempts: 1 } });
    const twitch = fakeTwitch(queue, { open: [openId, unknown.redemptionId] });
    const { reward, financial } = workers(twitch);

    // 1. The unknown task blocks: reward.delete waits in `retry`, never `unknown`, and is not claimable now.
    await expect(reward.processOne()).resolves.toBe('retry');
    expect(await prisma.outbox.findUnique({ where: { id: deletion.id } })).toMatchObject({
      status: 'retry', lastError: 'queue_deletion_blocked_by_review', nextAttemptAt: minutesFromNow(5),
    });
    expect(await repository.claimNextRewardOperation({ now })).toBeNull();
    expect(await auditRows(queue.id, 'queue.deletion_blocked')).toMatchObject([{ reason: 'financial_operations_need_review', safeDetail: { blockedCount: 1, pendingCount: 1 } }]);

    // 2. The cancel of the open redemption is confirmed by a positive read: the same transaction resumes reward.delete.
    await expect(financial.processOne()).resolves.toBe('confirmed');
    expect(await prisma.outbox.findUnique({ where: { id: deletion.id } })).toMatchObject({ status: 'retry', nextAttemptAt: now });
    expect(await auditRows(queue.id, 'queue.deletion_resumed')).toMatchObject([{ safeDetail: { resolvedBy: 'remote_read' } }]);

    // 3. Still blocked by the unknown task.
    await expect(reward.processOne()).resolves.toBe('retry');
    expect(await prisma.outbox.findUnique({ where: { id: deletion.id } })).toMatchObject({ lastError: 'queue_deletion_blocked_by_review' });

    // 4. Manual resolution counts as locally settled and resumes the deletion, without writing remoteStatus.
    await expect(repository.resolveUnknownFinancialOperation(unknown.outbox.id, 'operator-1')).resolves.toMatchObject({ status: 'resolved_manual' });
    expect(await prisma.outbox.findUnique({ where: { id: deletion.id } })).toMatchObject({ nextAttemptAt: now });
    expect(await prisma.redemption.findUnique({ where: { redemptionId: unknown.redemptionId } })).toMatchObject({ remoteStatus: 'UNFULFILLED' });

    // 5. The re-list taken after the resolution still shows it UNFULFILLED: the cancel is re-armed, nothing is deleted.
    await expect(reward.processOne()).resolves.toBe('retry');
    expect(twitch.state.deletes).toBe(0);
    expect(await prisma.outbox.findUnique({ where: { id: unknown.outbox.id } })).toMatchObject({ status: 'pending', attempts: 6, payload: { cycleStartAttempts: 6 } });
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({ lifecycleStatus: 'deleting' });
    // The delete guards refuse while the re-armed task is open, even with a lease in hand.
    await prisma.outbox.update({ where: { id: deletion.id }, data: { nextAttemptAt: now } });
    const claimed = await repository.claimNextRewardOperation({ now });
    expect(claimed).toMatchObject({ id: deletion.id, status: 'processing' });
    expect(await repository.prepareRewardDelete(claimed.id, claimed.leaseToken)).toBe(false);
    await prisma.outbox.update({ where: { id: deletion.id }, data: { payload: { ...claimed.payload, safeToDelete: true } } });
    expect(await repository.completeQueueDeletion(claimed.id, claimed.leaseToken)).toBe(false);
    expect(await repository.retryRewardOperation(claimed.id, { nextAttemptAt: now, errorCode: 'queue_deletion_waiting_for_refunds', payloadUpdates: { safeToDelete: false } }, claimed.leaseToken)).toBe(true);

    // 6. The fresh cycle refunds it with a read first; 7. the deletion then completes.
    await expect(financial.processOne()).resolves.toBe('confirmed');
    await expect(reward.processOne()).resolves.toBe('confirmed');
    expect(twitch.state.deletes).toBe(1);
    expect(twitch.state.deletesWithOpenRedemptions).toBe(0);
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({ lifecycleStatus: 'deleted', remoteSyncStatus: 'deleted' });
    expect(await prisma.redemption.findUnique({ where: { redemptionId: openId } })).toMatchObject({ remoteStatus: 'CANCELED', syncStatus: 'confirmed' });
    expect(await prisma.redemption.findUnique({ where: { redemptionId: unknown.redemptionId } })).toMatchObject({ remoteStatus: 'CANCELED', syncStatus: 'confirmed' });
  });

  it('PG26-02 (DATA 10): recording the deletion redemptions twice creates one cancel per redemption and keeps a fulfillment', async () => {
    const { queue } = await seedDeletingQueue();
    const served = await seedRedemption(queue, { expectedStatus: 'FULFILLED', task: { operationType: 'redemption.fulfill', status: 'pending' } });
    const openIds = [`open-${randomUUID()}`, `open-${randomUUID()}`];
    const list = [...openIds, served.redemptionId].map((id) => ({ id, broadcasterId: 'broadcaster', rewardId: queue.rewardId, userId: `viewer-${id.slice(-6)}`, redeemedAt: now, status: 'UNFULFILLED' }));

    await repository.recordQueueDeletionRedemptions({ queueId: queue.id, redemptions: list });
    await repository.recordQueueDeletionRedemptions({ queueId: queue.id, redemptions: list });

    for (const redemptionId of openIds) {
      expect(await prisma.outbox.findMany({ where: { redemptionId } })).toMatchObject([{ operationType: 'redemption.cancel', status: 'pending' }]);
    }
    expect(await prisma.outbox.findMany({ where: { redemptionId: served.redemptionId } })).toMatchObject([{ id: served.outbox.id, operationType: 'redemption.fulfill', status: 'pending' }]);
  });

  it.each([
    ['open', { open: true }, { queue: 'deleted', deletes: 1, financial: 'confirmed', remote: 'CANCELED' }],
    ['unknown', { open: true, task: { status: 'unknown', attempts: 6, lastError: 'attempts_exhausted' } }, { queue: 'deleting', deletes: 0, financial: 'unknown', remote: 'UNFULFILLED' }],
    ['already canceled', { remoteStatus: 'CANCELED', syncStatus: 'confirmed', task: { status: 'confirmed' } }, { queue: 'deleted', deletes: 1, financial: 'confirmed', remote: 'CANCELED' }],
    ['already fulfilled', { remoteStatus: 'FULFILLED', expectedStatus: 'FULFILLED', syncStatus: 'confirmed', task: { operationType: 'redemption.fulfill', status: 'confirmed' } }, { queue: 'deleted', deletes: 1, financial: 'confirmed', remote: 'FULFILLED' }],
  ])('PG26-03 (AC 17): a redemption %s ends in the states of ACs 13-15 and no DELETE runs over an unaccounted UNFULFILLED', async (_name, seed, expected) => {
    const { queue, deletion } = await seedDeletingQueue();
    const { open, ...redemption } = seed;
    const seeded = seed.task ? await seedRedemption(queue, redemption) : null;
    const redemptionId = seeded?.redemptionId ?? `open-${randomUUID()}`;
    const twitch = fakeTwitch(queue, { open: open ? [redemptionId] : [] });
    if (seed.remoteStatus) twitch.state.remote.set(redemptionId, seed.remoteStatus);
    const { reward, financial } = workers(twitch);

    for (let round = 0; round < 8; round += 1) {
      await reward.processOne();
      await financial.processOne();
      now = minutesFromNow(6);
    }

    expect(twitch.state.deletes).toBe(expected.deletes);
    expect(twitch.state.deletesWithOpenRedemptions).toBe(0);
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({ lifecycleStatus: expected.queue });
    expect(await prisma.outbox.findUnique({ where: { idempotencyKey: `financial:${redemptionId}` } })).toMatchObject({ status: expected.financial });
    expect(await prisma.redemption.findUnique({ where: { redemptionId } })).toMatchObject({ remoteStatus: expected.remote });
    const finalDeletion = await prisma.outbox.findUnique({ where: { id: deletion.id } });
    if (expected.queue === 'deleted') expect(finalDeletion).toMatchObject({ status: 'confirmed' });
    else {
      expect(finalDeletion).toMatchObject({ status: 'retry', lastError: 'queue_deletion_blocked_by_review' });
      expect(await projectionOf(queue.id)).toMatchObject({ deletionState: 'blocked', blockReason: 'financial_review_required', blockingOperations: 1 });
    }
  });

  it('PG26-04: a resolution contradicted by the post-resolution re-list re-arms the task with a fresh cycle and one audit row', async () => {
    const { queue } = await seedDeletingQueue();
    const unknown = await seedRedemption(queue, { task: { status: 'unknown', attempts: 7, lastError: 'attempts_exhausted', payload: { cycleStartAttempts: 1, reasonClass: 'remote_not_found', firstNonConclusiveAt: '2026-11-01T00:00:00.000Z' } } });
    await repository.resolveUnknownFinancialOperation(unknown.outbox.id, 'operator-1');
    const twitch = fakeTwitch(queue, { open: [unknown.redemptionId] });
    const { reward } = workers(twitch);

    await expect(reward.processOne()).resolves.toBe('retry');
    now = minutesFromNow(1);
    await prisma.outbox.updateMany({ where: { entityId: queue.id, operationType: 'reward.delete' }, data: { nextAttemptAt: now } });
    await reward.processOne();

    const task = await prisma.outbox.findUnique({ where: { id: unknown.outbox.id } });
    expect(task).toMatchObject({ status: 'pending', attempts: 7, lastError: null, leaseToken: null });
    expect(task.payload).toEqual({ cycleStartAttempts: 7, reasonClass: 'remote_not_found', firstNonConclusiveAt: '2026-11-01T00:00:00.000Z' });
    expect(await prisma.redemption.findUnique({ where: { redemptionId: unknown.redemptionId } })).toMatchObject({ remoteStatus: 'UNFULFILLED', syncStatus: 'pending' });
    const contradicted = await auditRows(queue.id, 'financial.manual_resolution_contradicted');
    expect(contradicted).toHaveLength(1);
    expect(contradicted[0]).toMatchObject({
      redemptionId: unknown.redemptionId, origin: 'system', previousState: 'resolved_manual', nextState: 'pending', reason: 'remote_still_unfulfilled',
      safeDetail: { operationType: 'redemption.cancel', attempts: 7, cycleStartAttempts: 7 },
    });
    expect(Object.keys(contradicted[0].safeDetail).sort()).toEqual(['attempts', 'cycleStartAttempts', 'operationType']);
    expect(twitch.state.deletes).toBe(0);
  });

  it('PG26-04b: after the contradiction GET /api/operations projects reason manual_contradicted from the audit fact, with nothing raw', async () => {
    const { queue } = await seedDeletingQueue();
    const unknown = await seedRedemption(queue, { task: { status: 'unknown', attempts: 7, lastError: 'attempts_exhausted', payload: { cycleStartAttempts: 1, reasonClass: 'remote_not_found', firstNonConclusiveAt: '2026-11-01T00:00:00.000Z' } } });
    const other = await seedRedemption(queue, { task: { status: 'unknown', attempts: 6, lastError: 'attempts_exhausted' } });
    const app = Fastify();
    registerLocalSession(app, { port: 3000 });
    registerQueueRoutes(app, { repository, domainService: repository, integrations: {}, publicBaseUrl: 'https://localhost:3000', productVersion: 'v0.1.0-1234567-alpha' });
    const session = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000' } });
    const headers = { host: 'localhost:3000', origin: 'https://localhost:3000', cookie: `${session.cookies[0].name}=${session.cookies[0].value}` };
    const operationOf = async (redemptionId) => (await app.inject({ method: 'GET', url: '/api/operations', headers })).json().find((item) => item.redemptionId === redemptionId);
    try {
      await repository.resolveUnknownFinancialOperation(unknown.outbox.id, 'operator-1');
      expect(await operationOf(unknown.redemptionId)).toMatchObject({ status: 'resolved_manual' });

      const twitch = fakeTwitch(queue, { open: [unknown.redemptionId, other.redemptionId] });
      const { reward } = workers(twitch);
      await reward.processOne();
      now = minutesFromNow(1);
      await prisma.outbox.updateMany({ where: { entityId: queue.id, operationType: 'reward.delete' }, data: { nextAttemptAt: now } });
      await reward.processOne();

      const response = await app.inject({ method: 'GET', url: '/api/operations', headers });
      const body = response.json();
      const contradicted = body.find((item) => item.redemptionId === unknown.redemptionId);
      expect(contradicted).toMatchObject({ type: 'redemption.cancel', status: 'pending', attempts: 7, reason: 'manual_contradicted' });
      expect(Object.keys(contradicted).sort()).toEqual(['attempts', 'id', 'nextAttemptAt', 'reason', 'redemptionId', 'status', 'type']);
      // The untouched exhausted task keeps its existing reason.
      expect(body.find((item) => item.redemptionId === other.redemptionId)).toMatchObject({ status: 'unknown', reason: 'attempts_exhausted' });
      for (const raw of ['firstNonConclusiveAt', 'remote_not_found', 'operator-1', 'viewer-', 'cycleStartAttempts', 'remote_still_unfulfilled', 'manualContradicted']) {
        expect(response.body).not.toContain(raw);
      }
    } finally { await app.close(); }
  });

  it('PG26-05: resolved_manual is not a blocking operation and the deletion projection is pending while the re-list guard runs', async () => {
    const { queue } = await seedDeletingQueue({ deleteStatus: 'retry', deleteLastError: 'queue_deletion_blocked_by_review' });
    const resolved = await seedRedemption(queue, { task: { status: 'unknown', attempts: 6, lastError: 'attempts_exhausted' } });
    expect(await repository.getQueueDeletionBlockers(queue.id)).toEqual({ pending: 0, blocked: 1 });
    expect(await projectionOf(queue.id)).toMatchObject({ deletionState: 'blocked', blockReason: 'financial_review_required', blockingOperations: 1 });

    await repository.resolveUnknownFinancialOperation(resolved.outbox.id, 'operator-1');
    // The resumed task waits for the re-list guard; until the worker runs it, the projection is pending with nothing counted.
    expect(await prisma.outbox.findFirst({ where: { entityId: queue.id, operationType: 'reward.delete' } })).toMatchObject({ status: 'retry', lastError: null, nextAttemptAt: now });

    expect(await repository.getQueueDeletionBlockers(queue.id)).toEqual({ pending: 0, blocked: 0 });
    expect(await repository.listManuallySettledDeletionTasks(queue.id)).toEqual([resolved.outbox.id]);
    expect(await projectionOf(queue.id)).toMatchObject({ deletionState: 'pending', blockReason: null, blockingOperations: 0 });
    const operation = (await repository.listFinancialOperations()).find(({ id }) => id === resolved.outbox.id);
    expect(operation).not.toHaveProperty('blockingQueueId');
  });

  it('PG26-06: a 401 during deletion is persisted as blocked by authorization and re-arms after re-authorization', async () => {
    const { queue, deletion } = await seedDeletingQueue();
    const twitch = fakeTwitch(queue);
    twitch.state.rewardError = twurpleHttpError(401, 'Unauthorized');
    const { reward } = workers(twitch);
    const financialTask = await seedRedemption(queue, { task: { status: 'pending' } });
    twitch.state.open.add(financialTask.redemptionId);
    twitch.state.readError = twurpleHttpError(401, 'Unauthorized');
    const financial = createFinancialOutboxWorker({ repository, twitch, clock, random: () => 0.5 });
    const exhausted = await seedRedemption(queue, { task: { status: 'unknown', attempts: 6, lastError: 'attempts_exhausted' } });
    const otherQueue = await repository.createQueue({ slug: `act-${randomUUID().slice(0, 8)}`, title: 'Active', cost: 1 });
    const unrelated = await prisma.outbox.create({ data: {
      operationType: 'reward.update', entityType: 'queue', entityId: otherQueue.id, idempotencyKey: `queue:${otherQueue.id}:reward.update:1`,
      payload: {}, status: 'retry', lastError: 'twitch_authorization_required', nextAttemptAt: minutesFromNow(30),
    } });

    await expect(reward.processOne()).resolves.toBe('retry');
    await expect(financial.processOne()).resolves.toBe('blocked_auth');

    expect(await prisma.outbox.findUnique({ where: { id: deletion.id } })).toMatchObject({ status: 'retry', lastError: 'twitch_authorization_required', nextAttemptAt: minutesFromNow(5) });
    expect(await prisma.outbox.findUnique({ where: { id: financialTask.outbox.id } })).toMatchObject({ status: 'unknown', lastError: 'authorization_required', attempts: 1, payload: { cycleStartAttempts: 1 } });
    expect(await projectionOf(queue.id)).toMatchObject({ deletionState: 'blocked', blockReason: 'authorization_required' });

    now = minutesFromNow(2);
    await expect(repository.rearmAuthorizationBlockedOperations()).resolves.toEqual({ financial: 1, reward: 1 });

    expect(await prisma.outbox.findUnique({ where: { id: deletion.id } })).toMatchObject({ status: 'retry', nextAttemptAt: now });
    expect(await prisma.outbox.findUnique({ where: { id: financialTask.outbox.id } })).toMatchObject({ status: 'retry', nextAttemptAt: now, attempts: 1, payload: { cycleStartAttempts: 1 } });
    expect(await prisma.outbox.findUnique({ where: { id: exhausted.outbox.id } })).toMatchObject({ status: 'unknown', lastError: 'attempts_exhausted' });
    expect(await prisma.outbox.findUnique({ where: { id: unrelated.id } })).toMatchObject({ status: 'retry', nextAttemptAt: minutesFromNow(28) });
    const rearmed = await prisma.auditLog.findMany({ where: { redemptionId: financialTask.redemptionId, event: 'financial.operation_rearmed_after_reauthorization' } });
    expect(rearmed).toMatchObject([{ origin: 'system', previousState: 'unknown', nextState: 'retry', reason: 'twitch_reauthorized', safeDetail: { operationType: 'redemption.cancel', attempts: 1, cycleStartAttempts: 1 } }]);
    for (const row of rearmed) for (const key of Object.keys(row.safeDetail)) expect(key).not.toMatch(FORBIDDEN_DETAIL_KEY);

    // The re-armed task continues the SAME cycle: the next claim is cycle attempt 1 again (the 401 was refunded).
    const claim = await repository.claimNext({ now });
    expect(claim).toMatchObject({ id: financialTask.outbox.id, attempts: 2, payload: { cycleStartAttempts: 1 } });
    expect(await repository.claimNextRewardOperation({ now })).toMatchObject({ id: deletion.id });
    // A second re-arm finds nothing to do.
    await expect(repository.rearmAuthorizationBlockedOperations()).resolves.toEqual({ financial: 0, reward: 0 });
  });

  it('PG26-07: the auto-resume after a financial confirmation touches only a reward.delete in retry of a deleting queue', async () => {
    const cases = [];
    for (const [deleteStatus, lifecycleStatus] of [['retry', 'deleting'], ['cancelled', 'deleting'], ['cancel_verification', 'deleting'], ['pending', 'deleting'], ['retry', 'active']]) {
      const { queue, deletion } = await seedDeletingQueue({ deleteStatus, deleteLastError: 'queue_deletion_waiting_for_refunds' });
      await prisma.outbox.update({ where: { id: deletion.id }, data: { nextAttemptAt: minutesFromNow(5) } });
      if (lifecycleStatus === 'active') await prisma.queue.update({ where: { id: queue.id }, data: { lifecycleStatus: 'active', remoteSyncStatus: 'synced' } });
      const { redemptionId, outbox } = await seedRedemption(queue, { task: { status: 'pending' } });
      cases.push({ deleteStatus, lifecycleStatus, deletion, redemptionId, outbox });
    }
    for (let index = 0; index < cases.length; index += 1) {
      const claim = await repository.claimNext({ now });
      expect(claim).not.toBeNull();
      expect(await repository.confirm(claim.id, 'CANCELED', claim.leaseToken)).toBe(true);
    }
    for (const { deleteStatus, lifecycleStatus, deletion } of cases) {
      const row = await prisma.outbox.findUnique({ where: { id: deletion.id } });
      expect(row.status, `${deleteStatus}/${lifecycleStatus}`).toBe(deleteStatus);
      expect(row.nextAttemptAt, `${deleteStatus}/${lifecycleStatus}`).toEqual(deleteStatus === 'retry' && lifecycleStatus === 'deleting' ? now : minutesFromNow(5));
    }
  });

  it(`PG26-07 race: a confirming read and a cancel of the deletion never revive a cancelled deletion (two connections, ${RACE_ROUNDS} rounds)`, async () => {
    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const { queue, deletion } = await seedDeletingQueue({ deleteStatus: 'retry', deleteLastError: 'queue_deletion_waiting_for_refunds' });
      await prisma.outbox.update({ where: { id: deletion.id }, data: { nextAttemptAt: minutesFromNow(5) } });
      const { outbox } = await seedRedemption(queue, { task: { status: 'pending' } });
      const claim = await repository.claimNext({ now });
      expect(claim.id).toBe(outbox.id);
      const wait = barrier(2);
      const [confirmed, begun] = await Promise.allSettled([
        (async () => { await wait(); return repository.confirm(claim.id, 'CANCELED', claim.leaseToken); })(),
        (async () => { await wait(); return otherRepository.beginQueueDeletionCancellation({ queueId: queue.id, actorId: 'operator-race' }); })(),
      ]);
      expect(confirmed, `round ${round}`).toMatchObject({ status: 'fulfilled', value: true });
      expect(begun, `round ${round}`).toMatchObject({ status: 'fulfilled', value: { status: 'verification_required' } });
      expect(await prisma.outbox.findUnique({ where: { id: deletion.id } }), `round ${round}`).toMatchObject({ status: 'cancel_verification' });
      expect(await prisma.outbox.findUnique({ where: { id: outbox.id } }), `round ${round}`).toMatchObject({ status: 'confirmed' });
      await prisma.outbox.update({ where: { id: deletion.id }, data: { status: 'cancelled', lastError: 'queue_deletion_cancelled_by_operator' } });
    }
  });

  it('PG26-08: absence from the UNFULFILLED list is never written back as a remote status', async () => {
    const { queue } = await seedDeletingQueue();
    const resolved = await seedRedemption(queue, { task: { status: 'unknown', attempts: 6, lastError: 'attempts_exhausted' } });
    await repository.resolveUnknownFinancialOperation(resolved.outbox.id, 'operator-1');
    const twitch = fakeTwitch(queue, { open: [] });
    const { reward } = workers(twitch);

    await expect(reward.processOne()).resolves.toBe('confirmed');

    expect(twitch.state.deletes).toBe(1);
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({ lifecycleStatus: 'deleted' });
    expect(await prisma.redemption.findUnique({ where: { redemptionId: resolved.redemptionId } })).toMatchObject({ remoteStatus: 'UNFULFILLED', syncStatus: 'operator_resolved' });
    expect(await prisma.outbox.findUnique({ where: { id: resolved.outbox.id } })).toMatchObject({ status: 'resolved_manual' });
  });

  it('PG26-08: a resolution recorded after the guard read refuses the DELETE (the re-list must follow the resolution)', async () => {
    const { queue, deletion } = await seedDeletingQueue();
    const late = await seedRedemption(queue, { task: { status: 'unknown', attempts: 6, lastError: 'attempts_exhausted' } });
    await repository.resolveUnknownFinancialOperation(late.outbox.id, 'operator-1');
    await prisma.outbox.update({ where: { id: deletion.id }, data: { nextAttemptAt: now } });
    const claimed = await repository.claimNextRewardOperation({ now });

    // The worker saw no settled task before its re-list, so the resolution is not covered by that read.
    expect(await repository.prepareRewardDelete(claimed.id, claimed.leaseToken)).toBe(false);
    expect(await repository.prepareRewardDelete(claimed.id, claimed.leaseToken, { settledManualTaskIds: ['00000000-0000-4000-8000-000000000000'] })).toBe(false);
    expect(await repository.prepareRewardDelete(claimed.id, claimed.leaseToken, { settledManualTaskIds: [late.outbox.id] })).toBe(true);
  });

  it('F18 (PG36-09 subset): re-deleting an open queue after a cancelled deletion reuses the single reward.delete row', async () => {
    const created = await repository.createQueue({ slug: `f18-${randomUUID().slice(0, 8)}`, title: 'Re-delete', cost: 3 });
    const queue = await prisma.queue.update({ where: { id: created.id }, data: { rewardId: `reward-${randomUUID()}`, rewardOrigin: 'bot_created', remoteSyncStatus: 'synced', isOpen: true } });
    const cancelled = await prisma.outbox.create({ data: {
      operationType: 'reward.delete', entityType: 'queue', entityId: queue.id, idempotencyKey: `queue:${queue.id}:reward.delete`,
      payload: { requestMayHaveReachedTwitch: true, safeToDelete: true }, status: 'cancelled', lastError: 'queue_deletion_cancelled_by_operator', attempts: 2,
    } });
    const service = createQueueDomainService({ repository, getTwitch: () => null });
    await service.deleteQueue({ queueId: queue.id, actorId: 'operator-1' });
    const pause = await repository.claimNextRewardOperation({ now });
    expect(pause).toMatchObject({ operationType: 'reward.set_open', payload: { deleteAfterConfirm: true } });

    await expect(repository.confirmRewardOpen(pause.id, { isOpen: false }, pause.leaseToken)).resolves.toBe(true);

    const rows = await prisma.outbox.findMany({ where: { entityId: queue.id, operationType: 'reward.delete' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: cancelled.id, status: 'pending', lastError: null, payload: { requestMayHaveReachedTwitch: false, safeToDelete: false, previousCancelledAttempt: { attempts: 2, requestMayHaveReachedTwitch: true, safeToDelete: true } } });
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({ lifecycleStatus: 'deleting', remoteSyncStatus: 'delete_pending' });
  });

  it('F18 fail closed (PG36-09b subset): an unexpected live reward.delete row rolls back the pause confirmation', async () => {
    const created = await repository.createQueue({ slug: `f18b-${randomUUID().slice(0, 8)}`, title: 'Fail closed', cost: 3 });
    const queue = await prisma.queue.update({ where: { id: created.id }, data: { rewardId: `reward-${randomUUID()}`, rewardOrigin: 'bot_created', remoteSyncStatus: 'synced', isOpen: true } });
    const unexpected = await prisma.outbox.create({ data: {
      operationType: 'reward.delete', entityType: 'queue', entityId: queue.id, idempotencyKey: `queue:${queue.id}:reward.delete`,
      payload: { marker: 'keep' }, status: 'unknown', lastError: 'queue_delete_result_unknown',
    } });
    await createQueueDomainService({ repository, getTwitch: () => null }).deleteQueue({ queueId: queue.id, actorId: 'operator-1' });
    const pause = await repository.claimNextRewardOperation({ now });

    await expect(repository.confirmRewardOpen(pause.id, { isOpen: false }, pause.leaseToken)).rejects.toMatchObject({ code: 'QUEUE_DELETION_NOT_READY' });

    expect(await prisma.outbox.findUnique({ where: { id: pause.id } })).toMatchObject({ status: 'processing', leaseToken: pause.leaseToken });
    expect(await prisma.outbox.findUnique({ where: { id: unexpected.id } })).toMatchObject({ status: 'unknown', payload: { marker: 'keep' } });
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({ remoteSyncStatus: 'pending_close' });
  });

  it('audit allowlist of the FT-26 events (no viewer data, enumerated keys only)', async () => {
    const allowlist = {
      'queue.deletion_blocked': ['blockedCount', 'pendingCount'],
      'queue.deletion_resumed': ['resolvedBy'],
      'financial.manual_resolution_contradicted': ['operationType', 'attempts', 'cycleStartAttempts'],
      'financial.operation_rearmed_after_reauthorization': ['operationType', 'attempts', 'cycleStartAttempts'],
    };
    const rows = await prisma.auditLog.findMany({ where: { event: { in: Object.keys(allowlist) } } });
    expect(new Set(rows.map(({ event }) => event))).toEqual(new Set(Object.keys(allowlist)));
    for (const row of rows) {
      const keys = Object.keys(row.safeDetail ?? {});
      expect(keys.every((key) => allowlist[row.event].includes(key)), `${row.event}: ${keys}`).toBe(true);
      for (const key of keys) expect(key).not.toMatch(FORBIDDEN_DETAIL_KEY);
    }
  });
});
