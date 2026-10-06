import { describe, expect, it, vi } from 'vitest';
import { createRewardOutboxWorker } from '../../apps/api/src/outbox/reward-worker.mjs';

function makeHarness({ attempts = 1, payload = {}, eligibility, managedRewards = [], createError = null } = {}) {
  const queue = { id: 'queue-1', title: 'Abismo', cost: 250, rewardPrompt: 'Envie somente UID.', uidMode: 'visible', rewardId: null, lifecycleStatus: 'active' };
  const task = { id: 'outbox-1', operationType: 'reward.create', attempts, leaseToken: 'lease-1', payload, queue };
  const existing = [...managedRewards];
  const repository = {
    claimNextRewardOperation: vi.fn(async () => task),
    prepareRewardCreate: vi.fn(async (_id, data) => { task.payload = { ...task.payload, ...data }; }),
    confirmRewardCreated: vi.fn(async () => true),
    retryRewardOperation: vi.fn(async () => true),
    failedRewardOperation: vi.fn(async () => true),
    unknownRewardOperation: vi.fn(async () => true),
  };
  const createdReward = {
    id: 'reward-new', title: queue.title, cost: queue.cost, prompt: queue.rewardPrompt,
    userInputRequired: true, autoFulfill: false, shouldRedemptionsSkipRequestQueue: false,
    isEnabled: true, isPaused: true,
  };
  let createCalls = 0;
  const twitch = {
    getChannelEligibility: vi.fn(async () => eligibility ?? ({ eligible: true, channelPointsAvailable: true, rewardCount: 10, rewardLimit: 50 })),
    getManagedRewards: vi.fn(async () => existing),
    createReward: vi.fn(async () => {
      createCalls += 1;
      if (createError) {
        if (createError.afterCreate) existing.push(createdReward);
        throw createError.error;
      }
      return createdReward;
    }),
  };
  return { worker: createRewardOutboxWorker({ repository, twitch, random: () => 0 }), repository, twitch, task, queue, createdReward, existing, get createCalls() { return createCalls; } };
}

