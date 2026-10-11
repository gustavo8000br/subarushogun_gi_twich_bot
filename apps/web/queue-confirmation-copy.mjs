/** @param {Record<string, any> | undefined} queue @param {'archive'|'unarchive'|'delete'} action */
export function getQueueConfirmationCopy(queue, action) {
  const localOnly = queue?.queueMode === 'manual_only'
    && queue?.rewardOrigin === 'none'
    && !queue?.rewardId;
  if (localOnly && action === 'archive') return 'panel.queue.confirm.archive_local';
  if (action === 'delete' && queue?.lifecycleStatus === 'deleting' && queue?.queueMode === 'manual_only' && queue?.rewardId && queue?.remoteSyncStatus === 'diverged') return 'panel.queue.confirm.retry_delete_converted_diverged';
  if (action === 'delete' && queue?.lifecycleStatus === 'deleting' && queue?.queueMode === 'manual_only' && queue?.rewardId && queue?.remoteSyncStatus === 'local_only') return 'panel.queue.confirm.retry_delete_converted';
  if (action === 'delete' && queue?.queueMode === 'manual_only' && queue?.rewardId && queue?.remoteSyncStatus === 'local_only') return 'panel.queue.confirm.delete_converted';
  if (localOnly && action === 'delete') return 'panel.queue.confirm.delete_local';
  if (action === 'archive' && queue?.queueMode === 'manual_only' && queue?.rewardId && queue?.remoteSyncStatus === 'local_only') return 'panel.queue.confirm.archive_converted';
  return `panel.queue.confirm.${action}`;
}
