import { createQueueRepository } from '../../apps/api/src/persistence/queue-repository.mjs';
import { createQueueDomainService } from '../../apps/api/src/domain/queue-service.mjs';
import { describe, expect, it, vi } from 'vitest';

describe('chat notification persistence contract', () => {
  it('reports a sent call with notification timestamp and deadline only after confirmed delivery', async () => {
    const now = new Date('2026-10-03T12:00:00Z');
    const tx = {
      outbox: { create: vi.fn(async () => ({ id: 'task-1' })) },
      entry: { findUnique: vi.fn(async () => ({ id: 'entry-1', queueId: 'queue-1', status: 'called', callNotifiedAt: null, callDeadlineAt: null, queue: { callTimeoutMin: 10 } })), update: vi.fn(async ({ data }) => data) },
      auditLog: { create: vi.fn(async () => undefined) },
    };
    const prisma = { $transaction: async (callback) => callback(tx), outbox: { findFirst: vi.fn(), updateMany: vi.fn() }, entry: { findMany: vi.fn(async () => []) } };
    const repository = createQueueRepository(prisma, { clock: () => now });
    expect(await repository.enqueueCallNotification({ entryId: 'entry-1', queueId: 'queue-1', message: 'Call message' })).toMatchObject({ id: 'task-1' });
    expect(JSON.stringify(tx.outbox.create.mock.calls[0][0])).not.toContain('Call message');
    expect(await repository.recordCallNotificationResult({ entryId: 'entry-1', sent: true, timeoutMin: 10 })).toMatchObject({ callNotifiedAt: now, callDeadlineAt: new Date(now.getTime() + 600_000) });
    expect(await repository.recordCallNotificationResult({ entryId: 'entry-1', sent: false, timeoutMin: 10 })).toBeNull();
  });

  it('claims one pending chat task with lease and ignores stale entries at processing time', async () => {
    const prisma = {
      $queryRaw: vi.fn(async () => [{ id: 'task-1', entryId: 'entry-1', status: 'processing', leaseToken: 'lease', entry: { id: 'entry-1', status: 'removed', queue: { uidMode: 'hidden' } } }]),
      outbox: { updateMany: vi.fn(async () => ({ count: 1 })) },
      entry: { findUnique: vi.fn(async () => ({ id: 'entry-1', status: 'removed', queue: { uidMode: 'hidden' } })) },
    };
    const repository = createQueueRepository(prisma);
    const task = await repository.claimNextChatNotification();
    expect(task).toMatchObject({ id: 'task-1', leaseToken: 'lease', entry: null });
    expect(prisma.outbox.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'task-1' }, data: { status: 'cancelled', lastError: 'entry_not_called' } });
  });

  it('persists no-show policy and cancellation intent through the domain service', async () => {
    const expired = { id: 'entry-1', queueId: 'queue-1', status: 'called', source: 'redemption', version: 1, callDeadlineAt: new Date('2026-10-03T11:59:00Z') };
    const queue = { refundOnNoShow: true, refundIfRemovedWhileCalled: true, refundIfViewerLeavesCalled: false };
    const tx = {
      $queryRaw: vi.fn(async () => [{ id: 'queue-1' }]),
      queue: { findUnique: vi.fn(async () => queue) },
      entry: { findUnique: vi.fn(async () => expired), update: vi.fn(async ({ data }) => ({ ...expired, ...data })) },
      redemption: { update: vi.fn(async () => undefined) },
      outbox: { create: vi.fn(async () => undefined) },
      auditLog: { create: vi.fn(async () => undefined) },
      setting: { findUnique: vi.fn(async () => null) },
    };
    const prisma = { $transaction: async (callback) => callback(tx), entry: { findUnique: vi.fn(async () => ({ queueId: 'queue-1' })) } };
    const repository = createQueueRepository(prisma, { clock: () => new Date('2026-10-03T12:00:00Z') });
    const domainService = createQueueDomainService({ repository });
    expect(await domainService.transitionEntry({ entryId: 'entry-1', to: 'no_show', origin: 'timer', reason: 'call_timeout' }))
      .toMatchObject({ status: 'no_show', financialDecision: 'request_cancel' });
  });
});
