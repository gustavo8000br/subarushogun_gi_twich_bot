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
const UNCONFIRMED_REWARD_STATUSES = new Set(['unknown', 'failed', 'conflict']);

// OPS-22 FT-36 (#100, architect-review-ft36 §1.2, D-36-5): ONE predicate for the cancel begin and the server projection
// (F17), so the panel button can never disagree with the server. Pure: no remote read, no clock, no I/O.
/** Refusal codes of the cancel begin; each is a 409 with this `code` (no audit row: nothing changed). */
export const QUEUE_DELETION_CANCEL_REFUSALS = Object.freeze([
  'QUEUE_DELETION_ALREADY_COMPLETED', 'QUEUE_DELETION_NOT_PENDING', 'QUEUE_REWARD_OPERATION_PROCESSING', 'QUEUE_DELETION_PAUSE_IN_PROGRESS',
]);
/** `reward.delete` statuses that a cancel may take ("deletion pending or blocked"). */
export const CANCELLABLE_DELETE_STATUSES = Object.freeze(['pending', 'retry', 'unknown', 'failed', 'conflict']);
/** Pause-task statuses of a BLOCKED pause stage (F19); `pending`/`retry` is a pause still in progress. */
export const CANCELLABLE_PAUSE_STATUSES = Object.freeze(['unknown', 'failed']);
const PAUSE_IN_PROGRESS_STATUSES = new Set(['pending', 'retry']);
const LEGACY_CANCEL_REASON_ALIASES = Object.freeze({ queue_deletion_cancel_verification_failed: 'queue_deletion_cancel_verification_unavailable' });

/** @param {{operationType?: string, payload?: any}|null|undefined} task */
function isDeletionPauseTask(task) {
  return task?.operationType === 'reward.set_open' && task.payload?.deleteAfterConfirm === true;
}

/** @param {{status?: string, lastError?: string|null}} task */
function cancelTargetBlockReason(task) {
  if (task.lastError === 'twitch_authorization_required') return 'authorization_required';
  if (task.lastError === 'queue_deletion_blocked_by_review') return 'financial_review_required';
  return UNCONFIRMED_REWARD_STATUSES.has(task.status) ? 'reward_operation_unconfirmed' : null;
}

/**
 * Decides what "cancel deletion" may do with the queue's `reward.*` tasks. A `cancelled` `reward.delete` of an earlier
 * cycle and a `confirmed`/`cancelled` pause are history, not the live deletion.
 * @param {{lifecycleStatus?: string, queueMode?: string, rewardId?: string|null}|null|undefined} queue
 * @param {Array<{id?: string, operationType?: string, status?: string, lastError?: string|null, payload?: any}>|null|undefined} rewardTasks
 * @returns {{outcome: 'refused', code: string, target: null} | {outcome: 'resume'|'begin', target: Record<string, any>, deletionState: 'pending'|'blocked', blockReason: string|null}}
 */
export function decideQueueDeletionCancellation(queue, rewardTasks) {
  const refuse = (code) => ({ outcome: /** @type {'refused'} */ ('refused'), code, target: null });
  if (queue?.lifecycleStatus === 'deleted') return refuse('QUEUE_DELETION_ALREADY_COMPLETED');
  if (queue?.lifecycleStatus !== 'deleting' || queue.queueMode !== 'channel_points' || !queue.rewardId) return refuse('QUEUE_DELETION_NOT_PENDING');
  const tasks = Array.isArray(rewardTasks) ? rewardTasks.filter((task) => task && typeof task === 'object') : [];
  if (tasks.some(({ status }) => status === 'processing')) return refuse('QUEUE_REWARD_OPERATION_PROCESSING');
  const deletion = tasks.find(({ operationType, status }) => operationType === 'reward.delete' && status !== 'cancelled');
  if (deletion?.status === 'confirmed') return refuse('QUEUE_DELETION_ALREADY_COMPLETED');
  const pause = deletion ? null : tasks.find((task) => isDeletionPauseTask(task) && !['confirmed', 'cancelled'].includes(task.status ?? ''));
  const target = deletion ?? pause;
  if (!target) return refuse('QUEUE_DELETION_NOT_PENDING');
  if (target === pause && PAUSE_IN_PROGRESS_STATUSES.has(pause.status ?? '')) return refuse('QUEUE_DELETION_PAUSE_IN_PROGRESS');
  const accepted = target === deletion ? CANCELLABLE_DELETE_STATUSES : CANCELLABLE_PAUSE_STATUSES;
  if (target.status !== 'cancel_verification' && !accepted.includes(target.status ?? '')) return refuse('QUEUE_DELETION_NOT_PENDING');
  const blockReason = target === pause ? 'reward_operation_unconfirmed' : cancelTargetBlockReason(target);
  return {
    outcome: target.status === 'cancel_verification' ? 'resume' : 'begin',
    target, deletionState: blockReason ? 'blocked' : 'pending', blockReason,
  };
}

/** Read alias (data-engineer (c)): legacy rows carry `..._failed`; the API answers with `..._unavailable`. */
export function normalizeDeletionCancelReason(reason) {
  return typeof reason === 'string' && Object.hasOwn(LEGACY_CANCEL_REASON_ALIASES, reason) ? LEGACY_CANCEL_REASON_ALIASES[reason] : reason;
}

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
  // FT-36 (F17, F19): the same decision as the cancel begin, rebuilt from the durable facts.
  const cancellation = decideQueueDeletionCancellation(queue, [
    ...(rewardDelete ? [{ operationType: 'reward.delete', status: rewardDelete.status, lastError: rewardDelete.lastError ?? null }] : []),
    ...(rewardPause ? [{ operationType: 'reward.set_open', status: rewardPause.status, lastError: rewardPause.lastError ?? null, payload: { deleteAfterConfirm: true } }] : []),
    ...(known.rewardTaskProcessing === true ? [{ operationType: 'reward.task', status: 'processing' }] : []),
  ]);
  return {
    deletionState: blockReason ? 'blocked' : 'pending',
    blockReason,
    blockingOperations,
    canCancelDeletion: cancellation.outcome !== 'refused',
    cancellationInProgress: cancellation.outcome === 'resume',
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
