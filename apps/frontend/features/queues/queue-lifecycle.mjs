import { validateQueueProjection } from '../panel-shell/load-panel-snapshot.mjs';
import { getQueueActionState } from '../../../shared/panel/queue-action-state.mjs';

const LIFECYCLE_ACTIONS = new Set(['delete', 'cancel-delete', 'manual-mode', 'unarchive', 'archive-local-challenge', 'archive-local-confirm']);

const SAFE_REFERENCE = /^[A-Za-z0-9_.-]{1,64}$/;
const safeReference = (value) => (typeof value === 'string' && SAFE_REFERENCE.test(value) ? value : null);

/** @param {{code?:string,referenceId?:string,status?:number}|null|undefined} error @param {{action?:string}} [context] */
export function getQueueLifecycleFailureFeedback(error, { action } = {}) {
  const referenceId = safeReference(error?.referenceId);
  const uncertain = error?.code !== 'SESSION_INITIALIZATION_FAILED'
    && (error?.status === 0 || error?.status >= 500 || error?.code === 'INVALID_QUEUE_LIFECYCLE_RESPONSE');
  if (action === 'delete') {
    return {
      status: 'error',
      key: uncertain ? 'panel.queue.action_result.uncertain' : 'panel.error.generic',
      uncertain,
      ...(uncertain && referenceId ? { referenceId } : {}),
    };
  }
  if (action !== 'cancel-delete') return { status: 'error', key: 'panel.error.generic', uncertain: false };
  // FT-36 contract: every refusal is a 409 with an enumerated `code`; the panel maps by code and never renders the API text.
  const knownKeys = {
    QUEUE_DELETION_ALREADY_COMPLETED: 'panel.queue.delete.cancel.already_deleted',
    QUEUE_DELETION_PAUSE_IN_PROGRESS: 'panel.queue.delete.cancel.pause_in_progress',
    QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED: 'panel.queue.delete.cancel.remote_delete_attempted',
    QUEUE_DELETION_NOT_PENDING: 'panel.queue.delete.cancel.stale',
    QUEUE_DELETION_CANCELLATION_STALE: 'panel.queue.delete.cancel.stale',
    QUEUE_REWARD_OPERATION_PROCESSING: 'panel.queue.delete.cancel.processing',
    QUEUE_DELETION_CANCELLATION_UNVERIFIED: 'panel.queue.delete.cancel.unverified',
    QUEUE_NOT_FOUND: 'panel.error.queue_not_found',
  };
  const key = Object.hasOwn(knownKeys, error?.code) ? knownKeys[error?.code] : null;
  if (key) return { status: 'error', key, uncertain: false };

  return {
    status: 'error',
    key: uncertain ? 'panel.queue.delete.cancel.uncertain' : 'panel.error.generic',
    uncertain,
    ...(uncertain && referenceId ? { referenceId } : {}),
  };
}

/** The region action each refusal text asks for (UX plan 3.4): refresh, review the operations, or reconnect. */
const OUTCOME_ACTIONS = Object.freeze({
  'panel.queue.delete.cancel.already_deleted': 'refresh',
  'panel.queue.delete.cancel.processing': 'refresh',
  'panel.queue.delete.cancel.stale': 'refresh',
  'panel.queue.delete.cancel.uncertain': 'refresh',
  'panel.error.queue_not_found': 'refresh',
  'panel.queue.action_result.uncertain': 'refresh',
  'panel.queue.delete.cancel.reward_absent': 'operations',
  'panel.queue.delete.cancel.reward_diverged': 'operations',
  'panel.queue.delete.cancel.reward_not_paused': 'operations',
  'panel.queue.delete.cancel.remote_delete_attempted': 'operations',
  'panel.queue.delete.cancel.authorization_required': 'connection',
});
const CANCEL_REASON_KEYS = Object.freeze({
  queue_delete_reward_absent: 'panel.queue.delete.cancel.reward_absent',
  queue_delete_reward_diverged: 'panel.queue.delete.cancel.reward_diverged',
  queue_delete_cancel_reward_not_paused: 'panel.queue.delete.cancel.reward_not_paused',
  authorization_required: 'panel.queue.delete.cancel.authorization_required',
});

function queueDeleteType(queue) {
  if (queue?.queueMode === 'channel_points') return 'reward';
  return queue?.rewardId ? 'converted' : 'local';
}

