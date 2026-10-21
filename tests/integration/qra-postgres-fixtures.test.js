import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createQueueDomainService } from '../../apps/api/src/domain/queue-service.mjs';
import { createClearConfirmationService } from '../../apps/api/src/domain/clear-confirmation.mjs';
import { createQueueRepository } from '../../apps/api/src/persistence/queue-repository.mjs';
import { registerLocalSession } from '../../apps/api/src/http/local-session.mjs';
import { registerQueueRoutes } from '../../apps/api/src/http/queue-routes.mjs';
import { cleanupIsolatedPostgres } from '../helpers/isolated-postgres-cleanup.mjs';
import { seedQraQueue, seedQraTerminalHistory } from '../helpers/ops15/qra-postgres-fixtures.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const suffix = `${process.pid}-${randomUUID().slice(0, 8)}`;
const containerName = `queuebot-qra-fixture-${suffix}`;
const volumeName = `queuebot-qra-fixture-data-${suffix}`;
let prisma;
let containerStarted = false;
let connectionString;
let publishedPort;

function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `docker ${args[0]} failed`);
  return result.stdout.trim();
}

async function waitForPostgres() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync('docker', [
      'exec', containerName, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-Atqc', 'SELECT 1',
    ], {
      cwd: root, encoding: 'utf8', timeout: 3_000,
    });
    if (probe.status === 0 && probe.stdout.trim() === '1') {
      const hostPortReady = await new Promise((resolve) => {
        const socket = createConnection({ host: '127.0.0.1', port: publishedPort });
        const finish = (ready) => {
          socket.destroy();
          resolve(ready);
        };
        socket.once('connect', () => finish(true));
        socket.once('error', () => finish(false));
        socket.setTimeout(1_000, () => finish(false));
      });
      if (hostPortReady) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('isolated QRA PostgreSQL fixture did not become healthy');
}

