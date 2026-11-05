// OPS-15 FT-41 (cutover wave 5), AC-41-2/3/4: the `archiveAfterConfirm` branch of the reward worker is what makes it safe to
// retire `POST /api/queues/:queueId/archive`. Rows written by the retired route may still exist in installed databases, so
// they are seeded BY HAND here (the route and `archiveQueue` no longer exist) on an ISOLATED PostgreSQL with the real
// migrations (never SQLite, never Prisma mocks, never an active volume). Twitch is a fake that records every read and write.
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
import { createRewardOutboxWorker } from '../../apps/api/src/outbox/reward-worker.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const containerName = `queuebot-archive-legacy-${process.pid}-${randomUUID().slice(0, 8)}`;

let connectionString;
let prisma;
let repository;
let now = new Date('2030-01-01T12:00:00.000Z');
const clock = () => now;

function docker(args, options = {}) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 30_000, ...options });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `docker ${args[0]} failed`);
  return result.stdout.trim();
}

/**
 * A queue exactly as the retired archive route left it: archived, closed, `pending_close`, reward bound.
 * `legacyRow` is the payload of the `reward.set_open` row the route wrote (`false` seeds no row at all).
 */
async function seedLegacyArchive({ lifecycleStatus = 'active', payload = {}, rowStatus = 'pending' } = {}) {
  const created = await repository.createQueue({ slug: `legacy-${randomUUID().slice(0, 8)}`, title: 'Legacy archive', cost: 7 });
  const queue = await prisma.queue.update({ where: { id: created.id }, data: {
    rewardId: `reward-${randomUUID()}`, rewardOrigin: 'bot_created', queueMode: 'channel_points', lifecycleStatus,
    ...(lifecycleStatus === 'deleted' ? { deletedAt: now } : {}),
    isArchived: true, isOpen: false, remoteSyncStatus: 'pending_close',
  } });
  const row = await prisma.outbox.create({ data: {
    operationType: 'reward.set_open', entityType: 'queue', entityId: queue.id,
    idempotencyKey: `queue:${queue.id}:reward.archive:${queue.version}`,
    payload: { isOpen: false, queueVersion: queue.version, requestMayHaveReachedTwitch: false, ...payload },
    status: rowStatus, nextAttemptAt: now,
  } });
  return { queue, row };
}

/** Fake Twitch: one managed reward that starts unpaused, with a log of every read and write. */
function fakeTwitch(queue, { paused = false, setOpen = null } = {}) {
  const state = { paused, reads: 0, writes: [] };
  const reward = () => ({
    id: queue.rewardId, title: queue.title, cost: queue.cost, prompt: queue.rewardPrompt ?? '', isPaused: state.paused, isEnabled: true,
    userInputRequired: queue.uidMode === 'visible', autoFulfill: false, shouldRedemptionsSkipRequestQueue: false,
    maxRedemptionsPerStream: queue.maxRedemptionsPerStream ?? null, maxRedemptionsPerUserPerStream: queue.maxRedemptionsPerUserPerStream ?? null,
    globalCooldown: queue.globalCooldownSeconds ?? null,
  });
  return {
    state,
    async getReward(rewardId) { state.reads += 1; return rewardId === queue.rewardId ? reward() : null; },
    async setRewardOpen(rewardId, isOpen) {
      state.writes.push({ op: 'setRewardOpen', isOpen });
      if (setOpen) await setOpen(state, isOpen);
      state.paused = !isOpen;
      return reward();
    },
  };
}

function rewardWorker(twitch) {
  return createRewardOutboxWorker({ repository, twitch, clock, random: () => 0 });
}

