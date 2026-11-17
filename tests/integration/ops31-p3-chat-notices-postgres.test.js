// OPS-31 P3 (AC 6, 7, 29): skip, restore, absence and reorder notices on an ISOLATED PostgreSQL with the real migrations
// (never SQLite, never Prisma mocks).
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

const root = fileURLToPath(new URL('../../', import.meta.url));
const containerName = `queuebot-ops31-p3-${process.pid}-${randomUUID().slice(0, 8)}`;
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


const NOTICES_ON = { noticeJoined: true, noticeService: true, noticeState: true, noticeReordered: true, noticePoints: false };
let sequence = 0;
async function newQueue(extra = {}) {
  sequence += 1;
  return prisma.queue.create({ data: { slug: `p3-${randomUUID().slice(0, 8)}`, title: `Abyss ${sequence}`, cost: 5, isOpen: true, rewardId: `reward-${randomUUID()}`, remoteSyncStatus: 'synced', ...NOTICES_ON, ...extra } });
}
const redemptionEvent = (queue, extra = {}) => ({
  id: `p2-red-${randomUUID()}`, rewardId: queue.rewardId, broadcasterId: 'broadcaster', userId: `viewer-${randomUUID()}`, userLogin: 'Viewer', displayName: 'Viewer',
  redeemedAt: now, status: 'UNFULFILLED', userInput: '', ...extra,
});
// rows a test drained (cancelled with `test_drained`) are not part of what the code under test wrote after that point
const noticesOf = (queueId) => prisma.outbox.findMany({ where: { operationType: 'chat.notice', entityId: queueId, OR: [{ lastError: null }, { lastError: { not: 'test_drained' } }] }, orderBy: { createdAt: 'asc' } });
const drainNotices = () => prisma.outbox.updateMany({ where: { operationType: 'chat.notice', status: { in: ['pending', 'retry', 'processing'] } }, data: { status: 'cancelled', lastError: 'test_drained' } });
const kindsOf = async (queueId) => (await noticesOf(queueId)).map((row) => row.payload.kind);

