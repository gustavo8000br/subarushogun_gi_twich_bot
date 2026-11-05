// OPS-22 FT-36 (#100), group G3 of the `@qa` plan: "cancel deletion" hardened on an ISOLATED PostgreSQL with the real
// migrations (never SQLite, never Prisma mocks, never an active volume). Races use two real connections and a barrier,
// never a sleep. Time is injected; Twitch is a fake that records every read and every write.
import { readFile } from 'node:fs/promises';
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
import { createQueueDomainService } from '../../apps/api/src/domain/queue-service.mjs';
import { createFinancialOutboxWorker } from '../../apps/api/src/outbox/financial-worker.mjs';
import { createRewardOutboxWorker } from '../../apps/api/src/outbox/reward-worker.mjs';
import { getQueueDeletionProjection } from '../../apps/shared/panel/queue-action-state.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const migrationDir = new URL('../../apps/api/prisma/migrations/20261014230000_outbox_deletion_cancel_verification/', import.meta.url);
const containerName = `queuebot-del-cancel-${process.pid}-${randomUUID().slice(0, 8)}`;
const RACE_ROUNDS = 50;
const FORBIDDEN_DETAIL_KEY = /user|login|name|token|header|input|body|uid/i;
const AUDIT_ALLOWLIST = {
  'queue.deletion_cancel_verification_requested': ['rewardId', 'operationId', 'operationType', 'deletionState', 'blockReason', 'requestMayHaveReachedTwitch', 'safeToDelete'],
  'queue.deletion_cancelled': ['rewardId', 'operationId', 'remoteSyncStatus', 'isPaused', 'cancelledTasks', 'financialTasksLeftRunning'],
  'queue.deletion_cancellation_not_confirmed': ['rewardId', 'operationId', 'restored', 'previousStatus'],
};

let connectionString;
let prisma;
let otherPrisma;
let repository;
let otherRepository;
let now = new Date('2030-01-01T12:00:00.000Z');
const clock = () => now;

function docker(args, options = {}) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 30_000, ...options });
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
async function seedDeletingQueue({ deleteStatus = 'pending', deleteLastError = null, deletePayload = { requestMayHaveReachedTwitch: false, safeToDelete: false }, nextAttemptAt = now, remoteSyncStatus = 'delete_pending' } = {}) {
  const created = await repository.createQueue({ slug: `cx-${randomUUID().slice(0, 8)}`, title: 'Cancel deletion', cost: 9 });
  const queue = await prisma.queue.update({ where: { id: created.id }, data: {
    rewardId: `reward-${randomUUID()}`, rewardOrigin: 'bot_created', queueMode: 'channel_points', lifecycleStatus: 'deleting',
    isArchived: true, isOpen: false, remoteSyncStatus,
  } });
  const deletion = deleteStatus ? await prisma.outbox.create({ data: {
    operationType: 'reward.delete', entityType: 'queue', entityId: queue.id, idempotencyKey: `queue:${queue.id}:reward.delete`,
    payload: deletePayload, status: deleteStatus, lastError: deleteLastError, nextAttemptAt,
  } }) : null;
  return { queue, deletion };
}

/** A queue whose deletion is still at the pause stage, with the pause task in `pauseStatus` and no `reward.delete`. */
async function seedPauseStage({ pauseStatus = 'unknown', remoteSyncStatus = 'close_unknown', lastError = 'reward_open_result_unknown' } = {}) {
  const { queue } = await seedDeletingQueue({ deleteStatus: null, remoteSyncStatus });
  const pause = await prisma.outbox.create({ data: {
    operationType: 'reward.set_open', entityType: 'queue', entityId: queue.id, idempotencyKey: `queue:${queue.id}:reward.delete.pause:${queue.version}`,
    payload: { isOpen: false, queueVersion: queue.version, deleteAfterConfirm: true, requestMayHaveReachedTwitch: true }, status: pauseStatus, lastError,
  } });
  return { queue, pause };
}

/** One redemption of the queue's reward, optionally with its local financial task and a removed entry. */
async function seedRedemption(queue, { remoteStatus = 'UNFULFILLED', expectedStatus = 'CANCELED', syncStatus = 'pending', task = null, entry = false } = {}) {
  const redemptionId = `red-${randomUUID()}`;
  await prisma.redemption.create({ data: {
    redemptionId, broadcasterId: 'broadcaster', rewardId: queue.rewardId, userId: `viewer-${randomUUID().slice(0, 8)}`, queueId: queue.id,
    redeemedAt: now, remoteStatus, expectedStatus, syncStatus,
  } });
  const removed = entry ? await prisma.entry.create({ data: {
    queueId: queue.id, twitchUserId: `viewer-${randomUUID().slice(0, 8)}`, userLogin: 'synthetic_viewer', displayName: 'Synthetic Viewer',
    source: 'redemption', redemptionId, status: 'removed', terminalReason: 'queue_deleted', finishedAt: now, position: null,
  } }) : null;
  const outbox = task ? await prisma.outbox.create({ data: {
    operationType: task.operationType ?? 'redemption.cancel', entityType: 'redemption', entityId: redemptionId,
    idempotencyKey: `financial:${redemptionId}`, redemptionId, status: task.status ?? 'pending', attempts: task.attempts ?? 0,
    lastError: task.lastError ?? null, payload: task.payload ?? {}, nextAttemptAt: task.nextAttemptAt ?? now,
  } }) : null;
  return { redemptionId, outbox, entry: removed };
}

