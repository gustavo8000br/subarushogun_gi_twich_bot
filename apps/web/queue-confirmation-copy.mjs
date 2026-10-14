/** @param {Record<string, any> | undefined} queue @param {'unarchive'|'delete'|'archive-local-first'|'archive-local-final'|'archive-local-first-accept'|'archive-local-final-accept'|'archive-local-processing'|'archive-local-expired'|'archive-local-stale'|'archive-local-unavailable'} action */
export function getQueueConfirmationCopy(queue, action) {
  if (action === 'archive-local-first') return 'panel.queue.confirm.archive_local_uncertain_first';
  if (action === 'archive-local-final') return 'panel.queue.confirm.archive_local_uncertain_final';
  if (action === 'archive-local-first-accept') return 'panel.queue.action.archive_local_review';
  if (action === 'archive-local-final-accept') return 'panel.queue.action.archive_local_anyway';
  if (action === 'archive-local-processing') return 'panel.queue.archive_local.processing';
  if (action === 'archive-local-expired') return 'panel.queue.archive_local.expired';
  if (action === 'archive-local-stale') return 'panel.queue.archive_local.stale';
  if (action === 'archive-local-unavailable') return 'panel.queue.archive_local.unavailable';
  const localOnly = queue?.queueMode === 'manual_only'
    && queue?.rewardOrigin === 'none'
    && !queue?.rewardId;
  if (action === 'delete' && queue?.lifecycleStatus === 'deleting' && queue?.queueMode === 'manual_only' && queue?.rewardId && queue?.remoteSyncStatus === 'diverged') return 'panel.queue.confirm.retry_delete_converted_diverged';
  if (action === 'delete' && queue?.lifecycleStatus === 'deleting' && queue?.queueMode === 'manual_only' && queue?.rewardId && queue?.remoteSyncStatus === 'local_only') return 'panel.queue.confirm.retry_delete_converted';
  if (action === 'delete' && queue?.queueMode === 'manual_only' && queue?.rewardId && queue?.remoteSyncStatus === 'local_only') return 'panel.queue.confirm.delete_converted';
  if (localOnly && action === 'delete') return 'panel.queue.confirm.delete_local';
  return `panel.queue.confirm.${action}`;
}
