const REMOTE_READY_STATES = new Set(['synced', 'synced_manual']);
const UNCERTAIN_REWARD_DELETE_STATES = new Set(['pending', 'pending_create', 'create_unknown', 'create_failed', 'pending_open', 'pending_close', 'open_unknown', 'close_unknown', 'open_failed', 'close_failed', 'pending_update', 'update_unknown', 'update_failed', 'pending_delete', 'delete_pending', 'delete_unknown', 'delete_failed', 'failed', 'unknown', 'diverged']);

/** @param {Record<string, any>} queue */
export function getQueueActionState(queue) {
  const localOnly = queue.queueMode === 'manual_only' && queue.rewardOrigin === 'none' && !queue.rewardId;
  const convertedLocal = queue.queueMode === 'manual_only' && queue.remoteSyncStatus === 'local_only' && Boolean(queue.rewardId);
  const active = queue.lifecycleStatus !== 'deleting' && queue.lifecycleStatus !== 'deleted';
  const localDeleteReady = localOnly || (convertedLocal && !queue.isOpen);
  const remoteReady = REMOTE_READY_STATES.has(queue.remoteSyncStatus) && Boolean(queue.rewardId);
  const transitionReady = !queue.modeTransitionStatus || queue.modeTransitionStatus === 'none'
    || (convertedLocal && queue.modeTransitionStatus === 'confirmed');
  const canManageState = active && transitionReady && (localOnly || convertedLocal || remoteReady);
  const canToggleIntake = canManageState;
  const canCallEntries = active && transitionReady;
  const canAddManualEntry = active && !queue.isArchived;
  const canShowToViewers = Boolean(queue.isArchived)
    && active
    && !queue.isOpen
    && transitionReady
    && (localOnly || convertedLocal || (remoteReady && !queue.isOpen));
  let blockedReason = null;
  if (!active) blockedReason = 'queue_not_active';
  else if (!transitionReady) blockedReason = 'queue_mode_transition_pending';
  else if (!localOnly && !convertedLocal && !remoteReady) {
    if (queue.remoteSyncStatus === 'pending_create') blockedReason = 'reward_creation_pending';
    else if (queue.remoteSyncStatus === 'create_unknown') blockedReason = 'reward_unresolved';
    else blockedReason = 'remote_operation_pending';
  }
  const canDelete = active && transitionReady && (localDeleteReady || remoteReady);
  const deleteBlockedReason = canDelete ? null : blockedReason ?? 'remote_operation_pending';
  const canRetryLocalDeletion = queue.lifecycleStatus === 'deleting' && queue.queueMode === 'manual_only' && Boolean(queue.rewardId);
  const canCancelQueueDeletion = queue.lifecycleStatus === 'deleting'
    && queue.queueMode === 'channel_points'
    && Boolean(queue.rewardId)
    && ['delete_pending', 'delete_unknown', 'delete_failed', 'diverged'].includes(queue.remoteSyncStatus);
  const canDeleteFromPanelAnyway = ['active', 'deleting'].includes(queue.lifecycleStatus)
    && Boolean(queue.rewardId)
    && UNCERTAIN_REWARD_DELETE_STATES.has(queue.remoteSyncStatus);
  return {
    canToggleIntake,
    canCallEntries,
    canAddManualEntry,
    canShowToViewers,
    canDelete,
    canRetryLocalDeletion,
    ...(canCancelQueueDeletion ? { canCancelQueueDeletion: true } : {}),
    canDeleteFromPanelAnyway,
    deleteBlockedReason,
    resolveReward: active && queue.remoteSyncStatus === 'create_unknown',
    blockedReason,
  };
}

// OPS-22 FT-26 (AC 15, F17): deletion projection derived on the server from durable facts; code-only, no free text.
export const QUEUE_DELETION_STATES = Object.freeze(['deleted', 'pending', 'blocked']);
export const QUEUE_DELETION_BLOCK_REASONS = Object.freeze(['authorization_required', 'financial_review_required', 'reward_operation_unconfirmed']);
// Same statuses the cancel begin accepts (`beginQueueDeletionCancellation`); `cancel_verification` resumes the read.
const CANCELLABLE_DELETE_STATUSES = new Set(['pending', 'retry', 'unknown', 'failed', 'conflict', 'cancel_verification']);
const UNCONFIRMED_REWARD_STATUSES = new Set(['unknown', 'failed', 'conflict']);

/**
 * @param {Record<string, any>|null|undefined} queue
 * @param {{rewardDelete?: {status?: string, lastError?: string|null}|null, rewardPause?: {status?: string, lastError?: string|null}|null, rewardTaskProcessing?: boolean, blockingOperations?: number, authorizationBlocked?: boolean}|null|undefined} facts
 * @returns {{deletionState: string, blockReason: string|null, blockingOperations: number, canCancelDeletion: boolean, cancellationInProgress: boolean}|null}
 */
export function getQueueDeletionProjection(queue, facts) {
  if (queue?.lifecycleStatus === 'deleted') {
    return { deletionState: 'deleted', blockReason: null, blockingOperations: 0, canCancelDeletion: false, cancellationInProgress: false };
  }
  if (queue?.lifecycleStatus !== 'deleting') return null;
  const known = facts && typeof facts === 'object' ? facts : {};
  const rewardDelete = known.rewardDelete && typeof known.rewardDelete === 'object' ? known.rewardDelete : null;
  const rewardPause = known.rewardPause && typeof known.rewardPause === 'object' ? known.rewardPause : null;
  const blockingOperations = Number.isSafeInteger(known.blockingOperations) && known.blockingOperations > 0 ? known.blockingOperations : 0;
  let blockReason = null;
  if (known.authorizationBlocked === true || [rewardDelete, rewardPause].some((task) => task?.lastError === 'twitch_authorization_required')) {
    blockReason = 'authorization_required';
  } else if (blockingOperations > 0 || rewardDelete?.lastError === 'queue_deletion_blocked_by_review') {
    blockReason = 'financial_review_required';
  } else if ([rewardDelete, rewardPause].some((task) => UNCONFIRMED_REWARD_STATUSES.has(task?.status))) {
    blockReason = 'reward_operation_unconfirmed';
  }
  const canCancelDeletion = queue.queueMode === 'channel_points' && Boolean(queue.rewardId)
    && known.rewardTaskProcessing !== true && CANCELLABLE_DELETE_STATUSES.has(rewardDelete?.status);
  return {
    deletionState: blockReason ? 'blocked' : 'pending',
    blockReason,
    blockingOperations,
    canCancelDeletion,
    cancellationInProgress: rewardDelete?.status === 'cancel_verification',
  };
}

/** @param {Record<string, any>} queue @param {ReturnType<typeof getQueueActionState>} actionState */
export function getQueueVisibilityAction(queue, actionState) {
  if (!queue.isArchived || ['deleting', 'deleted'].includes(queue.lifecycleStatus)) return null;
  return {
    key: 'panel.queue.action.unarchive',
    action: 'unarchive-queue',
    disabled: !actionState.canShowToViewers,
  };
}