describe('FT-41 legacy archive rows on isolated PostgreSQL', () => {
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

  beforeEach(async () => {
    // Park every claimable task of earlier tests so each test owns its claims.
    await prisma.outbox.updateMany({ where: { status: { in: ['pending', 'retry', 'processing'] } }, data: { status: 'cancelled', leaseToken: null, leaseUntil: null } });
    now = new Date(now.getTime() + 86_400_000);
  });

  it('AC-41-2: a legacy pending_close archive ends confirmed, the queue ends synced and archived, and unarchive then works', async () => {
    const { queue, row } = await seedLegacyArchive({ payload: { archiveAfterConfirm: true } });
    const twitch = fakeTwitch(queue);

    await expect(rewardWorker(twitch).processOne()).resolves.toBe('confirmed');

    expect(twitch.state.writes).toEqual([{ op: 'setRewardOpen', isOpen: false }]);
    expect(await prisma.outbox.findUnique({ where: { id: row.id } })).toMatchObject({ status: 'confirmed', lastError: null, leaseToken: null });
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({
      lifecycleStatus: 'active', isArchived: true, isOpen: false, remoteSyncStatus: 'synced', version: queue.version + 1,
    });
    await expect(repository.unarchiveQueue({ queueId: queue.id, actorId: 'operator-1' })).resolves.toMatchObject({ status: 'unarchived' });
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({ isArchived: false, isOpen: false, remoteSyncStatus: 'synced' });
  });

  it('AC-41-3 (429): a rate-limited legacy row goes to retry keeping the flag and the queue state, then confirms', async () => {
    const { queue, row } = await seedLegacyArchive({ payload: { archiveAfterConfirm: true } });
    const limited = fakeTwitch(queue, { setOpen: async () => { throw twurpleHttpError(429, 'Too Many Requests'); } });

    await expect(rewardWorker(limited).processOne()).resolves.toBe('retry');

    const retrying = await prisma.outbox.findUnique({ where: { id: row.id } });
    expect(retrying).toMatchObject({ status: 'retry' });
    expect(retrying.payload).toMatchObject({ archiveAfterConfirm: true, isOpen: false, requestMayHaveReachedTwitch: false });
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({
      isArchived: true, isOpen: false, remoteSyncStatus: 'pending_close', version: queue.version,
    });

    now = new Date(now.getTime() + 3_600_000);
    const healthy = fakeTwitch(queue);
    await expect(rewardWorker(healthy).processOne()).resolves.toBe('confirmed');
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({ isArchived: true, isOpen: false, remoteSyncStatus: 'synced' });
  });

  // KNOWN, ACCEPTED LIMITATION (Orion decision, 2026-11-05, FT-41 / AC-41-3, option B): a legacy `archiveAfterConfirm` row that
  // reached `unknown` or `failed` moved its queue to `close_unknown` / `close_failed`, and `retryOutboxManually` only re-arms the
  // queue for `reward.delete` / `reward.update` / `deleteAfterConfirm`. The row returns to `pending` but the claim needs the queue
  // in `pending_close`, so nothing is processed. This is how it behaves today, independent of the route removal. The manual exits
  // are deleting the queue or `archive-local`. These tests pin the current behavior so that a future change is deliberate.
  it.each([
    ['unknown', 'close_unknown', async (state, isOpen) => { state.paused = !isOpen; throw new Error('socket closed before the response'); }, true],
    ['failed', 'close_failed', async () => { throw twurpleHttpError(400, 'Bad Request'); }, true],
  ])('AC-41-3 (%s + manual retry): the row returns to pending with the flag but stays stranded behind the %s queue (documented limitation)', async (workerResult, queueStatus, setOpen, possiblySent) => {
    const { queue, row } = await seedLegacyArchive({ payload: { archiveAfterConfirm: true } });
    const failing = fakeTwitch(queue, { setOpen });

    await expect(rewardWorker(failing).processOne()).resolves.toBe(workerResult);

    const stopped = await prisma.outbox.findUnique({ where: { id: row.id } });
    expect(stopped).toMatchObject({ status: workerResult });
    expect(stopped.payload).toMatchObject({ archiveAfterConfirm: true, requestMayHaveReachedTwitch: possiblySent });
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({ isArchived: true, remoteSyncStatus: queueStatus });
    // A stopped row is never claimed by itself.
    await expect(rewardWorker(failing).processOne()).resolves.toBe('idle');

    await expect(repository.retryOutboxManually(row.id, { actorId: 'operator-1' })).resolves.toMatchObject({ count: 1 });
    const pending = await prisma.outbox.findUnique({ where: { id: row.id } });
    expect(pending).toMatchObject({ status: 'pending' });
    expect(pending.payload).toMatchObject({ archiveAfterConfirm: true });

    const readsBefore = failing.state.reads;
    const writesBefore = failing.state.writes.length;
    await expect(rewardWorker(failing).processOne()).resolves.toBe('idle');
    expect(failing.state.reads).toBe(readsBefore);
    expect(failing.state.writes).toHaveLength(writesBefore);
    expect(await prisma.outbox.findUnique({ where: { id: row.id } })).toMatchObject({ status: 'pending' });
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({ isArchived: true, isOpen: false, remoteSyncStatus: queueStatus });
    // The manual exits stay open: unarchive refuses the stranded queue, and the local archive is still offered for these states.
    await expect(repository.unarchiveQueue({ queueId: queue.id, actorId: 'operator-1' })).rejects.toMatchObject({ code: 'QUEUE_REWARD_NOT_READY' });
  });

  it.each([
    ['not yet sent', false, 'cancelled', 'tombstone_mutation_suppressed'],
    ['possibly sent', true, 'unknown', 'tombstone_mutation_outcome_unknown'],
  ])('AC-41-3 (tombstone, %s): a legacy row of a locally archived queue never calls Twitch', async (_label, possiblySent, status, lastError) => {
    const { queue, row } = await seedLegacyArchive({ lifecycleStatus: 'deleted', payload: { archiveAfterConfirm: true, requestMayHaveReachedTwitch: possiblySent } });
    const twitch = fakeTwitch(queue);

    await expect(rewardWorker(twitch).processOne()).resolves.toBe('idle');

    expect(twitch.state).toMatchObject({ reads: 0, writes: [] });
    expect(await prisma.outbox.findUnique({ where: { id: row.id } })).toMatchObject({ status, lastError });
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({ lifecycleStatus: 'deleted', isArchived: true });
  });

  it('AC-41-4 (guard): a reward.set_open row WITHOUT archiveAfterConfirm for an archived queue still fails as invalid', async () => {
    const { queue, row } = await seedLegacyArchive({ payload: {} });
    const twitch = fakeTwitch(queue);

    await expect(rewardWorker(twitch).processOne()).resolves.toBe('failed');

    expect(twitch.state).toMatchObject({ reads: 0, writes: [] });
    expect(await prisma.outbox.findUnique({ where: { id: row.id } })).toMatchObject({ status: 'failed', lastError: 'reward_open_operation_invalid' });
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({
      isArchived: true, isOpen: false, remoteSyncStatus: 'close_failed',
    });
  });

  it('AC-41-4 (guard): the flag with isOpen=true does not relax the archived-queue guard either', async () => {
    const { queue, row } = await seedLegacyArchive({ payload: { isOpen: true, archiveAfterConfirm: true } });
    const twitch = fakeTwitch(queue, { paused: true });

    await expect(rewardWorker(twitch).processOne()).resolves.toBe('failed');

    expect(twitch.state).toMatchObject({ reads: 0, writes: [] });
    expect(await prisma.outbox.findUnique({ where: { id: row.id } })).toMatchObject({ status: 'failed', lastError: 'reward_open_operation_invalid' });
  });
});
