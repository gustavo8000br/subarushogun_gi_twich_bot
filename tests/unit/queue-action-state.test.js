import { describe, expect, it } from 'vitest';
import { getQueueActionState, getQueueVisibilityAction } from '../../apps/web/queue-action-state.mjs';

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
    const queue = { queueMode: 'manual_only', rewardOrigin: 'bot_created', rewardId: 'reward-1', remoteSyncStatus: 'local_only', modeTransitionStatus: 'confirmed', isOpen: false, isArchived: true };
    const actionState = getQueueActionState(queue);
    expect(actionState).toMatchObject({ canCallEntries: true, canAddManualEntry: false, canToggleIntake: true, canDelete: true, canShowToViewers: true });
    expect(getQueueVisibilityAction(queue, actionState)).toEqual({ key: 'panel.queue.action.unarchive', action: 'unarchive-queue', disabled: false });
  });

  it('does not expose legacy visibility recovery while an archived queue is open', () => {
    const queue = { queueMode: 'manual_only', rewardOrigin: 'none', rewardId: null, remoteSyncStatus: 'local_only', isOpen: true, isArchived: true };
    const actionState = getQueueActionState(queue);
    expect(actionState.canShowToViewers).toBe(false);
    expect(getQueueVisibilityAction(queue, actionState)).toEqual({ key: 'panel.queue.action.unarchive', action: 'unarchive-queue', disabled: true });
  });

  it('exposes no hide action for a normal active queue', () => {
    const queue = { queueMode: 'manual_only', rewardOrigin: 'none', rewardId: null, remoteSyncStatus: 'local_only', isOpen: false, isArchived: false };
    expect(getQueueVisibilityAction(queue, getQueueActionState(queue))).toBeNull();
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

  it('offers a separate local-only recovery for uncertain reward sync states, including stuck deletion', () => {
    for (const remoteSyncStatus of ['pending', 'pending_create', 'create_unknown', 'create_failed', 'pending_open', 'pending_close', 'open_unknown', 'close_unknown', 'open_failed', 'close_failed', 'pending_update', 'update_unknown', 'update_failed', 'pending_delete', 'delete_pending', 'delete_unknown', 'delete_failed', 'failed', 'unknown', 'diverged']) {
      expect(getQueueActionState({ queueMode: 'channel_points', rewardId: 'reward-1', remoteSyncStatus, lifecycleStatus: 'active' }).canDeleteFromPanelAnyway).toBe(true);
      expect(getQueueActionState({ queueMode: 'channel_points', rewardId: 'reward-1', remoteSyncStatus, lifecycleStatus: 'deleting' }).canDeleteFromPanelAnyway).toBe(true);
    }
    expect(getQueueActionState({ queueMode: 'channel_points', rewardId: null, remoteSyncStatus: 'create_unknown', lifecycleStatus: 'active' }).canDeleteFromPanelAnyway).toBe(false);
    expect(getQueueActionState({ queueMode: 'channel_points', rewardId: 'reward-1', remoteSyncStatus: 'unknown', lifecycleStatus: 'deleted' }).canDeleteFromPanelAnyway).toBe(false);
  });

  it('shows recovery as the next action and disables remote actions while reward creation is unknown', () => {
    expect(getQueueActionState({ queueMode: 'channel_points', rewardId: null, remoteSyncStatus: 'create_unknown', modeTransitionStatus: 'none', isOpen: false, isArchived: false }))
      .toEqual({ canToggleIntake: false, canCallEntries: true, canAddManualEntry: true, canShowToViewers: false, canDelete: false, canRetryLocalDeletion: false, canDeleteFromPanelAnyway: false, deleteBlockedReason: 'reward_unresolved', resolveReward: true, blockedReason: 'reward_unresolved' });
  });

  it('enables open, pause and delete only after the managed reward is synchronized', () => {
    const queue = { queueMode: 'channel_points', rewardId: 'reward-1', remoteSyncStatus: 'synced', modeTransitionStatus: 'none', isOpen: true, isArchived: false };
    expect(getQueueActionState(queue)).toEqual({
      canToggleIntake: true,
      canCallEntries: true,
      canAddManualEntry: true,
      canShowToViewers: false,
      canDelete: true,
      canRetryLocalDeletion: false,
      canDeleteFromPanelAnyway: false,
      deleteBlockedReason: null,
      resolveReward: false,
      blockedReason: null,
    });
  });

  it('disables legacy show-to-viewers recovery until the remote pause is confirmed', () => {
    expect(getQueueActionState({ queueMode: 'channel_points', rewardId: 'reward-1', remoteSyncStatus: 'pending_close', lifecycleStatus: 'active', modeTransitionStatus: 'none', isOpen: false, isArchived: true }))
      .toEqual({ canToggleIntake: false, canCallEntries: true, canAddManualEntry: false, canShowToViewers: false, canDelete: false, canRetryLocalDeletion: false, canDeleteFromPanelAnyway: true, deleteBlockedReason: 'remote_operation_pending', resolveReward: false, blockedReason: 'remote_operation_pending' });
  });

  it('keeps all local queue state actions available without Twitch reward ownership', () => {
    expect(getQueueActionState({ queueMode: 'manual_only', rewardOrigin: 'none', rewardId: null, remoteSyncStatus: 'local_only', modeTransitionStatus: 'none', isOpen: false, isArchived: true }))
      .toEqual({ canToggleIntake: true, canCallEntries: true, canAddManualEntry: false, canShowToViewers: true, canDelete: true, canRetryLocalDeletion: false, canDeleteFromPanelAnyway: false, deleteBlockedReason: null, resolveReward: false, blockedReason: null });
  });
});