describe('managed reward creation outbox worker', () => {
  it('creates and confirms a paused, queued, manually fulfilled reward', async () => {
    const h = makeHarness();
    await expect(h.worker.processOne()).resolves.toBe('confirmed');
    expect(h.twitch.createReward).toHaveBeenCalledWith({
      title: 'Abismo', cost: 250, prompt: 'Envie somente UID.', userInputRequired: true,
      maxRedemptionsPerStream: null, maxRedemptionsPerUserPerStream: null, globalCooldown: null,
      autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: true,
    });
    expect(h.repository.prepareRewardCreate).toHaveBeenCalledWith('outbox-1', { baselineRewardIds: [], requestMayHaveReachedTwitch: true }, 'lease-1');
    expect(h.repository.confirmRewardCreated).toHaveBeenCalledWith('outbox-1', { rewardId: 'reward-new' }, 'lease-1');
  });

  it('sends the persisted Twitch-native limits in the reward creation request and verifies them', async () => {
    const h = makeHarness();
    Object.assign(h.queue, { maxRedemptionsPerStream: 20, maxRedemptionsPerUserPerStream: 2, globalCooldownSeconds: 90 });
    Object.assign(h.createdReward, { maxRedemptionsPerStream: 20, maxRedemptionsPerUserPerStream: 2, globalCooldown: 90 });
    await expect(h.worker.processOne()).resolves.toBe('confirmed');
    expect(h.twitch.createReward).toHaveBeenCalledWith(expect.objectContaining({
      maxRedemptionsPerStream: 20, maxRedemptionsPerUserPerStream: 2, globalCooldown: 90,
    }));
  });

  it('does not call Twitch create when the channel already has 50 rewards', async () => {
    const h = makeHarness({ eligibility: { eligible: true, channelPointsAvailable: true, rewardCount: 50, rewardLimit: 50 } });
    await expect(h.worker.processOne()).resolves.toBe('failed');
    expect(h.twitch.createReward).not.toHaveBeenCalled();
    expect(h.repository.failedRewardOperation).toHaveBeenCalledWith('outbox-1', 'reward_limit_reached', 'lease-1');
  });

  it('associates a unique new exact match after Twitch accepted a request whose response was lost', async () => {
    const h = makeHarness({ createError: { afterCreate: true, error: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }) } });
    await expect(h.worker.processOne()).resolves.toBe('confirmed');
    expect(h.repository.confirmRewardCreated).toHaveBeenCalledWith('outbox-1', { rewardId: 'reward-new' }, 'lease-1');
  });

  it('marks an ambiguous create result unknown instead of repeating the POST', async () => {
    const h = makeHarness({ createError: { error: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }) } });
    await expect(h.worker.processOne()).resolves.toBe('unknown');
    expect(h.twitch.createReward).toHaveBeenCalledTimes(1);
    expect(h.repository.unknownRewardOperation).toHaveBeenCalledWith('outbox-1', 'reward_create_result_unknown', 'lease-1');
  });

  it('recovers one new matching managed reward after restart without another create call', async () => {
    const h = makeHarness({ attempts: 2, payload: { baselineRewardIds: ['old-reward'], requestMayHaveReachedTwitch: true } });
    h.twitch.getManagedRewards.mockResolvedValueOnce([h.createdReward]);
    await expect(h.worker.processOne()).resolves.toBe('confirmed');
    expect(h.twitch.createReward).not.toHaveBeenCalled();
    expect(h.repository.confirmRewardCreated).toHaveBeenCalledWith('outbox-1', { rewardId: 'reward-new' }, 'lease-1');
  });

  it('does not guess ownership when multiple new rewards match after restart', async () => {
    const h = makeHarness({ attempts: 2, payload: { baselineRewardIds: [], requestMayHaveReachedTwitch: true } });
    h.twitch.getManagedRewards.mockResolvedValueOnce([h.createdReward, { ...h.createdReward, id: 'reward-other' }]);
    await expect(h.worker.processOne()).resolves.toBe('unknown');
    expect(h.twitch.createReward).not.toHaveBeenCalled();
    expect(h.repository.unknownRewardOperation).toHaveBeenCalledWith('outbox-1', 'reward_create_association_ambiguous', 'lease-1');
  });

  it('retries an explicit 429 after its retry-after delay without retaining an ambiguous request marker', async () => {
    const rateLimited = Object.assign(new Error('rate limited'), { status: 429, retryAfterSeconds: 17 });
    const h = makeHarness({ createError: { error: rateLimited } });
    await expect(h.worker.processOne()).resolves.toBe('retry');
    expect(h.repository.retryRewardOperation).toHaveBeenCalledWith('outbox-1', expect.objectContaining({
      nextAttemptAt: expect.any(Date), errorCode: 'reward_create_rate_limited', payloadUpdates: { requestMayHaveReachedTwitch: false },
    }), 'lease-1');
    expect(h.repository.unknownRewardOperation).not.toHaveBeenCalled();
  });

  it('confirms queue opening only after Twitch reports the managed reward open', async () => {
    const queue = { id: 'queue-1', title: 'Abismo', cost: 250, rewardPrompt: 'Envie somente UID.', uidMode: 'visible', rewardId: 'reward-managed', lifecycleStatus: 'active', isArchived: false };
    const task = { id: 'open-task', operationType: 'reward.set_open', attempts: 1, leaseToken: 'open-lease', payload: { isOpen: true, queueVersion: 4, requestMayHaveReachedTwitch: false }, queue };
    const repository = {
      claimNextRewardOperation: vi.fn(async () => task),
      prepareRewardOpen: vi.fn(async () => true),
      confirmRewardOpen: vi.fn(async () => true),
      retryRewardOperation: vi.fn(async () => true),
      failedRewardOperation: vi.fn(async () => true),
      unknownRewardOperation: vi.fn(async () => true),
    };
    const closedReward = { id: 'reward-managed', title: queue.title, cost: queue.cost, prompt: queue.rewardPrompt, userInputRequired: true, autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: true };
    const openedReward = { ...closedReward, isPaused: false };
    const twitch = { getReward: vi.fn(async () => closedReward), setRewardOpen: vi.fn(async () => openedReward) };
    const worker = createRewardOutboxWorker({ repository, twitch, random: () => 0 });

    await expect(worker.processOne()).resolves.toBe('confirmed');
    expect(repository.prepareRewardOpen).toHaveBeenCalledWith('open-task', 'open-lease');
    expect(twitch.setRewardOpen).toHaveBeenCalledWith('reward-managed', true);
    expect(repository.confirmRewardOpen).toHaveBeenCalledWith('open-task', { isOpen: true }, 'open-lease');
  });

  it('reconciles a lost open response from the current managed reward without repeating the mutation', async () => {
    const queue = { id: 'queue-1', title: 'Abismo', cost: 250, rewardPrompt: 'Envie somente UID.', uidMode: 'visible', rewardId: 'reward-managed', lifecycleStatus: 'active', isArchived: false };
    const task = { id: 'open-task', operationType: 'reward.set_open', attempts: 2, leaseToken: 'open-lease', payload: { isOpen: true, queueVersion: 4, requestMayHaveReachedTwitch: true }, queue };
    const repository = {
      claimNextRewardOperation: vi.fn(async () => task), confirmRewardOpen: vi.fn(async () => true),
      unknownRewardOperation: vi.fn(async () => true),
    };
    const twitch = { getReward: vi.fn(async () => ({ id: 'reward-managed', title: queue.title, cost: queue.cost, prompt: queue.rewardPrompt, userInputRequired: true, autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: false })), setRewardOpen: vi.fn() };
    const worker = createRewardOutboxWorker({ repository, twitch });

    await expect(worker.processOne()).resolves.toBe('confirmed');
    expect(repository.confirmRewardOpen).toHaveBeenCalledWith('open-task', { isOpen: true }, 'open-lease');
    expect(twitch.setRewardOpen).not.toHaveBeenCalled();
  });

  it('pauses an archived queue through the reward worker before reporting remote sync', async () => {
    const queue = { id: 'queue-archive', title: 'Archive', cost: 250, rewardPrompt: '', uidMode: 'hidden', rewardId: 'reward-managed', lifecycleStatus: 'active', isArchived: true };
    const task = { id: 'archive-task', operationType: 'reward.set_open', attempts: 1, leaseToken: 'archive-lease', payload: { isOpen: false, queueVersion: 5, archiveAfterConfirm: true, requestMayHaveReachedTwitch: false }, queue };
    const repository = {
      claimNextRewardOperation: vi.fn(async () => task), prepareRewardOpen: vi.fn(async () => true),
      confirmRewardOpen: vi.fn(async () => true), failedRewardOperation: vi.fn(async () => true),
    };
    const opened = { id: 'reward-managed', title: queue.title, cost: queue.cost, prompt: '', userInputRequired: false, autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: false };
    const paused = { ...opened, isPaused: true };
    const twitch = { getReward: vi.fn(async () => opened), setRewardOpen: vi.fn(async () => paused) };
    const worker = createRewardOutboxWorker({ repository, twitch });

    await expect(worker.processOne()).resolves.toBe('confirmed');
    expect(twitch.setRewardOpen).toHaveBeenCalledWith('reward-managed', false);
    expect(repository.confirmRewardOpen).toHaveBeenCalledWith('archive-task', { isOpen: false }, 'archive-lease');
    expect(repository.failedRewardOperation).not.toHaveBeenCalled();
  });

  it('records every unfulfilled redemption and does not delete the reward while cancellation is pending', async () => {
    const queue = { id: 'queue-delete', title: 'Delete', cost: 250, rewardPrompt: '', uidMode: 'hidden', rewardId: 'reward-managed', lifecycleStatus: 'deleting', isArchived: true, isOpen: false, remoteSyncStatus: 'delete_pending' };
    const task = { id: 'delete-task', operationType: 'reward.delete', attempts: 1, leaseToken: 'delete-lease', payload: { requestMayHaveReachedTwitch: false, safeToDelete: false }, queue };
    const redemption = { id: 'remote-redemption', broadcasterId: 'broadcaster', rewardId: queue.rewardId, userId: 'viewer', redeemedAt: new Date(), status: 'UNFULFILLED' };
    const repository = {
      claimNextRewardOperation: vi.fn(async () => task), recordQueueDeletionRedemptions: vi.fn(async () => ({ status: 'recorded', recorded: 1, conflicts: 0 })),
      getQueueDeletionBlockers: vi.fn(async () => ({ pending: 1, blocked: 0 })), retryRewardOperation: vi.fn(async () => true),
    };
    const reward = { id: queue.rewardId, title: queue.title, cost: queue.cost, prompt: '', userInputRequired: false, autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: true };
    const twitch = { getReward: vi.fn(async () => reward), listUnfulfilledRedemptions: vi.fn(async () => [redemption]), deleteReward: vi.fn() };
    const worker = createRewardOutboxWorker({ repository, twitch });

    await expect(worker.processOne()).resolves.toBe('retry');
    expect(repository.recordQueueDeletionRedemptions).toHaveBeenCalledWith({ queueId: queue.id, redemptions: [redemption] });
    expect(twitch.deleteReward).not.toHaveBeenCalled();
    expect(repository.retryRewardOperation).toHaveBeenCalledWith('delete-task', expect.objectContaining({ errorCode: 'queue_deletion_waiting_for_refunds' }), 'delete-lease');
  });

  it('reconciles a lost reward-delete response after the safe-to-delete gate', async () => {
    const queue = { id: 'queue-delete-lost', title: 'Delete', cost: 250, rewardPrompt: '', uidMode: 'hidden', rewardId: 'reward-managed', lifecycleStatus: 'deleting', isArchived: true, isOpen: false, remoteSyncStatus: 'delete_pending' };
    const task = { id: 'delete-lost-task', operationType: 'reward.delete', attempts: 1, leaseToken: 'delete-lost-lease', payload: { requestMayHaveReachedTwitch: false, safeToDelete: false }, queue };
    const reward = { id: queue.rewardId, title: queue.title, cost: queue.cost, prompt: '', userInputRequired: false, autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: true };
    const repository = {
      claimNextRewardOperation: vi.fn().mockResolvedValueOnce(task).mockResolvedValueOnce(null),
      recordQueueDeletionRedemptions: vi.fn(async () => ({ status: 'recorded', recorded: 0, conflicts: 0 })),
      getQueueDeletionBlockers: vi.fn(async () => ({ pending: 0, blocked: 0 })),
      prepareRewardDelete: vi.fn(async () => true), completeQueueDeletion: vi.fn(async () => true),
    };
    const twitch = { getReward: vi.fn().mockResolvedValueOnce(reward).mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 })), listUnfulfilledRedemptions: vi.fn(async () => []), deleteReward: vi.fn(async () => { throw new Error('response lost after remote delete'); }) };
    const worker = createRewardOutboxWorker({ repository, twitch });

    await expect(worker.processOne()).resolves.toBe('confirmed');
    await expect(worker.processOne()).resolves.toBe('idle');
    expect(repository.prepareRewardDelete).toHaveBeenCalledWith(task.id, task.leaseToken);
    expect(repository.completeQueueDeletion).toHaveBeenCalledWith(task.id, task.leaseToken);
    expect(twitch.deleteReward).toHaveBeenCalledTimes(1);
  });
});

