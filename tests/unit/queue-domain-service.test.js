import { describe, expect, it, vi } from 'vitest';
import { createQueueDomainService, createQueueDomainServiceProxy } from '../../apps/api/src/domain/queue-service.mjs';
import { twurpleHttpError } from '../helpers/twurple-real-instances.mjs';

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
    // OPS-22 FT-36 (F20, data-engineer (c)): the transient read writes the new code and asks for a RESTORE, never `unknown`.
    expect(repository.failQueueDeletionCancellation).toHaveBeenCalledWith(expect.objectContaining({
      queueId: 'queue-1', operationId: 'operation-1', errorCode: 'queue_deletion_cancel_verification_unavailable', conclusive: false,
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

// OPS-22 FT-36 (#100), group G3: the domain service of "cancel deletion" against a fake Twitch built from real Twurple
// instances (U36-02), the Orion decision on a possibly-sent DELETE (U36-05), the actor on every audited step (U36-04)
// and re-entrancy with a fresh request (U36-08).
describe('FT-36 cancel deletion domain service', () => {
  const queue = { id: 'queue-1', rewardId: 'reward-1', title: 'Queue', cost: 100, rewardPrompt: '', uidMode: 'hidden' };
  const pausedReward = {
    id: 'reward-1', title: 'Queue', cost: 100, prompt: '', isPaused: true, isEnabled: true,
    userInputRequired: false, maxRedemptionsPerStream: null, maxRedemptionsPerUserPerStream: null,
    globalCooldown: null, autoFulfill: false, shouldRedemptionsSkipRequestQueue: false,
  };
  function harness({ read, requestMayHaveReachedTwitch = false, operationType = 'reward.delete', confirm } = {}) {
    const repository = {
      beginQueueDeletionCancellation: vi.fn(async () => ({
        status: 'verification_required', operationId: 'operation-1', operationType, queueId: 'queue-1', rewardId: 'reward-1',
        expectedVersion: 2, queue, previousStatus: 'retry', requestMayHaveReachedTwitch,
      })),
      confirmQueueDeletionCancellation: vi.fn(confirm ?? (async () => ({ status: 'cancelled', queue: { ...queue, lifecycleStatus: 'active' } }))),
      failQueueDeletionCancellation: vi.fn(async ({ errorCode }) => ({ status: 'not_cancelled', reason: errorCode, queue })),
    };
    const twitch = { getReward: vi.fn(read), setRewardOpen: vi.fn(), deleteReward: vi.fn(), updateReward: vi.fn() };
    const service = createQueueDomainService({ repository, getTwitch: () => twitch });
    return { repository, twitch, service };
  }
  const timeout = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
  const network = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });

  it('U36-02: maps every read outcome to cancelled or to an enumerated reason, restoring on non-conclusive reads', async () => {
    const cases = [
      ['paused', async () => pausedReward, { status: 'cancelled' }],
      ['not paused', async () => ({ ...pausedReward, isPaused: false }), { errorCode: 'queue_delete_cancel_reward_not_paused', conclusive: true }],
      ['diverged', async () => ({ ...pausedReward, title: 'Other' }), { errorCode: 'queue_delete_reward_diverged', conclusive: true }],
      ['null', async () => null, { errorCode: 'queue_delete_reward_absent', conclusive: true }],
      ['real 404', async () => { throw twurpleHttpError(404, 'Not Found'); }, { errorCode: 'queue_delete_reward_absent', conclusive: true }],
      ['real 401', async () => { throw twurpleHttpError(401, 'Unauthorized'); }, { errorCode: 'authorization_required', conclusive: false }],
      ['real 500', async () => { throw twurpleHttpError(500, 'Internal Server Error'); }, { errorCode: 'queue_deletion_cancel_verification_unavailable', conclusive: false }],
      ['network', async () => { throw network(); }, { errorCode: 'queue_deletion_cancel_verification_unavailable', conclusive: false }],
      ['timeout', async () => { throw timeout(); }, { errorCode: 'queue_deletion_cancel_verification_unavailable', conclusive: false }],
    ];
    for (const [name, read, expected] of cases) {
      const { repository, twitch, service } = harness({ read });
      const result = await service.cancelQueueDeletion({ queueId: 'queue-1', actorId: 'operator-1' });
      expect(twitch.getReward, name).toHaveBeenCalledWith('reward-1');
      expect(twitch.setRewardOpen, name).not.toHaveBeenCalled();
      expect(twitch.deleteReward, name).not.toHaveBeenCalled();
      expect(twitch.updateReward, name).not.toHaveBeenCalled();
      if (expected.status === 'cancelled') {
        expect(result, name).toMatchObject({ status: 'cancelled' });
        expect(repository.failQueueDeletionCancellation, name).not.toHaveBeenCalled();
        continue;
      }
      expect(result, name).toMatchObject({ status: 'not_cancelled', reason: expected.errorCode });
      expect(repository.confirmQueueDeletionCancellation, name).not.toHaveBeenCalled();
      expect(repository.failQueueDeletionCancellation, name).toHaveBeenCalledWith({
        queueId: 'queue-1', operationId: 'operation-1', errorCode: expected.errorCode, conclusive: expected.conclusive, actorId: 'operator-1', origin: 'panel',
      });
    }
  });

  it('U36-05 (Orion decision): a possibly-sent DELETE is cancelled on a positive read and refused with 409 otherwise, after the restore', async () => {
    const positive = harness({ read: async () => pausedReward, requestMayHaveReachedTwitch: true });
    await expect(positive.service.cancelQueueDeletion({ queueId: 'queue-1', actorId: 'operator-1' })).resolves.toMatchObject({ status: 'cancelled' });
    expect(positive.repository.failQueueDeletionCancellation).not.toHaveBeenCalled();

    const reads = [
      ['503', async () => { throw twurpleHttpError(503, 'Service Unavailable'); }, 'queue_deletion_cancel_verification_unavailable', false],
      ['401', async () => { throw twurpleHttpError(401, 'Unauthorized'); }, 'authorization_required', false],
      ['absent', async () => null, 'queue_delete_reward_absent', true],
      ['not paused', async () => ({ ...pausedReward, isPaused: false }), 'queue_delete_cancel_reward_not_paused', true],
      ['diverged', async () => ({ ...pausedReward, cost: 1 }), 'queue_delete_reward_diverged', true],
    ];
    for (const [name, read, errorCode, conclusive] of reads) {
      const { repository, service } = harness({ read, requestMayHaveReachedTwitch: true });
      await expect(service.cancelQueueDeletion({ queueId: 'queue-1', actorId: 'operator-1' }), name)
        .rejects.toMatchObject({ code: 'QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED' });
      // The read happened after begin, so the task is restored (or set unknown) and audited BEFORE the refusal.
      expect(repository.failQueueDeletionCancellation, name).toHaveBeenCalledWith(expect.objectContaining({ errorCode, conclusive, actorId: 'operator-1' }));
      expect(repository.confirmQueueDeletionCancellation, name).not.toHaveBeenCalled();
    }
  });

  it('U36-06 (C-2): a 401 read keeps the refusal reason authorization_required; the repository maps the stored marker', async () => {
    const { repository, service } = harness({ read: async () => { throw twurpleHttpError(401, 'Unauthorized'); } });
    await expect(service.cancelQueueDeletion({ queueId: 'queue-1', actorId: 'operator-1' })).resolves.toMatchObject({ status: 'not_cancelled', reason: 'authorization_required' });
    expect(repository.failQueueDeletionCancellation).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'authorization_required', conclusive: false }));
  });

  it('U36-04: the actor and origin reach begin, confirm and fail (stale confirm restores and rethrows)', async () => {
    const ok = harness({ read: async () => pausedReward });
    await ok.service.cancelQueueDeletion({ queueId: 'queue-1', actorId: 'operator-7', origin: 'panel' });
    expect(ok.repository.beginQueueDeletionCancellation).toHaveBeenCalledWith({ queueId: 'queue-1', actorId: 'operator-7', origin: 'panel' });
    expect(ok.repository.confirmQueueDeletionCancellation).toHaveBeenCalledWith({
      queueId: 'queue-1', operationId: 'operation-1', expectedVersion: 2, reward: pausedReward, actorId: 'operator-7', origin: 'panel',
    });

    const stale = Object.assign(new Error('stale'), { code: 'QUEUE_DELETION_CANCELLATION_STALE' });
    const raced = harness({ read: async () => pausedReward, confirm: async () => { throw stale; } });
    await expect(raced.service.cancelQueueDeletion({ queueId: 'queue-1', actorId: 'operator-7' })).rejects.toBe(stale);
    expect(raced.repository.failQueueDeletionCancellation).toHaveBeenCalledWith({
      queueId: 'queue-1', operationId: 'operation-1', errorCode: 'queue_deletion_cancel_verification_stale', conclusive: false, actorId: 'operator-7', origin: 'panel',
    });
  });

  it('U36-02: a blocked pause target that is not paused is reported with the not-paused reason (restored by the repository)', async () => {
    const { repository, service } = harness({ read: async () => ({ ...pausedReward, isPaused: false }), operationType: 'reward.set_open' });
    await expect(service.cancelQueueDeletion({ queueId: 'queue-1', actorId: 'operator-1' }))
      .resolves.toMatchObject({ status: 'not_cancelled', reason: 'queue_delete_cancel_reward_not_paused' });
    expect(repository.failQueueDeletionCancellation).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'queue_delete_cancel_reward_not_paused', conclusive: true }));
  });

  it('U36-01: a begin refusal is passed through with its code and nothing else is called', async () => {
    for (const code of ['QUEUE_DELETION_ALREADY_COMPLETED', 'QUEUE_DELETION_NOT_PENDING', 'QUEUE_REWARD_OPERATION_PROCESSING', 'QUEUE_DELETION_PAUSE_IN_PROGRESS']) {
      const { repository, twitch, service } = harness({ read: async () => pausedReward });
      repository.beginQueueDeletionCancellation.mockRejectedValueOnce(Object.assign(new Error(code), { code }));
      await expect(service.cancelQueueDeletion({ queueId: 'queue-1', actorId: 'operator-1' }), code).rejects.toMatchObject({ code });
      expect(twitch.getReward, code).not.toHaveBeenCalled();
      expect(repository.confirmQueueDeletionCancellation, code).not.toHaveBeenCalled();
      expect(repository.failQueueDeletionCancellation, code).not.toHaveBeenCalled();
    }
  });

  it('U36-08: repeating the request (a fresh key) resumes the read; begin is re-entrant and the second call reads again', async () => {
    const { repository, twitch, service } = harness({ read: async () => { throw twurpleHttpError(500); } });
    await service.cancelQueueDeletion({ queueId: 'queue-1', actorId: 'operator-1' });
    twitch.getReward.mockResolvedValueOnce(pausedReward);
    await expect(service.cancelQueueDeletion({ queueId: 'queue-1', actorId: 'operator-1' })).resolves.toMatchObject({ status: 'cancelled' });
    expect(repository.beginQueueDeletionCancellation).toHaveBeenCalledTimes(2);
    expect(twitch.getReward).toHaveBeenCalledTimes(2);
  });
});