const service = () => createQueueDomainService({ repository });
const panel = (entryId, to, reason, extra = {}) => service().transitionEntry({ entryId, to, origin: 'panel', trigger: 'panel_action', reason, ...extra });
const entriesOf = (queueId, where = {}) => prisma.entry.findMany({ where: { queueId, ...where }, orderBy: [{ priorityClass: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] });
const waitingLogins = async (queueId) => (await entriesOf(queueId, { status: 'waiting' })).map((entry) => `${entry.userLogin}:${entry.position}`);
async function join(queue, login) {
  const event = redemptionEvent(queue, { userLogin: login, displayName: login });
  expect(await repository.importRedemption(event)).toMatchObject({ status: 'added' });
  return prisma.entry.findFirst({ where: { queueId: queue.id, userLogin: login.toLowerCase() } });
}
const noticeRows = async (queueId, kind) => (await noticesOf(queueId)).filter((row) => row.payload.kind === kind);

describe('OPS-31 P3 skip, restore, absence and reorder on isolated PostgreSQL', () => {
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

  it('PG72-01 / U72-02 skip: the called entry returns right after the first waiting entry, call stamps cleared, one skipped notice', async () => {
    const queue = await newQueue();
    const [a, , ] = [await join(queue, 'Ana'), await join(queue, 'Bia'), await join(queue, 'Caio')];
    await panel(a.id, 'called', 'operator_call');
    await prisma.entry.update({ where: { id: a.id }, data: { callNotifiedAt: now, callDeadlineAt: now, callAcknowledgedAt: now } });
    await drainNotices();
    const before = await prisma.entry.findUnique({ where: { id: a.id } });
    const result = await panel(a.id, 'waiting', 'operator_skip', { expectedVersion: before.version });
    expect(result).toMatchObject({ status: 'waiting', financialDecision: 'no_operation' });
    const after = await prisma.entry.findUnique({ where: { id: a.id } });
    expect(after).toMatchObject({ status: 'waiting', position: 2, version: before.version + 1, calledAt: null, callNotifiedAt: null, callDeadlineAt: null, callAcknowledgedAt: null, finishedAt: null, terminalReason: null });
    expect(await waitingLogins(queue.id)).toEqual(['bia:1', 'ana:2', 'caio:3']);
    const [notice] = await noticeRows(queue.id, 'skipped');
    expect(await kindsOf(queue.id)).toEqual(['skipped']);
    expect(notice.payload).toMatchObject({ kind: 'skipped', user: 'ana', position: 2, priority: 1 });
    expect(notice.idempotencyKey).toBe(`chat.notice:skipped:${a.id}:${after.version}`);
    expect(await prisma.auditLog.findFirst({ where: { entryId: a.id, event: 'entry.transitioned', nextState: 'waiting' } })).toMatchObject({ event: 'entry.transitioned', previousState: 'called', reason: 'operator_skip', origin: 'panel' });
  });

  it('U72-02 skip with nobody else waiting goes to position 1; with one other waiting goes to position 2', async () => {
    const queue = await newQueue();
    const a = await join(queue, 'Ana');
    await panel(a.id, 'called', 'operator_call');
    await panel(a.id, 'waiting', 'operator_skip');
    expect(await waitingLogins(queue.id)).toEqual(['ana:1']);
    await join(queue, 'Bia');
    await panel(a.id, 'called', 'operator_call');
    await panel(a.id, 'waiting', 'operator_skip');
    expect(await waitingLogins(queue.id)).toEqual(['bia:1', 'ana:2']);
  });

  it('a skipped standard entry never passes the priority lane and returns second in the standard lane; a skipped priority entry goes after the first priority entry', async () => {
    const queue = await newQueue();
    const [p1, p2, s1] = [await join(queue, 'P1'), await join(queue, 'P2'), await join(queue, 'S1')];
    await join(queue, 'S2');
    for (const entry of [p1, p2]) await repository.setEntryPriority({ queueId: queue.id, entryId: entry.id, priority: true, reason: 'operator_override' });
    await panel(s1.id, 'called', 'operator_call');
    await panel(s1.id, 'waiting', 'operator_skip');
    expect((await entriesOf(queue.id, { status: 'waiting' })).map((entry) => entry.userLogin)).toEqual(['p1', 'p2', 's2', 's1']);
    await panel(p1.id, 'called', 'operator_call');
    await panel(p1.id, 'waiting', 'operator_skip');
    expect((await entriesOf(queue.id, { status: 'waiting' })).map((entry) => `${entry.userLogin}:${entry.position}`)).toEqual(['p2:1', 'p1:2', 's2:3', 's1:4']);
  });

  it('lane rule: a default skip with 2 priority and 3 more default waiting returns at position 4 of 6 (second of the default lane)', async () => {
    const queue = await newQueue();
    const [p1, p2, d1] = [await join(queue, 'P1'), await join(queue, 'P2'), await join(queue, 'D1')];
    for (const name of ['D2', 'D3', 'D4']) await join(queue, name);
    for (const entry of [p1, p2]) await repository.setEntryPriority({ queueId: queue.id, entryId: entry.id, priority: true, reason: 'operator_override' });
    await panel(d1.id, 'called', 'operator_call');
    await panel(d1.id, 'waiting', 'operator_skip');
    expect(await waitingLogins(queue.id)).toEqual(['p1:1', 'p2:2', 'd2:3', 'd1:4', 'd3:5', 'd4:6']);
  });

  it('a skip cancels the call message still waiting to be sent, and the entry can be called again (one reusable call row)', async () => {
    const queue = await newQueue();
    const a = await join(queue, 'Ana');
    await join(queue, 'Bia');
    await panel(a.id, 'called', 'operator_call');
    await repository.enqueueCallNotification({ entryId: a.id, queueId: queue.id, previousPosition: 1 });
    const callKey = `chat.call:${a.id}`;
    expect(await prisma.outbox.findUnique({ where: { idempotencyKey: callKey } })).toMatchObject({ status: 'pending' });
    await panel(a.id, 'waiting', 'operator_skip');
    expect(await prisma.outbox.findUnique({ where: { idempotencyKey: callKey } })).toMatchObject({ status: 'cancelled', lastError: 'entry_returned_to_waiting' });
    await panel(a.id, 'called', 'operator_call');
    await repository.enqueueCallNotification({ entryId: a.id, queueId: queue.id, previousPosition: 2 });
    expect(await prisma.outbox.findUnique({ where: { idempotencyKey: callKey } })).toMatchObject({ status: 'pending', attempts: 0, lastError: null, payload: { previousPosition: 2 } });
    expect(await prisma.outbox.count({ where: { idempotencyKey: callKey } })).toBe(1);
  });

  it('U72-01 absence: a no-show (panel or timer path) writes one no_show notice, nothing when the service switch is off', async () => {
    const queue = await newQueue();
    const a = await join(queue, 'Ana');
    await panel(a.id, 'called', 'operator_call');
    await drainNotices();
    await panel(a.id, 'no_show', 'operator_no_show');
    const [notice] = await noticeRows(queue.id, 'no_show');
    expect(await kindsOf(queue.id)).toEqual(['no_show']);
    expect(notice.payload).toMatchObject({ user: 'ana', priority: 1 });

    const quiet = await newQueue({ noticeService: false });
    const b = await join(quiet, 'Bia');
    await drainNotices();
    await panel(b.id, 'called', 'operator_call');
    await panel(b.id, 'no_show', 'operator_no_show');
    expect(await noticesOf(quiet.id)).toHaveLength(0);
  });

  it('U72-03 restore: an absent entry returns at position 2 with one restored notice and the audit row', async () => {
    const queue = await newQueue();
    const [a] = [await join(queue, 'Ana'), await join(queue, 'Bia'), await join(queue, 'Caio')];
    await panel(a.id, 'called', 'operator_call');
    await panel(a.id, 'no_show', 'operator_no_show');
    await drainNotices();
    const absent = await prisma.entry.findUnique({ where: { id: a.id } });
    expect(absent).toMatchObject({ status: 'no_show' });
    expect(absent.finishedAt).toBeTruthy();
    await panel(a.id, 'waiting', 'operator_restore', { expectedVersion: absent.version });
    expect(await waitingLogins(queue.id)).toEqual(['bia:1', 'ana:2', 'caio:3']);
    expect(await prisma.entry.findUnique({ where: { id: a.id } })).toMatchObject({ status: 'waiting', finishedAt: null, terminalReason: null, calledAt: null });
    const [notice] = await noticeRows(queue.id, 'restored');
    expect(notice.payload).toMatchObject({ user: 'ana', position: 2 });
    expect(await prisma.auditLog.findFirst({ where: { entryId: a.id, event: 'entry.transitioned', nextState: 'waiting' } })).toMatchObject({ previousState: 'no_show', reason: 'operator_restore' });
  });

  it('PG72-03 / AC 29 restore is refused once a refund intent exists (expected status set), leaving the entry and the notices untouched', async () => {
    const queue = await newQueue({ refundOnNoShow: true });
    const a = await join(queue, 'Ana');
    await panel(a.id, 'called', 'operator_call');
    const noShow = await panel(a.id, 'no_show', 'operator_no_show');
    expect(noShow.financialDecision).toBe('request_cancel');
    expect(await prisma.redemption.findUnique({ where: { redemptionId: a.redemptionId } })).toMatchObject({ expectedStatus: 'CANCELED' });
    await drainNotices();
    const before = await prisma.entry.findUnique({ where: { id: a.id } });
    await expect(panel(a.id, 'waiting', 'operator_restore')).rejects.toMatchObject({ code: 'ENTRY_RESTORE_NOT_ALLOWED', reason: 'intent_recorded' });
    expect(await prisma.entry.findUnique({ where: { id: a.id } })).toEqual(before);
    expect(await noticesOf(queue.id)).toHaveLength(0);
    expect(await prisma.outbox.count({ where: { redemptionId: a.redemptionId } })).toBe(1);
  });

  it('AC 29 restore is refused when the remote redemption is no longer open, even without an expected status', async () => {
    const queue = await newQueue();
    const a = await join(queue, 'Ana');
    await panel(a.id, 'called', 'operator_call');
    await panel(a.id, 'no_show', 'operator_no_show');
    await prisma.redemption.update({ where: { redemptionId: a.redemptionId }, data: { remoteStatus: 'CANCELED' } });
    await expect(panel(a.id, 'waiting', 'operator_restore')).rejects.toMatchObject({ code: 'ENTRY_RESTORE_NOT_ALLOWED', reason: 'intent_recorded' });
  });

  it('PG72-02 restore is refused with other_active_entry when the same person already holds an active entry; the unique index is the last guard', async () => {
    const queue = await newQueue();
    const viewer = `viewer-${randomUUID()}`;
    await repository.importRedemption(redemptionEvent(queue, { userId: viewer, userLogin: 'Ana' }));
    const first = await prisma.entry.findFirst({ where: { queueId: queue.id, twitchUserId: viewer } });
    await panel(first.id, 'called', 'operator_call');
    await panel(first.id, 'no_show', 'operator_no_show');
    await repository.importRedemption(redemptionEvent(queue, { userId: viewer, userLogin: 'Ana' }));
    await drainNotices();
    await expect(panel(first.id, 'waiting', 'operator_restore')).rejects.toMatchObject({ code: 'ENTRY_RESTORE_NOT_ALLOWED', reason: 'other_active_entry' });
    expect(await prisma.entry.findUnique({ where: { id: first.id } })).toMatchObject({ status: 'no_show' });
    expect(await noticesOf(queue.id)).toHaveLength(0);
    // the database itself refuses a second active entry for the person (what the pre-check mirrors)
    await expect(prisma.entry.update({ where: { id: first.id }, data: { status: 'waiting' } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('a manual entry (no redemption) can be restored; a queue that is not active refuses skip and restore', async () => {
    const queue = await repository.createManualQueue({ slug: `p3-man-${randomUUID().slice(0, 8)}`, title: 'Manual' });
    await prisma.queue.update({ where: { id: queue.id }, data: { noticeService: true } });
    const added = await repository.addManualEntry({ queueId: queue.id, login: 'manualviewer', displayName: 'Manual', twitchUserId: `manual-${randomUUID()}` }).catch(() => null);
    const entry = added?.entry ?? await prisma.entry.create({ data: { queueId: queue.id, twitchUserId: `manual-${randomUUID()}`, userLogin: 'manualviewer', displayName: 'Manual', source: 'manual', status: 'waiting', position: 1 } });
    await panel(entry.id, 'called', 'operator_call');
    await panel(entry.id, 'no_show', 'operator_no_show');
    await panel(entry.id, 'waiting', 'operator_restore');
    expect(await prisma.entry.findUnique({ where: { id: entry.id } })).toMatchObject({ status: 'waiting', position: 1 });
    await panel(entry.id, 'called', 'operator_call');
    await prisma.queue.update({ where: { id: queue.id }, data: { lifecycleStatus: 'deleting' } });
    await expect(panel(entry.id, 'waiting', 'operator_skip')).rejects.toMatchObject({ code: 'QUEUE_NOT_AVAILABLE' });
    expect(await prisma.entry.findUnique({ where: { id: entry.id } })).toMatchObject({ status: 'called' });
  });

  it('U72-06 / G-8 a panel action with a stale version is refused with the current version and changes nothing', async () => {
    const queue = await newQueue();
    const a = await join(queue, 'Ana');
    await panel(a.id, 'called', 'operator_call');
    const current = await prisma.entry.findUnique({ where: { id: a.id } });
    await drainNotices();
    await expect(panel(a.id, 'waiting', 'operator_skip', { expectedVersion: current.version - 1 })).rejects.toMatchObject({ code: 'ENTRY_VERSION_STALE', currentVersion: current.version });
    await expect(panel(a.id, 'no_show', 'operator_no_show', { expectedVersion: current.version + 5 })).rejects.toMatchObject({ code: 'ENTRY_VERSION_STALE' });
    expect(await prisma.entry.findUnique({ where: { id: a.id } })).toEqual(current);
    expect(await noticesOf(queue.id)).toHaveLength(0);
    // a request without a version (chat, timer) is not compared
    await panel(a.id, 'waiting', 'operator_skip');
    expect(await prisma.entry.findUnique({ where: { id: a.id } })).toMatchObject({ status: 'waiting' });
  });

  it('skip is its own undo: skip twice in a row is refused as an invalid transition (waiting -> waiting)', async () => {
    const queue = await newQueue();
    const a = await join(queue, 'Ana');
    await panel(a.id, 'called', 'operator_call');
    await panel(a.id, 'waiting', 'operator_skip');
    await expect(panel(a.id, 'waiting', 'operator_skip')).rejects.toMatchObject({ code: 'INVALID_ENTRY_TRANSITION' });
  });

  it('U72-05 reorder: one aggregated notice lists only the people whose place changed, in their new order', async () => {
    const queue = await newQueue();
    const [a, b, c, d] = [await join(queue, 'Ana'), await join(queue, 'Bia'), await join(queue, 'Caio'), await join(queue, 'Dani')];
    await drainNotices();
    const bia = await prisma.entry.findUnique({ where: { id: b.id } });
    expect(await repository.moveWaitingEntry({ queueId: queue.id, entryId: b.id, position: 1, expectedVersion: bia.version })).toMatchObject({ status: 'moved' });
    expect(await waitingLogins(queue.id)).toEqual(['bia:1', 'ana:2', 'caio:3', 'dani:4']);
    const rows = await noticeRows(queue.id, 'reordered');
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({ priority: 2, names: ['bia', 'ana'] });
    expect(rows[0].idempotencyKey).toMatch(new RegExp(`^chat.notice:reordered:${queue.id}:\\d+$`));
    // a second move in the same window merges into the same row (burst = one message)
    await repository.moveWaitingEntry({ queueId: queue.id, entryId: d.id, position: 3 });
    const merged = await noticeRows(queue.id, 'reordered');
    expect(merged).toHaveLength(1);
    expect(merged[0].payload.names).toEqual(['bia', 'ana', 'dani', 'caio']);
    expect(c.id && a.id).toBeTruthy();
    // an unchanged move writes nothing new
    expect(await repository.moveWaitingEntry({ queueId: queue.id, entryId: b.id, position: 1 })).toEqual({ status: 'unchanged' });
    expect(await noticeRows(queue.id, 'reordered')).toHaveLength(1);
  });

  it('reorder notice follows its own switch (off by default on a new queue) and a later window writes a new row', async () => {
    const fresh = await repository.createQueue({ slug: `p3-new-${randomUUID().slice(0, 8)}`, title: 'Fresh', cost: 5 });
    expect(fresh.noticeReordered).toBe(false);
    const quiet = await newQueue({ noticeReordered: false });
    await join(quiet, 'Ana');
    const second = await join(quiet, 'Bia');
    await repository.moveWaitingEntry({ queueId: quiet.id, entryId: second.id, position: 1 });
    expect(await noticeRows(quiet.id, 'reordered')).toHaveLength(0);

    const queue = await newQueue();
    await join(queue, 'Ana');
    const other = await join(queue, 'Bia');
    await repository.moveWaitingEntry({ queueId: queue.id, entryId: other.id, position: 1 });
    const later = createQueueRepository(prisma, { clock: () => new Date(now.getTime() + 60_000) });
    await later.moveWaitingEntry({ queueId: queue.id, entryId: other.id, position: 2 });
    expect(await noticeRows(queue.id, 'reordered')).toHaveLength(2);
  });

  it('G-8 the panel move compares the version of the moved entry after the lock', async () => {
    const queue = await newQueue();
    await join(queue, 'Ana');
    const other = await join(queue, 'Bia');
    await expect(repository.moveWaitingEntry({ queueId: queue.id, entryId: other.id, position: 1, expectedVersion: other.version + 3 })).rejects.toMatchObject({ code: 'ENTRY_VERSION_STALE', currentVersion: other.version });
    expect(await waitingLogins(queue.id)).toEqual(['ana:1', 'bia:2']);
    expect(await noticeRows(queue.id, 'reordered')).toHaveLength(0);
  });

  it('PG72-04 skip x call x reorder on one queue, repeated: positions stay contiguous with no duplicate', async () => {
    const queue = await newQueue();
    const people = [];
    for (const login of ['Ana', 'Bia', 'Caio', 'Dani', 'Edu', 'Fia']) people.push(await join(queue, login));
    for (let round = 0; round < 12; round += 1) {
      const waiting = await entriesOf(queue.id, { status: 'waiting' });
      const called = await entriesOf(queue.id, { status: 'called' });
      const target = waiting[round % waiting.length];
      const results = await Promise.allSettled([
        called[0] ? panel(called[0].id, 'waiting', 'operator_skip') : panel(target.id, 'called', 'operator_call'),
        repository.moveWaitingEntry({ queueId: queue.id, entryId: waiting.at(-1).id, position: 1 }),
        repository.moveWaitingEntry({ queueId: queue.id, entryId: waiting[0].id, position: Math.min(2, waiting.length) }),
      ]);
      for (const result of results) {
        if (result.status === 'rejected') expect(['ENTRY_NOT_WAITING', 'INVALID_QUEUE_POSITION', 'INVALID_ENTRY_TRANSITION']).toContain(result.reason.code);
      }
      const now_ = await entriesOf(queue.id, { status: 'waiting' });
      expect(now_.map((entry) => entry.position)).toEqual(now_.map((_, index) => index + 1));
      expect(now_.length + (await entriesOf(queue.id, { status: 'called' })).length).toBe(people.length);
    }
  }, 60_000);
});
