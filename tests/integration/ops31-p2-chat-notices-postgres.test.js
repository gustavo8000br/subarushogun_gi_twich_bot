// OPS-31 P2 (Gate B): chat notices on an ISOLATED PostgreSQL with the real migrations (never SQLite, never Prisma mocks):
// M1 up/down/up, the five switches and their defaults, the notice rows written with the queue change, the claim order,
// the join summary, expiry, the aggregation window, and that the financial claim never meets a notice.
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

const root = fileURLToPath(new URL('../../', import.meta.url));
const containerName = `queuebot-ops31-p2-${process.pid}-${randomUUID().slice(0, 8)}`;
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


const psql = (sql) => {
  const result = spawnSync('docker', ['exec', '-i', containerName, 'psql', '-U', 'queuebot', '-d', 'queuebot', '-v', 'ON_ERROR_STOP=1', '-1', '-f', '-'], { cwd: root, encoding: 'utf8', timeout: 60_000, input: sql });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
};
const migrationDirectory = (name) => fileURLToPath(new URL(`../../apps/api/prisma/migrations/20261116120000_chat_notices/${name}`, import.meta.url));
const NOTICES_ON = { noticeJoined: true, noticeService: true, noticeState: true, noticeReordered: false, noticePoints: true };
let sequence = 0;
async function newQueue(extra = {}) {
  sequence += 1;
  return prisma.queue.create({ data: { slug: `p2-${randomUUID().slice(0, 8)}`, title: `Abyss ${sequence}`, cost: 5, isOpen: true, rewardId: `reward-${randomUUID()}`, remoteSyncStatus: 'synced', ...NOTICES_ON, ...extra } });
}
const redemptionEvent = (queue, extra = {}) => ({
  id: `p2-red-${randomUUID()}`, rewardId: queue.rewardId, broadcasterId: 'broadcaster', userId: `viewer-${randomUUID()}`, userLogin: 'Viewer', displayName: 'Viewer',
  redeemedAt: now, status: 'UNFULFILLED', userInput: '', ...extra,
});
const noticesOf = (queueId) => prisma.outbox.findMany({ where: { operationType: 'chat.notice', entityId: queueId }, orderBy: { createdAt: 'asc' } });
const drainNotices = () => prisma.outbox.updateMany({ where: { operationType: 'chat.notice', status: { in: ['pending', 'retry', 'processing'] } }, data: { status: 'cancelled', lastError: 'test_drained' } });
const kindsOf = async (queueId) => (await noticesOf(queueId)).map((row) => row.payload.kind);

