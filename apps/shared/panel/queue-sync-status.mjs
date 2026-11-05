const translationKeys = Object.freeze({
  local_only: 'panel.queue.sync.local',
  synced: 'panel.queue.sync.synced',
  synced_manual: 'panel.queue.sync.manual',
  pending: 'panel.queue.sync.pending',
  pending_create: 'panel.queue.sync.pending',
  pending_update: 'panel.queue.sync.pending',
  pending_open: 'panel.queue.sync.pending',
  pending_close: 'panel.queue.sync.pending',
  pending_delete: 'panel.queue.sync.pending',
  delete_pending: 'panel.queue.sync.pending',
  create_unknown: 'panel.queue.sync.unknown',
  update_unknown: 'panel.queue.sync.unknown',
  open_unknown: 'panel.queue.sync.unknown',
  close_unknown: 'panel.queue.sync.unknown',
  delete_unknown: 'panel.queue.sync.unknown',
  create_failed: 'panel.queue.sync.failed',
  update_failed: 'panel.queue.sync.failed',
  open_failed: 'panel.queue.sync.failed',
  close_failed: 'panel.queue.sync.failed',
  delete_failed: 'panel.queue.sync.failed',
  diverged: 'panel.queue.sync.diverged',
});

/** @param {string} status */
export function queueSyncTranslationKey(status) {
  return translationKeys[status] ?? 'panel.queue.sync.not_synced';
}
