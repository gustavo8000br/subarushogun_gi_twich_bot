import { loadQueueProjection } from './queue-lifecycle.mjs';

const ENTRY_ACTIONS = Object.freeze({
  attend: { to: 'in_progress', reason: 'service_started' },
  complete: { to: 'completed', reason: 'service_completed' },
  remove: { to: 'removed', reason: 'operator_removed' },
});

/** @param {{status?:number}|null|undefined} error */
export function getManualQueueEntryFailureKey(error) {
  if (error?.status === 400) return 'panel.entry.error.invalid';
  if (error?.status === 404 || error?.status === 409) return 'panel.entry.error.unavailable';
  return 'panel.entry.error.failed';
}

/** @param {{action:string, result:Record<string, any>, refreshFailed?:boolean}} input */
export function getQueueEntryActionFeedback({ action, result, refreshFailed = false }) {
  if (action === 'call-next' && result.count === 0) {
    return { status: 'info', key: 'panel.queue.action_result.no_waiting' };
  }
  if (refreshFailed) {
    return { status: 'warning', key: 'panel.queue.entry_action_result.refresh_failed' };
  }
  if (action === 'resend-call') {
    return {
      status: 'confirmed',
      key: result.status === 'already_queued' ? 'panel.notice.call_already_queued' : 'panel.notice.call_resent',
    };
  }
  if (action === 'add-manual') {
    return { status: 'confirmed', key: 'panel.entry.added' };
  }
  return { status: 'confirmed', key: 'panel.queue.entry_action_result.saved' };
}

/** Preserve an accepted mutation result when only the subsequent read projection fails. */
export async function performQueueEntryActionWithRefresh(input) {
  const result = await performQueueEntryAction(input);
  try {
    return { result, queues: await loadQueueProjection(input.request), refreshFailed: false };
  } catch {
    return { result, queues: null, refreshFailed: true };
  }
}

function invalidResponse() {
  return Object.assign(new Error('The queue entry action response is invalid.'), { code: 'INVALID_QUEUE_ENTRY_ACTION_RESPONSE' });
}

/** @param {{request: (path:string, options?:object)=>Promise<any>, queueId:string, entryId?:string|null, action:string, login?:string, uid?:string, priority?:boolean, priorityReason?:string}} input */
export async function performQueueEntryAction({ request, queueId, entryId = null, action, login, uid, priority = false, priorityReason }) {
  if (typeof queueId !== 'string' || !queueId || typeof action !== 'string') {
    throw Object.assign(new Error('The queue entry action request is invalid.'), { code: 'INVALID_QUEUE_ENTRY_ACTION_REQUEST' });
  }

  let result;
  if (action === 'call-next') {
    result = await request(`/api/queues/${encodeURIComponent(queueId)}/call`, {
      method: 'POST', body: JSON.stringify({ count: 1 }),
    });
    if (result?.status !== 'called' || !Number.isInteger(result.count) || result.count < 0 || result.count > 1) throw invalidResponse();
    return result;
  }

  if (action === 'add-manual') {
    if (typeof login !== 'string' || !/^[a-zA-Z0-9_]{1,25}$/.test(login)
      || (uid !== undefined && uid !== '' && (typeof uid !== 'string' || !/^\d{9}$/.test(uid)))
      || typeof priority !== 'boolean'
      || (priority && !['subscription', 'bits', 'external_payment', 'operator_override'].includes(priorityReason))) {
      throw Object.assign(new Error('The manual queue entry request is invalid.'), { code: 'INVALID_QUEUE_ENTRY_ACTION_REQUEST' });
    }
    const body = { login, ...(uid ? { uid } : {}), priority, ...(priority ? { priorityReason } : {}) };
    result = await request(`/api/queues/${encodeURIComponent(queueId)}/manual-entries`, {
      method: 'POST', body: JSON.stringify(body),
    });
    if (typeof result?.id !== 'string' || !result.id || result.status !== 'waiting' || !Number.isInteger(result.position) || result.position < 1) throw invalidResponse();
    return result;
  }

  if (typeof entryId !== 'string' || !entryId) {
    throw Object.assign(new Error('An entry is required for this queue action.'), { code: 'INVALID_QUEUE_ENTRY_ACTION_REQUEST' });
  }
  const encodedEntryId = encodeURIComponent(entryId);

  if (action === 'call') {
    result = await request(`/api/queues/${encodeURIComponent(queueId)}/call`, {
      method: 'POST', body: JSON.stringify({ count: 1, entryId }),
    });
    if (result?.status !== 'called' || result.id !== entryId) throw invalidResponse();
    return result;
  }

  if (action === 'resend-call') {
    result = await request(`/api/entries/${encodedEntryId}/call-notification/resend`, { method: 'POST' });
    if (!['queued', 'already_queued'].includes(result?.status) || result.entryId !== entryId) throw invalidResponse();
    return result;
  }

  const transition = ENTRY_ACTIONS[action];
  if (!transition) throw Object.assign(new Error('The queue entry action is unsupported.'), { code: 'INVALID_QUEUE_ENTRY_ACTION_REQUEST' });
  result = await request(`/api/entries/${encodedEntryId}/transitions`, {
    method: 'POST', body: JSON.stringify(transition),
  });
  if (result?.status !== transition.to || result.id !== entryId) throw invalidResponse();
  return result;
}
