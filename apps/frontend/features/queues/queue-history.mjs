const TERMINAL_STATUSES = new Set(['completed', 'removed', 'no_show']);

/** @param {unknown} value */
export function validateQueueHistory(value) {
  if (!Array.isArray(value) || value.length > 100) {
    throw Object.assign(new Error('Queue history response is invalid.'), { code: 'INVALID_QUEUE_HISTORY_RESPONSE' });
  }
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object'
      || typeof entry.id !== 'string' || !entry.id
      || typeof entry.userLogin !== 'string' || !entry.userLogin
      || (entry.displayName !== null && entry.displayName !== undefined && typeof entry.displayName !== 'string')
      || !TERMINAL_STATUSES.has(entry.status)
      || (entry.finishedAt !== null && entry.finishedAt !== undefined
        && (typeof entry.finishedAt !== 'string' || !Number.isFinite(Date.parse(entry.finishedAt))))) {
      throw Object.assign(new Error('Queue history response is invalid.'), { code: 'INVALID_QUEUE_HISTORY_RESPONSE' });
    }
    return Object.freeze({
      id: entry.id,
      userLogin: entry.userLogin,
      displayName: entry.displayName ?? null,
      status: entry.status,
      finishedAt: entry.finishedAt ?? null,
    });
  });
}

/** @param {{request:(path:string, options?:object)=>Promise<any>, queueId:string}} input */
export async function loadQueueHistory({ request, queueId }) {
  if (typeof queueId !== 'string' || !queueId) {
    throw Object.assign(new Error('Queue history request is invalid.'), { code: 'INVALID_QUEUE_HISTORY_REQUEST' });
  }
  const result = await request(`/api/queues/${encodeURIComponent(queueId)}/history`);
  return validateQueueHistory(result);
}
