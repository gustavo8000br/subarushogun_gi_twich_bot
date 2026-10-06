import { describe, expect, it, vi } from 'vitest';
import { createTwitchApiAdapter, normalizeRedemptionStatus } from '../../apps/api/src/twitch/helix-adapter.mjs';

describe('Twurple Helix adapter', () => {
  it('normalizes redemption status values from Helix and EventSub shapes', () => {
    expect(['UNFULFILLED', 'unfulfilled', 'FULFILLED', 'fulfilled', 'CANCELED', 'canceled'].map(normalizeRedemptionStatus))
      .toEqual(['UNFULFILLED', 'UNFULFILLED', 'FULFILLED', 'FULFILLED', 'CANCELED', 'CANCELED']);
    expect(normalizeRedemptionStatus('unknown')).toBe('UNKNOWN');
  });

  it('creates a reward with the redemption queue preserved and normalizes channel-owned rewards', async () => {
    const createCustomReward = vi.fn(async (_broadcasterId, data) => ({ id: 'reward-1', ...data, isEnabled: data.isEnabled, isPaused: data.isPaused }));
    const getCustomRewards = vi.fn(async () => [{ id: 'reward-1', title: 'Queue', cost: 50, isEnabled: false, isPaused: true, autoFulfill: false }]);
    const adapter = createTwitchApiAdapter({
      api: { channelPoints: { createCustomReward, getCustomRewards } }, broadcasterId: 'channel-1',
    });

    await adapter.createReward({ title: 'Queue', cost: 50, prompt: 'UID', userInputRequired: true, isPaused: true });
    expect(createCustomReward).toHaveBeenCalledWith('channel-1', expect.objectContaining({ autoFulfill: false, isPaused: true }));
    await expect(adapter.getManagedRewards()).resolves.toEqual([{
      id: 'reward-1', title: 'Queue', cost: 50, prompt: undefined, isEnabled: false,
      isPaused: true, userInputRequired: undefined, autoFulfill: false, shouldRedemptionsSkipRequestQueue: false,
      maxRedemptionsPerStream: null, maxRedemptionsPerUserPerStream: null, globalCooldown: null,
    }]);
  });

  it('normalizes Twitch native reward redemption caps and global cooldown', async () => {
    const createCustomReward = vi.fn(async (_broadcasterId, data) => ({
      id: 'reward-limits', ...data,
      maxRedemptionsPerStream: data.maxRedemptionsPerStream,
      maxRedemptionsPerUserPerStream: data.maxRedemptionsPerUserPerStream,
      globalCooldown: data.globalCooldown,
      autoFulfill: false,
      shouldRedemptionsSkipRequestQueue: false,
    }));
    const adapter = createTwitchApiAdapter({ api: { channelPoints: { createCustomReward } }, broadcasterId: 'channel-1' });
    const requested = {
      title: 'Abyss', cost: 100, maxRedemptionsPerStream: 20,
      maxRedemptionsPerUserPerStream: 2, globalCooldown: 90,
    };

    await expect(adapter.createReward(requested)).resolves.toMatchObject({
      id: 'reward-limits', maxRedemptionsPerStream: 20,
      maxRedemptionsPerUserPerStream: 2, globalCooldown: 90,
    });
    expect(createCustomReward).toHaveBeenCalledWith('channel-1', expect.objectContaining({
      maxRedemptionsPerStream: 20, maxRedemptionsPerUserPerStream: 2, globalCooldown: 90,
      autoFulfill: false,
    }));
  });

  it('normalizes disabled Twitch reward limits as null', async () => {
    const updateCustomReward = vi.fn(async () => ({
      id: 'reward-limits', title: 'Abyss', cost: 100,
      maxRedemptionsPerStream: null, maxRedemptionsPerUserPerStream: null, globalCooldown: null,
      autoFulfill: false, shouldRedemptionsSkipRequestQueue: false,
    }));
    const adapter = createTwitchApiAdapter({ api: { channelPoints: { updateCustomReward } }, broadcasterId: 'channel-1' });

    await expect(adapter.updateReward('reward-limits', {
      maxRedemptionsPerStream: null, maxRedemptionsPerUserPerStream: null, globalCooldown: null,
    })).resolves.toMatchObject({
      maxRedemptionsPerStream: null, maxRedemptionsPerUserPerStream: null, globalCooldown: null,
    });
    expect(updateCustomReward).toHaveBeenCalledWith('channel-1', 'reward-limits', expect.objectContaining({
      maxRedemptionsPerStream: null, maxRedemptionsPerUserPerStream: null, globalCooldown: null,
      autoFulfill: false,
    }));
  });


  it('returns sent/drop status from the actual Helix Send Chat Message response', async () => {
    const sendChatMessage = vi.fn(async () => ({ isSent: false, dropReasonCode: 'msg_rejected' }));
    const adapter = createTwitchApiAdapter({ api: { chat: { sendChatMessage } }, broadcasterId: 'channel-1' });
    await expect(adapter.sendChatMessage('short reply')).resolves.toEqual({ sent: false, dropReasonCode: 'msg_rejected' });
    expect(sendChatMessage).toHaveBeenCalledWith('channel-1', 'short reply');
  });

  it('uses redemption ID plus reward ID to query and mutate points status', async () => {
    const getRedemptionById = vi.fn(async () => ({ isFulfilled: false, isCanceled: true }));
    const updateRedemptionStatusByIds = vi.fn(async () => [{ isFulfilled: true, isCanceled: false }]);
    const adapter = createTwitchApiAdapter({
      api: { channelPoints: { getRedemptionById, updateRedemptionStatusByIds } }, broadcasterId: 'channel-1',
    });
    await expect(adapter.getRedemptionStatus('redemption-1', 'reward-1')).resolves.toBe('CANCELED');
    await expect(adapter.setRedemptionStatus('redemption-1', 'FULFILLED', 'reward-1')).resolves.toEqual({ status: 'FULFILLED' });
    expect(getRedemptionById).toHaveBeenCalledWith('channel-1', 'reward-1', 'redemption-1');
    expect(updateRedemptionStatusByIds).toHaveBeenCalledWith('channel-1', 'reward-1', ['redemption-1'], 'FULFILLED');
  });

  it('confirms Channel Points API access and counts every channel reward', async () => {
    const getCustomRewards = vi.fn(async () => Array.from({ length: 46 }, (_, index) => ({ id: `reward-${index}` })));
    const adapter = createTwitchApiAdapter({ api: {
      users: { getUserById: vi.fn(async () => ({ broadcasterType: 'affiliate' })) },
      channelPoints: { getCustomRewards },
    }, broadcasterId: 'channel-1' });

    await expect(adapter.getChannelEligibility()).resolves.toEqual({
      eligible: true, broadcasterType: 'affiliate', channelPointsAvailable: true,
      rewardCount: 46, rewardLimit: 50, nearRewardLimit: true,
    });
    expect(getCustomRewards).toHaveBeenCalledWith('channel-1', false);
  });

  it('checks Twitch API reachability with the configured broadcaster ID and returns no profile data', async () => {
    const getUserById = vi.fn(async () => ({ id: 'channel-1', displayName: 'Private channel data' }));
    const adapter = createTwitchApiAdapter({ api: { users: { getUserById } }, broadcasterId: 'channel-1' });

    await expect(adapter.ping()).resolves.toBe(true);
    expect(getUserById).toHaveBeenCalledWith('channel-1');
  });

  it('does not probe Channel Points for an ineligible broadcaster', async () => {
    const getCustomRewards = vi.fn();
    const adapter = createTwitchApiAdapter({ api: {
      users: { getUserById: vi.fn(async () => ({ broadcasterType: '' })) },
      channelPoints: { getCustomRewards },
    }, broadcasterId: 'channel-1' });

    await expect(adapter.getChannelEligibility()).resolves.toMatchObject({
      eligible: false, broadcasterType: 'unknown', channelPointsAvailable: false,
      reason: 'channel_ineligible',
    });
    expect(getCustomRewards).not.toHaveBeenCalled();
  });

  it('reports unavailable Channel Points access without leaking SDK errors', async () => {
    const adapter = createTwitchApiAdapter({ api: {
      users: { getUserById: vi.fn(async () => ({ broadcasterType: 'partner' })) },
      channelPoints: { getCustomRewards: vi.fn(async () => { throw new Error('sensitive sdk response'); }) },
    }, broadcasterId: 'channel-1' });

    await expect(adapter.getChannelEligibility()).resolves.toMatchObject({
      eligible: false, broadcasterType: 'partner', channelPointsAvailable: false,
      reason: 'channel_points_unavailable',
    });
  });
});
