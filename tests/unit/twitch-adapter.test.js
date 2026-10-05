import { describe, expect, it, vi } from 'vitest';
import { createTwitchApiAdapter, normalizeRedemptionStatus } from '../../apps/api/src/twitch/helix-adapter.mjs';

describe('Twurple Helix adapter', () => {
  it('normalizes redemption status values from Helix and EventSub shapes', () => {
    expect(['UNFULFILLED', 'unfulfilled', 'FULFILLED', 'fulfilled', 'CANCELED', 'canceled'].map(normalizeRedemptionStatus))
      .toEqual(['UNFULFILLED', 'UNFULFILLED', 'FULFILLED', 'FULFILLED', 'CANCELED', 'CANCELED']);
    expect(normalizeRedemptionStatus('unknown')).toBe('UNKNOWN');
  });

  it('creates a reward with the redemption queue preserved and normalizes channel-owned rewards', async () => {
    const createCustomReward = vi.fn(async (_broadcasterId, data) => ({ id: 'reward-1', ...data, isEnabled: data.isEnabled, isPaused: false }));
    const getCustomRewards = vi.fn(async () => [{ id: 'reward-1', title: 'Queue', cost: 50, isEnabled: false, isPaused: true, autoFulfill: false }]);
    const adapter = createTwitchApiAdapter({
      api: { channelPoints: { createCustomReward, getCustomRewards } }, broadcasterId: 'channel-1',
    });

    await adapter.createReward({ title: 'Queue', cost: 50, prompt: 'UID', userInputRequired: true });
    expect(createCustomReward).toHaveBeenCalledWith('channel-1', expect.objectContaining({ autoFulfill: false }));
    await expect(adapter.getManagedRewards()).resolves.toEqual([{
      id: 'reward-1', title: 'Queue', cost: 50, prompt: undefined, isEnabled: false,
      isPaused: true, userInputRequired: undefined, autoFulfill: false, shouldRedemptionsSkipRequestQueue: false,
    }]);
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
});
