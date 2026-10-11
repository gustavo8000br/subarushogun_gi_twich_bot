import { describe, expect, it, vi } from 'vitest';
import { createTwitchApiAdapter, normalizeRedemptionStatus } from '../../apps/api/src/twitch/helix-adapter.mjs';

describe('Twurple Helix adapter', () => {
  it('checks follower status by Twitch user id only when the saved broadcaster token has the follower scope', async () => {
    const getChannelFollowers = vi.fn(async (_broadcasterId, userId) => ({ data: userId === '123456' ? [{ userId }] : [] }));
    const adapter = createTwitchApiAdapter({
      api: { channels: { getChannelFollowers } }, broadcasterId: '999999',
      authProvider: { getCurrentScopesForUser: () => ['moderator:read:followers'] },
    });
    await expect(adapter.checkFollower('123456')).resolves.toBe('follower');
    expect(getChannelFollowers).toHaveBeenCalledWith('999999', '123456');
    await expect(adapter.checkFollower('789012')).resolves.toBe('not_follower');
  });

  it('returns unknown for missing scope, malformed user ids, and Twitch errors without caching completed results', async () => {
    const getChannelFollowers = vi.fn(async () => { throw new Error('network'); });
    const noScope = createTwitchApiAdapter({ api: { channels: { getChannelFollowers } }, broadcasterId: '999999',
      authProvider: { getCurrentScopesForUser: () => [] } });
    await expect(noScope.checkFollower('123456')).resolves.toBe('unknown');
    await expect(noScope.checkFollower('123456')).resolves.toBe('unknown');
    expect(getChannelFollowers).not.toHaveBeenCalled();
    const scoped = createTwitchApiAdapter({ api: { channels: { getChannelFollowers } }, broadcasterId: '999999',
      authProvider: { getCurrentScopesForUser: () => ['moderator:read:followers'] } });
    await expect(scoped.checkFollower('not-an-id')).resolves.toBe('unknown');
    await expect(scoped.checkFollower('123456')).resolves.toBe('unknown');
    expect(getChannelFollowers).toHaveBeenCalledOnce();
  });

  it('fails closed when follower data contains an unexpected user id', async () => {
    const getChannelFollowers = vi.fn(async () => ({ data: [{ userId: '123456' }, { userId: '654321' }] }));
    const adapter = createTwitchApiAdapter({ api: { channels: { getChannelFollowers } }, broadcasterId: '999999',
      authProvider: { getCurrentScopesForUser: () => ['moderator:read:followers'] } });

    await expect(adapter.checkFollower('123456')).resolves.toBe('unknown');
  });

  it('coalesces concurrent follower checks for the same Twitch user', async () => {
    let resolveFollowers;
    const getChannelFollowers = vi.fn(() => new Promise((resolve) => { resolveFollowers = resolve; }));
    const adapter = createTwitchApiAdapter({ api: { channels: { getChannelFollowers } }, broadcasterId: '999999',
      authProvider: { getCurrentScopesForUser: () => ['moderator:read:followers'] } });
    const first = adapter.checkFollower('123456');
    const second = adapter.checkFollower('123456');
    expect(getChannelFollowers).toHaveBeenCalledOnce();
    resolveFollowers({ data: [{ userId: '123456' }] });
    await expect(Promise.all([first, second])).resolves.toEqual(['follower', 'follower']);
  });

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
      isPaused: true, isInStock: undefined, userInputRequired: undefined, autoFulfill: false, shouldRedemptionsSkipRequestQueue: false,
      maxRedemptionsPerStream: null, maxRedemptionsPerUserPerStream: null, globalCooldown: null,
    }]);
  });

  it('maps Twurple autoFulfill to Helix should_redemptions_skip_request_queue without defaulting absent data', async () => {
    const adapter = createTwitchApiAdapter({
      api: { channelPoints: { getCustomRewards: vi.fn(async () => [
        { id: 'explicit', title: 'Queue', cost: 10, autoFulfill: true },
        { id: 'missing', title: 'Queue', cost: 10 },
      ]) } }, broadcasterId: 'channel-1',
    });
    const rewards = await adapter.getManagedRewards();
    expect(rewards.map(({ autoFulfill, shouldRedemptionsSkipRequestQueue }) => ({ autoFulfill, shouldRedemptionsSkipRequestQueue }))).toEqual([
      { autoFulfill: true, shouldRedemptionsSkipRequestQueue: true },
      { autoFulfill: undefined, shouldRedemptionsSkipRequestQueue: undefined },
    ]);
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

  it('updates only pause through the pinned Twurple API and preserves Twitch-owned stock state', async () => {
    const updateCustomReward = vi.fn(async (_broadcasterId, rewardId, data) => ({
      id: rewardId, isPaused: data.isPaused, isInStock: true,
    }));
    const getCustomRewardById = vi.fn(async (_broadcasterId, rewardId) => ({
      id: rewardId, title: 'Queue', cost: 50, prompt: '', isEnabled: true,
      isPaused: true, isInStock: true, userInputRequired: false,
      autoFulfill: false, shouldRedemptionsSkipRequestQueue: false,
    }));
    const adapter = createTwitchApiAdapter({ api: { channelPoints: { updateCustomReward, getCustomRewardById } }, broadcasterId: 'channel-1' });

    await expect(adapter.setRewardOpen('reward-stock', false)).resolves.toMatchObject({ isPaused: true, isInStock: true });
    expect(updateCustomReward).toHaveBeenCalledWith('channel-1', 'reward-stock', { isPaused: true, autoFulfill: false });
    expect(getCustomRewardById).toHaveBeenCalledWith('channel-1', 'reward-stock');
  });

  it('verifies the persisted reward state after Twitch accepts a pause PATCH with a stale response', async () => {
    const getCustomRewardById = vi.fn(async () => ({
      id: 'reward-stale', title: 'Queue', cost: 50, isEnabled: true,
      isPaused: true, isInStock: false, userInputRequired: false,
      autoFulfill: false, shouldRedemptionsSkipRequestQueue: false,
    }));
    const updateCustomReward = vi.fn(async () => ({ id: 'reward-stale', isPaused: false, isInStock: true }));
    const adapter = createTwitchApiAdapter({
      api: { channelPoints: { getCustomRewardById, updateCustomReward } }, broadcasterId: 'channel-1',
    });

    await expect(adapter.setRewardOpen('reward-stale', false, true)).resolves.toMatchObject({
      isPaused: true, isInStock: false,
    });
    expect(getCustomRewardById).toHaveBeenCalledWith('channel-1', 'reward-stale');
  });

  it.each([
    ['missing persisted reward', async () => null],
    ['wrong persisted reward id', async () => ({ id: 'other-reward', isPaused: true })],
  ])('keeps successful HTTP status separate from verification when GET returns %s', async (_label, getReward) => {
    const getCustomRewardById = vi.fn(getReward);
    const updateCustomReward = vi.fn(async () => ({ id: 'reward-1' }));
    const adapter = createTwitchApiAdapter({
      api: { channelPoints: { getCustomRewardById, updateCustomReward } }, broadcasterId: 'channel-1',
    });

    await expect(adapter.setRewardOpen('reward-1', false)).rejects.toMatchObject({ code: 'TWITCH_REWARD_STATE_UNVERIFIED' });
    expect(getCustomRewardById).toHaveBeenCalledOnce();
  });

  it('does not mask a failed remote read after a successful PATCH as a confirmed state', async () => {
    const getCustomRewardById = vi.fn(async () => { throw Object.assign(new Error('temporary read failure'), { code: 'TWITCH_READ_FAILED' }); });
    const updateCustomReward = vi.fn(async () => ({ id: 'reward-1', isPaused: true }));
    const adapter = createTwitchApiAdapter({
      api: { channelPoints: { getCustomRewardById, updateCustomReward } }, broadcasterId: 'channel-1',
    });

    await expect(adapter.setRewardOpen('reward-1', false)).rejects.toMatchObject({ code: 'TWITCH_READ_FAILED' });
  });

  it('does not attempt raw HTTP if the pinned Twurple update operation is unavailable', async () => {
    const adapter = createTwitchApiAdapter({ api: { channelPoints: {} }, broadcasterId: 'channel-1' });

    await expect(adapter.setRewardOpen('reward-1', false)).rejects.toMatchObject({ code: 'TWITCH_REWARD_UPDATE_NOT_CONFIGURED' });
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

  it('checks actual Helix reward capability instead of rejecting unknown broadcaster type up front', async () => {
    const getCustomRewards = vi.fn(async () => [{ id: 'reward-1' }, { id: 'reward-2' }]);
    const adapter = createTwitchApiAdapter({ api: {
      users: { getUserById: vi.fn(async () => ({ broadcasterType: '' })) },
      channelPoints: { getCustomRewards },
    }, broadcasterId: 'channel-1' });

    await expect(adapter.getChannelEligibility()).resolves.toMatchObject({
      eligible: true, broadcasterType: 'unknown', channelPointsAvailable: true,
      rewardCount: 2, rewardLimit: 50,
    });
    expect(getCustomRewards).toHaveBeenCalledWith('channel-1', false);
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

  it('classifies a forbidden Channel Points capability probe as unsupported, not a reconnect request', async () => {
    const adapter = createTwitchApiAdapter({ api: {
      users: { getUserById: vi.fn(async () => ({ broadcasterType: 'affiliate' })) },
      channelPoints: { getCustomRewards: vi.fn(async () => { throw Object.assign(new Error('private response'), { statusCode: 403 }); }) },
    }, broadcasterId: 'channel-1' });
    await expect(adapter.getChannelEligibility()).resolves.toMatchObject({
      eligible: false, channelPointsAvailable: false, reason: 'channel_ineligible',
    });
  });

  it('classifies an invalid access token separately so the integration can refresh it', async () => {
    const adapter = createTwitchApiAdapter({ api: {
      users: { getUserById: vi.fn(async () => ({ broadcasterType: 'affiliate' })) },
      channelPoints: { getCustomRewards: vi.fn(async () => { throw Object.assign(new Error('private response'), { statusCode: 401 }); }) },
    }, broadcasterId: 'channel-1' });
    await expect(adapter.getChannelEligibility()).resolves.toMatchObject({
      eligible: false, channelPointsAvailable: false, reason: 'access_token_invalid',
    });
  });
});
