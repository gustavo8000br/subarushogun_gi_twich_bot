function invalidResponse() {
  return Object.assign(new Error('The queue clear response is invalid.'), { code: 'INVALID_QUEUE_CLEAR_RESPONSE' });
}

/** @param {{code?:string,referenceId?:string,status?:number}|null|undefined} error @param {{phase?:'preview'|'confirm'}} [context] */
export function getQueueClearFailureFeedback(error, { phase = 'preview' } = {}) {
  const referenceId = typeof error?.referenceId === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(error.referenceId)
    ? error.referenceId
    : null;
  const uncertain = phase === 'confirm' && error?.code !== 'SESSION_INITIALIZATION_FAILED' && (
    error?.status === 0
    || error?.status >= 500
    || error?.code === 'INVALID_QUEUE_CLEAR_RESPONSE'
  );
  return {
    key: uncertain ? 'panel.queue.clear.uncertain' : 'panel.queue.clear.failed',
    ...(referenceId ? { referenceId } : {}),
  };
}

function validateCounts(result) {
  if (!result || !Number.isInteger(result.count) || result.count < 0
    || !Number.isInteger(result.refundsRequested) || result.refundsRequested < 0
    || result.refundsRequested > result.count) throw invalidResponse();
}

/** @param {{request:(path:string, options?:object)=>Promise<any>, queueId:string}} input */
export async function previewQueueClear({ request, queueId }) {
  if (typeof queueId !== 'string' || !queueId) {
    throw Object.assign(new Error('The queue clear request is invalid.'), { code: 'INVALID_QUEUE_CLEAR_REQUEST' });
  }
  const result = await request(`/api/queues/${encodeURIComponent(queueId)}/clear-preview`, { method: 'POST', body: '{}' });
  validateCounts(result);
  if (result.status === 'empty' && result.count === 0 && result.refundsRequested === 0) return { status: 'empty', count: 0, refundsRequested: 0 };
  if (result.status === 'confirmation_required' && result.count > 0
    && Number.isInteger(result.expiresInSeconds) && result.expiresInSeconds > 0 && result.expiresInSeconds <= 15) {
    return { status: result.status, count: result.count, refundsRequested: result.refundsRequested, expiresInSeconds: result.expiresInSeconds };
  }
  throw invalidResponse();
}

/** @param {{request:(path:string, options?:object)=>Promise<any>, queueId:string}} input */
export async function confirmQueueClear({ request, queueId }) {
  if (typeof queueId !== 'string' || !queueId) {
    throw Object.assign(new Error('The queue clear request is invalid.'), { code: 'INVALID_QUEUE_CLEAR_REQUEST' });
  }
  const result = await request(`/api/queues/${encodeURIComponent(queueId)}/clear-confirm`, { method: 'POST', body: '{}' });
  validateCounts(result);
  if (result.status === 'empty' && result.count === 0 && result.refundsRequested === 0) {
    return { status: 'empty', count: 0, refundsRequested: 0 };
  }
  if (result.status === 'cleared' && result.count > 0) {
    return { status: result.status, count: result.count, refundsRequested: result.refundsRequested };
  }
  if (result.status === 'confirmation_required' && result.count > 0
    && Number.isInteger(result.expiresInSeconds) && result.expiresInSeconds > 0 && result.expiresInSeconds <= 15) {
    return { status: result.status, count: result.count, refundsRequested: result.refundsRequested, expiresInSeconds: result.expiresInSeconds };
  }
  throw invalidResponse();
}
