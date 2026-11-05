import { getQueueLifecycleOutcome } from '../queues/queue-lifecycle.mjs';

/**
 * OPS-22 / FT-23 (#103): where the panel goes, and what it says, after creating or deleting a queue.
 * Pure routing plus the ONE navigation seam (`navigateTo`); FT-28 later swaps only the body of `navigateTo`.
 */

/** Closed list of outcome codes that may travel in the URL (AC 6). Nothing else is ever read from or rendered from the URL. */
export const OUTCOME_CODES = Object.freeze([
  'queue_created', 'queue_created_local', 'queue_created_pending', 'queue_created_review', 'queue_created_recovered',
  'queue_deleted_last_reward', 'queue_deleted_last_local', 'queue_deleted_last_converted',
]);
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CODE_MESSAGES = Object.freeze({
  queue_created: 'panel.outcome.created.channel_points',
  queue_created_local: 'panel.queue.creation_result.created_local',
  queue_created_pending: 'panel.queue.creation_result.pending',
  queue_created_review: 'panel.queue.creation_result.review',
  queue_created_recovered: 'panel.queue.creation_result.recovered',
  queue_deleted_last_reward: 'panel.outcome.deleted.reward',
  queue_deleted_last_local: 'panel.outcome.deleted.local',
  queue_deleted_last_converted: 'panel.queue.delete.done',
});

/** @param {unknown} code @returns {{key: string, element: 'status'}|null} */
export function getOutcomeFromCode(code) {
  return typeof code === 'string' && OUTCOME_CODES.includes(code) ? { key: CODE_MESSAGES[code], element: 'status' } : null;
}

/** The single navigation function (AC 7). Today a full document load, as the panel already does with plain links. */
export function navigateTo(href, win = globalThis) {
  win.location.assign(href);
}

function createCode(result) {
  const queue = result?.queue;
  if (!queue || result.uncertain === true || typeof queue.id !== 'string' || !UUID_PATTERN.test(queue.id)) return null;
  if (result.recovered === true) return 'queue_created_recovered';
  if (queue.queueMode === 'manual_only') return 'queue_created_local';
  if (['synced', 'synced_manual'].includes(queue.remoteSyncStatus)) return 'queue_created';
  if (['pending_create', 'create_pending'].includes(queue.remoteSyncStatus)) return 'queue_created_pending';
  return 'queue_created_review';
}

function queueType(queue) {
  if (queue?.queueMode === 'channel_points') return 'reward';
  return queue?.rewardId ? 'converted' : 'local';
}

/**
 * @param {{action?: string, result?: any, error?: any, feedback?: any, queue?: Record<string, any>}|null|undefined} descriptor
 * @param {Array<Record<string, any>>} [projection] the queue projection AFTER the action
 * @returns {{href: string|null, focusId: string|null, outcome: Record<string, any>}|null}
 */
export function resolvePostActionRoute(descriptor, projection = []) {
  if (!descriptor || typeof descriptor !== 'object') return null;
  if (descriptor.action === 'create') {
    const code = createCode(descriptor.result);
    if (!code) return null;
    const queueId = descriptor.result.queue.id;
    return { href: `/queues/?outcome=${code}&queue=${queueId}`, focusId: `queue-title-${queueId}`, outcome: getOutcomeFromCode(code) };
  }
  if (descriptor.action !== 'delete' && descriptor.action !== 'cancel-delete') return null;
  const outcome = getQueueLifecycleOutcome(descriptor);
  if (!outcome) return null;
  if (descriptor.action === 'delete' && descriptor.result?.status === 'deleted' && !descriptor.error && !descriptor.feedback) {
    const queue = descriptor.queue ?? {};
    const remaining = (Array.isArray(projection) ? projection : []).filter((item) => item?.id !== queue.id && item?.lifecycleStatus !== 'deleted');
    if (remaining.length === 0 && typeof queue.id === 'string' && UUID_PATTERN.test(queue.id)) {
      return { href: `/new-queue/?outcome=queue_deleted_last_${queueType(queue)}&queue=${queue.id}`, focusId: null, outcome };
    }
  }
  return { href: null, focusId: null, outcome };
}
