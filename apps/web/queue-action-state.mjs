const REMOTE_READY_STATES = new Set(['synced', 'synced_manual']);

/** @param {Record<string, any>} queue */
export function getQueueActionState(queue) {
  const localOnly = queue.queueMode === 'manual_only' && queue.rewardOrigin === 'none' && !queue.rewardId;
  const active = queue.lifecycleStatus !== 'deleting' && queue.lifecycleStatus !== 'deleted';
  const remoteReady = REMOTE_READY_STATES.has(queue.remoteSyncStatus) && Boolean(queue.rewardId);
  const transitionReady = !queue.modeTransitionStatus || queue.modeTransitionStatus === 'none';
  const canManageState = active && transitionReady && (localOnly || remoteReady);
  const canToggleIntake = canManageState;
  const archiveAction = {
    visible: active,
    enabled: queue.isArchived
      ? active && transitionReady && (localOnly || (remoteReady && !queue.isOpen))
      : canToggleIntake,
    action: queue.isArchived ? 'unarchive-queue' : 'archive-queue',
  };
  let blockedReason = null;
  if (!active) blockedReason = 'queue_not_active';
  else if (!transitionReady) blockedReason = 'queue_mode_transition_pending';
  else if (!localOnly && !remoteReady) {
    if (queue.remoteSyncStatus === 'pending_create') blockedReason = 'reward_creation_pending';
    else if (queue.remoteSyncStatus === 'create_unknown') blockedReason = 'reward_unresolved';
    else blockedReason = 'remote_operation_pending';
  }
  const canDelete = active && transitionReady && (localOnly || remoteReady);
  const deleteBlockedReason = canDelete ? null : blockedReason ?? 'remote_operation_pending';
  return {
    canToggleIntake,
    archiveAction,
    canDelete,
    deleteBlockedReason,
    resolveReward: active && queue.remoteSyncStatus === 'create_unknown',
    blockedReason,
  };
}
