/** @param {'created'|'settings_saved'} event @param {{id?: unknown, queueMode?: string, remoteSyncStatus?: string, isOpen?: boolean}|null} queue */
export function getQueueOnboardingTransition(event, queue) {
  if (!queue || typeof queue.id !== 'string' || !queue.id || queue.isOpen === true) return null;
  if (event === 'created') {
    return { page: 'queues', dialog: 'queue-settings', focusAction: null, canActivate: false };
  }
  if (event === 'settings_saved') {
    return {
      page: 'queues', dialog: null, focusAction: 'open-queue',
      canActivate: queue.queueMode === 'manual_only' || ['synced', 'synced_manual'].includes(queue.remoteSyncStatus),
    };
  }
  return null;
}
