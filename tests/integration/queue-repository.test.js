import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createQueueDomainService } from '../../apps/api/src/domain/queue-service.mjs';
import { createQueueRepository } from '../../apps/api/src/persistence/queue-repository.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const containerName = `queuebot-repo-${process.pid}-${randomUUID().slice(0, 8)}`;
let prisma;
let repository;
let queueService;
let containerStarted = false;

function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `docker ${args[0]} failed`);
  return result.stdout.trim();
}

describe('PostgreSQL queue repository', () => {
  beforeAll(async () => {
    docker(['run', '--detach', '--rm', '--name', containerName,
      '--env', 'POSTGRES_USER=queuebot', '--env', 'POSTGRES_PASSWORD=isolated-test-password', '--env', 'POSTGRES_DB=queuebot',
      '--publish', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql:rw,noexec,nosuid,size=512m',
      'postgres:18.6-bookworm']);
    containerStarted = true;
    const published = docker(['port', containerName, '5432/tcp']).split(':').at(-1);
    const connectionString = `postgresql://queuebot:isolated-test-password@127.0.0.1:${published}/queuebot?schema=public`;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const probe = spawnSync('docker', ['exec', containerName, 'pg_isready', '-U', 'queuebot', '-d', 'queuebot'], {
        cwd: root, encoding: 'utf8', timeout: 3000,
      });
      if (probe.status === 0) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    expect(ready, 'isolated PostgreSQL did not become healthy').toBe(true);
    const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
      cwd: root, encoding: 'utf8', timeout: 60_000,
      env: { ...process.env, DATABASE_URL: connectionString },
    });
    expect(migration.status, migration.stderr || migration.stdout).toBe(0);
    const adapter = new PrismaPg({ connectionString });
    prisma = new PrismaClient({ adapter });
    repository = createQueueRepository(prisma);
    queueService = createQueueDomainService({ repository });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (containerStarted) spawnSync('docker', ['stop', containerName], { cwd: root, encoding: 'utf8', timeout: 30_000 });
  });

  it('appends manual entries and preserves one continuous waiting order', async () => {
    const queue = await repository.createQueue({ slug: `order-${randomUUID().slice(0, 8)}`, title: 'Order', cost: 1 });
    const first = await repository.addManualEntry({ queueId: queue.id, twitchUserId: 'user-1', userLogin: 'one', displayName: 'One' });
    const second = await repository.addManualEntry({ queueId: queue.id, twitchUserId: 'user-2', userLogin: 'two', displayName: 'Two' });
    const third = await repository.addManualEntry({ queueId: queue.id, twitchUserId: 'user-3', userLogin: 'three', displayName: 'Three' });

    expect([first.entry.position, second.entry.position, third.entry.position]).toEqual([1, 2, 3]);
    expect(await repository.listWaiting(queue.id)).toMatchObject([
      { id: first.entry.id, position: 1 }, { id: second.entry.id, position: 2 }, { id: third.entry.id, position: 3 },
    ]);
  });

  it('serializes competing duplicate adds to one active entry per queue', async () => {
    const queue = await repository.createQueue({ slug: `race-${randomUUID().slice(0, 8)}`, title: 'Race', cost: 1 });
    const attempts = await Promise.all([
      repository.addManualEntry({ queueId: queue.id, twitchUserId: 'same-user', userLogin: 'same', displayName: 'Same' }),
      repository.addManualEntry({ queueId: queue.id, twitchUserId: 'same-user', userLogin: 'same', displayName: 'Same' }),
    ]);

    expect(attempts.filter((item) => item.status === 'created')).toHaveLength(1);
    expect(attempts.filter((item) => item.status === 'duplicate_active_entry')).toHaveLength(1);
    expect(await repository.listWaiting(queue.id)).toHaveLength(1);
  });

  it('allows the same viewer in another queue but only once within each queue', async () => {
    const firstQueue = await repository.createQueue({ slug: `viewer-a-${randomUUID().slice(0, 8)}`, title: 'Viewer A', cost: 1 });
    const secondQueue = await repository.createQueue({ slug: `viewer-b-${randomUUID().slice(0, 8)}`, title: 'Viewer B', cost: 1 });

    const first = await repository.addManualEntry({ queueId: firstQueue.id, twitchUserId: 'shared-viewer', userLogin: 'Viewer', displayName: 'Viewer' });
    const duplicate = await repository.addManualEntry({ queueId: firstQueue.id, twitchUserId: 'shared-viewer', userLogin: 'viewer', displayName: 'Viewer' });
    const otherQueue = await repository.addManualEntry({ queueId: secondQueue.id, twitchUserId: 'shared-viewer', userLogin: 'viewer', displayName: 'Viewer' });

    expect(first.status).toBe('created');
    expect(duplicate.status).toBe('duplicate_active_entry');
    expect(otherQueue.status).toBe('created');
    expect(await prisma.entry.count({ where: { twitchUserId: 'shared-viewer', status: { in: ['waiting', 'called', 'in_progress'] } } })).toBe(2);
  });

  it('permits manual additions to closed queues and rejects archived or deleting queues', async () => {
    const closedQueue = await repository.createQueue({ slug: `closed-${randomUUID().slice(0, 8)}`, title: 'Closed', cost: 1, isOpen: false });
    const closedAdd = await repository.addManualEntry({ queueId: closedQueue.id, twitchUserId: 'closed-user', userLogin: 'closed', displayName: 'Closed' });
    expect(closedAdd.status).toBe('created');

    const archivedQueue = await repository.createQueue({ slug: `archived-${randomUUID().slice(0, 8)}`, title: 'Archived', cost: 1, isArchived: true });
    await expect(repository.addManualEntry({ queueId: archivedQueue.id, twitchUserId: 'archived-user', userLogin: 'archived', displayName: 'Archived' }))
      .rejects.toMatchObject({ code: 'QUEUE_NOT_AVAILABLE' });

    const deletingQueue = await repository.createQueue({ slug: `deleting-${randomUUID().slice(0, 8)}`, title: 'Deleting', cost: 1, lifecycleStatus: 'deleting' });
    await expect(repository.addManualEntry({ queueId: deletingQueue.id, twitchUserId: 'deleting-user', userLogin: 'deleting', displayName: 'Deleting' }))
      .rejects.toMatchObject({ code: 'QUEUE_NOT_AVAILABLE' });
  });

  it('moves a waiting entry atomically and renumbers only its queue', async () => {
    const queue = await repository.createQueue({ slug: `move-${randomUUID().slice(0, 8)}`, title: 'Move', cost: 1 });
    const otherQueue = await repository.createQueue({ slug: `other-${randomUUID().slice(0, 8)}`, title: 'Other', cost: 1 });
    const entries = await Promise.all(['one', 'two', 'three'].map((id) => repository.addManualEntry({
      queueId: queue.id, twitchUserId: id, userLogin: id, displayName: id,
    })));
    const beforeMove = await repository.listWaiting(queue.id);
    const other = await repository.addManualEntry({ queueId: otherQueue.id, twitchUserId: 'other', userLogin: 'other', displayName: 'Other' });

    await repository.moveWaitingEntry({ queueId: queue.id, entryId: entries[2].entry.id, position: 1 });

    expect((await repository.listWaiting(queue.id)).map(({ id, position }) => [id, position]))
      .toEqual([
        [entries[2].entry.id, 1],
        ...beforeMove.filter(({ id }) => id !== entries[2].entry.id).map(({ id }, index) => [id, index + 2]),
      ]);
    expect(await repository.listWaiting(otherQueue.id)).toMatchObject([{ id: other.entry.id, position: 1 }]);
  });

  it('keeps continuous positions when two moves race on one queue', async () => {
    const queue = await repository.createQueue({ slug: `moves-${randomUUID().slice(0, 8)}`, title: 'Moves', cost: 1 });
    const entries = [];
    for (const id of ['move-a', 'move-b', 'move-c', 'move-d']) {
      entries.push(await repository.addManualEntry({ queueId: queue.id, twitchUserId: id, userLogin: id, displayName: id }));
    }

    await Promise.all([
      repository.moveWaitingEntry({ queueId: queue.id, entryId: entries[1].entry.id, position: 4 }),
      repository.moveWaitingEntry({ queueId: queue.id, entryId: entries[3].entry.id, position: 1 }),
    ]);

    const waiting = await repository.listWaiting(queue.id);
    expect(waiting.map(({ position }) => position)).toEqual([1, 2, 3, 4]);
    expect(new Set(waiting.map(({ id }) => id))).toEqual(new Set(entries.map(({ entry }) => entry.id)));
  });

  it('prevents another queue from claiming an existing slug or alias key', async () => {
    await repository.createQueue({ slug: `keys-${randomUUID().slice(0, 8)}`, aliases: ['shared-alias'], title: 'Keys', cost: 1 });
    await expect(repository.createQueue({ slug: 'shared-alias', title: 'Collision', cost: 1 }))
      .rejects.toMatchObject({ code: 'DUPLICATE_QUEUE_KEY' });
  });

  it('enforces source and redemption identifier integrity in PostgreSQL', async () => {
    const queue = await repository.createQueue({ slug: `integrity-${randomUUID().slice(0, 8)}`, title: 'Integrity', cost: 1 });
    const redemptionId = `redemption-${randomUUID()}`;
    await prisma.redemption.create({ data: {
      redemptionId, broadcasterId: 'broadcaster', rewardId: 'reward', userId: 'viewer',
      redeemedAt: new Date(), queueId: queue.id,
    } });

    await expect(prisma.entry.create({ data: {
      queueId: queue.id, twitchUserId: 'manual-with-redemption', userLogin: 'manual', displayName: 'Manual',
      source: 'manual', redemptionId,
    } })).rejects.toThrow(/entries_source_redemption_check/);
    await expect(prisma.entry.create({ data: {
      queueId: queue.id, twitchUserId: 'redemption-without-id', userLogin: 'redeemed', displayName: 'Redeemed',
      source: 'redemption',
    } })).rejects.toThrow(/entries_source_redemption_check/);
  });

  it('replaces a queue slug and aliases atomically and frees the prior names', async () => {
    const queue = await repository.createQueue({
      slug: `old-${randomUUID().slice(0, 8)}`, aliases: ['old-alias'], title: 'Keys', cost: 1,
    });
    const updated = await repository.replaceQueueKeys({ queueId: queue.id, slug: 'new-slug', aliases: ['new-alias'] });

    expect(updated.keys).toEqual([
      { key: 'new-slug', keyType: 'slug' }, { key: 'new-alias', keyType: 'alias' },
    ]);
    expect(await prisma.queueKey.findMany({ where: { queueId: queue.id }, orderBy: { keyType: 'asc' } }))
      .toMatchObject([{ key: 'new-alias', keyType: 'alias' }, { key: 'new-slug', keyType: 'slug' }]);
  });

  it('keeps prior queue keys when a replacement collides with another queue', async () => {
    const first = await repository.createQueue({
      slug: `first-${randomUUID().slice(0, 8)}`, aliases: ['owned-alias'], title: 'First', cost: 1,
    });
    await repository.createQueue({ slug: `second-${randomUUID().slice(0, 8)}`, aliases: ['reserved-for-second'], title: 'Second', cost: 1 });

    await expect(repository.replaceQueueKeys({ queueId: first.id, slug: 'reserved-for-second' }))
      .rejects.toMatchObject({ code: 'DUPLICATE_QUEUE_KEY' });
    expect(await prisma.queueKey.findMany({ where: { queueId: first.id }, orderBy: { key: 'asc' } }))
      .toMatchObject([{ key: first.slug, keyType: 'slug' }, { key: 'owned-alias', keyType: 'alias' }]);
  });

  it('clears stored UIDs atomically when a queue changes to hidden mode', async () => {
    const queue = await repository.createQueue({
      slug: `privacy-${randomUUID().slice(0, 8)}`, title: 'Privacy', cost: 1, uidMode: 'visible',
    });
    const added = await repository.addManualEntry({
      queueId: queue.id, twitchUserId: 'privacy-user', userLogin: 'privacy', displayName: 'Privacy', uid: '123456789',
    });
    expect(added.entry.uid).toBe('123456789');
    const notification = await prisma.outbox.create({ data: {
      operationType: 'chat.call', entityType: 'entry', entityId: added.entry.id,
      idempotencyKey: `call-${randomUUID()}`, payload: { text: 'Privacy: 123456789' }, entryId: added.entry.id,
    } });

    await repository.setUidMode({ queueId: queue.id, uidMode: 'hidden' });

    expect(await prisma.entry.findUnique({ where: { id: added.entry.id } })).toMatchObject({ uid: null });
    expect(await repository.listWaiting(queue.id)).toMatchObject([{ uid: null }]);
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({ uidMode: 'hidden' });
    expect(await prisma.outbox.findUnique({ where: { id: notification.id } }))
      .toMatchObject({ status: 'cancelled', payload: {} });
  });

  it('applies entry transitions, audit, and waiting renumbering inside PostgreSQL transactions', async () => {
    const queue = await repository.createQueue({
      slug: `transition-${randomUUID().slice(0, 8)}`, title: 'Transition', cost: 1,
      refundIfRemovedWhileCalled: false, refundOnNoShow: true, refundIfViewerLeavesCalled: false,
    });
    const first = await repository.addManualEntry({ queueId: queue.id, twitchUserId: 'first', userLogin: 'first', displayName: 'First' });
    const second = await repository.addManualEntry({ queueId: queue.id, twitchUserId: 'second', userLogin: 'second', displayName: 'Second' });

    const called = await queueService.transitionEntry({
      entryId: first.entry.id, to: 'called', origin: 'panel', actorId: 'broadcaster', reason: 'operator_call',
    });
    expect(called).toMatchObject({ status: 'called', position: null });
    expect(await repository.listWaiting(queue.id)).toMatchObject([{ id: second.entry.id, position: 1 }]);

    const started = await queueService.transitionEntry({
      entryId: first.entry.id, to: 'in_progress', origin: 'panel', actorId: 'broadcaster', reason: 'service_started',
    });
    expect(started.startedAt).toBeInstanceOf(Date);
    expect(started.callDeadlineAt).toBeNull();

    await expect(queueService.transitionEntry({
      entryId: first.entry.id, to: 'no_show', origin: 'timer', actorId: null, reason: 'timeout',
    })).rejects.toMatchObject({ code: 'INVALID_ENTRY_TRANSITION' });
    expect(await prisma.entry.findUnique({ where: { id: first.entry.id } })).toMatchObject({ status: 'in_progress' });
    const audit = await prisma.auditLog.findMany({ where: { entryId: first.entry.id }, orderBy: { createdAt: 'asc' } });
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({
      origin: 'panel', actorId: 'broadcaster', previousState: 'waiting', nextState: 'called', reason: 'operator_call',
      safeDetail: { financialDecision: 'no_operation', policySnapshot: { refundIfRemovedWhileCalled: false } },
    });
    expect(audit[1]).toMatchObject({
      origin: 'panel', actorId: 'broadcaster', previousState: 'called', nextState: 'in_progress', reason: 'service_started',
    });
    expect(await prisma.outbox.count({ where: { entryId: first.entry.id } })).toBe(0);
  });

  it('serializes competing terminal transitions so only one decision is recorded', async () => {
    const queue = await repository.createQueue({ slug: `terminal-race-${randomUUID().slice(0, 8)}`, title: 'Terminal race', cost: 1 });
    const added = await repository.addManualEntry({ queueId: queue.id, twitchUserId: 'terminal-race-user', userLogin: 'terminal', displayName: 'Terminal' });
    await queueService.transitionEntry({ entryId: added.entry.id, to: 'called', origin: 'panel', reason: 'operator_call' });

    const outcomes = await Promise.allSettled([
      queueService.transitionEntry({ entryId: added.entry.id, to: 'completed', origin: 'panel', reason: 'service_completed' }),
      queueService.transitionEntry({ entryId: added.entry.id, to: 'removed', origin: 'panel', reason: 'operator_removed' }),
    ]);

    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status, reason }) => status === 'rejected' && reason.code === 'INVALID_ENTRY_TRANSITION')).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { entryId: added.entry.id } })).toBe(2);
    expect(await prisma.entry.findUnique({ where: { id: added.entry.id } })).toMatchObject({
      status: expect.stringMatching(/^(completed|removed)$/), position: null,
    });
  });
});
