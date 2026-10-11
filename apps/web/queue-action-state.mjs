const REMOTE_READY_STATES = new Set(['synced', 'synced_manual']);

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
  const archiveAction = {
    visible: active,
    enabled: queue.isArchived
      ? active && transitionReady && (localOnly || convertedLocal || (remoteReady && !queue.isOpen))
      : canToggleIntake,
    action: queue.isArchived ? 'unarchive-queue' : 'archive-queue',
  };
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
  return {
    canToggleIntake,
    canCallEntries,
    canAddManualEntry,
    archiveAction,
    canDelete,
    canRetryLocalDeletion,
    deleteBlockedReason,
    resolveReward: active && queue.remoteSyncStatus === 'create_unknown',
    blockedReason,
  };
}
