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
      autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: true,
    });
    expect(h.repository.prepareRewardCreate).toHaveBeenCalledWith('outbox-1', { baselineRewardIds: [], requestMayHaveReachedTwitch: true }, 'lease-1');
    expect(h.repository.confirmRewardCreated).toHaveBeenCalledWith('outbox-1', { rewardId: 'reward-new' }, 'lease-1');
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
});