describe('OPS-15 QRA disposable PostgreSQL fixtures', () => {
  beforeAll(async () => {
    docker([
      'run', '--detach', '--rm', '--name', containerName,
      '--env', 'POSTGRES_USER=queuebot',
      '--env', 'POSTGRES_PASSWORD=isolated-test-password',
      '--env', 'POSTGRES_DB=queuebot',
      '--publish', '127.0.0.1::5432',
      '--volume', `${volumeName}:/var/lib/postgresql`,
      'postgres:18.6-bookworm',
    ]);
    containerStarted = true;
    publishedPort = Number(docker(['port', containerName, '5432/tcp']).split(':').at(-1));
    expect(Number.isInteger(publishedPort)).toBe(true);
    connectionString = `postgresql://queuebot:isolated-test-password@127.0.0.1:${publishedPort}/queuebot?schema=public`;
    await waitForPostgres();
    const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, DATABASE_URL: connectionString },
    });
    const migrationOutput = `${migration.stdout ?? ''}\n${migration.stderr ?? ''}`
      .replaceAll(connectionString, '[DATABASE_URL REDACTED]');
    const databaseLogs = migration.status === 0 ? '' : docker(['logs', containerName]);
    expect(migration.status, `${migrationOutput}\nDisposable PostgreSQL logs:\n${databaseLogs}`).toBe(0);
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (containerStarted) {
      cleanupIsolatedPostgres({
        containerName,
        volumeName,
        runDocker: (args) => spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 30_000 }),
      });
      containerStarted = false;
    }
  });

  it('seeds an active queue and waiting entries with stable IDs and isolated Twitch identities', async () => {
    const queue = await seedQraQueue(prisma, {
      entries: [
        { userLogin: 'viewer_alpha', displayName: 'Viewer Alpha', status: 'waiting', position: 1 },
        { userLogin: 'viewer_beta', displayName: 'Viewer Beta', status: 'waiting', position: 2, priorityReason: 'bits' },
      ],
    });

    expect(queue).toMatchObject({ lifecycleStatus: 'active', isOpen: true, remoteSyncStatus: 'synced', version: 1 });
    expect(queue.entries).toHaveLength(2);
    expect(queue.entries.map(({ position }) => position)).toEqual([1, 2]);
    expect(new Set(queue.entries.map(({ twitchUserId }) => twitchUserId)).size).toBe(2);
    expect(queue.entries[1]).toMatchObject({ priorityClass: 'priority', priorityReason: 'bits' });
  });

  it('seeds bounded-history terminal states with finish timestamps', async () => {
    const queue = await seedQraTerminalHistory(prisma);

    expect(queue.entries.map(({ status }) => status)).toEqual(['completed', 'removed', 'no_show']);
    expect(queue.entries.every(({ finishedAt, terminalReason, position }) => finishedAt instanceof Date && terminalReason && position === null)).toBe(true);
  });

  it('seeds independently selectable lifecycle and reward synchronization states', async () => {
    const queue = await seedQraQueue(prisma, {
      queue: { lifecycleStatus: 'deleting', remoteSyncStatus: 'delete_pending', isOpen: false },
      entries: [],
    });

    expect(queue).toMatchObject({ lifecycleStatus: 'deleting', remoteSyncStatus: 'delete_pending', isOpen: false });
    expect(queue.entries).toEqual([]);
  });

  it('creates a Channel Points queue through the real Fastify route and persists its reward intent in disposable PostgreSQL', async () => {
    const app = Fastify();
    const repository = createQueueRepository(prisma);
    const domainService = createQueueDomainService({ repository });
    registerLocalSession(app, { port: 3000, secure: false });
    registerQueueRoutes(app, {
      repository,
      domainService,
      clearConfirmation: createClearConfirmationService({ repository, domainService }),
    });
    try {
      const sessionResponse = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000' } });
      expect(sessionResponse.statusCode).toBe(200);
      const cookie = sessionResponse.headers['set-cookie'].split(';', 1)[0];
      const actorId = cookie.slice('queuebot_session='.length);
      const session = sessionResponse.json();
      const slug = `qra-channel-${randomUUID().slice(0, 8)}`;
      const request = {
        slug,
        aliases: [`${slug}-alt`],
        title: 'QRA Channel Points',
        cost: 350,
        rewardPrompt: 'Use this reward to join the queue.',
        maxRedemptionsPerStream: 12,
        maxRedemptionsPerUserPerStream: 2,
        globalCooldownSeconds: 45,
        callMessage: '{user}, sua vez chegou!',
        uidMode: 'visible',
      };
      const headers = {
        host: 'localhost:3000',
        cookie,
        'x-csrf-token': session.csrfToken,
        'idempotency-key': randomUUID(),
        'content-type': 'application/json',
      };

      const created = await app.inject({ method: 'POST', url: '/api/queues', headers, payload: request });
      expect(created.statusCode).toBe(201);
      const dto = created.json();
      expect(dto).toMatchObject({
        slug,
        aliases: request.aliases,
        title: request.title,
        cost: request.cost,
        rewardPrompt: request.rewardPrompt,
        queueMode: 'channel_points',
        rewardOrigin: 'bot_created',
        rewardId: null,
        maxRedemptionsPerStream: 12,
        maxRedemptionsPerUserPerStream: 2,
        globalCooldownSeconds: 45,
        callMessage: request.callMessage,
        callTimeoutMin: 10,
        uidMode: 'visible',
        isOpen: false,
        lifecycleStatus: 'active',
        version: 1,
        remoteSyncStatus: 'pending_create',
        entries: [],
      });
      expect(Object.keys(dto).sort()).toEqual([
        'aliases', 'autoSwitchAccount', 'callMessage', 'callTimeoutMin', 'cost', 'entries', 'globalCooldownSeconds',
        'id', 'isArchived', 'isOpen', 'lifecycleStatus', 'maxRedemptionsPerStream', 'maxRedemptionsPerUserPerStream',
        'modeTransitionStatus', 'queueMode', 'refundIfRemovedWhileCalled', 'refundIfViewerLeavesCalled', 'refundOnNoShow',
        'remoteSyncStatus', 'rewardId', 'rewardOrigin', 'rewardPrompt', 'showUidInList', 'showUidOnCall',
        'showUidInOverlay', 'slug', 'title', 'uidMode', 'version',
      ].sort());

      const persisted = await prisma.queue.findUnique({ where: { id: dto.id } });
      expect(persisted).toMatchObject({
        slug,
        title: request.title,
        cost: request.cost,
        queueMode: 'channel_points',
        rewardOrigin: 'bot_created',
        rewardId: null,
        remoteSyncStatus: 'pending_create',
        maxRedemptionsPerStream: 12,
        maxRedemptionsPerUserPerStream: 2,
        globalCooldownSeconds: 45,
        isOpen: false,
        version: 1,
      });
      const rewardIntent = await prisma.outbox.findUnique({ where: { idempotencyKey: `queue:${dto.id}:reward.create` } });
      expect(rewardIntent).toMatchObject({
        operationType: 'reward.create',
        entityType: 'queue',
        entityId: dto.id,
        status: 'pending',
        payload: {
          title: request.title,
          cost: request.cost,
          prompt: request.rewardPrompt,
          uidMode: 'visible',
          maxRedemptionsPerStream: 12,
          maxRedemptionsPerUserPerStream: 2,
          globalCooldownSeconds: 45,
        },
      });
      expect(await prisma.auditLog.findMany({ where: { queueId: dto.id, event: 'queue.reward_creation_requested' } }))
        .toMatchObject([{ actorId, origin: 'panel', safeDetail: { remoteSyncStatus: 'pending_create' } }]);

      const listed = await app.inject({ method: 'GET', url: '/api/queues', headers });
      expect(listed.statusCode).toBe(200);
      expect(listed.json().find(({ id }) => id === dto.id)).toEqual(dto);
    } finally {
      await app.close();
    }
  });

  it('persists accepted QRA-04 reward settings as a pending outbox operation without claiming Twitch confirmation', async () => {
    const queue = await seedQraQueue(prisma, { slugPrefix: 'qra-reward-update', entries: [] });
    const app = Fastify();
    const repository = createQueueRepository(prisma);
    const domainService = createQueueDomainService({ repository });
    registerLocalSession(app, { port: 3000, secure: false });
    registerQueueRoutes(app, {
      repository,
      domainService,
      clearConfirmation: createClearConfirmationService({ repository, domainService }),
    });
    try {
      const sessionResponse = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000' } });
      expect(sessionResponse.statusCode).toBe(200);
      const cookie = sessionResponse.headers['set-cookie'].split(';', 1)[0];
      const actorId = cookie.slice('queuebot_session='.length);
      const session = sessionResponse.json();
      const headers = {
        host: 'localhost:3000',
        cookie,
        'x-csrf-token': session.csrfToken,
        'idempotency-key': randomUUID(),
        'content-type': 'application/json',
      };
      const payload = { expectedVersion: 1, title: 'Updated QRA Reward', cost: 500, rewardPrompt: 'Updated queue reward.' };
      const accepted = await app.inject({
        method: 'PATCH',
        url: `/api/queues/${queue.id}/reward-settings`,
        headers,
        payload,
      });

      expect(accepted.statusCode).toBe(202);
      const acceptedDto = accepted.json();
      expect(acceptedDto).toMatchObject({
        id: queue.id,
        slug: queue.slug,
        title: payload.title,
        cost: payload.cost,
        rewardPrompt: payload.rewardPrompt,
        rewardId: queue.rewardId,
        remoteSyncStatus: 'pending_update',
        version: 2,
        operationStatus: 'pending',
      });
      expect(Object.keys(acceptedDto).sort()).toEqual([
        'aliases', 'autoSwitchAccount', 'callMessage', 'callTimeoutMin', 'cost', 'entries', 'globalCooldownSeconds',
        'id', 'isArchived', 'isOpen', 'lifecycleStatus', 'maxRedemptionsPerStream', 'maxRedemptionsPerUserPerStream',
        'modeTransitionStatus', 'operationStatus', 'queueMode', 'refundIfRemovedWhileCalled', 'refundIfViewerLeavesCalled',
        'refundOnNoShow', 'remoteSyncStatus', 'rewardId', 'rewardOrigin', 'rewardPrompt', 'showUidInList',
        'showUidOnCall', 'showUidInOverlay', 'slug', 'title', 'uidMode', 'version',
      ].sort());
      const persistedQueue = await prisma.queue.findUnique({ where: { id: queue.id } });
      expect(persistedQueue).toMatchObject({
        title: payload.title,
        cost: payload.cost,
        rewardPrompt: payload.rewardPrompt,
        remoteSyncStatus: 'pending_update',
        version: 2,
        rewardId: queue.rewardId,
      });
      const operation = await prisma.outbox.findUnique({ where: { idempotencyKey: `queue:${queue.id}:reward.update:2` } });
      expect(operation).toMatchObject({
        operationType: 'reward.update',
        entityType: 'queue',
        entityId: queue.id,
        status: 'pending',
        payload: {
          queueVersion: 2,
          requestMayHaveReachedTwitch: false,
          previous: {
            title: queue.title,
            cost: queue.cost,
            prompt: queue.rewardPrompt,
            uidMode: queue.uidMode,
          },
        },
      });
      expect(await prisma.auditLog.findMany({ where: { queueId: queue.id, event: 'queue.reward_settings_requested', actorId } }))
        .toMatchObject([{
          origin: 'panel',
          previousState: 'synced',
          nextState: 'pending_update',
          safeDetail: { rewardId: queue.rewardId, updatedFields: ['cost', 'rewardPrompt', 'title'], uidMode: queue.uidMode },
        }]);

      const stale = await app.inject({
        method: 'PATCH',
        url: `/api/queues/${queue.id}/reward-settings`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: { expectedVersion: 1, cost: 600 },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toEqual({ code: 'STALE_QUEUE_VERSION', error: 'A recompensa não está sincronizada ou a fila mudou. Atualize o painel e tente novamente.' });
      expect(await prisma.outbox.count({ where: { entityId: queue.id, operationType: 'reward.update' } })).toBe(1);

      const listed = await app.inject({ method: 'GET', url: '/api/queues', headers });
      expect(listed.statusCode).toBe(200);
      const listDto = listed.json().find(({ id }) => id === queue.id);
      const { operationStatus, ...queueDto } = acceptedDto;
      expect(operationStatus).toBe('pending');
      expect(listDto).toEqual(queueDto);
    } finally {
      await app.close();
    }
  });

  it('runs reward-candidate lookup and manual association through real Fastify routes with a test-only Twitch adapter and PostgreSQL', async () => {
    const queue = await seedQraQueue(prisma, {
      queue: { remoteSyncStatus: 'create_unknown', rewardId: null, isOpen: false },
      entries: [],
    });
    const manualQueue = await seedQraQueue(prisma, {
      slugPrefix: 'qra-manual-entry',
      queue: {
        queueMode: 'manual_only',
        rewardOrigin: 'none',
        remoteSyncStatus: 'local_only',
        rewardId: null,
        cost: null,
        isOpen: false,
      },
      entries: [],
    });
    const reward = {
      id: `managed-${randomUUID()}`,
      title: queue.title,
      cost: queue.cost,
      prompt: queue.rewardPrompt,
      userInputRequired: false,
      maxRedemptionsPerStream: null,
      maxRedemptionsPerUserPerStream: null,
      globalCooldown: null,
      autoFulfill: false,
      shouldRedemptionsSkipRequestQueue: false,
      isEnabled: true,
      isPaused: true,
    };
    const getManagedRewards = vi.fn(async () => [reward]);
    const getReward = vi.fn(async (rewardId) => rewardId === reward.id ? reward : null);
    await prisma.outbox.create({
      data: {
        operationType: 'reward.create',
        entityType: 'queue',
        entityId: queue.id,
        idempotencyKey: `queue:${queue.id}:reward.create`,
        payload: {},
        status: 'unknown',
      },
    });

    const app = Fastify();
    const repository = createQueueRepository(prisma);
    registerLocalSession(app, { port: 3000, secure: false });
    registerQueueRoutes(app, {
      repository,
      domainService: createQueueDomainService({ repository, getTwitch: () => ({ getReward }) }),
      clearConfirmation: createClearConfirmationService({ repository, domainService: createQueueDomainService({ repository }) }),
      integrations: { twitch: { getManagedRewards, getReward } },
      resolveUser: async (login) => login === 'qra_synthetic_viewer'
        ? { id: 'qra-synthetic-twitch-user', login, displayName: 'QRA Synthetic Viewer' }
        : null,
      reportDiagnostic: () => 'qra-test-reference-12345678',
    });
    try {
      const sessionResponse = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000' } });
      expect(sessionResponse.statusCode).toBe(200);
      const cookie = sessionResponse.headers['set-cookie'].split(';', 1)[0];
      const actorId = cookie.slice('queuebot_session='.length);
      const session = sessionResponse.json();
      const headers = {
        host: 'localhost:3000',
        cookie,
        'x-csrf-token': session.csrfToken,
        'content-type': 'application/json',
      };

      const candidates = await app.inject({
        method: 'GET',
        url: `/api/queues/${queue.id}/reward-candidates`,
        headers,
      });
      expect(candidates.statusCode).toBe(200);
      expect(candidates.json()).toEqual({
        candidates: [{ id: reward.id, title: reward.title, cost: reward.cost, prompt: reward.prompt }],
        diagnostics: { managedRewardCount: 1, candidateCount: 1, rejectedRewardCount: 0, mismatchCounts: {} },
      });

      const resolved = await app.inject({
        method: 'POST',
        url: `/api/queues/${queue.id}/resolve-reward`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: { rewardId: reward.id },
      });
      expect(resolved.statusCode).toBe(200);
      expect(resolved.json()).toMatchObject({
        status: 'resolved',
        remoteConfirmed: false,
        queue: { id: queue.id, rewardId: reward.id, remoteSyncStatus: 'synced_manual', isOpen: false, version: 2 },
      });
      expect(getManagedRewards).toHaveBeenCalledTimes(2);
      expect(await prisma.queue.findUnique({ where: { id: queue.id } }))
        .toMatchObject({ rewardId: reward.id, remoteSyncStatus: 'synced_manual', isOpen: false, version: 2 });
      expect(await prisma.outbox.findUnique({ where: { idempotencyKey: `queue:${queue.id}:reward.create` } }))
        .toMatchObject({ status: 'resolved_manual', lastError: null });
      expect(await prisma.auditLog.findMany({ where: { queueId: queue.id, event: 'queue.reward_creation_resolved_manually' } }))
        .toMatchObject([{ actorId, origin: 'panel', safeDetail: { rewardId: reward.id, remoteConfirmed: false } }]);

      const deletionQueue = await seedQraQueue(prisma, {
        slugPrefix: 'qra-delete-cancel',
        queue: {
          lifecycleStatus: 'deleting', isArchived: true, isOpen: false,
          remoteSyncStatus: 'delete_unknown', rewardId: `managed-delete-${randomUUID()}`,
        },
        entries: [],
      });
      const deletionTask = await prisma.outbox.create({
        data: {
          operationType: 'reward.delete', entityType: 'queue', entityId: deletionQueue.id,
          idempotencyKey: `queue:${deletionQueue.id}:reward.delete`,
          payload: { requestMayHaveReachedTwitch: true, safeToDelete: true },
          status: 'unknown', lastError: 'network_timeout',
        },
      });
      const deletionReward = { ...reward, id: deletionQueue.rewardId, title: deletionQueue.title, cost: deletionQueue.cost, prompt: deletionQueue.rewardPrompt };
      getReward.mockImplementation(async (rewardId) => rewardId === deletionQueue.rewardId ? deletionReward : reward);
      const cancelDeletion = await app.inject({
        method: 'POST',
        url: `/api/queues/${deletionQueue.id}/delete/cancel`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: { confirm: true },
      });
      expect(cancelDeletion.statusCode).toBe(200);
      expect(cancelDeletion.json()).toMatchObject({
        status: 'cancelled',
        queue: {
          id: deletionQueue.id, lifecycleStatus: 'active', isArchived: true,
          isOpen: false, remoteSyncStatus: 'synced', version: 2,
        },
      });
      expect(Object.keys(cancelDeletion.json()).sort()).toEqual(['queue', 'status']);
      expect(getReward).toHaveBeenCalledWith(deletionQueue.rewardId);
      expect(await prisma.queue.findUnique({ where: { id: deletionQueue.id } }))
        .toMatchObject({ lifecycleStatus: 'active', isArchived: true, isOpen: false, remoteSyncStatus: 'synced', version: 2 });
      expect(await prisma.outbox.findUnique({ where: { id: deletionTask.id } }))
        .toMatchObject({ status: 'cancelled', lastError: 'queue_deletion_cancelled_by_operator', payload: { requestMayHaveReachedTwitch: true, safeToDelete: true } });
      expect(await prisma.auditLog.findMany({ where: { queueId: deletionQueue.id }, orderBy: { createdAt: 'asc' } }))
        .toMatchObject([
          { event: 'queue.deletion_cancel_verification_requested', actorId, origin: 'panel', nextState: 'cancel_verification' },
          { event: 'queue.deletion_cancelled', origin: 'panel', nextState: 'active_closed_archived' },
        ]);

      const uncertainQueue = await seedQraQueue(prisma, {
        slugPrefix: 'qra-delete-cancel-uncertain',
        queue: {
          lifecycleStatus: 'deleting', isArchived: true, isOpen: false,
          remoteSyncStatus: 'delete_unknown', rewardId: `managed-uncertain-${randomUUID()}`,
        },
        entries: [],
      });
      const uncertainTask = await prisma.outbox.create({
        data: {
          operationType: 'reward.delete', entityType: 'queue', entityId: uncertainQueue.id,
          idempotencyKey: `queue:${uncertainQueue.id}:reward.delete`, payload: { requestMayHaveReachedTwitch: true },
          status: 'unknown', lastError: 'network_timeout',
        },
      });
      getReward.mockRejectedValueOnce(Object.assign(new Error('private adapter failure'), { statusCode: 503 }));
      const uncertainCancel = await app.inject({
        method: 'POST',
        url: `/api/queues/${uncertainQueue.id}/delete/cancel`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: { confirm: true },
      });
      expect(uncertainCancel.statusCode).toBe(200);
      expect(uncertainCancel.json()).toMatchObject({
        status: 'not_cancelled', reason: 'queue_deletion_cancel_verification_failed',
        queue: { id: uncertainQueue.id, lifecycleStatus: 'deleting', isArchived: true, isOpen: false, remoteSyncStatus: 'delete_unknown' },
      });
      expect(await prisma.queue.findUnique({ where: { id: uncertainQueue.id } }))
        .toMatchObject({ lifecycleStatus: 'deleting', remoteSyncStatus: 'delete_unknown', isOpen: false });
      expect(await prisma.outbox.findUnique({ where: { id: uncertainTask.id } }))
        .toMatchObject({ status: 'unknown', lastError: 'queue_deletion_cancel_verification_failed', payload: { requestMayHaveReachedTwitch: true } });
      expect(await prisma.auditLog.findMany({ where: { queueId: uncertainQueue.id }, orderBy: { createdAt: 'asc' } }))
        .toMatchObject([
          { event: 'queue.deletion_cancel_verification_requested', actorId, nextState: 'cancel_verification' },
          { event: 'queue.deletion_cancellation_not_confirmed', nextState: 'unknown', reason: 'queue_deletion_cancel_verification_failed' },
        ]);
      getReward.mockImplementation(async (rewardId) => rewardId === uncertainQueue.rewardId
        ? { ...deletionReward, id: uncertainQueue.rewardId, title: uncertainQueue.title, cost: uncertainQueue.cost, prompt: uncertainQueue.rewardPrompt }
        : reward);
      const retryUncertainCancel = await app.inject({
        method: 'POST',
        url: `/api/queues/${uncertainQueue.id}/delete/cancel`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: { confirm: true },
      });
      expect(retryUncertainCancel.statusCode).toBe(200);
      expect(retryUncertainCancel.json()).toMatchObject({
        status: 'cancelled',
        queue: { id: uncertainQueue.id, lifecycleStatus: 'active', isArchived: true, isOpen: false, remoteSyncStatus: 'synced', version: 2 },
      });
      expect(await prisma.outbox.findUnique({ where: { id: uncertainTask.id } }))
        .toMatchObject({ status: 'cancelled', lastError: 'queue_deletion_cancelled_by_operator', payload: { requestMayHaveReachedTwitch: true } });
      expect(await prisma.auditLog.findMany({ where: { queueId: uncertainQueue.id }, orderBy: { createdAt: 'asc' } }))
        .toMatchObject([
          { event: 'queue.deletion_cancel_verification_requested', nextState: 'cancel_verification' },
          { event: 'queue.deletion_cancellation_not_confirmed', nextState: 'unknown' },
          { event: 'queue.deletion_cancel_verification_requested', actorId, previousState: 'unknown', nextState: 'cancel_verification' },
          { event: 'queue.deletion_cancelled', nextState: 'active_closed_archived' },
        ]);

      const divergedQueue = await seedQraQueue(prisma, {
        slugPrefix: 'qra-delete-cancel-diverged',
        queue: {
          lifecycleStatus: 'deleting', isArchived: true, isOpen: false,
          remoteSyncStatus: 'delete_unknown', rewardId: `managed-diverged-${randomUUID()}`,
        },
        entries: [],
      });
      const divergedTask = await prisma.outbox.create({
        data: {
          operationType: 'reward.delete', entityType: 'queue', entityId: divergedQueue.id,
          idempotencyKey: `queue:${divergedQueue.id}:reward.delete`, payload: {}, status: 'unknown',
        },
      });
      getReward.mockResolvedValueOnce({ ...deletionReward, id: divergedQueue.rewardId, title: 'Different remote reward' });
      const divergedCancel = await app.inject({
        method: 'POST',
        url: `/api/queues/${divergedQueue.id}/delete/cancel`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: { confirm: true },
      });
      expect(divergedCancel.statusCode).toBe(200);
      expect(divergedCancel.json()).toMatchObject({
        status: 'not_cancelled', reason: 'queue_delete_reward_diverged',
        queue: { id: divergedQueue.id, lifecycleStatus: 'deleting', remoteSyncStatus: 'diverged' },
      });
      expect(await prisma.queue.findUnique({ where: { id: divergedQueue.id } }))
        .toMatchObject({ lifecycleStatus: 'deleting', remoteSyncStatus: 'diverged', isOpen: false, version: 2 });
      expect(await prisma.outbox.findUnique({ where: { id: divergedTask.id } }))
        .toMatchObject({ status: 'unknown', lastError: 'queue_delete_reward_diverged' });

      const resendQueue = await seedQraQueue(prisma, {
        slugPrefix: 'qra-call-resend',
        entries: [{ userLogin: 'qra_resend_viewer', displayName: 'QRA Resend Viewer', status: 'called', position: null }],
      });
      const resendEntry = resendQueue.entries[0];
      const originalDeadline = new Date(Date.now() + 5 * 60_000);
      await prisma.entry.update({
        where: { id: resendEntry.id },
        data: { calledAt: new Date(Date.now() - 60_000), callDeadlineAt: originalDeadline },
      });
      const resendTask = await prisma.outbox.create({
        data: {
          operationType: 'chat.call', entityType: 'entry', entityId: resendEntry.id,
          idempotencyKey: `chat.call:${resendEntry.id}`, payload: {}, entryId: resendEntry.id,
          status: 'retry', attempts: 3, lastError: 'chat_transport_unavailable',
          nextAttemptAt: new Date(Date.now() + 60_000),
        },
      });
      const resendResponse = await app.inject({
        method: 'POST',
        url: `/api/entries/${resendEntry.id}/call-notification/resend`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: {},
      });
      expect(resendResponse.statusCode).toBe(200);
      expect(resendResponse.json()).toEqual({ status: 'queued', entryId: resendEntry.id });
      const resentTask = await prisma.outbox.findUnique({ where: { id: resendTask.id } });
      expect(resentTask)
        .toMatchObject({ status: 'pending', attempts: 0, lastError: null, leaseToken: null, leaseUntil: null });
      expect(resentTask.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now() + 1_000);
      expect(await prisma.entry.findUnique({ where: { id: resendEntry.id } }))
        .toMatchObject({ status: 'called', callDeadlineAt: originalDeadline });
      expect(await prisma.auditLog.findMany({ where: { queueId: resendQueue.id, entryId: resendEntry.id, event: 'entry.call_notification_resent' } }))
        .toMatchObject([{ actorId, origin: 'panel', previousState: 'retry', nextState: 'pending', safeDetail: { callDeadlinePreserved: true } }]);

      const clearQueue = await seedQraQueue(prisma, {
        slugPrefix: 'qra-clear-confirm',
        entries: [
          { userLogin: 'qra_clear_first', displayName: 'QRA Clear First', status: 'waiting', position: 1 },
          { userLogin: 'qra_clear_second', displayName: 'QRA Clear Second', status: 'waiting', position: 2 },
        ],
      });
      const clearRedemptionId = `qra-clear-redemption-${randomUUID()}`;
      await prisma.redemption.create({
        data: {
          redemptionId: clearRedemptionId, broadcasterId: 'qra-clear-broadcaster',
          rewardId: clearQueue.rewardId, userId: 'qra-clear-viewer', queueId: clearQueue.id,
          redeemedAt: new Date(), remoteStatus: 'UNFULFILLED', syncStatus: 'observed',
        },
      });
      const clearRedemptionEntry = await prisma.entry.create({
        data: {
          queueId: clearQueue.id, twitchUserId: 'qra-clear-viewer', userLogin: 'qra_clear_redemption',
          displayName: 'QRA Clear Redemption', source: 'redemption', redemptionId: clearRedemptionId,
          status: 'waiting', position: 3,
        },
      });
      const clearPreview = await app.inject({
        method: 'POST',
        url: `/api/queues/${clearQueue.id}/clear-preview`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: {},
      });
      expect(clearPreview.statusCode).toBe(200);
      expect(clearPreview.json()).toEqual({ status: 'confirmation_required', count: 3, refundsRequested: 1, expiresInSeconds: 15 });
      await prisma.entry.update({ where: { id: clearQueue.entries[0].id }, data: { version: { increment: 1 } } });
      const staleClearConfirm = await app.inject({
        method: 'POST',
        url: `/api/queues/${clearQueue.id}/clear-confirm`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: {},
      });
      expect(staleClearConfirm.statusCode).toBe(200);
      expect(staleClearConfirm.json()).toEqual({ status: 'confirmation_required', count: 3, refundsRequested: 1, expiresInSeconds: 15 });
      expect(await prisma.entry.count({ where: { queueId: clearQueue.id, status: 'waiting' } })).toBe(3);

      const otherSessionResponse = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000' } });
      expect(otherSessionResponse.statusCode).toBe(200);
      const otherCookie = otherSessionResponse.headers['set-cookie'].split(';', 1)[0];
      const otherSessionHeaders = {
        ...headers,
        cookie: otherCookie,
        'x-csrf-token': otherSessionResponse.json().csrfToken,
        'idempotency-key': randomUUID(),
      };
      const crossSessionConfirm = await app.inject({
        method: 'POST',
        url: `/api/queues/${clearQueue.id}/clear-confirm`,
        headers: otherSessionHeaders,
        payload: {},
      });
      expect(crossSessionConfirm.statusCode).toBe(200);
      expect(crossSessionConfirm.json()).toEqual({ status: 'confirmation_required', count: 3, refundsRequested: 1, expiresInSeconds: 15 });
      expect(await prisma.entry.count({ where: { queueId: clearQueue.id, status: 'waiting' } })).toBe(3);

      const clearConfirm = await app.inject({
        method: 'POST',
        url: `/api/queues/${clearQueue.id}/clear-confirm`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: {},
      });
      expect(clearConfirm.statusCode).toBe(200);
      expect(clearConfirm.json()).toEqual({ status: 'cleared', count: 3, refundsRequested: 1 });
      expect(await prisma.entry.findMany({ where: { queueId: clearQueue.id }, orderBy: { userLogin: 'asc' } }))
        .toMatchObject([
          { status: 'removed', position: null, terminalReason: 'queue_cleared', version: 3 },
          { id: clearRedemptionEntry.id, status: 'removed', position: null, terminalReason: 'queue_cleared', version: 2 },
          { status: 'removed', position: null, terminalReason: 'queue_cleared', version: 2 },
        ]);
      expect(await prisma.redemption.findUnique({ where: { redemptionId: clearRedemptionId } }))
        .toMatchObject({ expectedStatus: 'CANCELED', syncStatus: 'pending', remoteStatus: 'UNFULFILLED' });
      expect(await prisma.outbox.findMany({ where: { redemptionId: clearRedemptionId } }))
        .toMatchObject([{ operationType: 'redemption.cancel', status: 'pending', idempotencyKey: `financial:${clearRedemptionId}` }]);
      expect(await prisma.auditLog.count({ where: { queueId: clearQueue.id, event: 'entry.transitioned', actorId, reason: 'queue_cleared' } })).toBe(3);

      const openStateQueue = await seedQraQueue(prisma, { slugPrefix: 'qra-open-state', entries: [] });
      const closeQueue = await app.inject({
        method: 'POST',
        url: `/api/queues/${openStateQueue.id}/open-state`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: { isOpen: false },
      });
      expect(closeQueue.statusCode).toBe(200);
      expect(closeQueue.json()).toEqual({ status: 'pending', isOpen: false, remoteSyncStatus: 'pending_close' });
      expect(await prisma.queue.findUnique({ where: { id: openStateQueue.id } }))
        .toMatchObject({ isOpen: false, remoteSyncStatus: 'pending_close', version: 2 });
      expect(await prisma.outbox.findUnique({ where: { idempotencyKey: `queue:${openStateQueue.id}:reward.open:2` } }))
        .toMatchObject({ operationType: 'reward.set_open', status: 'pending', payload: { isOpen: false, queueVersion: 2, requestMayHaveReachedTwitch: false } });
      expect(await prisma.auditLog.findMany({ where: { queueId: openStateQueue.id, event: 'queue.open_state_requested', actorId } }))
        .toMatchObject([{ previousState: 'true', nextState: 'false', reason: 'queue_close_requested' }]);

      const manualModeQueue = await seedQraQueue(prisma, { slugPrefix: 'qra-manual-mode', entries: [] });
      const manualModeRequest = await app.inject({
        method: 'POST',
        url: `/api/queues/${manualModeQueue.id}/manual-mode`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: {},
      });
      expect(manualModeRequest.statusCode).toBe(202);
      expect(manualModeRequest.json()).toMatchObject({
        status: 'pending',
        queue: { id: manualModeQueue.id, queueMode: 'channel_points', isOpen: false, remoteSyncStatus: 'pending_close', modeTransitionStatus: 'pending_pause', version: 2 },
      });
      expect(await prisma.outbox.findUnique({ where: { idempotencyKey: `queue:${manualModeQueue.id}:mode.manual:2` } }))
        .toMatchObject({ operationType: 'reward.set_open', status: 'pending', payload: { isOpen: false, queueVersion: 2, convertToManualAfterConfirm: true } });
      expect(await repository.confirmManualModeFromReconciliation(manualModeQueue.id))
        .toMatchObject({ status: 'confirmed', queue: { queueMode: 'manual_only', isOpen: false, remoteSyncStatus: 'local_only', modeTransitionStatus: 'confirmed', version: 3 } });
      expect(await prisma.outbox.findUnique({ where: { idempotencyKey: `queue:${manualModeQueue.id}:mode.manual:2` } }))
        .toMatchObject({ status: 'confirmed', lastError: null, leaseToken: null, leaseUntil: null });
      expect(await prisma.auditLog.findMany({ where: { queueId: manualModeQueue.id }, orderBy: { createdAt: 'asc' } }))
        .toMatchObject([
          { event: 'queue.manual_mode_requested', actorId, origin: 'panel', nextState: 'manual_only_pending' },
          { event: 'queue.manual_mode_confirmed', origin: 'reconciliation', nextState: 'manual_only' },
        ]);

      const archiveQueue = await seedQraQueue(prisma, { slugPrefix: 'qra-archive', entries: [] });
      const archiveResponse = await app.inject({
        method: 'POST',
        url: `/api/queues/${archiveQueue.id}/archive`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: {},
      });
      expect(archiveResponse.statusCode).toBe(200);
      expect(archiveResponse.json()).toMatchObject({
        status: 'pending',
        queue: { id: archiveQueue.id, lifecycleStatus: 'active', isArchived: true, isOpen: false, remoteSyncStatus: 'pending_close', version: 2 },
      });
      expect(await prisma.outbox.findUnique({ where: { idempotencyKey: `queue:${archiveQueue.id}:reward.archive:2` } }))
        .toMatchObject({ operationType: 'reward.set_open', status: 'pending', payload: { isOpen: false, queueVersion: 2, archiveAfterConfirm: true } });
      expect(await prisma.auditLog.findMany({ where: { queueId: archiveQueue.id, event: 'queue.archive_requested', actorId } }))
        .toMatchObject([{ previousState: 'active', nextState: 'archived_pending_pause' }]);

      const localArchiveQueue = await seedQraQueue(prisma, {
        slugPrefix: 'qra-local-archive',
        queue: { remoteSyncStatus: 'unknown', isOpen: false },
        entries: [],
      });
      const archiveChallenge = await app.inject({
        method: 'POST',
        url: `/api/queues/${localArchiveQueue.id}/archive-local/challenge`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: { expectedVersion: 1 },
      });
      expect(archiveChallenge.statusCode).toBe(200);
      expect(archiveChallenge.json()).toMatchObject({
        status: 'challenge_issued', expectedVersion: 1, remoteSyncStatus: 'unknown',
      });
      expect(archiveChallenge.json().challengeId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(archiveChallenge.json().expiresAt).toMatch(/^\d{4}-\d\d-\d\dT/);
      const archiveChallengeRecord = await prisma.processedOperation.findUnique({
        where: { operationKey: `queue.local_archive.challenge:${createHash('sha256').update(archiveChallenge.json().challengeId).digest('hex')}` },
      });
      expect(archiveChallengeRecord.result).toMatchObject({
        kind: 'queue_local_archive_challenge', state: 'issued', queueId: localArchiveQueue.id,
        action: 'archive_local', actorId, expectedVersion: 1, remoteSyncStatus: 'unknown',
      });
      await prisma.processedOperation.update({
        where: { operationKey: archiveChallengeRecord.operationKey },
        data: { result: { ...archiveChallengeRecord.result, expiresAt: new Date(Date.now() - 1_000).toISOString() } },
      });
      const expiredArchiveConfirmation = await app.inject({
        method: 'POST',
        url: `/api/queues/${localArchiveQueue.id}/archive-local/confirm`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: {
          challengeId: archiveChallenge.json().challengeId,
          expectedVersion: 1,
          remoteSyncStatus: 'unknown',
        },
      });
      expect(expiredArchiveConfirmation.statusCode).toBe(409);
      expect(expiredArchiveConfirmation.json()).toEqual({
        code: 'LOCAL_ARCHIVE_CHALLENGE_EXPIRED',
        error: 'A fila ou a confirmação mudou/expirou. Atualize o painel e reinicie as duas confirmações.',
      });
      expect(await prisma.queue.findUnique({ where: { id: localArchiveQueue.id } }))
        .toMatchObject({ lifecycleStatus: 'active', isArchived: false, remoteSyncStatus: 'unknown', version: 1 });
      const freshArchiveChallenge = await app.inject({
        method: 'POST',
        url: `/api/queues/${localArchiveQueue.id}/archive-local/challenge`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: { expectedVersion: 1 },
      });
      expect(freshArchiveChallenge.statusCode).toBe(200);
      const archiveConfirmation = await app.inject({
        method: 'POST',
        url: `/api/queues/${localArchiveQueue.id}/archive-local/confirm`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: {
          challengeId: freshArchiveChallenge.json().challengeId,
          expectedVersion: 1,
          remoteSyncStatus: 'unknown',
        },
      });
      expect(archiveConfirmation.statusCode).toBe(200);
      expect(archiveConfirmation.json()).toMatchObject({
        status: 'archived', queue: { id: localArchiveQueue.id, lifecycleStatus: 'deleted', isArchived: true, isOpen: false, remoteSyncStatus: 'unknown', version: 2 },
      });
      expect((await prisma.queue.findUnique({ where: { id: localArchiveQueue.id } })).deletedAt).toBeInstanceOf(Date);
      expect(await prisma.auditLog.findMany({ where: { queueId: localArchiveQueue.id, event: 'queue.local_only_archived', actorId } }))
        .toMatchObject([{ previousState: 'active', nextState: 'deleted', reason: 'operator_local_archive_after_sync_uncertain' }]);

      const unarchiveQueue = await seedQraQueue(prisma, {
        slugPrefix: 'qra-unarchive',
        queue: { queueMode: 'manual_only', rewardOrigin: 'none', rewardId: null, cost: null, remoteSyncStatus: 'local_only', isArchived: true, isOpen: false },
        entries: [],
      });
      const unarchiveResponse = await app.inject({
        method: 'POST',
        url: `/api/queues/${unarchiveQueue.id}/unarchive`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: {},
      });
      expect(unarchiveResponse.statusCode).toBe(200);
      expect(unarchiveResponse.json()).toMatchObject({
        status: 'unarchived',
        queue: { id: unarchiveQueue.id, lifecycleStatus: 'active', isArchived: false, isOpen: false, remoteSyncStatus: 'local_only', version: 2 },
      });
      expect(await prisma.auditLog.findMany({ where: { queueId: unarchiveQueue.id, event: 'queue.unarchived', actorId } }))
        .toMatchObject([{ previousState: 'archived', nextState: 'active_closed', reason: 'local_queue_unarchived_closed' }]);

      const queueDeletion = await seedQraQueue(prisma, {
        slugPrefix: 'qra-delete-request',
        queue: { isOpen: false },
        entries: [],
      });
      const deletionResponse = await app.inject({
        method: 'POST',
        url: `/api/queues/${queueDeletion.id}/delete`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: { confirm: true },
      });
      expect(deletionResponse.statusCode).toBe(200);
      expect(deletionResponse.json()).toMatchObject({
        status: 'pending', activeRemoved: 0, refundsRequested: 0,
        queue: { id: queueDeletion.id, lifecycleStatus: 'deleting', isArchived: true, isOpen: false, remoteSyncStatus: 'delete_pending', version: 2 },
      });
      expect(await prisma.queue.findUnique({ where: { id: queueDeletion.id } }))
        .toMatchObject({ lifecycleStatus: 'deleting', isArchived: true, isOpen: false, remoteSyncStatus: 'delete_pending', version: 2 });
      expect(await prisma.outbox.findUnique({ where: { idempotencyKey: `queue:${queueDeletion.id}:reward.delete` } }))
        .toMatchObject({ operationType: 'reward.delete', status: 'pending', payload: { requestMayHaveReachedTwitch: false, safeToDelete: false } });
      expect(await prisma.auditLog.findMany({ where: { queueId: queueDeletion.id, event: 'queue.deletion_requested', actorId } }))
        .toMatchObject([{ previousState: 'active', nextState: 'deleting', reason: 'operator_requested_queue_deletion' }]);

      const manualAdmission = await app.inject({
        method: 'POST',
        url: `/api/queues/${manualQueue.id}/manual-entries`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: { login: 'qra_synthetic_viewer' },
      });
      expect(manualAdmission.statusCode).toBe(201);
      const admission = manualAdmission.json();
      expect(admission).toMatchObject({ status: 'waiting', position: 1 });
      expect(admission.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(Object.keys(admission).sort()).toEqual(['id', 'position', 'status']);
      expect(await prisma.entry.findUnique({ where: { id: admission.id } }))
        .toMatchObject({ queueId: manualQueue.id, twitchUserId: 'qra-synthetic-twitch-user', userLogin: 'qra_synthetic_viewer', status: 'waiting', position: 1, source: 'manual' });
      expect(await prisma.auditLog.findMany({ where: { queueId: manualQueue.id, entryId: admission.id, event: 'entry.manual_added' } }))
        .toMatchObject([{ actorId, origin: 'panel', reason: 'manual_admission' }]);

      const duplicateAdmission = await app.inject({
        method: 'POST',
        url: `/api/queues/${manualQueue.id}/manual-entries`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: { login: 'qra_synthetic_viewer' },
      });
      expect(duplicateAdmission.statusCode).toBe(409);
      expect(duplicateAdmission.json()).toEqual({ error: 'Essa pessoa já está ativa nesta fila.' });
      expect(await prisma.entry.count({ where: { queueId: manualQueue.id, twitchUserId: 'qra-synthetic-twitch-user', status: 'waiting' } })).toBe(1);

      for (const [to, reason] of [
        ['called', 'operator_call'],
        ['in_progress', 'operator_start'],
        ['completed', 'operator_complete'],
      ]) {
        const transition = await app.inject({
          method: 'POST',
          url: `/api/entries/${admission.id}/transitions`,
          headers: { ...headers, 'idempotency-key': randomUUID() },
          payload: { to, reason },
        });
        expect(transition.statusCode).toBe(200);
        expect(transition.json()).toEqual({ id: admission.id, status: to, financialDecision: 'no_operation' });
      }
      expect(await prisma.entry.findUnique({ where: { id: admission.id } }))
        .toMatchObject({ status: 'completed', position: null, terminalReason: 'operator_complete', source: 'manual' });
      const manualHistory = await app.inject({
        method: 'GET',
        url: `/api/queues/${manualQueue.id}/history`,
        headers,
      });
      expect(manualHistory.statusCode).toBe(200);
      expect(manualHistory.json()).toHaveLength(1);
      expect(manualHistory.json()[0]).toMatchObject({
        id: admission.id,
        userLogin: 'qra_synthetic_viewer',
        displayName: 'QRA Synthetic Viewer',
        status: 'completed',
        terminalReason: 'operator_complete',
      });
      expect(await prisma.auditLog.count({
        where: { queueId: manualQueue.id, entryId: admission.id, event: 'entry.transitioned', actorId },
      })).toBe(3);

      const callQueue = await seedQraQueue(prisma, {
        slugPrefix: 'qra-call-next',
        entries: [
          { userLogin: 'qra_call_first', displayName: 'QRA Call First', status: 'waiting', position: 1 },
          { userLogin: 'qra_call_second', displayName: 'QRA Call Second', status: 'waiting', position: 2 },
        ],
      });
      const callNext = await app.inject({
        method: 'POST',
        url: `/api/queues/${callQueue.id}/call`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: { count: 1 },
      });
      expect(callNext.statusCode).toBe(200);
      expect(callNext.json()).toEqual({ status: 'called', count: 1 });
      const persistedCallQueue = await prisma.queue.findUnique({
        where: { id: callQueue.id },
        include: { entries: { orderBy: { position: 'asc' } } },
      });
      expect(persistedCallQueue.entries.map(({ userLogin, status, position }) => ({ userLogin, status, position })))
        .toEqual(expect.arrayContaining([
          { userLogin: 'qra_call_first', status: 'called', position: null },
          { userLogin: 'qra_call_second', status: 'waiting', position: 1 },
        ]));
      const callNotice = await prisma.outbox.findUnique({ where: { idempotencyKey: `chat.call:${callQueue.entries[0].id}` } });
      expect(callNotice).toMatchObject({
        operationType: 'chat.call', entityType: 'entry', entityId: callQueue.entries[0].id,
        entryId: callQueue.entries[0].id, status: 'pending', attempts: 0,
      });
      expect(await prisma.auditLog.findMany({
        where: { queueId: callQueue.id, entryId: callQueue.entries[0].id, event: 'entry.transitioned' },
      })).toMatchObject([{ previousState: 'waiting', nextState: 'called', origin: 'panel' }]);

      const fulfillmentRedemptionId = `qra-fulfill-${randomUUID()}`;
      await prisma.redemption.create({
        data: {
          redemptionId: fulfillmentRedemptionId,
          broadcasterId: 'qra-synthetic-broadcaster',
          rewardId: reward.id,
          userId: 'qra-synthetic-fulfill-user',
          queueId: queue.id,
          redeemedAt: new Date(),
          remoteStatus: 'UNFULFILLED',
          syncStatus: 'observed',
        },
      });
      const fulfillmentEntry = await prisma.entry.create({
        data: {
          queueId: queue.id,
          twitchUserId: 'qra-synthetic-fulfill-user',
          userLogin: 'qrafulfillviewer',
          displayName: 'QRA Fulfill Viewer',
          source: 'redemption',
          redemptionId: fulfillmentRedemptionId,
          status: 'waiting',
          position: 1,
        },
      });
      const callFulfillmentEntry = await app.inject({
        method: 'POST',
        url: `/api/entries/${fulfillmentEntry.id}/transitions`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: { to: 'called', reason: 'operator_call' },
      });
      expect(callFulfillmentEntry.json()).toEqual({ id: fulfillmentEntry.id, status: 'called', financialDecision: 'no_operation' });
      const startFulfillmentEntry = await app.inject({
        method: 'POST',
        url: `/api/entries/${fulfillmentEntry.id}/transitions`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: { to: 'in_progress', reason: 'operator_start' },
      });
      expect(startFulfillmentEntry.json()).toEqual({ id: fulfillmentEntry.id, status: 'in_progress', financialDecision: 'request_fulfill' });
      const completeFulfillmentEntry = await app.inject({
        method: 'POST',
        url: `/api/entries/${fulfillmentEntry.id}/transitions`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: { to: 'completed', reason: 'operator_complete' },
      });
      expect(completeFulfillmentEntry.json()).toEqual({ id: fulfillmentEntry.id, status: 'completed', financialDecision: 'no_operation' });
      expect(await prisma.redemption.findUnique({ where: { redemptionId: fulfillmentRedemptionId } }))
        .toMatchObject({ expectedStatus: 'FULFILLED', syncStatus: 'pending', remoteStatus: 'UNFULFILLED' });
      expect(await prisma.outbox.findMany({ where: { redemptionId: fulfillmentRedemptionId } }))
        .toMatchObject([{ operationType: 'redemption.fulfill', status: 'pending', idempotencyKey: `financial:${fulfillmentRedemptionId}` }]);

      const cancellationRedemptionId = `qra-cancel-${randomUUID()}`;
      await prisma.redemption.create({
        data: {
          redemptionId: cancellationRedemptionId,
          broadcasterId: 'qra-synthetic-broadcaster',
          rewardId: reward.id,
          userId: 'qra-synthetic-cancel-user',
          queueId: queue.id,
          redeemedAt: new Date(),
          remoteStatus: 'UNFULFILLED',
          syncStatus: 'observed',
        },
      });
      const cancellationEntry = await prisma.entry.create({
        data: {
          queueId: queue.id,
          twitchUserId: 'qra-synthetic-cancel-user',
          userLogin: 'qracancelviewer',
          displayName: 'QRA Cancel Viewer',
          source: 'redemption',
          redemptionId: cancellationRedemptionId,
          status: 'waiting',
          position: 1,
        },
      });
      const callCancellationEntry = await app.inject({
        method: 'POST',
        url: `/api/entries/${cancellationEntry.id}/transitions`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: { to: 'called', reason: 'operator_call' },
      });
      expect(callCancellationEntry.json()).toEqual({ id: cancellationEntry.id, status: 'called', financialDecision: 'no_operation' });
      const removeCancellationEntry = await app.inject({
        method: 'POST',
        url: `/api/entries/${cancellationEntry.id}/transitions`,
        headers: { ...headers, 'idempotency-key': randomUUID() },
        payload: { to: 'removed', reason: 'operator_removed' },
      });
      expect(removeCancellationEntry.json()).toEqual({ id: cancellationEntry.id, status: 'removed', financialDecision: 'request_cancel' });
      expect(await prisma.redemption.findUnique({ where: { redemptionId: cancellationRedemptionId } }))
        .toMatchObject({ expectedStatus: 'CANCELED', syncStatus: 'pending', remoteStatus: 'UNFULFILLED' });
      expect(await prisma.outbox.findMany({ where: { redemptionId: cancellationRedemptionId } }))
        .toMatchObject([{ operationType: 'redemption.cancel', status: 'pending', idempotencyKey: `financial:${cancellationRedemptionId}` }]);
    } finally {
      await app.close();
    }
  });
});