/** Fake Twitch: one managed reward (exists/paused are mutable), redemptions, and a log of every write. */
function fakeTwitch(queue, { paused = true } = {}) {
  const state = { rewardExists: true, paused, rewardError: null, reads: 0, writes: [], remote: new Map(), onRead: null };
  const reward = () => ({
    id: queue.rewardId, title: queue.title, cost: queue.cost, prompt: queue.rewardPrompt ?? '', isPaused: state.paused, isEnabled: true,
    userInputRequired: queue.uidMode === 'visible', autoFulfill: false, shouldRedemptionsSkipRequestQueue: false,
    maxRedemptionsPerStream: queue.maxRedemptionsPerStream ?? null, maxRedemptionsPerUserPerStream: queue.maxRedemptionsPerUserPerStream ?? null,
    globalCooldown: queue.globalCooldownSeconds ?? null,
  });
  return {
    state,
    async getReward(rewardId) {
      state.reads += 1;
      if (state.onRead) await state.onRead();
      if (state.rewardError) throw state.rewardError;
      return state.rewardExists && rewardId === queue.rewardId ? reward() : null;
    },
    async setRewardOpen(rewardId, isOpen) {
      state.writes.push({ op: 'setRewardOpen', isOpen });
      if (!state.rewardExists || rewardId !== queue.rewardId) throw twurpleHttpError(404, 'Not Found');
      state.paused = !isOpen;
      return reward();
    },
    async deleteReward() { state.writes.push({ op: 'deleteReward' }); state.rewardExists = false; },
    async updateReward() { state.writes.push({ op: 'updateReward' }); return reward(); },
    async listUnfulfilledRedemptions() { return []; },
    async getRedemptionStatus(redemptionId) { return state.remote.get(redemptionId) ?? 'UNFULFILLED'; },
    async setRedemptionStatus(redemptionId, status) { state.writes.push({ op: 'setRedemptionStatus', status }); state.remote.set(redemptionId, status); return { status }; },
  };
}

function serviceFor(twitch, repo = repository) {
  return createQueueDomainService({ repository: repo, getTwitch: () => twitch });
}

function rewardWorker(twitch) {
  return createRewardOutboxWorker({ repository, twitch, clock, random: () => 0 });
}

