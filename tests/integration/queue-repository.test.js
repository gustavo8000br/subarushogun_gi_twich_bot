import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createQueueDomainService } from '../../apps/api/src/domain/queue-service.mjs';
import { createQueueRepository } from '../../apps/api/src/persistence/queue-repository.mjs';
import { createTwitchCredentialRepository } from '../../apps/api/src/persistence/twitch-credential-repository.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const containerName = `queuebot-repo-${process.pid}-${randomUUID().slice(0, 8)}`;
let prisma;
let repository;
let queueService;
let credentialRepository;
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
    credentialRepository = createTwitchCredentialRepository(prisma);
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

  it('persists queue creation and a managed reward creation intent atomically', async () => {
    const slug = `reward-${randomUUID().slice(0, 8)}`;
    const result = await repository.createQueueWithRewardIntent({
      slug,
      title: 'Reward queue',
      cost: 250,
      rewardPrompt: 'Send only your UID.',
      uidMode: 'visible',
      actorId: 'operator-session',
    });

    expect(result.queue).toMatchObject({ slug, title: 'Reward queue', rewardId: null, remoteSyncStatus: 'pending_create' });
    const task = await prisma.outbox.findUnique({ where: { idempotencyKey: `queue:${result.queue.id}:reward.create` } });
    expect(task).toMatchObject({
      operationType: 'reward.create',
      entityType: 'queue',
      entityId: result.queue.id,
      status: 'pending',
      payload: { title: 'Reward queue', cost: 250, prompt: 'Send only your UID.', uidMode: 'visible' },
    });
    expect(await prisma.auditLog.findMany({ where: { queueId: result.queue.id } })).toMatchObject([
      { event: 'queue.reward_creation_requested', actorId: 'operator-session', origin: 'panel' },
    ]);
  });

  it('rolls back queue and reward intent together when queue keys collide', async () => {
    const slug = `collision-${randomUUID().slice(0, 8)}`;
    await repository.createQueue({ slug, title: 'Existing', cost: 1 });

    await expect(repository.createQueueWithRewardIntent({ slug, title: 'Duplicate', cost: 250 }))
      .rejects.toMatchObject({ code: 'DUPLICATE_QUEUE_KEY' });
    expect(await prisma.queue.count({ where: { slug } })).toBe(1);
    expect(await prisma.outbox.count({ where: { operationType: 'reward.create' } })).toBe(1);
  });

  it('claims reward creation with a lease, records safe intent, confirms ownership, and recovers expired leases', async () => {
    const queue = await repository.createQueueWithRewardIntent({
      slug: `reward-worker-${randomUUID().slice(0, 8)}`, title: 'Worker queue', cost: 250,
      rewardPrompt: 'Only UID.', uidMode: 'visible',
    });
    const now = new Date(Date.now() + 1000);
    const claimed = await repository.claimNextRewardOperation({ now: new Date(now.getTime() + 86_400_000), leaseMs: 1000 });
    expect(claimed).toMatchObject({ operationType: 'reward.create', status: 'processing', attempts: 1, queue: { id: queue.queue.id } });
    expect(claimed.leaseToken).toBeTruthy();
    expect(await repository.prepareRewardCreate(claimed.id, { baselineRewardIds: ['old-id'], requestMayHaveReachedTwitch: true }, claimed.leaseToken)).toBe(true);

    const task = await prisma.outbox.findUnique({ where: { id: claimed.id } });
    expect(task).toMatchObject({ status: 'processing', payload: { baselineRewardIds: ['old-id'], requestMayHaveReachedTwitch: true } });
    expect(await repository.confirmRewardCreated(claimed.id, { rewardId: 'managed-reward-id' }, claimed.leaseToken)).toBe(true);
    expect(await prisma.queue.findUnique({ where: { id: queue.queue.id } })).toMatchObject({ rewardId: 'managed-reward-id', remoteSyncStatus: 'synced' });
    expect(await prisma.outbox.findUnique({ where: { id: claimed.id } })).toMatchObject({ status: 'confirmed', leaseToken: null });

    const nextQueue = await repository.createQueueWithRewardIntent({
      slug: `reward-lease-${randomUUID().slice(0, 8)}`, title: 'Lease queue', cost: 300,
    });
    const firstClaim = await repository.claimNextRewardOperation({ now: new Date(now.getTime() + 86_401_000), leaseMs: 1000 });
    expect(firstClaim).toMatchObject({ queue: { id: nextQueue.queue.id }, attempts: 1 });
    const recovered = await repository.claimNextRewardOperation({ now: new Date(now.getTime() + 86_402_001), leaseMs: 1000 });
    expect(recovered).toMatchObject({ id: firstClaim.id, queue: { id: nextQueue.queue.id }, attempts: 2 });
    expect(recovered.leaseToken).not.toBe(firstClaim.leaseToken);
  });

  it('keeps an ambiguous reward association visible and prevents queue activation', async () => {
    const result = await repository.createQueueWithRewardIntent({
      slug: `reward-unknown-${randomUUID().slice(0, 8)}`, title: 'Unknown queue', cost: 100,
    });
    const task = await repository.claimNextRewardOperation({ now: new Date(Date.now() + 86_400_000) });
    await repository.unknownRewardOperation(task.id, 'reward_create_association_ambiguous', task.leaseToken);
    expect(await prisma.queue.findUnique({ where: { id: result.queue.id } })).toMatchObject({ rewardId: null, remoteSyncStatus: 'create_unknown' });
    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'unknown', lastError: 'reward_create_association_ambiguous', leaseToken: null });
  });

  it('resolves an ambiguous managed reward only with an operator actor and preserves the audit trail', async () => {
    const result = await repository.createQueueWithRewardIntent({
      slug: `reward-manual-${randomUUID().slice(0, 8)}`, title: 'Manual resolve', cost: 125,
    });
    const task = await repository.claimNextRewardOperation({ now: new Date(Date.now() + 86_400_000) });
    await repository.unknownRewardOperation(task.id, 'reward_create_association_ambiguous', task.leaseToken);

    const resolved = await repository.resolveUnknownRewardCreation({ queueId: result.queue.id, rewardId: 'picked-managed-reward', actorId: 'operator-session' });
    expect(resolved).toMatchObject({ status: 'resolved', queue: { rewardId: 'picked-managed-reward', remoteSyncStatus: 'synced_manual', isOpen: false } });
    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'resolved_manual', lastError: null });
    expect(await prisma.auditLog.findMany({ where: { queueId: result.queue.id, event: 'queue.reward_creation_resolved_manually' } })).toMatchObject([
      { actorId: 'operator-session', origin: 'panel', safeDetail: { rewardId: 'picked-managed-reward', remoteConfirmed: false } },
    ]);
  });

  it('rejects manual reward association when no ambiguous creation is pending', async () => {
    const queue = await repository.createQueue({ slug: `not-unk-${randomUUID().slice(0, 8)}`, title: 'Not unknown', cost: 50 });
    await expect(repository.resolveUnknownRewardCreation({ queueId: queue.id, rewardId: 'arbitrary-reward', actorId: 'operator-session' }))
      .rejects.toMatchObject({ code: 'REWARD_ASSOCIATION_NOT_PENDING' });
  });

  it('clears the preflight request marker transactionally after Twitch explicitly rate-limits reward creation', async () => {
    const result = await repository.createQueueWithRewardIntent({
      slug: `rate-${randomUUID().slice(0, 8)}`, title: 'Rate limited queue', cost: 50,
    });
    const now = new Date(Date.now() + 86_400_000);
    const task = await repository.claimNextRewardOperation({ now });
    expect(task.queue.id).toBe(result.queue.id);
    await repository.prepareRewardCreate(task.id, { baselineRewardIds: ['known-before'], requestMayHaveReachedTwitch: true }, task.leaseToken);
    await repository.retryRewardOperation(task.id, {
      nextAttemptAt: new Date(now.getTime() + 17_000), errorCode: 'reward_create_rate_limited',
      payloadUpdates: { requestMayHaveReachedTwitch: false },
    }, task.leaseToken);
    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({
      status: 'retry', attempts: 1,
      payload: { baselineRewardIds: ['known-before'], requestMayHaveReachedTwitch: false },
      lastError: 'reward_create_rate_limited', leaseToken: null,
    });
  });

  it('calls a bounded next group atomically and returns prior positions', async () => {
    const queue = await repository.createQueue({ slug: `call-${randomUUID().slice(0, 8)}`, title: 'Call', cost: 1 });
    const first = await repository.addManualEntry({ queueId: queue.id, twitchUserId: `c-${randomUUID()}`, userLogin: 'first', displayName: 'First' });
    const second = await repository.addManualEntry({ queueId: queue.id, twitchUserId: `c-${randomUUID()}`, userLogin: 'second', displayName: 'Second' });
    const selected = await queueService.callNext({ queueId: queue.id, count: 2 });
    expect(selected).toMatchObject([{ id: first.entry.id, previousPosition: 1, status: 'called' }, { id: second.entry.id, previousPosition: 2, status: 'called' }]);
    expect(await repository.listWaiting(queue.id)).toEqual([]);
  });

  it('calls a selected waiting entry through the domain service and preserves remaining order', async () => {
    const queue = await repository.createQueue({ slug: `call-one-${randomUUID().slice(0, 8)}`, title: 'Call one', cost: 1 });
    const first = await repository.addManualEntry({ queueId: queue.id, twitchUserId: `call-a-${randomUUID()}`, userLogin: 'first', displayName: 'First' });
    const second = await repository.addManualEntry({ queueId: queue.id, twitchUserId: `call-b-${randomUUID()}`, userLogin: 'second', displayName: 'Second' });

    const called = await queueService.callSpecificEntry({ queueId: queue.id, entryId: second.entry.id, actorId: 'operator' });

    expect(called).toMatchObject({ id: second.entry.id, status: 'called', previousPosition: 2 });
    expect(await repository.listWaiting(queue.id)).toMatchObject([{ id: first.entry.id, position: 1 }]);
    expect(await prisma.auditLog.findMany({ where: { entryId: second.entry.id } })).toMatchObject([
      { previousState: 'waiting', nextState: 'called', reason: 'operator_call' },
    ]);
  });

  it('does not reclaim a chat call notification until its persisted retry time', async () => {
    const queue = await repository.createQueue({ slug: `chat-retry-${randomUUID().slice(0, 8)}`, title: 'Chat retry', cost: 1 });
    const added = await repository.addManualEntry({ queueId: queue.id, twitchUserId: `retry-${randomUUID()}`, userLogin: 'retryuser', displayName: 'Retry User' });
    await queueService.callSpecificEntry({ queueId: queue.id, entryId: added.entry.id, actorId: 'operator' });
    const dueAt = new Date(Date.now() + 120_000);
    await repository.enqueueCallNotification({ queueId: queue.id, entryId: added.entry.id });
    const task = await prisma.outbox.findFirst({ where: { operationType: 'chat.call', entityId: added.entry.id } });
    expect(task).toBeTruthy();
    const claimed = await repository.claimNextChatNotification({ now: new Date() });
    expect(claimed).toMatchObject({ id: task.id });
    await repository.finishCallNotification(task.id, {
      status: 'retry', errorCode: 'chat_delivery_not_confirmed', nextAttemptAt: dueAt,
    });

    expect(await repository.claimNextChatNotification({ now: new Date(dueAt.getTime() - 1) })).toBeNull();
    expect(await repository.claimNextChatNotification({ now: dueAt })).toMatchObject({ id: task.id });
  });

  it('resends an existing call notification without changing the call transition or deadline', async () => {
    const queue = await repository.createQueue({ slug: `call-resend-${randomUUID().slice(0, 8)}`, title: 'Call resend', cost: 1 });
    const added = await repository.addManualEntry({ queueId: queue.id, twitchUserId: `resend-${randomUUID()}`, userLogin: 'resenduser', displayName: 'Resend User' });
    const called = await queueService.callSpecificEntry({ queueId: queue.id, entryId: added.entry.id, actorId: 'operator' });
    const deadline = new Date(Date.now() + 60_000);
    await prisma.entry.update({ where: { id: added.entry.id }, data: { callNotifiedAt: new Date(), callDeadlineAt: deadline } });
    await repository.enqueueCallNotification({ queueId: queue.id, entryId: added.entry.id });
    const original = await prisma.outbox.findUnique({ where: { idempotencyKey: `chat.call:${added.entry.id}` } });
    await prisma.outbox.update({ where: { id: original.id }, data: { status: 'confirmed', attempts: 1 } });

    const result = await repository.resendCallNotification({ entryId: added.entry.id, actorId: 'operator' });

    expect(result).toMatchObject({ status: 'queued', entryId: added.entry.id });
    expect(await prisma.outbox.findUnique({ where: { id: original.id } })).toMatchObject({ status: 'pending', attempts: 0 });
    expect(await prisma.entry.findUnique({ where: { id: added.entry.id } })).toMatchObject({ status: 'called', calledAt: called.calledAt, callDeadlineAt: deadline });
    expect(await prisma.auditLog.findMany({ where: { entryId: added.entry.id, event: 'entry.call_notification_resent' } })).toMatchObject([
      { actorId: 'operator', reason: 'operator_call_notification_resend' },
    ]);
  });

  it('resolves a viewer entry strictly by Twitch identity and moves only waiting entries', async () => {
    const queue = await repository.createQueue({ slug: `viewer-ops-${randomUUID().slice(0, 8)}`, title: 'Viewer ops', cost: 1 });
    const first = await repository.addManualEntry({ queueId: queue.id, twitchUserId: `v-${randomUUID()}`, userLogin: 'first', displayName: 'First' });
    await repository.addManualEntry({ queueId: queue.id, twitchUserId: `v-${randomUUID()}`, userLogin: 'second', displayName: 'Second' });
    expect(await repository.getActiveEntryForUser(queue.id, first.entry.twitchUserId)).toMatchObject({ id: first.entry.id });
    expect(await repository.getActiveEntryForUser(queue.id, 'display-name-is-not-an-id')).toBeNull();
    expect(await repository.moveWaitingEntry({ queueId: queue.id, entryId: first.entry.id, position: 2 })).toMatchObject({ status: 'moved', position: 2 });
    expect(await repository.listWaiting(queue.id)).toMatchObject([{ position: 1 }, { id: first.entry.id, position: 2 }]);
  });

  it('provides queue key, ordered chat lists, and own active entry projections', async () => {
    const queue = await repository.createQueue({ slug: `query-${randomUUID().slice(0, 8)}`, title: 'Query', cost: 1 });
    const created = await repository.addManualEntry({ queueId: queue.id, twitchUserId: `q-${randomUUID()}`, userLogin: 'queryuser', displayName: 'Query User' });
    expect(await repository.getQueueByKey(queue.slug)).toMatchObject({ id: queue.id });
    expect(await repository.listEntriesByStatus(queue.id, ['waiting'])).toMatchObject([{ id: created.entry.id, position: 1 }]);
    expect(await repository.listQueueChatEntries(queue.id)).toMatchObject({ totalWaiting: 1, waiting: [{ id: created.entry.id, position: 1 }] });
  });

  it('persists manual account changes and resets to the configured default', async () => {
    const changed = await repository.setCurrentAccount('Spiral Abyss', 'operator-1');
    expect(changed).toMatchObject({ label: 'Spiral Abyss', source: 'manual', ownerEntryId: null });
    expect(await repository.getCurrentAccount()).toMatchObject({ label: 'Spiral Abyss', source: 'manual' });
    expect(await repository.resetCurrentAccount('operator-1')).toMatchObject({ label: 'Streamer', source: 'default', ownerEntryId: null });
  });

  it('changes the default account label and updates the active label only when source is default', async () => {
    const initial = await repository.setDefaultAccountLabel('Default One', 'operator');
    expect(initial).toMatchObject({ label: 'Default One', defaultLabel: 'Default One', source: 'default' });
    await repository.setCurrentAccount('Manual Label', 'operator');
    const updated = await repository.setDefaultAccountLabel('Default Two', 'operator');
    expect(updated).toMatchObject({ label: 'Manual Label', defaultLabel: 'Default Two', source: 'manual' });
    await repository.resetCurrentAccount('operator');
    expect(await repository.getCurrentAccount()).toMatchObject({ label: 'Default Two', defaultLabel: 'Default Two', source: 'default' });
  });

  it('binds automatic account switching to a single call and only its owner can reset it', async () => {
    await repository.setDefaultAccountLabel('Streamer', 'operator');
    await repository.resetCurrentAccount('operator');
    const queue = await repository.createQueue({ slug: `account-owner-${randomUUID().slice(0, 8)}`, title: 'Account owner', cost: 1, autoSwitchAccount: true });
    const owner = await repository.addManualEntry({ queueId: queue.id, twitchUserId: `owner-${randomUUID()}`, userLogin: 'owner', displayName: 'Owner Display' });
    const other = await repository.addManualEntry({ queueId: queue.id, twitchUserId: `other-${randomUUID()}`, userLogin: 'other', displayName: 'Other Display' });
    await queueService.callNext({ queueId: queue.id, count: 1, actorId: 'operator' });
    expect(await repository.getCurrentAccount()).toMatchObject({ label: 'Owner Display', source: 'queue_auto', ownerEntryId: owner.entry.id });
    await queueService.transitionEntry({ entryId: other.entry.id, to: 'removed', origin: 'moderator', actorId: 'operator', reason: 'operator_removed' });
    expect(await repository.getCurrentAccount()).toMatchObject({ ownerEntryId: owner.entry.id });
    await repository.setCurrentAccount('Manual override', 'operator');
    expect(await repository.getCurrentAccount()).toMatchObject({ label: 'Manual override', ownerEntryId: owner.entry.id });
    await queueService.transitionEntry({ entryId: owner.entry.id, to: 'in_progress', origin: 'panel', actorId: 'operator', reason: 'service_started' });
    await queueService.transitionEntry({ entryId: owner.entry.id, to: 'completed', origin: 'panel', actorId: 'operator', reason: 'service_completed' });
    expect(await repository.getCurrentAccount()).toMatchObject({ label: 'Streamer', source: 'default', ownerEntryId: null });
  });

  it('does not switch current account for a group call with only one available viewer', async () => {
    await repository.resetCurrentAccount('operator');
    const queue = await repository.createQueue({ slug: `account-group-${randomUUID().slice(0, 8)}`, title: 'Account group', cost: 1, autoSwitchAccount: true });
    const only = await repository.addManualEntry({ queueId: queue.id, twitchUserId: `group-${randomUUID()}`, userLogin: 'group', displayName: 'Group Viewer' });
    await queueService.callNext({ queueId: queue.id, count: 2, actorId: 'operator' });
    expect(await repository.getCurrentAccount()).not.toMatchObject({ label: 'Group Viewer', ownerEntryId: only.entry.id });
  });

  it('serializes automatic account ownership across concurrent calls from separate queues', async () => {
    await repository.resetCurrentAccount('operator');
    const firstQueue = await repository.createQueue({ slug: `account-race-a-${randomUUID().slice(0, 8)}`, title: 'Account Race A', cost: 1, autoSwitchAccount: true });
    const secondQueue = await repository.createQueue({ slug: `account-race-b-${randomUUID().slice(0, 8)}`, title: 'Account Race B', cost: 1, autoSwitchAccount: true });
    const first = await repository.addManualEntry({ queueId: firstQueue.id, twitchUserId: `race-a-${randomUUID()}`, userLogin: 'racea', displayName: 'Race A' });
    const second = await repository.addManualEntry({ queueId: secondQueue.id, twitchUserId: `race-b-${randomUUID()}`, userLogin: 'raceb', displayName: 'Race B' });
    await prisma.$executeRawUnsafe(`CREATE FUNCTION test_delay_account_state_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.key = 'account_state' THEN PERFORM pg_sleep(0.2); END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER test_delay_account_state_write BEFORE INSERT OR UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION test_delay_account_state_write()');

    try {
      await Promise.all([
        queueService.callNext({ queueId: firstQueue.id, count: 1, actorId: 'operator' }),
        queueService.callNext({ queueId: secondQueue.id, count: 1, actorId: 'operator' }),
      ]);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER test_delay_account_state_write ON settings');
      await prisma.$executeRawUnsafe('DROP FUNCTION test_delay_account_state_write()');
    }

    const switches = await prisma.auditLog.findMany({
      where: { event: 'account.auto_switched', entryId: { in: [first.entry.id, second.entry.id] } },
      orderBy: { createdAt: 'asc' },
    });
    expect(switches).toHaveLength(2);
    expect(switches.map((item) => item.previousState)).toEqual(['Streamer', switches[0].nextState]);
    const account = await repository.getCurrentAccount();
    expect(account).toMatchObject({ ownerEntryId: switches[1].entryId, label: switches[1].nextState });
  });

  it('persists chat message deduplication and viewer cooldown across repository recreation', async () => {
    const now = new Date('2026-10-06T12:00:00.000Z');
    const claim = (messageId, at) => repository.claimChatCommand({
      messageId, channelId: 'broadcaster-1', userId: 'viewer-cooldown-1', role: 'viewer',
      cooldownExempt: false, now: new Date(now.getTime() + at),
    });
    expect(await claim('cooldown-message-1', 0)).toEqual({ status: 'accepted' });
    expect(await createQueueRepository(prisma).claimChatCommand({
      messageId: 'cooldown-message-1', channelId: 'broadcaster-1', userId: 'viewer-cooldown-1', role: 'viewer',
      cooldownExempt: false, now: new Date(now.getTime() + 10_000),
    })).toEqual({ status: 'duplicate' });
    expect(await claim('cooldown-message-2', 4_999)).toEqual({ status: 'cooldown' });
    expect(await claim('cooldown-message-2', 10_000)).toEqual({ status: 'duplicate' });
    expect(await claim('cooldown-message-3', 5_000)).toEqual({ status: 'accepted' });
  });

  it('serializes viewer cooldown claims across concurrent messages and exempts managers', async () => {
    const now = new Date('2026-10-06T12:01:00.000Z');
    const claimViewer = (messageId) => repository.claimChatCommand({
      messageId, channelId: 'broadcaster-1', userId: 'viewer-race-1', role: 'viewer', cooldownExempt: false, now,
    });
    const parallel = await Promise.all([claimViewer('cooldown-race-1'), claimViewer('cooldown-race-2')]);
    expect(parallel.map(({ status }) => status).sort()).toEqual(['accepted', 'cooldown']);
    expect(await repository.claimChatCommand({
      messageId: 'manager-race-1', channelId: 'broadcaster-1', userId: 'moderator-1', role: 'moderator', cooldownExempt: false, now,
    })).toEqual({ status: 'accepted' });
    expect(await repository.claimChatCommand({
      messageId: 'manager-race-2', channelId: 'broadcaster-1', userId: 'moderator-1', role: 'moderator', cooldownExempt: false, now,
    })).toEqual({ status: 'accepted' });
  });

  it('persists a remote reward pause intent when opening a managed queue', async () => {
    const queue = await repository.createQueue({ slug: `open-${randomUUID().slice(0, 8)}`, title: 'Open queue', cost: 1 });
    await prisma.queue.update({ where: { id: queue.id }, data: { rewardId: `managed-${randomUUID()}`, remoteSyncStatus: 'synced' } });

    const result = await repository.setQueueOpen(queue.id, true, 'moderator-1');
    const task = await prisma.outbox.findFirst({ where: { operationType: 'reward.set_open', entityId: queue.id } });

    expect(result).toMatchObject({ status: 'pending', isOpen: true, remoteSyncStatus: 'pending_open' });
    expect(task).toMatchObject({ operationType: 'reward.set_open', entityType: 'queue', status: 'pending', payload: { isOpen: true } });
    expect(task.idempotencyKey).toMatch(new RegExp(`^queue:${queue.id}:reward\\.open:`));
    const claimed = await repository.claimNextRewardOperation();
    expect(claimed).toMatchObject({ id: task.id, operationType: 'reward.set_open', queue: { id: queue.id, rewardId: expect.any(String) } });
    expect(await repository.prepareRewardOpen(claimed.id, claimed.leaseToken)).toBe(true);
    expect(await repository.confirmRewardOpen(claimed.id, { isOpen: true }, claimed.leaseToken)).toBe(true);
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({ isOpen: true, remoteSyncStatus: 'synced' });
    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'confirmed', leaseToken: null });
  });

  it('keeps a repeated open request pending until the remote reward state is confirmed', async () => {
    const queue = await repository.createQueue({ slug: `open-repeat-${randomUUID().slice(0, 8)}`, title: 'Open repeat', cost: 1 });
    await prisma.queue.update({ where: { id: queue.id }, data: { rewardId: `managed-${randomUUID()}`, remoteSyncStatus: 'synced' } });

    expect(await repository.setQueueOpen(queue.id, true, 'operator-1')).toMatchObject({ status: 'pending', remoteSyncStatus: 'pending_open' });
    const repeated = await repository.setQueueOpen(queue.id, true, 'operator-2');

    expect(repeated).toMatchObject({ status: 'pending', isOpen: true, remoteSyncStatus: 'pending_open' });
    expect(await prisma.outbox.count({ where: { operationType: 'reward.set_open', entityId: queue.id } })).toBe(1);
  });

  it('archives an open queue with a durable pause intent and preserves active entries', async () => {
    const queue = await repository.createQueue({ slug: `archive-${randomUUID().slice(0, 8)}`, title: 'Archive', cost: 1 });
    await prisma.queue.update({ where: { id: queue.id }, data: { rewardId: `managed-${randomUUID()}`, remoteSyncStatus: 'synced', isOpen: true } });
    const entry = await repository.addManualEntry({ queueId: queue.id, twitchUserId: `archive-user-${randomUUID()}`, userLogin: 'archiveuser', displayName: 'Archive User' });

    const result = await repository.archiveQueue({ queueId: queue.id, actorId: 'operator-archive' });

    expect(result).toMatchObject({ status: 'pending', queue: { isArchived: true, isOpen: false, remoteSyncStatus: 'pending_close' } });
    expect(await prisma.outbox.findFirst({ where: { operationType: 'reward.set_open', entityId: queue.id } })).toMatchObject({ status: 'pending', payload: { isOpen: false, archiveAfterConfirm: true } });
    expect(await repository.getEntry(entry.entry.id)).toMatchObject({ status: 'waiting', position: 1 });
    await expect(repository.addManualEntry({ queueId: queue.id, twitchUserId: 'other-archive-user', userLogin: 'other', displayName: 'Other' }))
      .rejects.toMatchObject({ code: 'QUEUE_NOT_AVAILABLE' });
  });

  it('keeps archived queue entries callable while blocking new entries', async () => {
    const queue = await repository.createQueue({ slug: `archive-call-${randomUUID().slice(0, 8)}`, title: 'Archive call', cost: 1 });
    const entry = await repository.addManualEntry({ queueId: queue.id, twitchUserId: `archive-call-user-${randomUUID()}`, userLogin: 'archivecaller', displayName: 'Archive Caller' });
    await prisma.queue.update({ where: { id: queue.id }, data: { isArchived: true } });

    const called = await queueService.callNext({ queueId: queue.id, count: 1 });

    expect(called).toMatchObject([{ id: entry.entry.id, status: 'called' }]);
    await expect(repository.addManualEntry({ queueId: queue.id, twitchUserId: 'new-archive-user', userLogin: 'newuser', displayName: 'New User' }))
      .rejects.toMatchObject({ code: 'QUEUE_NOT_AVAILABLE' });
  });

  it('unarchives a queue without reopening it or changing its entries', async () => {
    const queue = await repository.createQueue({ slug: `unarchive-${randomUUID().slice(0, 8)}`, title: 'Unarchive', cost: 1 });
    await prisma.queue.update({ where: { id: queue.id }, data: { rewardId: `managed-${randomUUID()}`, remoteSyncStatus: 'synced', isOpen: false } });
    const entry = await repository.addManualEntry({ queueId: queue.id, twitchUserId: `unarchive-user-${randomUUID()}`, userLogin: 'unarchiveuser', displayName: 'Unarchive User' });
    await prisma.queue.update({ where: { id: queue.id }, data: { isArchived: true } });
    const result = await repository.unarchiveQueue({ queueId: queue.id, actorId: 'operator-unarchive' });

    expect(result).toMatchObject({ status: 'unarchived', queue: { isArchived: false, isOpen: false, remoteSyncStatus: 'synced' } });
    expect(await repository.getEntry(entry.entry.id)).toMatchObject({ status: 'waiting', position: 1 });
  });

  it('requests resumable deletion, removes active entries and forces cancellation regardless of queue policy', async () => {
    const queue = await repository.createQueue({ slug: `delete-open-${randomUUID().slice(0, 8)}`, title: 'Delete open', cost: 1, refundIfRemovedWhileCalled: false });
    const rewardId = `managed-${randomUUID()}`;
    await prisma.queue.update({ where: { id: queue.id }, data: { rewardId, remoteSyncStatus: 'synced', isOpen: true } });
    const redemptionId = `delete-r-${randomUUID()}`;
    const redemption = await repository.importRedemption({ id: redemptionId, broadcasterId: 'broadcaster-1', rewardId, userId: 'delete-user', userLogin: 'deleteuser', displayName: 'Delete User', userInput: '', redeemedAt: new Date(), status: 'UNFULFILLED' });
    expect(redemption.status).toBe('added');
    const manual = await repository.addManualEntry({ queueId: queue.id, twitchUserId: `delete-manual-${randomUUID()}`, userLogin: 'manual', displayName: 'Manual' });

    const result = await queueService.deleteQueue({ queueId: queue.id, actorId: 'operator-delete' });

    expect(result).toMatchObject({ status: 'pending', activeRemoved: 2, refundsRequested: 1, queue: { lifecycleStatus: 'deleting', isArchived: true, isOpen: false, remoteSyncStatus: 'pending_close' } });
    expect(await repository.getEntry(redemption.entryId)).toMatchObject({ status: 'removed', terminalReason: 'queue_deleted' });
    expect(await repository.getEntry(manual.entry.id)).toMatchObject({ status: 'removed', terminalReason: 'queue_deleted' });
    expect(await prisma.outbox.findUnique({ where: { idempotencyKey: `financial:${redemptionId}` } })).toMatchObject({ operationType: 'redemption.cancel', status: 'pending' });
    expect(await prisma.outbox.findFirst({ where: { operationType: 'reward.set_open', entityId: queue.id } })).toMatchObject({ payload: { isOpen: false, deleteAfterConfirm: true } });
  });

  it('restores the pending pause stage when an operator retries an unknown queue deletion', async () => {
    const queue = await repository.createQueue({ slug: `delete-retry-${randomUUID().slice(0, 8)}`, title: 'Delete retry', cost: 1 });
    await prisma.queue.update({ where: { id: queue.id }, data: { rewardId: `managed-${randomUUID()}`, remoteSyncStatus: 'synced', isOpen: true } });
    await queueService.deleteQueue({ queueId: queue.id, actorId: 'operator-delete' });
    const task = await prisma.outbox.findFirst({ where: { operationType: 'reward.set_open', entityId: queue.id } });
    const leaseToken = randomUUID();
    await prisma.outbox.update({ where: { id: task.id }, data: { status: 'processing', leaseToken, leaseUntil: new Date(Date.now() + 60_000) } });

    expect(await repository.unknownRewardOperation(task.id, 'reward_open_result_unknown', leaseToken)).toBe(true);
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({ remoteSyncStatus: 'close_unknown', lifecycleStatus: 'deleting' });
    expect((await repository.retryOutboxManually(task.id)).count).toBe(1);

    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({ remoteSyncStatus: 'pending_close', lifecycleStatus: 'deleting' });
    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'pending' });
  });

  it('keeps deletion tasks visible when the financial operation history exceeds the panel page limit', async () => {
    const queue = await repository.createQueue({ slug: `delete-visible-${randomUUID().slice(0, 8)}`, title: 'Delete visible', cost: 1 });
    await prisma.queue.update({ where: { id: queue.id }, data: { rewardId: `managed-${randomUUID()}`, lifecycleStatus: 'deleting', isArchived: true, isOpen: false, remoteSyncStatus: 'delete_pending' } });
    const old = new Date(Date.now() - 60_000);
    const deletion = await prisma.outbox.create({ data: { operationType: 'reward.delete', entityType: 'queue', entityId: queue.id, idempotencyKey: `queue:${queue.id}:reward.delete`, payload: {}, status: 'unknown', createdAt: old, updatedAt: old } });
    await prisma.outbox.createMany({ data: Array.from({ length: 205 }, (_, index) => ({ operationType: 'redemption.cancel', entityType: 'redemption', entityId: `noise-${queue.id}-${index}`, idempotencyKey: `noise:${queue.id}:${index}`, payload: {}, status: 'confirmed' })) });

    const operations = await repository.listFinancialOperations();

    expect(operations.some(({ id }) => id === deletion.id)).toBe(true);
  });

  it('starts reward deletion directly only when the managed reward is already confirmed paused', async () => {
    const queue = await repository.createQueue({ slug: `delete-closed-${randomUUID().slice(0, 8)}`, title: 'Delete closed', cost: 1 });
    await prisma.queue.update({ where: { id: queue.id }, data: { rewardId: `managed-${randomUUID()}`, remoteSyncStatus: 'synced', isOpen: false } });

    const result = await queueService.deleteQueue({ queueId: queue.id, actorId: 'operator-delete' });

    expect(result).toMatchObject({ status: 'pending', queue: { lifecycleStatus: 'deleting', isArchived: true, isOpen: false, remoteSyncStatus: 'delete_pending' } });
    expect(await prisma.outbox.findFirst({ where: { operationType: 'reward.delete', entityId: queue.id } })).toMatchObject({ status: 'pending' });
  });

  it('prevents reward deletion while any redemption cancellation is unconfirmed and releases keys only after confirmation', async () => {
    const slug = `delete-safe-${randomUUID().slice(0, 8)}`;
    const queue = await repository.createQueue({ slug, aliases: [`safe-${slug.slice(-6)}`], title: 'Delete safe', cost: 1 });
    const rewardId = `managed-${randomUUID()}`;
    await prisma.queue.update({ where: { id: queue.id }, data: { rewardId, lifecycleStatus: 'deleting', isArchived: true, isOpen: false, remoteSyncStatus: 'delete_pending' } });
    const redemptionId = `delete-safe-r-${randomUUID()}`;
    await prisma.redemption.create({ data: { redemptionId, broadcasterId: 'broadcaster-1', rewardId, userId: 'delete-safe-user', queueId: queue.id, redeemedAt: new Date(), remoteStatus: 'UNFULFILLED', expectedStatus: 'CANCELED', syncStatus: 'pending' } });
    const deletion = await prisma.outbox.create({ data: { operationType: 'reward.delete', entityType: 'queue', entityId: queue.id, idempotencyKey: `queue:${queue.id}:reward.delete`, payload: { safeToDelete: true }, status: 'processing', leaseToken: randomUUID() } });
    const leaseToken = deletion.leaseToken;
    expect(await repository.prepareRewardDelete(deletion.id, leaseToken)).toBe(false);
    expect(await repository.completeQueueDeletion(deletion.id, leaseToken)).toBe(false);

    await prisma.redemption.update({ where: { redemptionId }, data: { remoteStatus: 'CANCELED', syncStatus: 'confirmed' } });
    await prisma.outbox.create({ data: { operationType: 'redemption.cancel', entityType: 'redemption', entityId: redemptionId, idempotencyKey: `financial:${redemptionId}`, payload: {}, redemptionId, status: 'confirmed' } });
    expect(await repository.prepareRewardDelete(deletion.id, leaseToken)).toBe(true);
    expect(await repository.completeQueueDeletion(deletion.id, leaseToken)).toBe(true);
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({ lifecycleStatus: 'deleted', remoteSyncStatus: 'deleted', deletedAt: expect.any(Date) });
    expect(await prisma.queueKey.count({ where: { queueId: queue.id } })).toBe(0);

    const replacement = await repository.createQueue({ slug, title: 'Replacement', cost: 1 });
    expect(replacement.id).not.toBe(queue.id);
    expect(await prisma.redemption.findUnique({ where: { redemptionId } })).toMatchObject({ queueId: queue.id, remoteStatus: 'CANCELED' });
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

  it('commits a redemption terminal transition, audit, and one financial outbox intent atomically', async () => {
    const queue = await repository.createQueue({ slug: `outbox-${randomUUID().slice(0, 8)}`, title: 'Outbox', cost: 1 });
    const redemptionId = `financial-${randomUUID()}`;
    await prisma.redemption.create({ data: {
      redemptionId, broadcasterId: 'broadcaster', rewardId: 'reward', userId: 'viewer',
      redeemedAt: new Date(), queueId: queue.id,
    } });
    const entry = await prisma.entry.create({ data: {
      queueId: queue.id, twitchUserId: 'viewer', userLogin: 'viewer', displayName: 'Viewer',
      source: 'redemption', redemptionId, status: 'waiting', position: 1,
    } });

    const transition = await queueService.transitionEntry({
      entryId: entry.id, to: 'removed', origin: 'panel', actorId: 'broadcaster', reason: 'operator_removed',
    });

    expect(transition).toMatchObject({ status: 'removed', financialDecision: 'request_cancel' });
    expect(await prisma.outbox.findMany({ where: { redemptionId } })).toMatchObject([{
      operationType: 'redemption.cancel', entityType: 'redemption', entityId: redemptionId,
      idempotencyKey: `financial:${redemptionId}`, status: 'pending', payload: {},
    }]);
    expect(await prisma.redemption.findUnique({ where: { redemptionId } })).toMatchObject({
      expectedStatus: 'CANCELED', syncStatus: 'pending',
    });
    expect(await prisma.auditLog.count({ where: { entryId: entry.id, event: 'entry.transitioned' } })).toBe(1);
    expect(await prisma.outbox.count({ where: { redemptionId } })).toBe(1);
  });

  it('clears a confirmed snapshot atomically and requests cancellation regardless of called-state policy', async () => {
    const queue = await repository.createQueue({ slug: `clear-${randomUUID().slice(0, 8)}`, title: 'Clear', cost: 1, refundIfRemovedWhileCalled: false });
    const redemptionId = `clear-redemption-${randomUUID()}`;
    await prisma.redemption.create({ data: { redemptionId, broadcasterId: 'broadcaster', rewardId: 'reward', userId: 'viewer', redeemedAt: new Date(), queueId: queue.id } });
    const waiting = await prisma.entry.create({ data: { queueId: queue.id, twitchUserId: 'viewer-a', userLogin: 'viewer-a', displayName: 'Viewer A', source: 'redemption', redemptionId, status: 'waiting', position: 1 } });
    const called = await prisma.entry.create({ data: { queueId: queue.id, twitchUserId: 'viewer-b', userLogin: 'viewer-b', displayName: 'Viewer B', source: 'manual', status: 'called', position: null } });
    const snapshot = [waiting, called].map(({ id, version, status, source, redemptionId: idRedemption }) => ({ id, version, status, source, redemptionId: idRedemption }));
    const cleared = await queueService.clearActiveEntries({ queueId: queue.id, snapshot, actorId: 'operator', origin: 'panel' });
    expect(cleared).toMatchObject({ status: 'cleared', count: 2, refundsRequested: 1 });
    expect(await prisma.entry.findMany({ where: { id: { in: [waiting.id, called.id] } }, orderBy: { id: 'asc' } })).toMatchObject([{ status: 'removed', terminalReason: 'queue_cleared' }, { status: 'removed', terminalReason: 'queue_cleared' }]);
    expect(await prisma.outbox.count({ where: { redemptionId, operationType: 'redemption.cancel' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { queueId: queue.id, reason: 'queue_cleared' } })).toBe(2);
  });

  it('leases pending financial work once and recovers it after the lease expires', async () => {
    const drainNow = new Date();
    let pendingTask = await repository.claimNext({ now: drainNow, leaseMs: 30_000 });
    while (pendingTask) pendingTask = await repository.claimNext({ now: drainNow, leaseMs: 30_000 });
    const queue = await repository.createQueue({ slug: `lease-${randomUUID().slice(0, 8)}`, title: 'Lease', cost: 1 });
    const redemptionId = `lease-redemption-${randomUUID()}`;
    await prisma.redemption.create({ data: {
      redemptionId, broadcasterId: 'broadcaster', rewardId: 'reward', userId: 'viewer',
      redeemedAt: new Date(), queueId: queue.id,
    } });
    const entry = await prisma.entry.create({ data: {
      queueId: queue.id, twitchUserId: 'lease-viewer', userLogin: 'viewer', displayName: 'Viewer',
      source: 'redemption', redemptionId, status: 'waiting', position: 1,
    } });
    await queueService.transitionEntry({ entryId: entry.id, to: 'removed', reason: 'operator_removed' });
    expect(await prisma.outbox.count({ where: { redemptionId } })).toBe(1);

    const now = new Date();
    const [first, second] = await Promise.all([
      repository.claimNext({ now, leaseMs: 30_000 }),
      repository.claimNext({ now, leaseMs: 30_000 }),
    ]);
    const initialLease = first ?? second;
    expect(Number(Boolean(first)) + Number(Boolean(second))).toBe(1);
    expect(initialLease).toMatchObject({ redemptionId, status: 'processing', attempts: 1 });
    expect(initialLease.leaseToken).toMatch(/^[0-9a-f-]{36}$/i);

    await prisma.outbox.update({ where: { id: initialLease.id }, data: { leaseUntil: new Date(now.getTime() - 1) } });
    const recovered = await repository.claimNext({ now, leaseMs: 30_000 });
    expect(recovered).toMatchObject({ id: initialLease.id, redemptionId, status: 'processing', attempts: 2 });
    expect(recovered.leaseToken).not.toBe(initialLease.leaseToken);
    expect(await repository.confirm(initialLease.id, 'CANCELED', initialLease.leaseToken)).toBe(false);
    expect(await prisma.outbox.findUnique({ where: { id: initialLease.id } })).toMatchObject({ status: 'processing', attempts: 2 });
    expect(await repository.confirm(recovered.id, 'CANCELED', recovered.leaseToken)).toBe(true);
    expect(await prisma.outbox.findUnique({ where: { id: recovered.id } })).toMatchObject({ status: 'confirmed' });
  });

  it('persists a rejected redemption cancellation without an entry for recovery after restart', async () => {
    const redemptionId = `rejected-${randomUUID()}`;
    const result = await repository.recordRejectedRedemption({
      redemptionId, broadcasterId: 'broadcaster', rewardId: 'managed-reward', userId: 'viewer',
      redeemedAt: new Date(), reason: 'invalid_uid',
    });

    expect(result).toMatchObject({ status: 'cancellation_pending', redemptionId });
    expect(await prisma.entry.count({ where: { redemptionId } })).toBe(0);
    expect(await prisma.redemption.findUnique({ where: { redemptionId } })).toMatchObject({
      remoteStatus: 'UNFULFILLED', expectedStatus: 'CANCELED', syncStatus: 'pending', rejectionReason: 'invalid_uid',
    });
    expect(await prisma.outbox.findMany({ where: { redemptionId } })).toMatchObject([{
      idempotencyKey: `financial:${redemptionId}`, operationType: 'redemption.cancel', status: 'pending', payload: {},
    }]);

    const duplicate = await repository.recordRejectedRedemption({
      redemptionId, broadcasterId: 'broadcaster', rewardId: 'managed-reward', userId: 'viewer',
      redeemedAt: new Date(), reason: 'invalid_uid',
    });
    expect(duplicate).toEqual({ status: 'already_recorded', redemptionId });
    expect(await prisma.outbox.count({ where: { redemptionId } })).toBe(1);
  });

  it('stores Twitch secrets and tokens privately while exposing only connection metadata', async () => {
    const saved = await credentialRepository.saveValidatedApplication({ clientId: 'client-private', clientSecret: 'secret-1' });
    expect(saved).toEqual({ clientId: 'client-private', secretConfigured: true, broadcasterId: null });
    await credentialRepository.storeTokens({
      clientId: 'client-private', broadcasterId: 'channel-1', accessToken: 'access-1', refreshToken: 'refresh-1',
      scopes: ['channel:manage:redemptions', 'user:read:chat', 'user:write:chat'], expiresIn: 3600, obtainmentTimestamp: Date.now(),
    });

    expect(await credentialRepository.getPublicStatus()).toEqual({
      clientId: 'client-private', secretConfigured: true, connected: true, broadcasterId: 'channel-1',
      scopes: ['channel:manage:redemptions', 'user:read:chat', 'user:write:chat'],
    });
    expect(JSON.stringify(await credentialRepository.getPublicStatus())).not.toMatch(/secret-1|access-1|refresh-1/);
    expect(await prisma.oAuthCredential.findUnique({ where: { clientId: 'client-private' } })).toMatchObject({
      clientSecret: 'secret-1', accessToken: 'access-1', refreshToken: 'refresh-1', broadcasterId: 'channel-1',
    });
  });

  it('allows same-app secret rotation but locks app/channel switching when product data exists', async () => {
    const current = await credentialRepository.getAuthRecord();
    const clientId = current?.clientId ?? 'bound-client';
    const broadcasterId = current?.broadcasterId ?? 'bound-channel';
    await credentialRepository.saveValidatedApplication({ clientId, clientSecret: 'old-secret' });
    await credentialRepository.storeTokens({
      clientId, broadcasterId, accessToken: 'access', refreshToken: 'refresh',
      scopes: [], expiresIn: 3600, obtainmentTimestamp: Date.now(),
    });
    const queue = await repository.createQueue({ slug: `binding-${randomUUID().slice(0, 8)}`, title: 'Binding', cost: 1 });

    expect(await credentialRepository.saveValidatedApplication({ clientId, clientSecret: 'new-secret' }))
      .toMatchObject({ clientId, secretConfigured: true, broadcasterId });
    await expect(credentialRepository.saveValidatedApplication({ clientId: 'other-client', clientSecret: 'another-secret' }))
      .rejects.toMatchObject({ code: 'CHANNEL_BINDING_LOCKED' });
    await expect(credentialRepository.bindChannel({ clientId, broadcasterId: 'other-channel' }))
      .rejects.toMatchObject({ code: 'CHANNEL_BINDING_LOCKED' });
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).not.toBeNull();
    expect(await prisma.oAuthCredential.findUnique({ where: { clientId } }))
      .toMatchObject({ clientSecret: 'new-secret', broadcasterId });
  });

  it('imports only valid unfulfilled redemptions and never persists hidden or rejected input', async () => {
    const queue = await repository.createQueue({
      slug: `import-${randomUUID().slice(0, 8)}`, title: 'Import', cost: 1, isOpen: true, rewardId: `managed-${randomUUID()}`,
    });
    const event = {
      id: `valid-${randomUUID()}`, broadcasterId: 'broadcaster', rewardId: queue.rewardId, userId: 'viewer-1',
      userLogin: 'Viewer', displayName: 'Viewer', userInput: 'login-secret 123456789',
      status: 'UNFULFILLED', redeemedAt: new Date(),
    };
    const imported = await repository.importRedemption(event);
    expect(imported).toMatchObject({ status: 'added', position: 1 });
    expect(await prisma.entry.findUnique({ where: { redemptionId: event.id } })).toMatchObject({
      source: 'redemption', status: 'waiting', uid: null, userLogin: 'viewer',
    });
    expect(await prisma.redemption.findUnique({ where: { redemptionId: event.id } })).toMatchObject({ syncStatus: 'observed' });
    expect(await repository.importRedemption(event)).toEqual({ status: 'already_recorded', redemptionId: event.id });
    expect(await prisma.entry.count({ where: { redemptionId: event.id } })).toBe(1);
    const privateRows = JSON.stringify(await prisma.auditLog.findMany({ where: { redemptionId: event.id } }));
    expect(privateRows).not.toContain('login-secret');
    expect(privateRows).not.toContain('123456789');
  });

  it('stores a visible valid UID but requests cancellation for invalid UID or closed queues', async () => {
    const visibleQueue = await repository.createQueue({
      slug: `visible-${randomUUID().slice(0, 8)}`, title: 'Visible', cost: 1, isOpen: true, uidMode: 'visible', rewardId: `visible-reward-${randomUUID()}`,
    });
    const visibleEvent = {
      id: `uid-valid-${randomUUID()}`, broadcasterId: 'broadcaster', rewardId: visibleQueue.rewardId, userId: 'uid-user',
      userLogin: 'uiduser', displayName: 'UID user', userInput: ' 123456789 ', status: 'unfulfilled', redeemedAt: new Date(),
    };
    expect(await repository.importRedemption(visibleEvent)).toMatchObject({ status: 'added', position: 1 });
    expect(await prisma.entry.findUnique({ where: { redemptionId: visibleEvent.id } })).toMatchObject({ uid: '123456789' });

    const invalidEvent = { ...visibleEvent, id: `uid-invalid-${randomUUID()}`, userInput: 'password 123456789' };
    expect(await repository.importRedemption(invalidEvent)).toMatchObject({ status: 'cancellation_pending', reason: 'invalid_uid' });
    expect(await prisma.entry.findUnique({ where: { redemptionId: invalidEvent.id } })).toBeNull();
    expect(await prisma.outbox.findUnique({ where: { idempotencyKey: `financial:${invalidEvent.id}` } })).toMatchObject({ status: 'pending' });
    const persistedRejection = JSON.stringify(await prisma.redemption.findUnique({ where: { redemptionId: invalidEvent.id } }));
    expect(persistedRejection).not.toContain('password');

    const closedQueue = await repository.createQueue({
      slug: `not-open-${randomUUID().slice(0, 8)}`, title: 'Closed', cost: 1, isOpen: false, rewardId: `closed-reward-${randomUUID()}`,
    });
    const closedEvent = { ...visibleEvent, id: `closed-${randomUUID()}`, rewardId: closedQueue.rewardId };
    expect(await repository.importRedemption(closedEvent)).toMatchObject({ status: 'cancellation_pending', reason: 'queue_closed' });
  });

  it('records a terminal update before add so a later add cannot become active', async () => {
    const queue = await repository.createQueue({
      slug: `early-terminal-${randomUUID().slice(0, 8)}`, title: 'Early terminal', cost: 1, rewardId: `early-${randomUUID()}`,
    });
    const id = `terminal-before-add-${randomUUID()}`;
    const terminal = {
      id, broadcasterId: 'broadcaster', rewardId: queue.rewardId, userId: 'viewer', userLogin: 'viewer',
      displayName: 'Viewer', status: 'FULFILLED', redeemedAt: new Date(),
    };
    expect(await repository.recordTerminalRedemption(terminal)).toEqual({ status: 'terminal_observed', redemptionId: id });
    expect(await repository.importRedemption({ ...terminal, userInput: '', status: 'UNFULFILLED' }))
      .toEqual({ status: 'already_recorded', redemptionId: id });
    expect(await prisma.entry.count({ where: { redemptionId: id } })).toBe(0);
    expect(await prisma.redemption.findUnique({ where: { redemptionId: id } })).toMatchObject({ remoteStatus: 'FULFILLED', syncStatus: 'confirmed' });
  });

  it('applies an external terminal update through the domain service without sending another point operation', async () => {
    const queue = await repository.createQueue({ slug: `external-${randomUUID().slice(0, 8)}`, title: 'External', cost: 1 });
    const redemptionId = `external-redemption-${randomUUID()}`;
    await prisma.redemption.create({ data: {
      redemptionId, broadcasterId: 'broadcaster', rewardId: 'reward', userId: 'viewer', redeemedAt: new Date(), queueId: queue.id,
    } });
    const entry = await prisma.entry.create({ data: {
      queueId: queue.id, twitchUserId: 'external-viewer', userLogin: 'viewer', displayName: 'Viewer',
      source: 'redemption', redemptionId, status: 'waiting', position: 1,
    } });

    await queueService.transitionEntry({
      entryId: entry.id, to: 'completed', origin: 'external', reason: 'external_fulfillment', remoteStatus: 'FULFILLED',
    });

    expect(await prisma.entry.findUnique({ where: { id: entry.id } })).toMatchObject({ status: 'completed' });
    expect(await prisma.redemption.findUnique({ where: { redemptionId } })).toMatchObject({ remoteStatus: 'FULFILLED', syncStatus: 'confirmed' });
    expect(await prisma.outbox.count({ where: { redemptionId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entryId: entry.id, event: 'entry.transitioned' } })).toBe(1);
  });

  it('resolves matching external financial state and records an opposing state as conflict', async () => {
    const queue = await repository.createQueue({ slug: `remote-intent-${randomUUID().slice(0, 8)}`, title: 'Remote intent', cost: 1 });
    const matchingId = `matching-${randomUUID()}`;
    const opposingId = `opposing-${randomUUID()}`;
    for (const [redemptionId, operationType] of [[matchingId, 'redemption.cancel'], [opposingId, 'redemption.cancel']]) {
      await prisma.redemption.create({ data: { redemptionId, broadcasterId: 'broadcaster', rewardId: 'reward', userId: redemptionId, queueId: queue.id, redeemedAt: new Date(), expectedStatus: 'CANCELED', syncStatus: 'pending' } });
      await prisma.outbox.create({ data: { operationType, entityType: 'redemption', entityId: redemptionId, idempotencyKey: `financial:${redemptionId}`, redemptionId, payload: {} } });
    }
    expect(await repository.recordExternalRedemptionState({ id: matchingId, broadcasterId: 'broadcaster', rewardId: 'reward', userId: matchingId, status: 'CANCELED', redeemedAt: new Date() })).toMatchObject({ status: 'external_state_recorded' });
    expect(await repository.recordExternalRedemptionState({ id: opposingId, broadcasterId: 'broadcaster', rewardId: 'reward', userId: opposingId, status: 'FULFILLED', redeemedAt: new Date() })).toMatchObject({ status: 'conflict' });
    expect(await prisma.outbox.findUnique({ where: { idempotencyKey: `financial:${matchingId}` } })).toMatchObject({ status: 'confirmed' });
    expect(await prisma.outbox.findUnique({ where: { idempotencyKey: `financial:${opposingId}` } })).toMatchObject({ status: 'conflict' });
  });

  it('exposes sanitized financial operation status and allows only explicit manual retry of terminal uncertainty', async () => {
    const queue = await repository.createQueue({ slug: `operations-${randomUUID().slice(0, 8)}`, title: 'Operations', cost: 1 });
    const redemptionId = `operation-${randomUUID()}`;
    await prisma.redemption.create({ data: { redemptionId, broadcasterId: 'broadcaster', rewardId: 'reward', userId: 'viewer', queueId: queue.id, redeemedAt: new Date(), expectedStatus: 'CANCELED', syncStatus: 'unknown' } });
    const task = await prisma.outbox.create({ data: { operationType: 'redemption.cancel', entityType: 'redemption', entityId: redemptionId, idempotencyKey: `financial:${redemptionId}`, redemptionId, status: 'unknown', lastError: 'remote_history_unavailable', payload: {} } });
    expect((await repository.listFinancialOperations()).find(({ id }) => id === task.id)).toMatchObject({ id: task.id, status: 'unknown', lastError: 'remote_history_unavailable', redemptionId });
    expect(await repository.retryOutboxManually(task.id)).toMatchObject({ count: 1 });
    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'pending', lastError: null });
  });

  it('records operator resolution of unknown financial state without claiming Twitch confirmation or retrying', async () => {
    const queue = await repository.createQueue({ slug: `resolve-${randomUUID().slice(0, 8)}`, title: 'Resolve', cost: 1 });
    const redemptionId = `resolve-${randomUUID()}`;
    await prisma.redemption.create({ data: { redemptionId, broadcasterId: 'broadcaster', rewardId: 'reward', userId: 'viewer', queueId: queue.id, redeemedAt: new Date(), remoteStatus: 'UNFULFILLED', expectedStatus: 'CANCELED', syncStatus: 'unknown' } });
    const task = await prisma.outbox.create({ data: { operationType: 'redemption.cancel', entityType: 'redemption', entityId: redemptionId, idempotencyKey: `financial:${redemptionId}`, redemptionId, status: 'unknown', lastError: 'remote_history_unavailable', payload: {} } });

    const result = await repository.resolveUnknownFinancialOperation(task.id, 'operator-123');

    expect(result).toMatchObject({ status: 'resolved_manual' });
    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'resolved_manual', attempts: 0 });
    expect(await prisma.redemption.findUnique({ where: { redemptionId } })).toMatchObject({ remoteStatus: 'UNFULFILLED', expectedStatus: 'CANCELED', syncStatus: 'operator_resolved' });
    expect(await prisma.auditLog.findFirst({ where: { redemptionId, event: 'financial.operation_resolved_manually' } })).toMatchObject({ actorId: 'operator-123', origin: 'panel', previousState: 'unknown', nextState: 'resolved_manual', reason: 'operator_acknowledged_unknown', safeDetail: { remoteConfirmed: false, expectedStatus: 'CANCELED' } });
    expect(await repository.retryOutboxManually(task.id)).toMatchObject({ count: 0 });
    const claimed = await repository.claimNext();
    expect(claimed?.id).not.toBe(task.id);
    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'resolved_manual', attempts: 0 });
  });

  it('does not manually resolve a financial operation outside unknown state', async () => {
    const redemptionId = `resolve-${randomUUID()}`;
    await prisma.redemption.create({ data: { redemptionId, broadcasterId: 'broadcaster', rewardId: 'reward', userId: 'viewer', redeemedAt: new Date(), expectedStatus: 'CANCELED', syncStatus: 'pending' } });
    const task = await prisma.outbox.create({ data: { operationType: 'redemption.cancel', entityType: 'redemption', entityId: redemptionId, idempotencyKey: `financial:${redemptionId}`, redemptionId, status: 'pending', payload: {} } });

    const result = await repository.resolveUnknownFinancialOperation(task.id, 'operator-123');

    expect(result).toMatchObject({ status: 'not_unknown' });
    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'pending' });
    expect(await prisma.auditLog.count({ where: { redemptionId, event: 'financial.operation_resolved_manually' } })).toBe(0);
  });

  it('applies a later Twitch terminal observation to a manually resolved operation', async () => {
    const queue = await repository.createQueue({ slug: `late-event-${randomUUID().slice(0, 8)}`, title: 'Late event', cost: 1 });
    const redemptionId = `late-event-${randomUUID()}`;
    await prisma.redemption.create({ data: { redemptionId, broadcasterId: 'broadcaster', rewardId: 'reward', userId: 'viewer', queueId: queue.id, redeemedAt: new Date(), remoteStatus: 'UNFULFILLED', expectedStatus: 'CANCELED', syncStatus: 'operator_resolved' } });
    const task = await prisma.outbox.create({ data: { operationType: 'redemption.cancel', entityType: 'redemption', entityId: redemptionId, idempotencyKey: `financial:${redemptionId}`, redemptionId, status: 'resolved_manual', payload: {} } });

    const result = await repository.recordExternalRedemptionState({ id: redemptionId, broadcasterId: 'broadcaster', rewardId: 'reward', userId: 'viewer', redeemedAt: new Date(), status: 'CANCELED' });

    expect(result).toMatchObject({ status: 'external_state_recorded', redemptionId });
    expect(await prisma.redemption.findUnique({ where: { redemptionId } })).toMatchObject({ remoteStatus: 'CANCELED', expectedStatus: 'CANCELED', syncStatus: 'confirmed' });
    expect(await prisma.outbox.findUnique({ where: { id: task.id } })).toMatchObject({ status: 'confirmed' });
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
