import { describe, expect, it, vi } from 'vitest';
import { createTwitchReconciler } from '../../apps/api/src/twitch/reconciliation.mjs';

function dependencies(overrides = {}) {
  const repository = {
    listManagedQueues: vi.fn(async () => [{ id: 'queue-1', rewardId: 'reward-1', isOpen: true, isArchived: false, lifecycleStatus: 'active', uidMode: 'hidden' }]),
    claimConvertedTombstoneReconciliationPage: vi.fn(async () => ({ status: 'unavailable', queues: [] })),
    completeConvertedTombstoneReconciliationPage: vi.fn(async () => true),
    listActiveRedemptionEntries: vi.fn(async () => []),
    markQueueRemoteDivergence: vi.fn(async () => undefined),
    markQueueRemoteUnknown: vi.fn(async () => undefined),
    retireQueueForConfirmedRewardAbsence: vi.fn(async () => ({ id: 'queue-1', lifecycleStatus: 'deleted', remoteSyncStatus: 'deleted' })),
    confirmConvertedQueueRemoteState: vi.fn(async () => true),
    markRedemptionUnknown: vi.fn(async () => undefined),
    ...overrides.repository,
  };
  const twitch = {
    getReward: vi.fn(async () => ({ id: 'reward-1', autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: false, isInStock: true, userInputRequired: false })),
    listUnfulfilledRedemptions: vi.fn(async () => []),
    getRedemptionStatus: vi.fn(async () => 'UNFULFILLED'),
    ...overrides.twitch,
  };
  const processor = {
    onRedemptionAdd: vi.fn(async () => ({ status: 'added' })),
    onRedemptionUpdate: vi.fn(async () => ({ status: 'completed' })),
  };
  return { repository, twitch, processor, reconciler: createTwitchReconciler({ repository, twitch, processor, clock: () => new Date('2026-10-03T12:00:00Z') }) };
}

