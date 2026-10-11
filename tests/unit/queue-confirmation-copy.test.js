import { describe, expect, it } from 'vitest';
import { getQueueConfirmationCopy } from '../../apps/web/queue-confirmation-copy.mjs';

describe('queue confirmation copy', () => {
  it('uses local-only wording for a queue that has never had a Twitch reward', () => {
    const queue = { queueMode: 'manual_only', rewardOrigin: 'none', rewardId: null };
    expect(getQueueConfirmationCopy(queue, 'archive')).toBe('panel.queue.confirm.archive_local');
    expect(getQueueConfirmationCopy(queue, 'delete')).toBe('panel.queue.confirm.delete_local');
  });

  it('keeps remote deletion wording only for reward-backed queues', () => {
    expect(getQueueConfirmationCopy({ queueMode: 'channel_points', rewardId: 'reward-1' }, 'archive')).toBe('panel.queue.confirm.archive');
    expect(getQueueConfirmationCopy({ queueMode: 'manual_only', rewardOrigin: 'bot_created', rewardId: 'reward-1', remoteSyncStatus: 'local_only' }, 'delete')).toBe('panel.queue.confirm.delete_converted');
    expect(getQueueConfirmationCopy({ queueMode: 'manual_only', rewardOrigin: 'bot_created', rewardId: 'reward-1', remoteSyncStatus: 'local_only', lifecycleStatus: 'deleting' }, 'delete')).toBe('panel.queue.confirm.retry_delete_converted');
    expect(getQueueConfirmationCopy({ queueMode: 'manual_only', rewardOrigin: 'bot_created', rewardId: 'reward-1', remoteSyncStatus: 'diverged', lifecycleStatus: 'deleting' }, 'delete')).toBe('panel.queue.confirm.retry_delete_converted_diverged');
    expect(getQueueConfirmationCopy({ queueMode: 'channel_points', rewardOrigin: 'bot_created', rewardId: 'reward-1' }, 'delete')).toBe('panel.queue.confirm.delete');
    expect(getQueueConfirmationCopy({ queueMode: 'manual_only', rewardOrigin: 'dashboard_existing', rewardId: 'reward-2' }, 'archive')).toBe('panel.queue.confirm.archive');
  });

  it('uses the established wording when queue history is incomplete', () => {
    expect(getQueueConfirmationCopy(undefined, 'archive')).toBe('panel.queue.confirm.archive');
    expect(getQueueConfirmationCopy({ queueMode: 'manual_only', rewardOrigin: 'none', rewardId: 'unexpected-id' }, 'delete')).toBe('panel.queue.confirm.delete');
  });

  it('keeps unarchive wording independent of reward history', () => {
    expect(getQueueConfirmationCopy({ queueMode: 'manual_only', rewardOrigin: 'none', rewardId: null }, 'unarchive')).toBe('panel.queue.confirm.unarchive');
  });
});
