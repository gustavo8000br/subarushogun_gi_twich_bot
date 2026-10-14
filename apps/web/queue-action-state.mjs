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
    canDeleteFromPanelAnyway,
    deleteBlockedReason,
    resolveReward: active && queue.remoteSyncStatus === 'create_unknown',
    blockedReason,
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
