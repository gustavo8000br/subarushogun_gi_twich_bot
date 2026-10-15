/** @param {Array<{entries?: Array<{status?: string}>}>} queues */
export function summarizeQueues(queues) {
  if (!Array.isArray(queues)) throw new TypeError('Queue projection must be an array.');
  let waiting = 0;
  let inService = 0;
  for (const queue of queues) {
    for (const entry of queue.entries ?? []) {
      if (entry.status === 'waiting') waiting += 1;
      if (entry.status === 'called' || entry.status === 'in_progress') inService += 1;
    }
  }
  return { queues: queues.length, waiting, inService };
}
