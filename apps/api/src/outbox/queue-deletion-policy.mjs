// OPS-22 FT-26 (AC 13-16): codes and rules of the queue-deletion task shared by the reward worker and the repository.

/** Re-check interval of a deletion blocked by review or by authorization (AC 14, 16); no attempt budget. */
export const QUEUE_DELETION_BLOCKED_RECHECK_MS = 5 * 60_000;
/** Re-check interval while refunds of the deletion are still in flight (existing behavior). */
export const QUEUE_DELETION_REFUND_WAIT_MS = 30_000;

/** `lastError` of a `reward.delete` held in `retry` by financial tasks that need review (AC 14). */
export const QUEUE_DELETION_BLOCKED_BY_REVIEW = 'queue_deletion_blocked_by_review';
/** `lastError` of a `reward.delete` held in `retry` while refunds are still running. */
export const QUEUE_DELETION_WAITING_FOR_REFUNDS = 'queue_deletion_waiting_for_refunds';
/** `lastError` of a reward task held in `retry` by a 401 (existing code of the reward worker). */
export const REWARD_AUTHORIZATION_REQUIRED = 'twitch_authorization_required';

/**
 * I7 (architect-review-ft36 §1.3): only a `reward.delete` waiting in `retry` on a queue that is still `deleting` may be
 * resumed; `cancelled`, `cancel_verification` and every other status are never touched.
 * @param {{lifecycleStatus?: string}|null|undefined} queue
 * @param {{operationType?: string, status?: string}|null|undefined} task
 */
export function isResumableQueueDeletion(queue, task) {
  return queue?.lifecycleStatus === 'deleting' && task?.operationType === 'reward.delete' && task.status === 'retry';
}