/** @param {string} key @param {string|null} [referenceId] @returns {{key: string, element: 'alert', action?: string, referenceId?: string}} */
function refusal(key, referenceId) {
  const action = OUTCOME_ACTIONS[key];
  return { key, element: /** @type {'alert'} */ ('alert'), ...(action ? { action } : {}), ...(referenceId ? { referenceId } : {}) };
}

/**
 * FT-23: what the persistent outcome region shows after a delete or a cancel-deletion. Pure; never renders API free text.
 * `element` is where the text is written: `status` when the requested change happened (or is pending), `alert` when it did not.
 * @param {{action?: string, result?: any, error?: any, feedback?: any, queue?: Record<string, any>}} input
 * @returns {{key: string, element: 'status'|'alert', action?: string, count?: number, referenceId?: string}|null}
 */
export function getQueueLifecycleOutcome({ action, result, error, feedback, queue } = {}) {
  if (action !== 'delete' && action !== 'cancel-delete') return null;
  if (error || feedback) {
    const failure = feedback?.key ? feedback : getQueueLifecycleFailureFeedback(error, { action });
    return refusal(failure.key, safeReference(failure.referenceId));
  }
  if (action === 'delete') {
    const type = queueDeleteType(queue);
    if (result?.status === 'deleted') {
      return { key: type === 'reward' ? 'panel.outcome.deleted.reward' : type === 'local' ? 'panel.outcome.deleted.local' : 'panel.queue.delete.done', element: /** @type {'status'} */ ('status') };
    }
    if (result?.status === 'pending') {
      if (result.deletionState === 'blocked') {
        const count = result.queue?.blockingOperations ?? result.blockingOperations;
        return Number.isSafeInteger(count) && count > 0
          ? { key: 'panel.queue.deletion.blocked', count, element: 'alert', action: 'operations' }
          : { key: 'panel.queue.deletion.blocked.generic', element: 'alert', action: 'operations' };
      }
      return { key: type === 'reward' ? 'panel.outcome.delete_pending.reward' : 'panel.queue.delete.pending', element: 'status', action: 'refresh' };
    }
    return null;
  }
  if (result?.status === 'cancelled') return { key: 'panel.queue.delete.cancelled', element: 'status' };
  // A 200 `already_deleted` is dead per the architect (R6): that answer is a 409 with a code. Any other 200 means "not cancelled".
  const reason = result?.status === 'not_cancelled' && typeof result.reason === 'string' ? result.reason : null;
  return refusal(reason && Object.hasOwn(CANCEL_REASON_KEYS, reason) ? CANCEL_REASON_KEYS[reason] : 'panel.queue.delete.cancel.unverified');
}

/**
 * R2 / FT-36: the Cancel deletion button and its checking state come from the SERVER projection (`canCancelDeletion`,
 * `cancellationInProgress`, `deletionState`, `blockingOperations`), never from the `remoteSyncStatus` heuristic.
 * @param {Record<string, any>} queue
 */
export function getQueueDeletionView(queue) {
  const deleting = queue?.lifecycleStatus === 'deleting';
  const blocked = deleting && queue.deletionState === 'blocked';
  return {
    canCancel: deleting && queue.canCancelDeletion === true,
    cancelling: deleting && queue.cancellationInProgress === true,
    blocked,
    blockedCount: blocked && Number.isSafeInteger(queue.blockingOperations) && queue.blockingOperations > 0 ? queue.blockingOperations : 0,
  };
}

