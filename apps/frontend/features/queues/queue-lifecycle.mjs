import { validateQueueProjection } from '../panel-shell/load-panel-snapshot.mjs';
import { getQueueActionState } from '../../../shared/panel/queue-action-state.mjs';

const LIFECYCLE_ACTIONS = new Set(['delete', 'cancel-delete', 'manual-mode', 'unarchive', 'archive-local-challenge', 'archive-local-confirm']);

/** @param {{code?:string,referenceId?:string,status?:number}|null|undefined} error @param {{action?:string}} [context] */
export function getQueueLifecycleFailureFeedback(error, { action } = {}) {
  if (action !== 'cancel-delete') return { status: 'error', key: 'panel.error.generic', uncertain: false };
  const referenceId = typeof error?.referenceId === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(error.referenceId)
    ? error.referenceId
    : null;
  const knownKeys = {
    QUEUE_DELETION_NOT_PENDING: 'panel.queue.delete.cancel.stale',
    QUEUE_DELETION_CANCELLATION_STALE: 'panel.queue.delete.cancel.stale',
    QUEUE_REWARD_OPERATION_PROCESSING: 'panel.queue.delete.cancel.processing',
    QUEUE_DELETION_CANCELLATION_UNVERIFIED: 'panel.queue.delete.cancel.unverified',
    QUEUE_NOT_FOUND: 'panel.error.queue_not_found',
  };
  const key = Object.hasOwn(knownKeys, error?.code) ? knownKeys[error?.code] : null;
  if (key) return { status: 'error', key, uncertain: false };

  const uncertain = error?.code !== 'SESSION_INITIALIZATION_FAILED'
    && (error?.status === 0 || error?.status >= 500 || error?.code === 'INVALID_QUEUE_LIFECYCLE_RESPONSE');
  return {
    status: 'error',
    key: uncertain ? 'panel.queue.delete.cancel.uncertain' : 'panel.error.generic',
    uncertain,
    ...(uncertain && referenceId ? { referenceId } : {}),
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
  if (action === 'cancel-delete') return Boolean(state.canCancelQueueDeletion);
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