describe('OPS-31 P2 chat notices on isolated PostgreSQL', () => {
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

  it('PG71-02 M1: five switches default off for rows that never named them, and `expired` is a valid status', async () => {
    const legacy = await prisma.queue.create({ data: { slug: `p2-legacy-${randomUUID().slice(0, 8)}`, title: 'Old', cost: 1 } });
    expect(legacy).toMatchObject({ noticeJoined: false, noticeService: false, noticeState: false, noticeReordered: false, noticePoints: false });
    const row = await prisma.outbox.create({ data: { operationType: 'chat.notice', entityType: 'queue', idempotencyKey: `m1-${randomUUID()}`, status: 'expired' } });
    expect(row.status).toBe('expired');
    await expect(prisma.outbox.create({ data: { operationType: 'chat.notice', entityType: 'queue', idempotencyKey: `m1-${randomUUID()}`, status: 'bogus' } })).rejects.toThrow();
  });

  it('a NEW queue starts with join, service and state on, reorder and points off (O-10 + owner decision 2026-11-17: points off until P7)', async () => {
    const created = await repository.createQueue({ slug: `p2-new-${randomUUID().slice(0, 8)}`, title: 'New', cost: 5 });
    expect(created).toMatchObject({ noticeJoined: true, noticeService: true, noticeState: true, noticeReordered: false, noticePoints: false });
    const manual = await repository.createManualQueue({ slug: `p2-man-${randomUUID().slice(0, 8)}`, title: 'Manual' });
    expect(manual).toMatchObject({ noticeJoined: true, noticeReordered: false, noticePoints: false });
  });

  it('U-23 the pending-operations count in getLocalState excludes chat.notice rows in every unresolved status', async () => {
    const before = (await repository.getLocalState()).pendingOperations;
    for (const status of ['pending', 'retry', 'processing']) {
      await prisma.outbox.create({ data: { operationType: 'chat.notice', entityType: 'queue', idempotencyKey: `u23-${randomUUID()}`, status } });
    }
    expect((await repository.getLocalState()).pendingOperations).toBe(before);
    await prisma.outbox.create({ data: { operationType: 'redemption.cancel', entityType: 'redemption', idempotencyKey: `u23-${randomUUID()}`, status: 'pending' } });
    expect((await repository.getLocalState()).pendingOperations).toBe(before + 1);
  });

  it('U71-02 a redemption that joins writes exactly one joined notice; a duplicate or an already-recorded one writes none', async () => {
    const queue = await newQueue();
    const event = redemptionEvent(queue);
    expect(await repository.importRedemption(event)).toMatchObject({ status: 'added', position: 1 });
    expect(await repository.importRedemption(event)).toMatchObject({ status: 'already_recorded' });
    expect(await kindsOf(queue.id)).toEqual(['joined']);
    const [notice] = await noticesOf(queue.id);
    expect(notice.payload).toMatchObject({ kind: 'joined', queueId: queue.id, priority: 1, position: 1, user: 'viewer' });
    expect(notice.entryId).toBeNull();
    expect(notice.redemptionId).toBeNull();
  });

  it('refusals: closed and duplicate each write one refusal notice and still record the cancel intent; switch off writes none', async () => {
    const queue = await newQueue();
    const viewer = `viewer-${randomUUID()}`;
    await repository.importRedemption(redemptionEvent(queue, { userId: viewer }));
    const duplicate = redemptionEvent(queue, { userId: viewer });
    expect(await repository.importRedemption(duplicate)).toMatchObject({ status: 'cancellation_pending', reason: 'duplicate_active_entry' });
    await prisma.queue.update({ where: { id: queue.id }, data: { isOpen: false } });
    const closed = redemptionEvent(queue);
    expect(await repository.importRedemption(closed)).toMatchObject({ reason: 'queue_closed' });
    expect(await kindsOf(queue.id)).toEqual(['joined', 'refused_duplicate_entry', 'refused_queue_closed']);
    expect(await prisma.outbox.findMany({ where: { redemptionId: closed.id } })).toMatchObject([{ operationType: 'redemption.cancel' }]);

    const quiet = await newQueue({ noticeJoined: false, isOpen: false });
    await repository.importRedemption(redemptionEvent(quiet));
    expect(await noticesOf(quiet.id)).toHaveLength(0);
  });

  it('existing queues (switches off) write no notice for any trigger', async () => {
    const queue = await newQueue({ noticeJoined: false, noticeService: false, noticeState: false });
    await repository.importRedemption(redemptionEvent(queue));
    const entry = await prisma.entry.findFirst({ where: { queueId: queue.id } });
    const service = createQueueDomainService({ repository });
    await service.transitionEntry({ entryId: entry.id, to: 'called', origin: 'panel', reason: 'operator_called' });
    await service.transitionEntry({ entryId: entry.id, to: 'in_progress', origin: 'panel', reason: 'service_started' });
    await service.transitionEntry({ entryId: entry.id, to: 'completed', origin: 'panel', reason: 'service_completed' });
    expect(await noticesOf(queue.id)).toHaveLength(0);
  });

  it('U71-03 a conclusion writes one service_ended notice; a removal does not', async () => {
    const queue = await newQueue();
    await repository.importRedemption(redemptionEvent(queue));
    await repository.importRedemption(redemptionEvent(queue, { userLogin: 'Other' }));
    const [first, second] = await prisma.entry.findMany({ where: { queueId: queue.id }, orderBy: { position: 'asc' } });
    const service = createQueueDomainService({ repository });
    await service.transitionEntry({ entryId: first.id, to: 'called', origin: 'panel', reason: 'operator_called' });
    await service.transitionEntry({ entryId: first.id, to: 'in_progress', origin: 'panel', reason: 'service_started' });
    await service.transitionEntry({ entryId: first.id, to: 'completed', origin: 'panel', reason: 'service_completed' });
    await service.transitionEntry({ entryId: second.id, to: 'removed', origin: 'panel', reason: 'operator_removed' });
    expect(await kindsOf(queue.id)).toEqual(['joined', 'joined', 'service_ended']);
  });

  it('U71-04 / PG71-01 open state: close and reopen each write one notice, latest wins; a clear merges inside the window and a new window writes a new row', async () => {
    const manual = await repository.createManualQueue({ slug: `p2-open-${randomUUID().slice(0, 8)}`, title: 'Open' });
    await repository.setQueueOpen(manual.id, true);
    await repository.setQueueOpen(manual.id, false);
    const rows = await noticesOf(manual.id);
    expect(rows.map((row) => [row.payload.kind, row.status])).toEqual([['queue_reopened', 'cancelled'], ['queue_closed', 'pending']]);
    expect(rows[0].lastError).toBe('notice_superseded');
    await repository.setQueueOpen(manual.id, true);
    await repository.setQueueOpen(manual.id, false);
    expect((await noticesOf(manual.id)).filter((row) => row.status === 'pending').map((row) => row.payload.kind)).toEqual(['queue_closed']);

    const queue = await newQueue();
    for (const login of ['a', 'b']) await repository.importRedemption(redemptionEvent(queue, { userLogin: login }));
    const snapshot = async () => (await prisma.entry.findMany({ where: { queueId: queue.id, status: { in: ['waiting', 'called', 'in_progress'] } } }))
      .map(({ id, version, status, source, redemptionId }) => ({ id, version, status, source, redemptionId }));
    const service = createQueueDomainService({ repository });
    expect(await service.clearActiveEntries({ queueId: queue.id, snapshot: await snapshot(), origin: 'panel' })).toMatchObject({ status: 'cleared', count: 2 });
    await repository.importRedemption(redemptionEvent(queue, { userLogin: 'c' }));
    expect(await service.clearActiveEntries({ queueId: queue.id, snapshot: await snapshot(), origin: 'panel' })).toMatchObject({ count: 1 });
    const cleared = (await noticesOf(queue.id)).filter((row) => row.payload.kind === 'cleared');
    expect(cleared).toHaveLength(1);
    expect(cleared[0].payload.count).toBe(3);

    const later = createQueueRepository(prisma, { clock: () => new Date(now.getTime() + 60_000) });
    await later.importRedemption(redemptionEvent(queue, { userLogin: 'd' }));
    const laterService = createQueueDomainService({ repository: later });
    await laterService.clearActiveEntries({ queueId: queue.id, snapshot: await snapshot(), origin: 'panel' });
    expect((await noticesOf(queue.id)).filter((row) => row.payload.kind === 'cleared')).toHaveLength(2);
  });

  it('confirmed reward open/close writes the state notice only after Twitch confirmation', async () => {
    const queue = await newQueue({ isOpen: false });
    await repository.setQueueOpen(queue.id, true);
    expect(await noticesOf(queue.id)).toHaveLength(0);
    const task = await repository.claimNextRewardOperation();
    expect(task.operationType).toBe('reward.set_open');
    expect(await repository.confirmRewardOpen(task.id, { isOpen: true }, task.leaseToken)).toBe(true);
    expect(await kindsOf(queue.id)).toEqual(['queue_reopened']);
  });

  it('claims priority 1 before 2, oldest first, with a lease; an expired row becomes `expired` and is skipped', async () => {
    await drainNotices();
    const queue = await newQueue();
    const mk = (kind, priority, offsetMs, expiresAt = '2031-01-01T00:00:00.000Z') => prisma.outbox.create({ data: {
      operationType: 'chat.notice', entityType: 'queue', entityId: queue.id, idempotencyKey: `claim-${randomUUID()}`, nextAttemptAt: new Date(now.getTime() - offsetMs),
      payload: { kind, queueId: queue.id, priority, maxAttempts: 2, expiresAt },
    } });
    const closed = await mk('queue_closed', 2, 3000);
    const stale = await mk('service_ended', 1, 4000, '2020-01-01T00:00:00.000Z');
    const ended = await mk('service_ended', 1, 1000);
    const first = await repository.claimNextChatNotice({ now });
    expect(first.id).toBe(ended.id);
    expect(first).toMatchObject({ attempts: 1, queue: { id: queue.id } });
    expect((await prisma.outbox.findUnique({ where: { id: stale.id } })).status).toBe('expired');
    const second = await repository.claimNextChatNotice({ now });
    expect(second.id).toBe(closed.id);
    expect(await repository.claimNextChatNotice({ now })).toBeNull();
    expect(await repository.finishChatNotice(first.ids, { status: 'confirmed', leaseToken: first.leaseToken })).toMatchObject({ count: 1 });
    expect(await repository.finishChatNotice(first.ids, { status: 'confirmed', leaseToken: first.leaseToken })).toMatchObject({ count: 0 });
    expect(await repository.claimNextChatNotice({ now: new Date(now.getTime() + 60_000) })).toMatchObject({ id: second.id, attempts: 2 });
  });

  it('a burst of joins is claimed as one group above the threshold and one by one below it', async () => {
    await drainNotices();
    const small = await newQueue();
    for (let i = 0; i < 3; i += 1) await repository.importRedemption(redemptionEvent(small, { userLogin: `s${i}` }));
    const one = await repository.claimNextChatNotice({ now: new Date(now.getTime() + 1) });
    expect(one.ids).toHaveLength(1);
    expect(one.summaryCount).toBe(1);
    const big = await newQueue();
    for (let i = 0; i < 6; i += 1) await repository.importRedemption(redemptionEvent(big, { userLogin: `b${i}` }));
    let group;
    await drainNotices();
    for (let i = 0; i < 6; i += 1) await repository.importRedemption(redemptionEvent(big, { userLogin: `c${i}` }));
    group = await repository.claimNextChatNotice({ now: new Date(now.getTime() + 1) });
    expect(group.payload.queueId).toBe(big.id);
    expect(group.ids).toHaveLength(6);
    expect(group.summaryCount).toBe(6);
    expect(group.ids).not.toContain(one.id);
    await repository.finishChatNotice(group.ids, { status: 'confirmed', leaseToken: group.leaseToken });
    const confirmed = await prisma.outbox.findMany({ where: { id: { in: group.ids } } });
    expect(confirmed.every((row) => row.status === 'confirmed')).toBe(true);
  });

  it('PG71-03 the financial claim never takes a chat.notice, and a notice carries no financial identifier', async () => {
    const queue = await newQueue();
    await repository.importRedemption(redemptionEvent(queue));
    await drainNotices();
    const later = new Date(now.getTime() + 1);
    for (let i = 0; i < 20; i += 1) {
      const claimed = await repository.claimNext({ now: later });
      if (!claimed) break;
      expect(claimed.operationType).toMatch(/^redemption\./);
    }
    expect(await prisma.outbox.count({ where: { operationType: 'chat.notice', status: 'processing' } })).toBe(0);
    const rows = await noticesOf(queue.id);
    expect(JSON.stringify(rows.map((row) => row.payload))).not.toMatch(/redemption|twitchUserId|viewer-/);
  });

  it('PG-claim concurrency: two workers never claim the same notice', async () => {
    const queue = await newQueue({ noticeJoined: true });
    for (let i = 0; i < 2; i += 1) {
      await prisma.outbox.create({ data: { operationType: 'chat.notice', entityType: 'queue', entityId: queue.id, idempotencyKey: `race-${randomUUID()}`, nextAttemptAt: new Date(now.getTime() - 100_000),
        payload: { kind: 'queue_closed', queueId: queue.id, priority: 2, maxAttempts: 2, expiresAt: '2031-01-01T00:00:00.000Z' } } });
    }
    const [a, b] = await Promise.all([repository.claimNextChatNotice({ now }), repository.claimNextChatNotice({ now })]);
    const ids = [a?.id, b?.id].filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('MG-09 / MG-11 M1 down removes the columns, maps expired and pending notices, and up again restores the schema', async () => {
    const queue = await newQueue();
    const mk = (status, kind = 'queue_closed') => prisma.outbox.create({ data: { operationType: 'chat.notice', entityType: 'queue', entityId: queue.id, idempotencyKey: `down-${randomUUID()}`, status, payload: { kind } } });
    const pending = await mk('pending');
    const retry = await mk('retry');
    const expired = await mk('expired');
    const confirmed = await mk('confirmed');
    const reference = await prisma.outbox.create({ data: { operationType: 'redemption.cancel', entityType: 'redemption', idempotencyKey: `down-${randomUUID()}`, status: 'failed' } });
    // Column order is not part of the schema: later migrations add columns after M1's, and M1 re-added at the end changes the order only.
    const sortedSchema = () => psql('\\d queues').toString().split('\n').sort().join('\n');
    const schemaBefore = sortedSchema();

    psql(readFileSync(migrationDirectory('rollback.sql'), 'utf8'));
    const columns = psql("SELECT column_name FROM information_schema.columns WHERE table_name = 'queues' AND column_name LIKE 'notice_%'");
    expect(columns).not.toMatch(/notice_/);
    const statuses = Object.fromEntries((await prisma.$queryRaw`SELECT id::text, status, last_error FROM outbox WHERE id IN (${pending.id}::uuid, ${retry.id}::uuid, ${expired.id}::uuid, ${confirmed.id}::uuid, ${reference.id}::uuid)`)
      .map((row) => [row.id, [row.status, row.last_error]]));
    expect(statuses[pending.id]).toEqual(['cancelled', 'notice_rolled_back']);
    expect(statuses[retry.id]).toEqual(['cancelled', 'notice_rolled_back']);
    expect(statuses[expired.id]).toEqual(['cancelled', 'notice_expired_rolled_back']);
    expect(statuses[confirmed.id][0]).toBe('confirmed');
    expect(statuses[reference.id][0]).toBe('failed');
    expect(psql("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'outbox_status_check'")).not.toContain('expired');

    psql(readFileSync(migrationDirectory('migration.sql'), 'utf8'));
    expect(sortedSchema()).toBe(schemaBefore);
    expect(psql("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'outbox_status_check'")).toContain('expired');
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({ noticeJoined: false });
  });
});
