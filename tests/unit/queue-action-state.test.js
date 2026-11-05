import { describe, expect, it } from 'vitest';
import * as queueActionState from '../../apps/shared/panel/queue-action-state.mjs';

const { getQueueActionState, getQueueVisibilityAction } = queueActionState;

describe('queue action visibility and safety', () => {
  it('offers cancellation while a managed reward deletion is pending', () => {
    expect(getQueueActionState({
      queueMode: 'channel_points', rewardOrigin: 'bot_created', rewardId: 'reward-1',
      remoteSyncStatus: 'delete_pending', lifecycleStatus: 'deleting', isArchived: true, isOpen: false,
    }).canCancelQueueDeletion).toBe(true);
  });

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

// OPS-22 FT-26 (#99), U26-06: server-derived deletion projection consumed by the panel (AC 15, F17).
describe('queue deletion projection', () => {
  const { getQueueDeletionProjection, QUEUE_DELETION_STATES, QUEUE_DELETION_BLOCK_REASONS } = queueActionState;
  const deleting = { queueMode: 'channel_points', rewardId: 'reward-1', lifecycleStatus: 'deleting', remoteSyncStatus: 'delete_pending', isArchived: true, isOpen: false };
  const facts = (overrides = {}) => ({ rewardDelete: { status: 'retry', lastError: 'queue_deletion_waiting_for_refunds' }, rewardPause: null, rewardTaskProcessing: false, blockingOperations: 0, authorizationBlocked: false, ...overrides });

  it('exposes only the three enumerated states and enumerated block reasons', () => {
    expect(QUEUE_DELETION_STATES).toEqual(['deleted', 'pending', 'blocked']);
    expect(QUEUE_DELETION_BLOCK_REASONS).toEqual(['authorization_required', 'financial_review_required', 'reward_operation_unconfirmed']);
  });

  it('projects a pending deletion with no blockers and a cancellable reward.delete', () => {
    expect(getQueueDeletionProjection(deleting, facts())).toEqual({
      deletionState: 'pending', blockReason: null, blockingOperations: 0, canCancelDeletion: true, cancellationInProgress: false,
    });
  });

  it('projects deleted, and nothing for a queue that is not being deleted', () => {
    expect(getQueueDeletionProjection({ ...deleting, lifecycleStatus: 'deleted' }, facts())).toEqual({
      deletionState: 'deleted', blockReason: null, blockingOperations: 0, canCancelDeletion: false, cancellationInProgress: false,
    });
    expect(getQueueDeletionProjection({ ...deleting, lifecycleStatus: 'active' }, facts())).toBeNull();
  });

  it('blocks on financial operations that need review and reports their count', () => {
    expect(getQueueDeletionProjection(deleting, facts({ blockingOperations: 3, rewardDelete: { status: 'retry', lastError: 'queue_deletion_blocked_by_review' } })))
      .toMatchObject({ deletionState: 'blocked', blockReason: 'financial_review_required', blockingOperations: 3, canCancelDeletion: true });
    // The worker saw a blocker the count no longer shows: still blocked, generic count 0 (the panel uses the generic text).
    expect(getQueueDeletionProjection(deleting, facts({ rewardDelete: { status: 'retry', lastError: 'queue_deletion_blocked_by_review' } })))
      .toMatchObject({ deletionState: 'blocked', blockReason: 'financial_review_required', blockingOperations: 0 });
  });

  it('does not count manually resolved operations: the facts never carry them, so the deletion stays pending', () => {
    expect(getQueueDeletionProjection(deleting, facts({ blockingOperations: 0, rewardDelete: { status: 'retry', lastError: 'queue_deletion_waiting_for_refunds' } })))
      .toMatchObject({ deletionState: 'pending', blockingOperations: 0 });
  });

  it('puts authorization first, then financial review, then an unconfirmed reward step', () => {
    expect(getQueueDeletionProjection(deleting, facts({ authorizationBlocked: true, blockingOperations: 2 }))).toMatchObject({ deletionState: 'blocked', blockReason: 'authorization_required', blockingOperations: 2 });
    expect(getQueueDeletionProjection(deleting, facts({ rewardDelete: { status: 'retry', lastError: 'twitch_authorization_required' } }))).toMatchObject({ deletionState: 'blocked', blockReason: 'authorization_required' });
    for (const status of ['unknown', 'failed', 'conflict']) {
      expect(getQueueDeletionProjection(deleting, facts({ rewardDelete: { status, lastError: 'queue_delete_reward_diverged' } })), status).toMatchObject({ deletionState: 'blocked', blockReason: 'reward_operation_unconfirmed' });
    }
    // OPS-22 FT-36 (F19, D-36-5): a BLOCKED pause stage is cancellable; this case said `false` before FT-36.
    expect(getQueueDeletionProjection({ ...deleting, remoteSyncStatus: 'close_unknown' }, facts({ rewardDelete: null, rewardPause: { status: 'unknown', lastError: 'reward_open_result_unknown' } })))
      .toMatchObject({ deletionState: 'blocked', blockReason: 'reward_operation_unconfirmed', canCancelDeletion: true });
  });

  it('derives canCancelDeletion and cancellationInProgress from the same predicate as the cancel begin (no remote read)', () => {
    for (const status of ['pending', 'retry', 'unknown', 'failed', 'conflict']) {
      expect(getQueueDeletionProjection(deleting, facts({ rewardDelete: { status, lastError: null } })).canCancelDeletion, status).toBe(true);
    }
    expect(getQueueDeletionProjection(deleting, facts({ rewardDelete: { status: 'cancel_verification', lastError: null } })))
      .toMatchObject({ canCancelDeletion: true, cancellationInProgress: true });
    for (const status of ['processing', 'confirmed', 'cancelled']) {
      expect(getQueueDeletionProjection(deleting, facts({ rewardDelete: { status, lastError: null } })).canCancelDeletion, status).toBe(false);
    }
    expect(getQueueDeletionProjection(deleting, facts({ rewardTaskProcessing: true })).canCancelDeletion).toBe(false);
    expect(getQueueDeletionProjection(deleting, facts({ rewardDelete: null })).canCancelDeletion).toBe(false);
    expect(getQueueDeletionProjection({ ...deleting, queueMode: 'manual_only' }, facts()).canCancelDeletion).toBe(false);
    expect(getQueueDeletionProjection({ ...deleting, rewardId: null }, facts()).canCancelDeletion).toBe(false);
  });

  it('treats missing or malformed facts as a pending, non-cancellable deletion with no count', () => {
    expect(getQueueDeletionProjection(deleting, undefined)).toEqual({
      deletionState: 'pending', blockReason: null, blockingOperations: 0, canCancelDeletion: false, cancellationInProgress: false,
    });
    expect(getQueueDeletionProjection(deleting, facts({ blockingOperations: -4 })).blockingOperations).toBe(0);
    expect(getQueueDeletionProjection(deleting, facts({ blockingOperations: 'many' })).blockingOperations).toBe(0);
  });
});
