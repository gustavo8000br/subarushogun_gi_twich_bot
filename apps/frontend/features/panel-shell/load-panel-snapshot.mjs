/** Load the distinct operator projection, runtime state, setup eligibility and catalog sources. */
export async function loadPanelSnapshot(request) {
  const [bundle, state, setup, queues] = await Promise.all([
    request('/api/localization/catalogs'),
    request('/api/state'),
    request('/api/setup'),
    request('/api/queues'),
  ]);
  validateQueueProjection(queues);
  return { bundle, state, setup, queues };
}

export function validateQueueProjection(queues) {
  if (!Array.isArray(queues) || queues.some((queue) => (
    !queue || typeof queue.id !== 'string' || typeof queue.slug !== 'string'
      || typeof queue.title !== 'string' || typeof queue.isOpen !== 'boolean'
      || !Array.isArray(queue.entries)
      || queue.entries.some((entry) => (
        !entry || typeof entry.id !== 'string' || typeof entry.status !== 'string'
          || (typeof entry.displayName !== 'string' && typeof entry.userLogin !== 'string')
      ))
  ))) {
    throw Object.assign(new Error('The operator queue projection is invalid.'), { code: 'INVALID_QUEUE_PROJECTION' });
  }
  return queues;
}