/** @param {{request:(path:string, options?:object)=>Promise<any>, queueId:string, action:string, queue?:Record<string, any>, challenge?:Record<string, any>}} input */
export async function performQueueLifecycleAction({ request, queueId, action, queue, challenge }) {
  if (typeof queueId !== 'string' || !queueId || !LIFECYCLE_ACTIONS.has(action)) {
    throw Object.assign(new Error('The queue lifecycle request is invalid.'), { code: 'INVALID_QUEUE_LIFECYCLE_REQUEST' });
  }
  if (action === 'archive-local-challenge') {
    if (!Number.isInteger(queue?.version) || queue.version < 1) throw Object.assign(new Error('The local archive request is invalid.'), { code: 'INVALID_QUEUE_LIFECYCLE_REQUEST' });
    const result = await request(`/api/queues/${encodeURIComponent(queueId)}/archive-local/challenge`, {
      method: 'POST', body: JSON.stringify({ expectedVersion: queue.version }),
    });
    const expiresAt = Date.parse(result?.expiresAt);
    if (result?.status !== 'challenge_issued' || typeof result.challengeId !== 'string'
      || !Number.isInteger(result.expectedVersion) || result.expectedVersion !== queue.version
      || typeof result.remoteSyncStatus !== 'string' || !Number.isFinite(expiresAt)
      || expiresAt <= Date.now() || expiresAt > Date.now() + 305_000) {
      throw Object.assign(new Error('The local archive challenge response is invalid.'), { code: 'INVALID_QUEUE_LIFECYCLE_RESPONSE' });
    }
    return { status: result.status, challengeId: result.challengeId, expectedVersion: result.expectedVersion, remoteSyncStatus: result.remoteSyncStatus, expiresAt: result.expiresAt };
  }
  if (action === 'archive-local-confirm') {
    const expiresAt = Date.parse(challenge?.expiresAt);
    if (typeof challenge?.challengeId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(challenge.challengeId)
      || !Number.isInteger(challenge.expectedVersion) || typeof challenge.remoteSyncStatus !== 'string'
      || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw Object.assign(new Error('The local archive confirmation is invalid or expired.'), { code: 'INVALID_QUEUE_LIFECYCLE_REQUEST' });
    }
    const result = await request(`/api/queues/${encodeURIComponent(queueId)}/archive-local/confirm`, {
      method: 'POST', body: JSON.stringify({ challengeId: challenge.challengeId, expectedVersion: challenge.expectedVersion, remoteSyncStatus: challenge.remoteSyncStatus }),
    });
    if (result?.status !== 'archived') throw Object.assign(new Error('The local archive response is invalid.'), { code: 'INVALID_QUEUE_LIFECYCLE_RESPONSE' });
    return result;
  }
  const route = action === 'delete' ? `/api/queues/${encodeURIComponent(queueId)}/delete`
    : action === 'cancel-delete' ? `/api/queues/${encodeURIComponent(queueId)}/delete/cancel`
      : action === 'manual-mode' ? `/api/queues/${encodeURIComponent(queueId)}/manual-mode`
        : `/api/queues/${encodeURIComponent(queueId)}/unarchive`;
  const body = action === 'delete' || action === 'cancel-delete' ? { confirm: true } : {};
  const result = await request(route, { method: 'POST', body: JSON.stringify(body) });
  const valid = action === 'delete'
    ? ['pending', 'deleted'].includes(result?.status)
    : action === 'cancel-delete'
      ? ['cancelled', 'already_deleted', 'not_cancelled'].includes(result?.status)
      : action === 'manual-mode'
        ? ['pending', 'confirmed'].includes(result?.status)
        : ['unarchived'].includes(result?.status);
  if (!valid) throw Object.assign(new Error('The queue lifecycle response is invalid.'), { code: 'INVALID_QUEUE_LIFECYCLE_RESPONSE' });
  return result;
}

/** @param {Record<string, any>} queue @param {string} action */
export function isQueueLifecycleActionAvailable(queue, action) {
  const state = getQueueActionState(queue);
  if (action === 'delete') return state.canDelete || state.canRetryLocalDeletion;
  if (action === 'cancel-delete') return getQueueDeletionView(queue).canCancel;
  if (action === 'unarchive') return Boolean(state.canShowToViewers);
  if (action === 'manual-mode') return queue.queueMode !== 'manual_only' && Boolean(queue.rewardId)
    && queue.modeTransitionStatus === 'none' && ['synced', 'synced_manual'].includes(queue.remoteSyncStatus);
  if (action === 'archive-local') return Boolean(state.canDeleteFromPanelAnyway);
  return false;
}

/** @param {{request: (path:string, options?:object)=>Promise<any>, queueId:string, isOpen:boolean}} input */
export async function requestQueueOpenState({ request, queueId, isOpen }) {
  if (typeof queueId !== 'string' || !queueId || typeof isOpen !== 'boolean') {
    throw Object.assign(new Error('The queue open state request is invalid.'), { code: 'INVALID_QUEUE_OPEN_STATE_REQUEST' });
  }
  const result = await request(`/api/queues/${encodeURIComponent(queueId)}/open-state`, {
    method: 'POST',
    body: JSON.stringify({ isOpen }),
  });
  if (!result || !['confirmed', 'pending'].includes(result.status) || result.isOpen !== isOpen || typeof result.remoteSyncStatus !== 'string') {
    throw Object.assign(new Error('The queue open state response is invalid.'), { code: 'INVALID_QUEUE_OPEN_STATE_RESPONSE' });
  }
  return result;
}

/** @param {(path:string)=>Promise<any>} request */
export async function loadQueueProjection(request) {
  return validateQueueProjection(await request('/api/queues'));
}