describe('Twitch recovery reconciliation', () => {
  it('imports every paginated unfulfilled event in redeemedAt then ID order', async () => {
    const { reconciler, processor } = dependencies({ twitch: { listUnfulfilledRedemptions: vi.fn(async () => [
      { id: 'b', redeemedAt: new Date('2026-10-03T12:00:00Z') },
      { id: 'a', redeemedAt: new Date('2026-10-03T12:00:00Z') },
      { id: 'older', redeemedAt: new Date('2026-10-03T11:00:00Z') },
    ]) } });
    const result = await reconciler.run();
    expect(result.status).toBe('complete');
    expect(processor.onRedemptionAdd.mock.calls.map(([event]) => event.id)).toEqual(['older', 'a', 'b']);
  });

  it('expects a converted manual queue reward to stay paused even when local manual intake is open', async () => {
    const { reconciler, repository, twitch } = dependencies({
      repository: { listManagedQueues: vi.fn(async () => [{ id: 'queue-1', queueMode: 'channel_points', rewardOrigin: 'bot_created', modeTransitionStatus: 'pending_pause', rewardId: 'reward-1', isOpen: false, isArchived: false, lifecycleStatus: 'active', uidMode: 'hidden' }]), confirmManualModeFromReconciliation: vi.fn(async () => ({ status: 'confirmed' })) },
      twitch: { getReward: vi.fn(async () => ({ id: 'reward-1', autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: true, isInStock: true, userInputRequired: false })) },
    });
    const result = await reconciler.run();
    expect(result.status).toBe('complete');
    expect(repository.markQueueRemoteDivergence).not.toHaveBeenCalled();
    expect(twitch.listUnfulfilledRedemptions).toHaveBeenCalledWith('reward-1');
    expect(repository.confirmManualModeFromReconciliation).toHaveBeenCalledWith('queue-1');
  });

  it.each([true, false, undefined])('ignores Twitch stock value %s when reconciling the writable pause state', async (stock) => {
    const { reconciler, repository, twitch } = dependencies({
      repository: { listManagedQueues: vi.fn(async () => [{ id: 'queue-1', queueMode: 'channel_points', rewardOrigin: 'bot_created', modeTransitionStatus: 'none', rewardId: 'reward-1', isOpen: false, isArchived: false, lifecycleStatus: 'active', uidMode: 'hidden' }]) },
      twitch: { getReward: vi.fn(async () => ({ id: 'reward-1', autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: true, isInStock: stock, userInputRequired: false })) },
    });

    await expect(reconciler.run()).resolves.toMatchObject({ status: 'complete', issues: [] });
    expect(repository.markQueueRemoteDivergence).not.toHaveBeenCalled();
    expect(twitch.listUnfulfilledRedemptions).toHaveBeenCalledWith('reward-1');
  });

  it('ties divergence recovery to the queue version that was checked against Twitch', async () => {
    const { reconciler, repository } = dependencies({
      repository: { listManagedQueues: vi.fn(async () => [{
        id: 'queue-1', version: 12, queueMode: 'channel_points', rewardOrigin: 'bot_created', modeTransitionStatus: 'none',
        rewardId: 'reward-1', isOpen: false, isArchived: false, lifecycleStatus: 'active', uidMode: 'hidden',
        remoteSyncStatus: 'diverged',
      }]), confirmQueueRemoteState: vi.fn(async () => true) },
      twitch: { getReward: vi.fn(async () => ({ id: 'reward-1', autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: true, isInStock: true, userInputRequired: false })) },
    });

    await reconciler.run();

    expect(repository.confirmQueueRemoteState).toHaveBeenCalledWith('queue-1', { expectedVersion: 12 });
  });

  it('reports partial when the queue changes during remote verification and does not import redemptions', async () => {
    const { reconciler, twitch, processor } = dependencies({
      repository: { listManagedQueues: vi.fn(async () => [{
        id: 'queue-1', version: 12, queueMode: 'channel_points', rewardOrigin: 'bot_created', modeTransitionStatus: 'none',
        rewardId: 'reward-1', isOpen: false, isArchived: false, lifecycleStatus: 'active', uidMode: 'hidden',
        remoteSyncStatus: 'diverged',
      }]), confirmQueueRemoteState: vi.fn(async () => false) },
      twitch: { getReward: vi.fn(async () => ({ id: 'reward-1', autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: true, isInStock: true, userInputRequired: false })) },
    });

    await expect(reconciler.run()).resolves.toMatchObject({ status: 'partial', issues: [{ queueId: 'queue-1', code: 'queue_state_changed_during_reconciliation' }] });
    expect(twitch.listUnfulfilledRedemptions).not.toHaveBeenCalled();
    expect(processor.onRedemptionAdd).not.toHaveBeenCalled();
  });

  it('queries missing active redemptions by ID and applies only confirmed terminal state', async () => {
    const { reconciler, repository, twitch, processor } = dependencies({
      repository: { listActiveRedemptionEntries: vi.fn(async () => [{
        id: 'entry-1', redemptionId: 'missing-from-page', queueId: 'queue-1', status: 'called', rewardId: 'reward-1',
      }]) },
      twitch: {
        listUnfulfilledRedemptions: vi.fn(async () => []),
        getRedemptionStatus: vi.fn(async () => 'FULFILLED'),
      },
    });
    await reconciler.run();
    expect(twitch.getRedemptionStatus).toHaveBeenCalledWith('missing-from-page', 'reward-1');
    expect(processor.onRedemptionUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'missing-from-page', status: 'FULFILLED' }));
    expect(repository.markRedemptionUnknown).not.toHaveBeenCalled();
  });

  it('retires a queue only after an authoritative exact reward lookup confirms it is absent', async () => {
    const { reconciler, repository, twitch } = dependencies({ twitch: { getReward: vi.fn(async () => null) } });
    const result = await reconciler.run();
    expect(result.status).toBe('complete');
    expect(repository.retireQueueForConfirmedRewardAbsence).toHaveBeenCalledWith({ queueId: 'queue-1', expectedVersion: undefined, rewardId: 'reward-1' });
    expect(repository.markQueueRemoteDivergence).not.toHaveBeenCalled();
    expect(twitch.listUnfulfilledRedemptions).not.toHaveBeenCalled();
  });

  it('treats an incomplete undefined reward lookup as unknown rather than absence', async () => {
    const { reconciler, repository } = dependencies({ twitch: { getReward: vi.fn(async () => undefined) } });
    await expect(reconciler.run()).resolves.toMatchObject({ status: 'partial', issues: [{ code: 'reward_verification_failed' }] });
    expect(repository.markQueueRemoteUnknown).toHaveBeenCalledWith('queue-1', 'reward_verification_failed', undefined);
    expect(repository.retireQueueForConfirmedRewardAbsence).not.toHaveBeenCalled();
  });

  it('keeps a failed reward lookup unknown and does not retire the queue', async () => {
    const { reconciler, repository } = dependencies({ twitch: { getReward: vi.fn(async () => { throw new Error('network unavailable'); }) } });
    await expect(reconciler.run()).resolves.toMatchObject({ status: 'partial', issues: [{ code: 'reward_verification_failed' }] });
    expect(repository.markQueueRemoteUnknown).toHaveBeenCalledWith('queue-1', 'reward_verification_failed', undefined);
    expect(repository.retireQueueForConfirmedRewardAbsence).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 500, undefined])('does not interpret Twitch lookup error %s as reward absence', async (status) => {
    const error = Object.assign(new Error('private Twitch detail'), status ? { status } : {});
    const { reconciler, repository } = dependencies({ twitch: { getReward: vi.fn(async () => { throw error; }) } });

    await expect(reconciler.run()).resolves.toMatchObject({ status: 'partial', issues: [{ code: 'reward_verification_failed' }] });

    expect(repository.retireQueueForConfirmedRewardAbsence).not.toHaveBeenCalled();
    expect(repository.markQueueRemoteUnknown).toHaveBeenCalledWith('queue-1', 'reward_verification_failed', undefined);
  });

  it('reconciles unresolved terminal financial work for channel-points tombstones', async () => {
    const tombstone = { id: 'queue-1', version: 7, queueMode: 'channel_points', rewardId: 'reward-1', isOpen: false, isArchived: true, lifecycleStatus: 'deleted', uidMode: 'hidden', remoteSyncStatus: 'unknown' };
    const { reconciler, repository, processor } = dependencies({
      repository: {
        listManagedQueues: vi.fn(async () => []),
        claimConvertedTombstoneReconciliationPage: vi.fn(async () => ({ status: 'acquired', leaseId: '10000000-0000-4000-8000-000000000001', queues: [tombstone] })),
        listUnresolvedRedemptions: vi.fn(async () => [{ redemptionId: 'terminal-pending', broadcasterId: 'broadcaster-1', rewardId: 'reward-1', userId: 'viewer-1', syncStatus: 'unknown', expectedStatus: 'CANCELED', entry: { status: 'removed', userLogin: 'viewer', displayName: 'Viewer' } }]),
      },
      twitch: { getReward: vi.fn(async () => ({ id: 'reward-1' })), getRedemptionStatus: vi.fn(async () => 'CANCELED') },
    });
    const result = await reconciler.run();
    expect(result.externalTransitions).toBe(1);
    expect(processor.onRedemptionUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'terminal-pending', status: 'CANCELED' }));
    expect(repository.markQueueRemoteDivergence).not.toHaveBeenCalled();
  });

  it('checks a tombstone redemption once when unresolved finance and active-entry recovery overlap', async () => {
    const tombstone = { id: 'queue-1', version: 7, queueMode: 'channel_points', rewardId: 'reward-1', isOpen: false, isArchived: true, lifecycleStatus: 'deleted', uidMode: 'hidden', remoteSyncStatus: 'unknown' };
    const { reconciler, twitch } = dependencies({
      repository: {
        listManagedQueues: vi.fn(async () => []),
        claimConvertedTombstoneReconciliationPage: vi.fn(async () => ({ status: 'acquired', leaseId: '10000000-0000-4000-8000-000000000001', queues: [tombstone] })),
        listUnresolvedRedemptions: vi.fn(async () => [{ redemptionId: 'overlapping-record', broadcasterId: 'broadcaster-1', rewardId: 'reward-1', userId: 'viewer-1', syncStatus: 'unknown', entry: { id: 'entry-1', status: 'called', userLogin: 'viewer', displayName: 'Viewer' } }]),
        listActiveRedemptionEntries: vi.fn(async () => [{ id: 'entry-1', redemptionId: 'overlapping-record', twitchUserId: 'viewer-1', userLogin: 'viewer', displayName: 'Viewer' }]),
      },
    });

    await reconciler.run();

    expect(twitch.getRedemptionStatus).toHaveBeenCalledTimes(1);
    expect(twitch.getRedemptionStatus).toHaveBeenCalledWith('overlapping-record', 'reward-1');
  });

  it('keeps reconciling known financial records after exact reward absence on a tombstone', async () => {
    const tombstone = { id: 'queue-1', version: 9, queueMode: 'channel_points', rewardId: 'reward-1', isOpen: false, isArchived: true, lifecycleStatus: 'deleted', uidMode: 'hidden', remoteSyncStatus: 'unknown' };
    const { reconciler, repository, twitch, processor } = dependencies({
      repository: {
        listManagedQueues: vi.fn(async () => []),
        claimConvertedTombstoneReconciliationPage: vi.fn(async () => ({ status: 'acquired', leaseId: '10000000-0000-4000-8000-000000000001', queues: [tombstone] })),
        listUnresolvedRedemptions: vi.fn(async () => [{ redemptionId: 'terminal-unavailable', broadcasterId: 'broadcaster-1', rewardId: 'reward-1', userId: 'viewer-1', syncStatus: 'unknown', expectedStatus: 'CANCELED', entry: { status: 'removed', userLogin: 'viewer', displayName: 'Viewer' } }]),
      },
      twitch: { getReward: vi.fn(async () => null), getRedemptionStatus: vi.fn(async () => { throw Object.assign(new Error('missing'), { status: 404 }); }) },
    });

    const result = await reconciler.run();

    expect(repository.retireQueueForConfirmedRewardAbsence).toHaveBeenCalledWith({ queueId: 'queue-1', expectedVersion: 9, rewardId: 'reward-1' });
    expect(repository.listUnresolvedRedemptions).toHaveBeenCalledWith('queue-1');
    expect(twitch.getRedemptionStatus).toHaveBeenCalledWith('terminal-unavailable', 'reward-1');
    expect(repository.markRedemptionUnknown).toHaveBeenCalledWith('terminal-unavailable', 'remote_history_unavailable');
    expect(processor.onRedemptionUpdate).not.toHaveBeenCalled();
    expect(result.status).toBe('complete');
  });

  it('keeps reconciling redemptions for deleted converted queues when the reward state diverges', async () => {
    const redemption = { id: 'late-redemption', redeemedAt: new Date('2026-10-03T12:00:00Z'), status: 'UNFULFILLED' };
    const { reconciler, repository, twitch, processor } = dependencies({
      repository: { listManagedQueues: vi.fn(async () => [{
        id: 'queue-1', version: 7, queueMode: 'manual_only', rewardOrigin: 'bot_created', modeTransitionStatus: 'confirmed',
        rewardId: 'reward-1', isOpen: false, isArchived: true, lifecycleStatus: 'deleted', uidMode: 'hidden', remoteSyncStatus: 'diverged',
      }]) },
      twitch: {
        getReward: vi.fn(async () => ({ id: 'reward-1', autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: false, userInputRequired: false })),
        listUnfulfilledRedemptions: vi.fn(async () => [redemption]),
      },
    });

    await expect(reconciler.run()).resolves.toMatchObject({ status: 'complete', queues: 1 });
    expect(twitch.listUnfulfilledRedemptions).toHaveBeenCalledWith('reward-1');
    expect(processor.onRedemptionAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'late-redemption', rewardId: 'reward-1', status: 'UNFULFILLED' }));
    expect(repository.confirmConvertedQueueRemoteState).not.toHaveBeenCalled();
  });

  it('reconciles every active queue before a bounded tombstone page and checkpoints after attempting it', async () => {
    const order = [];
    const active = { id: 'queue-active', queueMode: 'channel_points', modeTransitionStatus: 'none', rewardId: 'reward-active', isOpen: true, isArchived: false, lifecycleStatus: 'active', uidMode: 'hidden' };
    const tombstone = { id: 'queue-tombstone', queueMode: 'manual_only', modeTransitionStatus: 'confirmed', rewardId: 'reward-tombstone', isOpen: false, isArchived: true, lifecycleStatus: 'deleted', uidMode: 'hidden' };
    const page = { status: 'acquired', leaseId: '10000000-0000-4000-8000-000000000001', queues: [tombstone] };
    const { reconciler, repository, twitch } = dependencies({
      repository: {
        listManagedQueues: vi.fn(async () => [active]),
        claimConvertedTombstoneReconciliationPage: vi.fn(async ({ limit }) => { expect(limit).toBe(10); return page; }),
        completeConvertedTombstoneReconciliationPage: vi.fn(async (input) => { order.push('checkpoint'); expect(input).toMatchObject({ leaseId: page.leaseId, lastQueueId: tombstone.id, complete: true }); return true; }),
      },
      twitch: {
        getReward: vi.fn(async (id) => {
          order.push(id);
          return { id, autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: id === 'reward-tombstone', userInputRequired: false };
        }),
        listUnfulfilledRedemptions: vi.fn(async (id) => { order.push(`redemptions:${id}`); return []; }),
      },
    });

    const result = await reconciler.run();

    expect(result).toMatchObject({ status: 'complete', queues: 2, tombstonesScanned: 1 });
    expect(order.indexOf('reward-active')).toBeLessThan(order.indexOf('reward-tombstone'));
    expect(order.at(-1)).toBe('checkpoint');
    expect(repository.completeConvertedTombstoneReconciliationPage).toHaveBeenCalledTimes(1);
    expect(twitch.listUnfulfilledRedemptions).toHaveBeenCalledWith('reward-tombstone');
  });

  it('releases an incomplete tombstone page without checkpointing when an unexpected database failure aborts it', async () => {
    const tombstone = { id: 'queue-tombstone', queueMode: 'manual_only', modeTransitionStatus: 'confirmed', rewardId: 'reward-tombstone', isOpen: false, isArchived: true, lifecycleStatus: 'deleted', uidMode: 'hidden' };
    const { reconciler, repository } = dependencies({
      repository: {
        listManagedQueues: vi.fn(async () => [{ id: 'queue-active', version: 1, queueMode: 'channel_points', rewardId: 'reward-active', isOpen: true, isArchived: false, lifecycleStatus: 'active', uidMode: 'hidden' }]),
        claimConvertedTombstoneReconciliationPage: vi.fn(async () => ({ status: 'acquired', leaseId: '10000000-0000-4000-8000-000000000001', queues: [tombstone] })),
        markQueueRemoteUnknown: vi.fn(async () => { throw new Error('database unavailable'); }),
      },
      twitch: { getReward: vi.fn(async () => { throw new Error('network failure'); }) },
    });

    await expect(reconciler.run()).rejects.toThrow('database unavailable');
    expect(repository.completeConvertedTombstoneReconciliationPage).toHaveBeenCalledWith({
      leaseId: '10000000-0000-4000-8000-000000000001', complete: false,
    });
  });

  it('reports partial reconciliation when another process owns the expired tombstone page lease', async () => {
    const tombstone = { id: 'queue-tombstone', queueMode: 'manual_only', modeTransitionStatus: 'confirmed', rewardId: 'reward-tombstone', isOpen: false, isArchived: true, lifecycleStatus: 'deleted', uidMode: 'hidden' };
    const { reconciler } = dependencies({
      repository: {
        listManagedQueues: vi.fn(async () => []),
        claimConvertedTombstoneReconciliationPage: vi.fn(async () => ({ status: 'acquired', leaseId: '10000000-0000-4000-8000-000000000001', queues: [tombstone] })),
        completeConvertedTombstoneReconciliationPage: vi.fn(async () => false),
      },
      twitch: { getReward: vi.fn(async () => ({ id: 'reward-tombstone', autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: true, userInputRequired: false })) },
    });

    await expect(reconciler.run()).resolves.toMatchObject({ status: 'partial', issues: [{ code: 'tombstone_cursor_checkpoint_lost' }] });
  });

  it('confirms a deleted converted reward only after its paused state is verified', async () => {
    const reward = { id: 'reward-1', autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: true, isInStock: true, userInputRequired: false };
    const { reconciler, repository } = dependencies({
      repository: { listManagedQueues: vi.fn(async () => [{
        id: 'queue-1', version: 12, queueMode: 'manual_only', rewardOrigin: 'bot_created', modeTransitionStatus: 'confirmed',
        rewardId: 'reward-1', isOpen: false, isArchived: true, lifecycleStatus: 'deleting', uidMode: 'hidden', remoteSyncStatus: 'diverged',
      }]), confirmConvertedQueueRemoteState: vi.fn(async () => true) },
      twitch: { getReward: vi.fn(async () => reward) },
    });

    await reconciler.run();

    expect(repository.confirmConvertedQueueRemoteState).toHaveBeenCalledWith('queue-1', { expectedVersion: 12, reward });
  });

  it('treats a reward configured to skip the Twitch request queue as remote divergence', async () => {
    const { reconciler, repository, twitch } = dependencies({ twitch: {
      getReward: vi.fn(async () => ({ id: 'reward-1', autoFulfill: false, shouldRedemptionsSkipRequestQueue: true, isEnabled: true, isPaused: false, userInputRequired: false })),
    } });
    const result = await reconciler.run();
    expect(result.status).toBe('partial');
    expect(repository.markQueueRemoteDivergence).toHaveBeenCalledWith('queue-1', 'reward_configuration_mismatch', undefined);
    expect(twitch.listUnfulfilledRedemptions).not.toHaveBeenCalled();
  });

  it('does not infer cancellations or removals after a partial pagination failure', async () => {
    const { reconciler, repository } = dependencies({ twitch: {
      listUnfulfilledRedemptions: vi.fn(async () => { throw new Error('network response with sensitive text'); }),
    } });
    const result = await reconciler.run();
    expect(result.status).toBe('partial');
    expect(repository.markRedemptionUnknown).not.toHaveBeenCalled();
    expect(repository.markQueueRemoteUnknown).toHaveBeenCalledWith('queue-1', 'reconciliation_failed', undefined);
  });
});
