import { describe, expect, it } from 'vitest';
import { getQueueActionState } from '../../apps/web/queue-action-state.mjs';

describe('queue action visibility and safety', () => {
  it('shows recovery as the next action and disables remote actions while reward creation is unknown', () => {
    expect(getQueueActionState({ queueMode: 'channel_points', rewardId: null, remoteSyncStatus: 'create_unknown', modeTransitionStatus: 'none', isOpen: false, isArchived: false }))
      .toEqual({ canToggleIntake: false, archiveAction: { visible: true, enabled: false, action: 'archive-queue' }, canDelete: false, deleteBlockedReason: 'reward_unresolved', resolveReward: true, blockedReason: 'reward_unresolved' });
  });

  it('enables open, pause, archive and delete only after the managed reward is synchronized', () => {
    const queue = { queueMode: 'channel_points', rewardId: 'reward-1', remoteSyncStatus: 'synced', modeTransitionStatus: 'none', isOpen: true, isArchived: false };
    expect(getQueueActionState(queue)).toEqual({
      canToggleIntake: true,
      archiveAction: { visible: true, enabled: true, action: 'archive-queue' },
      canDelete: true,
      deleteBlockedReason: null,
      resolveReward: false,
      blockedReason: null,
    });
  });

  it('keeps unarchive visible but disabled until the remote pause is confirmed', () => {
    expect(getQueueActionState({ queueMode: 'channel_points', rewardId: 'reward-1', remoteSyncStatus: 'pending_close', modeTransitionStatus: 'none', isOpen: false, isArchived: true }))
      .toEqual({ canToggleIntake: false, archiveAction: { visible: true, enabled: false, action: 'unarchive-queue' }, canDelete: false, deleteBlockedReason: 'remote_operation_pending', resolveReward: false, blockedReason: 'remote_operation_pending' });
  });

  it('keeps all local queue state actions available without Twitch reward ownership', () => {
    expect(getQueueActionState({ queueMode: 'manual_only', rewardOrigin: 'none', rewardId: null, remoteSyncStatus: 'local_only', modeTransitionStatus: 'none', isOpen: false, isArchived: true }))
      .toEqual({ canToggleIntake: true, archiveAction: { visible: true, enabled: true, action: 'unarchive-queue' }, canDelete: true, deleteBlockedReason: null, resolveReward: false, blockedReason: null });
  });
});
