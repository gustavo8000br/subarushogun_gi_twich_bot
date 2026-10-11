import { describe, expect, it } from 'vitest';
import { getQueueActionState } from '../../apps/web/queue-action-state.mjs';

describe('queue action visibility and safety', () => {
  it('blocks calls while reward-to-manual pause is unresolved but keeps explicit adds available', () => {
    expect(getQueueActionState({ queueMode: 'channel_points', rewardId: 'reward-1', remoteSyncStatus: 'synced', modeTransitionStatus: 'pending_pause', isOpen: false, isArchived: false }))
      .toMatchObject({ canCallEntries: false, canAddManualEntry: true });
    expect(getQueueActionState({ queueMode: 'channel_points', rewardId: 'reward-1', remoteSyncStatus: 'synced', modeTransitionStatus: 'unknown', isOpen: false, isArchived: false }))
      .toMatchObject({ canCallEntries: false, canAddManualEntry: true });
  });

  it('allows calls and explicit adds after the transition resolves', () => {
    expect(getQueueActionState({ queueMode: 'manual_only', rewardOrigin: 'bot_created', rewardId: 'reward-1', remoteSyncStatus: 'local_only', modeTransitionStatus: 'confirmed', isOpen: false, isArchived: false }))
      .toMatchObject({ canCallEntries: true, canAddManualEntry: true, canToggleIntake: true, canDelete: true });
  });

  it('allows archived converted queues to be restored without reopening the reward', () => {
    expect(getQueueActionState({ queueMode: 'manual_only', rewardOrigin: 'bot_created', rewardId: 'reward-1', remoteSyncStatus: 'local_only', modeTransitionStatus: 'confirmed', isOpen: false, isArchived: true }))
      .toMatchObject({ canCallEntries: true, canAddManualEntry: false, canToggleIntake: true, canDelete: true, archiveAction: { enabled: true, action: 'unarchive-queue' } });
  });

  it('allows local deletion of a closed converted queue without enabling remote reward lifecycle', () => {
    expect(getQueueActionState({ queueMode: 'manual_only', rewardOrigin: 'bot_created', rewardId: 'reward-1', remoteSyncStatus: 'local_only', modeTransitionStatus: 'confirmed', isOpen: false, isArchived: false }))
      .toMatchObject({ canToggleIntake: true, canDelete: true, deleteBlockedReason: null });
    expect(getQueueActionState({ queueMode: 'manual_only', rewardOrigin: 'bot_created', rewardId: 'reward-1', remoteSyncStatus: 'local_only', modeTransitionStatus: 'confirmed', isOpen: true, isArchived: false }))
      .toMatchObject({ canDelete: false, deleteBlockedReason: 'remote_operation_pending' });
  });

  it('keeps a safe retry action available while converted local deletion is pending', () => {
    expect(getQueueActionState({ queueMode: 'manual_only', rewardOrigin: 'bot_created', rewardId: 'reward-1', remoteSyncStatus: 'local_only', lifecycleStatus: 'deleting', modeTransitionStatus: 'confirmed', isOpen: false, isArchived: true }))
      .toMatchObject({ canDelete: false, canRetryLocalDeletion: true, canToggleIntake: false, canAddManualEntry: false });
    expect(getQueueActionState({ queueMode: 'channel_points', rewardOrigin: 'bot_created', rewardId: 'reward-1', remoteSyncStatus: 'delete_pending', lifecycleStatus: 'deleting' }).canRetryLocalDeletion).toBe(false);
    expect(getQueueActionState({ queueMode: 'manual_only', rewardOrigin: 'bot_created', rewardId: 'reward-1', remoteSyncStatus: 'diverged', lifecycleStatus: 'deleting' }).canRetryLocalDeletion).toBe(true);
  });

  it('shows recovery as the next action and disables remote actions while reward creation is unknown', () => {
    expect(getQueueActionState({ queueMode: 'channel_points', rewardId: null, remoteSyncStatus: 'create_unknown', modeTransitionStatus: 'none', isOpen: false, isArchived: false }))
      .toEqual({ canToggleIntake: false, canCallEntries: true, canAddManualEntry: true, archiveAction: { visible: true, enabled: false, action: 'archive-queue' }, canDelete: false, canRetryLocalDeletion: false, deleteBlockedReason: 'reward_unresolved', resolveReward: true, blockedReason: 'reward_unresolved' });
  });

  it('enables open, pause, archive and delete only after the managed reward is synchronized', () => {
    const queue = { queueMode: 'channel_points', rewardId: 'reward-1', remoteSyncStatus: 'synced', modeTransitionStatus: 'none', isOpen: true, isArchived: false };
    expect(getQueueActionState(queue)).toEqual({
      canToggleIntake: true,
      canCallEntries: true,
      canAddManualEntry: true,
      archiveAction: { visible: true, enabled: true, action: 'archive-queue' },
      canDelete: true,
      canRetryLocalDeletion: false,
      deleteBlockedReason: null,
      resolveReward: false,
      blockedReason: null,
    });
  });

  it('keeps unarchive visible but disabled until the remote pause is confirmed', () => {
    expect(getQueueActionState({ queueMode: 'channel_points', rewardId: 'reward-1', remoteSyncStatus: 'pending_close', modeTransitionStatus: 'none', isOpen: false, isArchived: true }))
      .toEqual({ canToggleIntake: false, canCallEntries: true, canAddManualEntry: false, archiveAction: { visible: true, enabled: false, action: 'unarchive-queue' }, canDelete: false, canRetryLocalDeletion: false, deleteBlockedReason: 'remote_operation_pending', resolveReward: false, blockedReason: 'remote_operation_pending' });
  });

  it('keeps all local queue state actions available without Twitch reward ownership', () => {
    expect(getQueueActionState({ queueMode: 'manual_only', rewardOrigin: 'none', rewardId: null, remoteSyncStatus: 'local_only', modeTransitionStatus: 'none', isOpen: false, isArchived: true }))
      .toEqual({ canToggleIntake: true, canCallEntries: true, canAddManualEntry: false, archiveAction: { visible: true, enabled: true, action: 'unarchive-queue' }, canDelete: true, canRetryLocalDeletion: false, deleteBlockedReason: null, resolveReward: false, blockedReason: null });
  });
});
