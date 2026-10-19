import { describe, expect, it, vi } from 'vitest';
import { getQueueRewardSettingsFailureKey, updateQueueRewardSettings } from '../../apps/frontend/features/queues/queue-reward-settings.mjs';

const valid = {
  expectedVersion: 4, title: 'Arena', cost: 350, rewardPrompt: 'UID opcional', uidMode: 'hidden',
  maxRedemptionsPerStream: null, maxRedemptionsPerUserPerStream: 2, globalCooldownSeconds: 60,
};

describe('Next queue reward settings', () => {
  it('sends the existing versioned settings PATCH and accepts only a pending update', async () => {
    const request = vi.fn().mockResolvedValue({ operationStatus: 'pending', id: 'queue-id', version: 5, remoteSyncStatus: 'pending_update' });
    await expect(updateQueueRewardSettings({ request, queueId: 'queue id', settings: valid }))
      .resolves.toMatchObject({ operationStatus: 'pending', remoteSyncStatus: 'pending_update' });
    expect(request).toHaveBeenCalledWith('/api/queues/queue%20id/reward-settings', {
      method: 'PATCH', body: JSON.stringify(valid),
    });
  });

  it.each([
    ['missing version', { ...valid, expectedVersion: 0 }],
    ['invalid title', { ...valid, title: ' '.repeat(46) }],
    ['invalid cost', { ...valid, cost: 0 }],
    ['invalid UID mode', { ...valid, uidMode: 'raw' }],
    ['invalid limit', { ...valid, globalCooldownSeconds: -1 }],
    ['description control characters', { ...valid, rewardPrompt: 'UID\noptional' }],
  ])('rejects %s before making a request', async (_label, settings) => {
    const request = vi.fn();
    await expect(updateQueueRewardSettings({ request, queueId: 'queue-id', settings })).rejects.toMatchObject({ code: 'INVALID_REWARD_SETTINGS_REQUEST' });
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects a response that could imply Twitch already confirmed the change', async () => {
    const request = vi.fn().mockResolvedValue({ operationStatus: 'confirmed', remoteSyncStatus: 'synced' });
    await expect(updateQueueRewardSettings({ request, queueId: 'queue-id', settings: valid })).rejects.toMatchObject({ code: 'INVALID_REWARD_SETTINGS_RESPONSE' });
  });

  it('maps known queue conflicts to safe localized product copy', () => {
    expect(getQueueRewardSettingsFailureKey({ code: 'STALE_QUEUE_VERSION', status: 409 })).toBe('panel.error.stale_queue_settings');
    expect(getQueueRewardSettingsFailureKey({ code: 'QUEUE_REWARD_UPDATE_PENDING', status: 409 })).toBe('panel.error.reward_update_pending');
    expect(getQueueRewardSettingsFailureKey({ message: 'private server details' })).toBe('panel.error.generic');
  });
});
