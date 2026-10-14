import { describe, expect, it, vi } from 'vitest';
import { createQueueDomainService, createQueueDomainServiceProxy } from '../../apps/api/src/domain/queue-service.mjs';

describe('queue domain service', () => {
  it('forwards queue deletion through a late-bound runtime proxy', async () => {
    const runtimeService = { deleteQueue: vi.fn(async (input) => ({ status: 'pending', queueId: input.queueId })) };
    const proxy = createQueueDomainServiceProxy({ getService: () => runtimeService });

    await expect(proxy.deleteQueue({ queueId: 'queue-1', actorId: 'operator-1', origin: 'panel' }))
      .resolves.toEqual({ status: 'pending', queueId: 'queue-1' });
    expect(runtimeService.deleteQueue).toHaveBeenCalledWith({ queueId: 'queue-1', actorId: 'operator-1', origin: 'panel' });
  });

  it('verifies Twitch state before asking the repository to cancel a pending queue deletion', async () => {
    const queue = { id: 'queue-1', rewardId: 'reward-1', title: 'Queue', cost: 100, rewardPrompt: '', uidMode: 'hidden', isPaused: true };
    const reward = {
      id: 'reward-1', title: 'Queue', cost: 100, prompt: '', isPaused: true, isEnabled: true,
      userInputRequired: false, maxRedemptionsPerStream: null, maxRedemptionsPerUserPerStream: null,
      globalCooldown: null, autoFulfill: false, shouldRedemptionsSkipRequestQueue: false,
    };
    const repository = {
      beginQueueDeletionCancellation: vi.fn(async () => ({ status: 'verification_required', operationId: 'operation-1', queueId: 'queue-1', rewardId: 'reward-1', expectedVersion: 2, queue })),
      confirmQueueDeletionCancellation: vi.fn(async () => ({ status: 'cancelled', queueId: 'queue-1' })),
      failQueueDeletionCancellation: vi.fn(),
    };
    const twitch = { getReward: vi.fn(async () => reward) };
    const service = createQueueDomainService({ repository, getTwitch: () => twitch });

    await expect(service.cancelQueueDeletion({ queueId: 'queue-1', actorId: 'operator-1' }))
      .resolves.toMatchObject({ status: 'cancelled' });

    expect(repository.beginQueueDeletionCancellation).toHaveBeenCalledWith({ queueId: 'queue-1', actorId: 'operator-1', origin: 'panel' });
    expect(twitch.getReward).toHaveBeenCalledWith('reward-1');
    expect(repository.confirmQueueDeletionCancellation).toHaveBeenCalledWith(expect.objectContaining({ queueId: 'queue-1', operationId: 'operation-1', expectedVersion: 2, reward }));
    expect(repository.failQueueDeletionCancellation).not.toHaveBeenCalled();
  });

  it('does not restore a queue when Twitch cannot verify the paused reward', async () => {
    const repository = {
      beginQueueDeletionCancellation: vi.fn(async () => ({ status: 'verification_required', operationId: 'operation-1', queueId: 'queue-1', rewardId: 'reward-1', expectedVersion: 2, queue: { id: 'queue-1', rewardId: 'reward-1' } })),
      confirmQueueDeletionCancellation: vi.fn(),
      failQueueDeletionCancellation: vi.fn(async () => ({ status: 'not_cancelled' })),
    };
    const twitch = { getReward: vi.fn(async () => { throw Object.assign(new Error('private'), { status: 503 }); }) };
    const service = createQueueDomainService({ repository, getTwitch: () => twitch });

    await expect(service.cancelQueueDeletion({ queueId: 'queue-1', actorId: 'operator-1' }))
      .resolves.toMatchObject({ status: 'not_cancelled' });

    expect(repository.confirmQueueDeletionCancellation).not.toHaveBeenCalled();
    expect(repository.failQueueDeletionCancellation).toHaveBeenCalledWith(expect.objectContaining({
      queueId: 'queue-1', operationId: 'operation-1', errorCode: 'queue_deletion_cancel_verification_failed',
    }));
  });

  it('decides a transition inside the persistence boundary and never claims remote completion', async () => {
    let persistedDecision;
    const repository = {
      applyEntryTransition: vi.fn(async ({ decideTransition, input }) => {
        persistedDecision = decideTransition({
          entry: { status: 'waiting', source: 'redemption' },
          queue: {
            refundIfRemovedWhileCalled: false,
            refundIfViewerLeavesCalled: false,
            refundOnNoShow: false,
          },
          input,
        });
        return { status: 'removed', financialDecision: persistedDecision.financialDecision };
      }),
    };
    const service = createQueueDomainService({ repository });

    const result = await service.transitionEntry({
      entryId: 'entry-1', to: 'removed', origin: 'viewer', actorId: 'viewer-1', reason: 'viewer_left',
    });

    expect(repository.applyEntryTransition).toHaveBeenCalledOnce();
    expect(persistedDecision).toMatchObject({
      accepted: true,
      previousStatus: 'waiting',
      nextStatus: 'removed',
      financialDecision: 'request_cancel',
    });
    expect(result).toEqual({ status: 'removed', financialDecision: 'request_cancel' });
    expect(result).not.toHaveProperty('refundConfirmed');
  });

  it('does not persist an invalid transition', async () => {
    let persisted = false;
    const repository = {
      applyEntryTransition: vi.fn(async ({ decideTransition, input }) => {
        const decision = decideTransition({
          entry: { status: 'waiting', source: 'redemption' },
          queue: {},
          input,
        });
        persisted = true;
        return decision;
      }),
    };
    const service = createQueueDomainService({ repository });

    await expect(service.transitionEntry({ entryId: 'entry-1', to: 'completed', reason: 'completed' }))
      .rejects.toMatchObject({ code: 'INVALID_ENTRY_TRANSITION' });
    expect(persisted).toBe(false);
  });

  it('routes batch calls through the domain decision before asking the repository to persist them', async () => {
    let decision;
    const repository = {
      callNext: vi.fn(async ({ decideTransition }) => {
        decision = decideTransition({
          entry: { status: 'waiting', source: 'redemption' },
          queue: {},
          input: { to: 'called', origin: 'panel', reason: 'operator_call' },
        });
        return [{ id: 'entry-1', status: 'called' }];
      }),
    };
    const service = createQueueDomainService({ repository });

    const result = await service.callNext({ queueId: 'queue-1', count: 1 });

    expect(result).toEqual([{ id: 'entry-1', status: 'called' }]);
    expect(decision).toMatchObject({
      accepted: true,
      previousStatus: 'waiting',
      nextStatus: 'called',
      financialDecision: 'no_operation',
    });
    expect(repository.callNext).toHaveBeenCalledOnce();
  });

  it('routes snapshot clearing through the same transition decision function', async () => {
    let decision;
    const repository = {
      clearActiveEntries: vi.fn(async ({ decideTransition }) => {
        decision = decideTransition({
          entry: { status: 'in_progress', source: 'redemption' },
          queue: { refundIfRemovedWhileCalled: false },
          input: { to: 'removed', origin: 'panel', reason: 'queue_cleared' },
        });
        return { status: 'cleared', count: 1, refundsRequested: Number(decision.financialDecision === 'request_cancel') };
      }),
    };
    const service = createQueueDomainService({ repository });
    const snapshot = [{ id: 'entry-1', version: 1, status: 'in_progress', source: 'redemption', redemptionId: 'redemption-1' }];

    const result = await service.clearActiveEntries({ queueId: 'queue-1', snapshot, origin: 'panel' });

    expect(repository.clearActiveEntries).toHaveBeenCalledOnce();
    expect(decision).toMatchObject({ previousStatus: 'in_progress', nextStatus: 'removed', financialDecision: 'request_cancel' });
    expect(result).toMatchObject({ status: 'cleared', refundsRequested: 1 });
  });
});
