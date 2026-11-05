import { describe, expect, it, vi } from 'vitest';
import { getQueueRewardSettingsFailureFeedback, getQueueRewardSettingsFailureKey, updateQueueRewardSettings } from '../../apps/frontend/features/queues/queue-reward-settings.mjs';

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

  it.each([
    [{ code: 'INVALID_REWARD_SETTINGS' }, 'panel.error.invalid_reward_settings'],
    [{ status: 400 }, 'panel.error.invalid_reward_settings'],
    [{ code: 'STALE_QUEUE_VERSION', status: 409 }, 'panel.error.stale_queue_settings'],
    [{ code: 'QUEUE_REWARD_UPDATE_PENDING', status: 409 }, 'panel.error.reward_update_pending'],
    [{ code: 'QUEUE_REWARD_NOT_READY', status: 409 }, 'panel.error.reward_not_ready'],
    [{ code: 'QUEUE_NOT_AVAILABLE', status: 409 }, 'panel.error.queue_not_available'],
    [{ code: 'QUEUE_NOT_FOUND', status: 404 }, 'panel.error.queue_not_found'],
    [{ code: 'INTERNAL_ERROR', status: 503, referenceId: 'safe-reference' }, 'panel.error.generic'],
    [{ code: 'INVALID_REWARD_SETTINGS_RESPONSE' }, 'panel.error.generic'],
    [{ message: 'private server details' }, 'panel.error.generic'],
  ])('maps failure %o to safe localized product copy', (error, key) => {
    expect(getQueueRewardSettingsFailureKey(error)).toBe(key);
  });

  it('keeps only a safe diagnostic reference for reward-settings feedback', () => {
    expect(getQueueRewardSettingsFailureFeedback({ code: 'INTERNAL_ERROR', referenceId: 'operation.ref-12_3' }))
      .toEqual({ key: 'panel.error.generic', referenceId: 'operation.ref-12_3' });
    expect(getQueueRewardSettingsFailureFeedback({ code: 'INTERNAL_ERROR', referenceId: 'secret SQL details' }))
      .toEqual({ key: 'panel.error.generic', referenceId: null });
  });
});
