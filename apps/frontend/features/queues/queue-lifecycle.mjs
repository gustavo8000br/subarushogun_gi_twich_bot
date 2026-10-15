import { validateQueueProjection } from '../panel-shell/load-panel-snapshot.mjs';

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