async function auditRows(queueId, event) {
  return prisma.auditLog.findMany({ where: { queueId, ...(event ? { event } : {}) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
}

/** Snapshot of everything the cancel must never touch: redemptions, financial tasks and entries of the queue. */
async function financialSnapshot(queueId) {
  const [redemptions, tasks, entries] = await Promise.all([
    prisma.redemption.findMany({ where: { queueId }, select: { redemptionId: true, remoteStatus: true, syncStatus: true, expectedStatus: true }, orderBy: { redemptionId: 'asc' } }),
    prisma.outbox.findMany({ where: { operationType: { in: ['redemption.cancel', 'redemption.fulfill'] }, redemption: { queueId } }, select: { id: true, status: true, attempts: true, lastError: true, nextAttemptAt: true }, orderBy: { id: 'asc' } }),
    prisma.entry.findMany({ where: { queueId }, select: { id: true, status: true, terminalReason: true, version: true }, orderBy: { id: 'asc' } }),
  ]);
  return { redemptions, tasks, entries };
}

async function expectUnchanged(queue, rows, label) {
  expect(await prisma.queue.findUnique({ where: { id: queue.id } }), label).toMatchObject({
    lifecycleStatus: queue.lifecycleStatus, remoteSyncStatus: queue.remoteSyncStatus, version: queue.version, isOpen: queue.isOpen, isArchived: queue.isArchived,
  });
  for (const row of rows) {
    expect(await prisma.outbox.findUnique({ where: { id: row.id } }), label).toMatchObject({ status: row.status, lastError: row.lastError, payload: row.payload });
  }
  expect(await auditRows(queue.id), label).toEqual([]);
}

describe('OPS-22 FT-36 cancel deletion on isolated PostgreSQL', () => {
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
    await prisma.outbox.updateMany({ where: { status: { in: ['pending', 'retry', 'processing'] } }, data: { status: 'cancelled', leaseToken: null, leaseUntil: null } });
    now = new Date(now.getTime() + 86_400_000);
  });

  it('PG36-01 (T36-1): a pending delete is cancelled on a paused read; the queue returns active, archived, closed and synced', async () => {
    const { queue, deletion } = await seedDeletingQueue();
    const twitch = fakeTwitch(queue);

    await expect(serviceFor(twitch).cancelQueueDeletion({ queueId: queue.id, actorId: 'operator-1' })).resolves.toMatchObject({ status: 'cancelled' });

    expect(twitch.state.writes).toEqual([]);
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({ lifecycleStatus: 'active', isArchived: true, isOpen: false, remoteSyncStatus: 'synced', version: queue.version + 1 });
    const row = await prisma.outbox.findUnique({ where: { id: deletion.id } });
    expect(row).toMatchObject({ status: 'cancelled', lastError: 'queue_deletion_cancelled_by_operator', leaseToken: null });
    expect(row.payload).toEqual({ requestMayHaveReachedTwitch: false, safeToDelete: false });
    expect((await auditRows(queue.id)).map(({ event, previousState, nextState }) => [event, previousState, nextState])).toEqual([
      ['queue.deletion_cancel_verification_requested', 'pending', 'cancel_verification'],
      ['queue.deletion_cancelled', 'deleting', 'active_closed_archived'],
    ]);
  });

  it('PG36-01 5xx variant (F20): a non-conclusive read restores the previous status and its schedule, never unknown', async () => {
    for (const previous of ['pending', 'retry', 'failed']) {
      const { queue, deletion } = await seedDeletingQueue({ deleteStatus: previous, deleteLastError: 'queue_deletion_waiting_for_refunds', nextAttemptAt: minutesFromNow(5) });
      const twitch = fakeTwitch(queue);
      twitch.state.rewardError = twurpleHttpError(500, 'Internal Server Error');

      await expect(serviceFor(twitch).cancelQueueDeletion({ queueId: queue.id, actorId: 'operator-1' }), previous)
        .resolves.toMatchObject({ status: 'not_cancelled', reason: 'queue_deletion_cancel_verification_unavailable', queue: { lifecycleStatus: 'deleting' } });

      const row = await prisma.outbox.findUnique({ where: { id: deletion.id } });
      expect(row, previous).toMatchObject({ status: previous, lastError: 'queue_deletion_cancel_verification_unavailable', nextAttemptAt: minutesFromNow(5), leaseToken: null });
      expect(row.payload, previous).toEqual({ requestMayHaveReachedTwitch: false, safeToDelete: false });
      expect(await prisma.queue.findUnique({ where: { id: queue.id } }), previous).toMatchObject({ lifecycleStatus: 'deleting', remoteSyncStatus: 'delete_pending', version: queue.version });
      expect(await auditRows(queue.id, 'queue.deletion_cancellation_not_confirmed'), previous).toMatchObject([{
        actorId: 'operator-1', origin: 'panel', previousState: 'cancel_verification', nextState: previous, reason: 'queue_deletion_cancel_verification_unavailable',
        safeDetail: { rewardId: queue.rewardId, operationId: deletion.id, restored: true, previousStatus: previous },
      }]);
    }
  });

  it('PG36-01 401 variant (C-2): a 401 read restores the worker marker, keeps blockReason authorization_required and the re-arm selects the task', async () => {
    const { queue, deletion } = await seedDeletingQueue({ deleteStatus: 'retry', deleteLastError: 'queue_deletion_waiting_for_refunds', nextAttemptAt: minutesFromNow(5) });
    const twitch = fakeTwitch(queue);
    twitch.state.rewardError = twurpleHttpError(401, 'Unauthorized');

    await expect(serviceFor(twitch).cancelQueueDeletion({ queueId: queue.id, actorId: 'operator-1' }))
      .resolves.toMatchObject({ status: 'not_cancelled', reason: 'authorization_required' });

    expect(await prisma.outbox.findUnique({ where: { id: deletion.id } })).toMatchObject({ status: 'retry', lastError: 'twitch_authorization_required', leaseToken: null });
    expect(await getQueueDeletionProjection(queue, (await repository.getQueueDeletionFacts([queue.id])).get(queue.id)))
      .toMatchObject({ deletionState: 'blocked', blockReason: 'authorization_required' });
    expect(await auditRows(queue.id, 'queue.deletion_cancellation_not_confirmed')).toMatchObject([{ reason: 'authorization_required', nextState: 'retry' }]);

    now = minutesFromNow(1);
    await expect(repository.rearmAuthorizationBlockedOperations()).resolves.toMatchObject({ reward: 1 });
    expect(await prisma.outbox.findUnique({ where: { id: deletion.id } })).toMatchObject({ status: 'retry', nextAttemptAt: now, lastError: null });
  });

  it('PG36-02 (T36-2): a delete blocked by review is cancelled; the financial unknown task is untouched and still listed', async () => {
    const { queue, deletion } = await seedDeletingQueue({ deleteStatus: 'retry', deleteLastError: 'queue_deletion_blocked_by_review', nextAttemptAt: minutesFromNow(5) });
    const blocked = await seedRedemption(queue, { task: { status: 'unknown', attempts: 6, lastError: 'attempts_exhausted' }, entry: true });
    const before = await financialSnapshot(queue.id);
    expect(await getQueueDeletionProjection(queue, (await repository.getQueueDeletionFacts([queue.id])).get(queue.id)))
      .toMatchObject({ deletionState: 'blocked', blockReason: 'financial_review_required', canCancelDeletion: true });

    await expect(serviceFor(fakeTwitch(queue)).cancelQueueDeletion({ queueId: queue.id, actorId: 'operator-1' })).resolves.toMatchObject({ status: 'cancelled' });

    expect(await financialSnapshot(queue.id)).toEqual(before);
    expect((await repository.listFinancialOperations()).find(({ id }) => id === blocked.outbox.id)).toMatchObject({ status: 'unknown', lastError: 'attempts_exhausted' });
    expect(await prisma.outbox.findUnique({ where: { id: deletion.id } })).toMatchObject({ status: 'cancelled' });
    expect(await auditRows(queue.id, 'queue.deletion_cancel_verification_requested')).toMatchObject([{
      previousState: 'retry', safeDetail: { operationType: 'reward.delete', deletionState: 'blocked', blockReason: 'financial_review_required' },
    }]);
    expect(await auditRows(queue.id, 'queue.deletion_cancelled')).toMatchObject([{ actorId: 'operator-1', safeDetail: { cancelledTasks: 1, financialTasksLeftRunning: 0 } }]);
  });

  it('PG36-03 (T36-3): a processing reward task (live or expired lease) refuses with 409, nothing changes and no audit row', async () => {
    for (const leaseUntil of [minutesFromNow(1), minutesFromNow(-1)]) {
      const { queue, deletion } = await seedDeletingQueue();
      const processing = await prisma.outbox.update({ where: { id: deletion.id }, data: { status: 'processing', leaseToken: randomUUID(), leaseUntil } });
      const twitch = fakeTwitch(queue);
      await expect(serviceFor(twitch).cancelQueueDeletion({ queueId: queue.id, actorId: 'operator-1' })).rejects.toMatchObject({ code: 'QUEUE_REWARD_OPERATION_PROCESSING' });
      expect(twitch.state.reads).toBe(0);
      await expectUnchanged(queue, [processing], `lease ${leaseUntil.toISOString()}`);
      expect(await prisma.outbox.findUnique({ where: { id: deletion.id } })).toMatchObject({ leaseToken: processing.leaseToken });
    }
  });

  it(`PG36-04 (T36-4): claim vs begin, two connections and a barrier, ${RACE_ROUNDS} rounds: exactly one wins, never both`, async () => {
    const wins = { claim: 0, begin: 0 };
    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const { queue, deletion } = await seedDeletingQueue();
      const wait = barrier(2);
      const [claimed, begun] = await Promise.allSettled([
        (async () => { await wait(); return repository.claimNextRewardOperation({ now }); })(),
        (async () => { await wait(); return otherRepository.beginQueueDeletionCancellation({ queueId: queue.id, actorId: 'operator-race' }); })(),
      ]);
      expect(claimed.status, `round ${round}`).toBe('fulfilled');
      const row = await prisma.outbox.findUnique({ where: { id: deletion.id } });
      const requested = await auditRows(queue.id, 'queue.deletion_cancel_verification_requested');
      if (claimed.value) {
        wins.claim += 1;
        expect(claimed.value.id, `round ${round}`).toBe(deletion.id);
        expect(begun, `round ${round}`).toMatchObject({ status: 'rejected', reason: { code: 'QUEUE_REWARD_OPERATION_PROCESSING' } });
        expect(row.status, `round ${round}`).toBe('processing');
        expect(requested, `round ${round}`).toEqual([]);
      } else {
        wins.begin += 1;
        expect(begun, `round ${round}`).toMatchObject({ status: 'fulfilled', value: { status: 'verification_required', operationId: deletion.id } });
        expect(row.status, `round ${round}`).toBe('cancel_verification');
        expect(requested, `round ${round}`).toHaveLength(1);
      }
      // Invariant read back from the database: never `processing` together with a cancel_verification audit row.
      expect(row.status === 'processing' && requested.length > 0, `round ${round}`).toBe(false);
      await prisma.outbox.update({ where: { id: deletion.id }, data: { status: 'cancelled', leaseToken: null, leaseUntil: null } });
    }
    expect(wins.claim + wins.begin).toBe(RACE_ROUNDS);
  });

  it('PG36-05 (T36-5, Orion decision): with requestMayHaveReachedTwitch a positive read cancels; inconclusive or negative reads refuse with 409', async () => {
    const possiblySent = { requestMayHaveReachedTwitch: true, safeToDelete: true };
    const positive = await seedDeletingQueue({ deleteStatus: 'retry', deleteLastError: 'queue_delete_response_unknown', deletePayload: possiblySent });
    await expect(serviceFor(fakeTwitch(positive.queue)).cancelQueueDeletion({ queueId: positive.queue.id, actorId: 'operator-1' })).resolves.toMatchObject({ status: 'cancelled' });
    expect(await prisma.outbox.findUnique({ where: { id: positive.deletion.id } })).toMatchObject({ status: 'cancelled', payload: possiblySent });

    const cases = [
      ['503', (twitch) => { twitch.state.rewardError = twurpleHttpError(503, 'Service Unavailable'); }, 'retry', 'queue_deletion_cancel_verification_unavailable', true],
      ['401', (twitch) => { twitch.state.rewardError = twurpleHttpError(401, 'Unauthorized'); }, 'retry', 'authorization_required', true],
      ['absent', (twitch) => { twitch.state.rewardExists = false; }, 'unknown', 'queue_delete_reward_absent', false],
      ['not paused', (twitch) => { twitch.state.paused = false; }, 'unknown', 'queue_delete_cancel_reward_not_paused', false],
    ];
    for (const [name, arrange, nextStatus, reason, restored] of cases) {
      const { queue, deletion } = await seedDeletingQueue({ deleteStatus: 'retry', deleteLastError: 'queue_delete_response_unknown', deletePayload: possiblySent, nextAttemptAt: minutesFromNow(5) });
      const twitch = fakeTwitch(queue);
      arrange(twitch);
      await expect(serviceFor(twitch).cancelQueueDeletion({ queueId: queue.id, actorId: 'operator-1' }), name).rejects.toMatchObject({ code: 'QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED' });
      expect(await prisma.outbox.findUnique({ where: { id: deletion.id } }), name).toMatchObject({ status: nextStatus, lastError: reason === 'authorization_required' ? 'twitch_authorization_required' : reason, payload: possiblySent });
      expect(await prisma.queue.findUnique({ where: { id: queue.id } }), name).toMatchObject({ lifecycleStatus: 'deleting', isOpen: false });
      expect(await auditRows(queue.id, 'queue.deletion_cancellation_not_confirmed'), name).toMatchObject([{ actorId: 'operator-1', nextState: nextStatus, reason, safeDetail: { restored, previousStatus: 'retry' } }]);
      expect(await auditRows(queue.id, 'queue.deletion_cancelled'), name).toEqual([]);
    }
  });

  it('PG36-06 (T36-6): a deleted queue refuses with 409 ALREADY_COMPLETED and a pause still in progress with 409 PAUSE_IN_PROGRESS; nothing changes', async () => {
    const { queue, deletion } = await seedDeletingQueue({ deleteStatus: 'confirmed' });
    const deleted = await prisma.queue.update({ where: { id: queue.id }, data: { lifecycleStatus: 'deleted', deletedAt: now } });
    await expect(serviceFor(fakeTwitch(queue)).cancelQueueDeletion({ queueId: queue.id, actorId: 'operator-1' })).rejects.toMatchObject({ code: 'QUEUE_DELETION_ALREADY_COMPLETED' });
    await expectUnchanged(deleted, [deletion], 'deleted');

    for (const pauseStatus of ['pending', 'retry']) {
      const stage = await seedPauseStage({ pauseStatus, remoteSyncStatus: 'pending_close', lastError: pauseStatus === 'retry' ? 'reward_open_lookup_failed' : null });
      const twitch = fakeTwitch(stage.queue);
      await expect(serviceFor(twitch).cancelQueueDeletion({ queueId: stage.queue.id, actorId: 'operator-1' }), pauseStatus).rejects.toMatchObject({ code: 'QUEUE_DELETION_PAUSE_IN_PROGRESS' });
      expect(twitch.state.reads, pauseStatus).toBe(0);
      await expectUnchanged(stage.queue, [stage.pause], pauseStatus);
    }

    const manual = await seedDeletingQueue();
    const converted = await prisma.queue.update({ where: { id: manual.queue.id }, data: { queueMode: 'manual_only', remoteSyncStatus: 'local_only' } });
    await expect(serviceFor(fakeTwitch(converted)).cancelQueueDeletion({ queueId: converted.id, actorId: 'operator-1' })).rejects.toMatchObject({ code: 'QUEUE_DELETION_NOT_PENDING' });
    await expectUnchanged(converted, [manual.deletion], 'converted (D-36-8)');
  });

  it('PG36-07 (T36-7): a crash after begin leaves cancel_verification; a fresh request resumes, executes once and audits begin once', async () => {
    const { queue, deletion } = await seedDeletingQueue({ deleteStatus: 'unknown', deleteLastError: 'queue_delete_result_unknown' });
    await expect(repository.beginQueueDeletionCancellation({ queueId: queue.id, actorId: 'operator-1', origin: 'panel' })).resolves.toMatchObject({ status: 'verification_required', previousStatus: 'unknown' });
    const reserved = await prisma.outbox.findUnique({ where: { id: deletion.id } });
    expect(reserved).toMatchObject({ status: 'cancel_verification', payload: { cancelVerification: { previousStatus: 'unknown', previousLastError: 'queue_delete_result_unknown', requestedAt: now.toISOString() } } });
    expect(await getQueueDeletionProjection(queue, (await repository.getQueueDeletionFacts([queue.id])).get(queue.id))).toMatchObject({ canCancelDeletion: true, cancellationInProgress: true });

    const twitch = fakeTwitch(queue);
    await expect(serviceFor(twitch).cancelQueueDeletion({ queueId: queue.id, actorId: 'operator-1' })).resolves.toMatchObject({ status: 'cancelled' });
    await expect(serviceFor(twitch).cancelQueueDeletion({ queueId: queue.id, actorId: 'operator-1' })).rejects.toMatchObject({ code: 'QUEUE_DELETION_NOT_PENDING' });

    expect(twitch.state.reads).toBe(1);
    expect(await auditRows(queue.id, 'queue.deletion_cancel_verification_requested')).toHaveLength(1);
    expect(await auditRows(queue.id, 'queue.deletion_cancelled')).toHaveLength(1);
    expect((await prisma.outbox.findUnique({ where: { id: deletion.id } })).payload).not.toHaveProperty('cancelVerification');
  });

  it('PG36-08 (T36-8, I2/I3): a pending refund keeps running after the cancel and is confirmed; entries stay removed; nothing is deleted', async () => {
    const { queue, deletion } = await seedDeletingQueue({ deleteStatus: 'retry', deleteLastError: 'queue_deletion_waiting_for_refunds', nextAttemptAt: minutesFromNow(1) });
    const running = await seedRedemption(queue, { task: { status: 'pending' }, entry: true });
    const settled = await seedRedemption(queue, { remoteStatus: 'CANCELED', syncStatus: 'confirmed', task: { status: 'confirmed' }, entry: true });
    const before = await financialSnapshot(queue.id);
    const counts = async () => ({ redemptions: await prisma.redemption.count(), outbox: await prisma.outbox.count(), entries: await prisma.entry.count(), audit: await prisma.auditLog.count() });
    const countsBefore = await counts();
    const twitch = fakeTwitch(queue);

    await expect(serviceFor(twitch).cancelQueueDeletion({ queueId: queue.id, actorId: 'operator-1' })).resolves.toMatchObject({ status: 'cancelled' });

    expect(await financialSnapshot(queue.id)).toEqual(before);
    expect(await counts()).toEqual({ ...countsBefore, audit: countsBefore.audit + 2 });
    expect(await auditRows(queue.id, 'queue.deletion_cancelled')).toMatchObject([{ safeDetail: { financialTasksLeftRunning: 1 } }]);

    await expect(createFinancialOutboxWorker({ repository, twitch, clock, random: () => 0.5 }).processOne()).resolves.toBeTruthy();
    expect(await prisma.outbox.findUnique({ where: { id: running.outbox.id } })).toMatchObject({ status: 'confirmed' });
    expect(await prisma.redemption.findUnique({ where: { redemptionId: running.redemptionId } })).toMatchObject({ remoteStatus: 'CANCELED', syncStatus: 'confirmed' });
    expect(await prisma.outbox.findUnique({ where: { id: settled.outbox.id } })).toMatchObject({ status: 'confirmed' });
    for (const { entry } of [running, settled]) expect(await prisma.entry.findUnique({ where: { id: entry.id } })).toMatchObject({ status: 'removed', terminalReason: 'queue_deleted' });
    // I7: the refund confirmation of a reopened queue never revives the cancelled deletion.
    expect(await prisma.outbox.findUnique({ where: { id: deletion.id } })).toMatchObject({ status: 'cancelled', nextAttemptAt: minutesFromNow(1) });
  });

  it('PG36-09 (T36-9, F18): open queue, delete, cancel, show and open, delete again: one reward.delete row, a new pause key, the old pause kept', async () => {
    const created = await repository.createQueue({ slug: `f18full-${randomUUID().slice(0, 8)}`, title: 'Full cycle', cost: 4 });
    const queue = await prisma.queue.update({ where: { id: created.id }, data: { rewardId: `reward-${randomUUID()}`, rewardOrigin: 'bot_created', remoteSyncStatus: 'synced', isOpen: true } });
    const twitch = fakeTwitch(queue, { paused: false });
    const worker = rewardWorker(twitch);
    const service = serviceFor(twitch);

    await service.deleteQueue({ queueId: queue.id, actorId: 'operator-1' });
    await expect(worker.processOne()).resolves.toBe('confirmed');
    const firstPause = await prisma.outbox.findFirst({ where: { entityId: queue.id, operationType: 'reward.set_open' } });
    const deletion = await prisma.outbox.findUnique({ where: { idempotencyKey: `queue:${queue.id}:reward.delete` } });
    expect(firstPause).toMatchObject({ status: 'confirmed', idempotencyKey: `queue:${queue.id}:reward.delete.pause:${queue.version + 1}` });
    expect(deletion).toMatchObject({ status: 'pending' });

    await expect(service.cancelQueueDeletion({ queueId: queue.id, actorId: 'operator-1' })).resolves.toMatchObject({ status: 'cancelled' });
    await repository.unarchiveQueue({ queueId: queue.id, actorId: 'operator-1' });
    await repository.setQueueOpen(queue.id, true, 'operator-1');
    await expect(worker.processOne()).resolves.toBe('confirmed');
    expect(twitch.state.paused).toBe(false);
    const reopened = await prisma.queue.findUnique({ where: { id: queue.id } });
    expect(reopened).toMatchObject({ lifecycleStatus: 'active', isArchived: false, isOpen: true, remoteSyncStatus: 'synced' });

    await service.deleteQueue({ queueId: queue.id, actorId: 'operator-1' });
    const secondPause = await prisma.outbox.findFirst({ where: { entityId: queue.id, operationType: 'reward.set_open', payload: { path: ['deleteAfterConfirm'], equals: true }, status: 'pending' } });
    expect(secondPause.idempotencyKey).toBe(`queue:${queue.id}:reward.delete.pause:${reopened.version + 1}`);
    expect(secondPause.idempotencyKey).not.toBe(firstPause.idempotencyKey);
    await expect(worker.processOne()).resolves.toBe('confirmed');

    const deletes = await prisma.outbox.findMany({ where: { entityId: queue.id, operationType: 'reward.delete' } });
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toMatchObject({ id: deletion.id, status: 'pending', lastError: null, payload: { previousCancelledAttempt: { requestMayHaveReachedTwitch: false, safeToDelete: false } } });
    expect(deletes[0].payload).not.toHaveProperty('cancelVerification');
    expect(await prisma.outbox.findUnique({ where: { id: firstPause.id } })).toMatchObject({ status: 'confirmed', idempotencyKey: firstPause.idempotencyKey });
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({ lifecycleStatus: 'deleting', remoteSyncStatus: 'delete_pending', isOpen: false });
  });

  it('PG36-09b (T36-9b): an unexpected live reward.delete row at the pause confirmation fails closed and writes nothing', async () => {
    const created = await repository.createQueue({ slug: `f18bfull-${randomUUID().slice(0, 8)}`, title: 'Fail closed full', cost: 4 });
    const queue = await prisma.queue.update({ where: { id: created.id }, data: { rewardId: `reward-${randomUUID()}`, rewardOrigin: 'bot_created', remoteSyncStatus: 'synced', isOpen: true } });
    for (const [status, lastError] of [['unknown', 'queue_delete_result_unknown'], ['cancelled', 'tombstone_mutation_suppressed']]) {
      await prisma.outbox.deleteMany({ where: { entityId: queue.id } });
      await prisma.queue.update({ where: { id: queue.id }, data: { lifecycleStatus: 'active', isArchived: false, isOpen: true, remoteSyncStatus: 'synced' } });
      const unexpected = await prisma.outbox.create({ data: {
        operationType: 'reward.delete', entityType: 'queue', entityId: queue.id, idempotencyKey: `queue:${queue.id}:reward.delete`, payload: { marker: 'keep' }, status, lastError,
      } });
      await serviceFor(null).deleteQueue({ queueId: queue.id, actorId: 'operator-1' });
      const pause = await repository.claimNextRewardOperation({ now });
      const auditBefore = await prisma.auditLog.count({ where: { queueId: queue.id } });

      await expect(repository.confirmRewardOpen(pause.id, { isOpen: false }, pause.leaseToken), status).rejects.toMatchObject({ code: 'QUEUE_DELETION_NOT_READY' });

      expect(await prisma.outbox.findUnique({ where: { id: pause.id } }), status).toMatchObject({ status: 'processing', leaseToken: pause.leaseToken });
      expect(await prisma.outbox.findUnique({ where: { id: unexpected.id } }), status).toMatchObject({ status, lastError, payload: { marker: 'keep' } });
      expect(await prisma.queue.findUnique({ where: { id: queue.id } }), status).toMatchObject({ remoteSyncStatus: 'pending_close' });
      expect(await prisma.auditLog.count({ where: { queueId: queue.id } }), status).toBe(auditBefore);
      await prisma.outbox.update({ where: { id: pause.id }, data: { status: 'cancelled', leaseToken: null, leaseUntil: null } });
    }
  });

  it('PG36-10 (T36-10, F19): a blocked pause (close_unknown/close_failed) is cancelled on a paused read; not paused restores the pause task', async () => {
    for (const pauseStatus of ['unknown', 'failed']) {
      const { queue, pause } = await seedPauseStage({ pauseStatus, remoteSyncStatus: `close_${pauseStatus}` });
      const earlier = await prisma.outbox.create({ data: {
        operationType: 'reward.delete', entityType: 'queue', entityId: queue.id, idempotencyKey: `queue:${queue.id}:reward.delete`,
        payload: {}, status: 'cancelled', lastError: 'queue_deletion_cancelled_by_operator',
      } });
      expect(await getQueueDeletionProjection(queue, (await repository.getQueueDeletionFacts([queue.id])).get(queue.id)), pauseStatus)
        .toMatchObject({ deletionState: 'blocked', canCancelDeletion: true });

      await expect(serviceFor(fakeTwitch(queue)).cancelQueueDeletion({ queueId: queue.id, actorId: 'operator-1' }), pauseStatus).resolves.toMatchObject({ status: 'cancelled' });

      expect(await prisma.outbox.findUnique({ where: { id: pause.id } }), pauseStatus).toMatchObject({ status: 'cancelled', lastError: 'queue_deletion_cancelled_by_operator' });
      expect(await prisma.outbox.findUnique({ where: { id: earlier.id } }), pauseStatus).toMatchObject({ status: 'cancelled', updatedAt: earlier.updatedAt });
      expect(await prisma.queue.findUnique({ where: { id: queue.id } }), pauseStatus).toMatchObject({ lifecycleStatus: 'active', isArchived: true, isOpen: false, remoteSyncStatus: 'synced' });
      expect(await auditRows(queue.id, 'queue.deletion_cancel_verification_requested'), pauseStatus).toMatchObject([{
        previousState: pauseStatus, safeDetail: { operationId: pause.id, operationType: 'reward.set_open', deletionState: 'blocked', blockReason: 'reward_operation_unconfirmed' },
      }]);
      expect(await auditRows(queue.id, 'queue.deletion_cancelled'), pauseStatus).toMatchObject([{ safeDetail: { operationId: pause.id, cancelledTasks: 1 } }]);
    }

    const notPaused = await seedPauseStage({ pauseStatus: 'unknown' });
    const twitch = fakeTwitch(notPaused.queue, { paused: false });
    await expect(serviceFor(twitch).cancelQueueDeletion({ queueId: notPaused.queue.id, actorId: 'operator-1' }))
      .resolves.toMatchObject({ status: 'not_cancelled', reason: 'queue_delete_cancel_reward_not_paused' });
    expect(await prisma.outbox.findUnique({ where: { id: notPaused.pause.id } })).toMatchObject({ status: 'unknown', lastError: 'queue_delete_cancel_reward_not_paused' });
    expect(await prisma.outbox.count({ where: { entityId: notPaused.queue.id, operationType: 'reward.delete' } })).toBe(0);
    expect(await prisma.queue.findUnique({ where: { id: notPaused.queue.id } })).toMatchObject({ lifecycleStatus: 'deleting', remoteSyncStatus: 'close_unknown' });
    expect(await auditRows(notPaused.queue.id, 'queue.deletion_cancellation_not_confirmed')).toMatchObject([{ nextState: 'unknown', safeDetail: { restored: true, previousStatus: 'unknown' } }]);
    expect(twitch.state.writes).toEqual([]);

    // The pause task's own `requestMayHaveReachedTwitch` refers to the PAUSE write, never to a DELETE: no 409 here.
    const pauseUnreadable = await seedPauseStage({ pauseStatus: 'failed', remoteSyncStatus: 'close_failed' });
    const unreadable = fakeTwitch(pauseUnreadable.queue);
    unreadable.state.rewardError = twurpleHttpError(503, 'Service Unavailable');
    await expect(serviceFor(unreadable).cancelQueueDeletion({ queueId: pauseUnreadable.queue.id, actorId: 'operator-1' }))
      .resolves.toMatchObject({ status: 'not_cancelled', reason: 'queue_deletion_cancel_verification_unavailable' });
    expect(await prisma.outbox.findUnique({ where: { id: pauseUnreadable.pause.id } })).toMatchObject({ status: 'failed', payload: { requestMayHaveReachedTwitch: true } });
  });

  it('PG36-11 (T36-11, I7): the FT-26 auto-resume ignores a delete in cancel_verification and after a real cancel', async () => {
    const { queue, deletion } = await seedDeletingQueue({ deleteStatus: 'retry', deleteLastError: 'queue_deletion_waiting_for_refunds', nextAttemptAt: minutesFromNow(5) });
    const refund = await seedRedemption(queue, { task: { status: 'pending' } });
    await repository.beginQueueDeletionCancellation({ queueId: queue.id, actorId: 'operator-1' });
    const claim = await repository.claimNext({ now });
    expect(claim.id).toBe(refund.outbox.id);
    expect(await repository.confirm(claim.id, 'CANCELED', claim.leaseToken)).toBe(true);
    expect(await prisma.outbox.findUnique({ where: { id: deletion.id } })).toMatchObject({ status: 'cancel_verification', nextAttemptAt: minutesFromNow(5) });
    expect(await auditRows(queue.id, 'queue.deletion_resumed')).toEqual([]);

    await expect(serviceFor(fakeTwitch(queue)).cancelQueueDeletion({ queueId: queue.id, actorId: 'operator-1' })).resolves.toMatchObject({ status: 'cancelled' });
    expect(await repository.claimNextRewardOperation({ now: minutesFromNow(60) })).toBeNull();
  });

  it('PG36-12 (T36-12): a queue version change during the read gives 409 STALE and restores the previous status', async () => {
    for (const previous of ['pending', 'retry']) {
      const { queue, deletion } = await seedDeletingQueue({ deleteStatus: previous, deleteLastError: 'queue_deletion_waiting_for_refunds', nextAttemptAt: minutesFromNow(5) });
      const twitch = fakeTwitch(queue);
      twitch.state.onRead = async () => { await otherPrisma.queue.update({ where: { id: queue.id }, data: { version: { increment: 1 } } }); };

      await expect(serviceFor(twitch).cancelQueueDeletion({ queueId: queue.id, actorId: 'operator-1' }), previous).rejects.toMatchObject({ code: 'QUEUE_DELETION_CANCELLATION_STALE' });

      expect(await prisma.outbox.findUnique({ where: { id: deletion.id } }), previous).toMatchObject({ status: previous, lastError: 'queue_deletion_cancel_verification_stale', nextAttemptAt: minutesFromNow(5) });
      expect(await prisma.queue.findUnique({ where: { id: queue.id } }), previous).toMatchObject({ lifecycleStatus: 'deleting', remoteSyncStatus: 'delete_pending', version: queue.version + 1 });
      expect(await auditRows(queue.id, 'queue.deletion_cancelled'), previous).toEqual([]);
      expect(await auditRows(queue.id, 'queue.deletion_cancellation_not_confirmed'), previous).toMatchObject([{ actorId: 'operator-1', nextState: previous, reason: 'queue_deletion_cancel_verification_stale', safeDetail: { restored: true, previousStatus: previous } }]);
    }
  });

  it('PG36-14 (T36-14): a legacy cancel_verification row without payload.cancelVerification resumes and restores to unknown', async () => {
    const { queue, deletion } = await seedDeletingQueue({ deleteStatus: 'cancel_verification', deletePayload: { requestMayHaveReachedTwitch: false, safeToDelete: false, marker: 'legacy' } });
    const twitch = fakeTwitch(queue);
    twitch.state.rewardError = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });

    await expect(serviceFor(twitch).cancelQueueDeletion({ queueId: queue.id, actorId: 'operator-1' }))
      .resolves.toMatchObject({ status: 'not_cancelled', reason: 'queue_deletion_cancel_verification_unavailable' });

    expect(await prisma.outbox.findUnique({ where: { id: deletion.id } })).toMatchObject({ status: 'unknown', lastError: 'queue_deletion_cancel_verification_unavailable', payload: { marker: 'legacy' } });
    expect(await auditRows(queue.id, 'queue.deletion_cancel_verification_requested')).toEqual([]);
    expect(await auditRows(queue.id, 'queue.deletion_cancellation_not_confirmed')).toMatchObject([{ nextState: 'unknown', safeDetail: { restored: true, previousStatus: 'unknown' } }]);
  });

  it('PG36-16 (T36-16, Orion addendum): a late DELETE after a verified cancel makes the open fail safely; the queue is never reopened on Twitch', async () => {
    const { queue } = await seedDeletingQueue({ deleteStatus: 'retry', deleteLastError: 'queue_delete_response_unknown', deletePayload: { requestMayHaveReachedTwitch: true, safeToDelete: true } });
    const twitch = fakeTwitch(queue);
    await expect(serviceFor(twitch).cancelQueueDeletion({ queueId: queue.id, actorId: 'operator-1' })).resolves.toMatchObject({ status: 'cancelled' });
    // The DELETE sent before the cancel lands now, after the positive read.
    twitch.state.rewardExists = false;
    await repository.unarchiveQueue({ queueId: queue.id, actorId: 'operator-1' });
    await expect(repository.setQueueOpen(queue.id, true, 'operator-1')).resolves.toMatchObject({ status: 'pending' });

    await expect(rewardWorker(twitch).processOne()).resolves.toBe('unknown');

    expect(twitch.state.writes).toEqual([]);
    expect(await prisma.outbox.findFirst({ where: { entityId: queue.id, operationType: 'reward.set_open', payload: { path: ['isOpen'], equals: true } } }))
      .toMatchObject({ status: 'unknown', lastError: 'reward_open_reward_diverged' });
    const after = await prisma.queue.findUnique({ where: { id: queue.id } });
    expect(after.remoteSyncStatus).toBe('open_unknown');
    expect(after.remoteSyncStatus).not.toBe('synced');
    expect(await auditRows(queue.id, 'queue.open_state_confirmed')).toEqual([]);
    expect(await auditRows(queue.id, 'queue.open_state_unknown')).toMatchObject([{ reason: 'reward_open_reward_diverged' }]);
    await expect(repository.setQueueOpen(queue.id, true, 'operator-1')).resolves.toMatchObject({ status: 'open_unknown' });
  });

  it('PG36-13 (T36-13): the three cancel audit events carry the actor and only allowlisted, non-personal safeDetail keys', async () => {
    const rows = await prisma.auditLog.findMany({ where: { event: { in: Object.keys(AUDIT_ALLOWLIST) } } });
    expect(new Set(rows.map(({ event }) => event))).toEqual(new Set(Object.keys(AUDIT_ALLOWLIST)));
    for (const row of rows) {
      expect(row.actorId, row.event).toEqual(expect.any(String));
      expect(row.origin, row.event).toBe('panel');
      expect(Object.keys(row.safeDetail ?? {}).sort(), row.event).toEqual([...AUDIT_ALLOWLIST[row.event]].sort());
      for (const key of Object.keys(row.safeDetail ?? {})) expect(key).not.toMatch(FORBIDDEN_DETAIL_KEY);
      for (const value of Object.values(row.safeDetail ?? {})) expect(['string', 'number', 'boolean', 'object'].includes(typeof value) && (value === null || typeof value !== 'object')).toBe(true);
    }
  });

  it('PG36-EX (evidence, not asserted): EXPLAIN (ANALYZE, BUFFERS) of the begin lookup by entity_id with 50 000 redemption.* rows', async () => {
    const { queue } = await seedDeletingQueue();
    await prisma.$executeRawUnsafe(`INSERT INTO outbox (id, operation_type, entity_type, entity_id, idempotency_key, payload, status, updated_at)
      SELECT gen_random_uuid(), 'redemption.cancel', 'redemption', 'explain-' || g, 'explain:' || g || ':' || md5(random()::text), '{}'::jsonb, 'confirmed', now()
      FROM generate_series(1, 50000) AS g`);
    await prisma.$executeRawUnsafe('ANALYZE outbox');
    const plans = await prisma.$transaction(async (tx) => ({
      begin: await tx.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM outbox WHERE entity_id = '${queue.id}' AND operation_type LIKE 'reward.%' ORDER BY id FOR UPDATE`),
      byKey: await tx.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM outbox WHERE idempotency_key = 'queue:${queue.id}:reward.delete'`),
    }));
    console.info(`PG36-EX begin lookup by entity_id (50000 redemption.* rows):\n${plans.begin.map((line) => line['QUERY PLAN']).join('\n')}`);
    console.info(`PG36-EX lookup by idempotency_key:\n${plans.byKey.map((line) => line['QUERY PLAN']).join('\n')}`);
    await prisma.outbox.deleteMany({ where: { entityId: { startsWith: 'explain-' } } });
  });

  it('PG36-15 (T36-15, optional once): rollback.sql then the migration again, with a cancel_verification row present', async () => {
    const { queue, deletion } = await seedDeletingQueue({ deleteStatus: 'pending' });
    await repository.beginQueueDeletionCancellation({ queueId: queue.id, actorId: 'operator-1' });
    const statements = async (file) => (await readFile(new URL(file, migrationDir), 'utf8'))
      .split('\n').filter((line) => !line.trim().startsWith('--')).join('\n').split(';').map((statement) => statement.trim()).filter(Boolean);

    for (const statement of await statements('rollback.sql')) await prisma.$executeRawUnsafe(statement);
    expect(await prisma.outbox.findUnique({ where: { id: deletion.id } })).toMatchObject({ status: 'unknown', lastError: 'queue_deletion_cancel_verification_rolled_back', payload: { cancelVerification: { previousStatus: 'pending' } } });
    for (const statement of await statements('migration.sql')) await prisma.$executeRawUnsafe(statement);

    // The new code reads the stale key only as evidence: a new begin writes a fresh one from the row's real status.
    await expect(serviceFor(fakeTwitch(queue)).cancelQueueDeletion({ queueId: queue.id, actorId: 'operator-1' })).resolves.toMatchObject({ status: 'cancelled' });
    expect(await auditRows(queue.id, 'queue.deletion_cancel_verification_requested')).toMatchObject([{ previousState: 'pending' }, { previousState: 'unknown' }]);
  });
});