describe('managed reward settings update outbox worker', () => {
  function setup({ requestMayHaveReachedTwitch = false, remote = 'previous' } = {}) {
    const queue = {
      id: 'queue-update', title: 'New title', cost: 200, rewardPrompt: 'New prompt', uidMode: 'visible',
      maxRedemptionsPerStream: 20, maxRedemptionsPerUserPerStream: null, globalCooldownSeconds: 60,
      rewardId: 'reward-owned', lifecycleStatus: 'active', remoteSyncStatus: 'pending_update', version: 2,
    };
    const previous = { title: 'Old title', cost: 100, prompt: 'Old prompt', uidMode: 'hidden', maxRedemptionsPerStream: 10, maxRedemptionsPerUserPerStream: null, globalCooldownSeconds: null };
    const desiredReward = { id: queue.rewardId, title: queue.title, cost: queue.cost, prompt: queue.rewardPrompt, userInputRequired: true, maxRedemptionsPerStream: 20, maxRedemptionsPerUserPerStream: null, globalCooldown: 60, autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: true };
    const previousReward = { id: queue.rewardId, title: previous.title, cost: previous.cost, prompt: previous.prompt, userInputRequired: false, maxRedemptionsPerStream: 10, maxRedemptionsPerUserPerStream: null, globalCooldown: null, autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: true };
    const task = { id: 'update-outbox', operationType: 'reward.update', attempts: 1, leaseToken: 'lease-update', payload: { queueVersion: 2, requestMayHaveReachedTwitch, previous }, queue };
    const repository = {
      claimNextRewardOperation: vi.fn(async () => task), prepareRewardUpdate: vi.fn(async () => true),
      confirmRewardUpdated: vi.fn(async () => true), retryRewardOperation: vi.fn(async () => true),
      failedRewardOperation: vi.fn(async () => true), unknownRewardOperation: vi.fn(async () => true),
    };
    const twitch = {
      getReward: vi.fn(async () => remote === 'desired' ? desiredReward : remote === 'previous' ? previousReward : ({ ...previousReward, title: 'Externally changed' })),
      updateReward: vi.fn(async () => desiredReward),
    };
    const worker = createRewardOutboxWorker({ repository, twitch, random: () => 0 });
    return { worker, repository, twitch, task, queue, previous, desiredReward };
  }

  it('preflights ownership/config and confirms the desired app-owned reward settings', async () => {
    const h = setup();
    await expect(h.worker.processOne()).resolves.toBe('confirmed');
    expect(h.twitch.updateReward).toHaveBeenCalledWith('reward-owned', expect.objectContaining({
      title: 'New title', cost: 200, prompt: 'New prompt', userInputRequired: true,
      maxRedemptionsPerStream: 20, maxRedemptionsPerUserPerStream: null, globalCooldown: 60,
      autoFulfill: false,
    }));
    expect(h.repository.prepareRewardUpdate).toHaveBeenCalledWith('update-outbox', 'lease-update');
    expect(h.repository.confirmRewardUpdated).toHaveBeenCalledWith('update-outbox', 'lease-update');
  });

  it('resolves a lost PATCH response by reading the desired state without repeating the update', async () => {
    const h = setup({ requestMayHaveReachedTwitch: true, remote: 'desired' });
    await expect(h.worker.processOne()).resolves.toBe('confirmed');
    expect(h.twitch.updateReward).not.toHaveBeenCalled();
    expect(h.repository.confirmRewardUpdated).toHaveBeenCalled();
  });

  it('does not PATCH when the owned reward no longer matches the recorded previous state', async () => {
    const h = setup({ remote: 'diverged' });
    await expect(h.worker.processOne()).resolves.toBe('unknown');
    expect(h.twitch.updateReward).not.toHaveBeenCalled();
    expect(h.repository.unknownRewardOperation).toHaveBeenCalledWith('update-outbox', 'reward_update_reward_diverged', 'lease-update');
  });
});
