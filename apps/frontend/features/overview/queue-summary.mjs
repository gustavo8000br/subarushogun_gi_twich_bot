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

const UNRESOLVED_OPERATION_STATUSES = new Set([
  'pending', 'retry', 'processing', 'unknown', 'conflict', 'failed', 'cancel_verification',
]);

const FUNCTIONAL_HEALTH_STATES = new Set(['connected', 'available']);
const NONFUNCTIONAL_HEALTH_STATES = new Set([
  'not_configured', 'unavailable', 'reconnect_required', 'ineligible', 'stopped', 'unsupported',
]);

/** Map runtime state to a stable, user-facing severity independent of its label. */
export function getRuntimeHealthSeverity(state) {
  if (FUNCTIONAL_HEALTH_STATES.has(state)) return 'functional';
  if (NONFUNCTIONAL_HEALTH_STATES.has(state)) return 'nonfunctional';
  return 'partial';
}

/** Count only operations that still need execution, confirmation, or review. */
export function summarizeUnresolvedOperations(operations, aggregate = null) {
  if (!Array.isArray(operations) || operations.some((operation) => (
    !operation || typeof operation.id !== 'string' || typeof operation.type !== 'string'
      || typeof operation.status !== 'string'
  ))) throw new TypeError('Operation projection must be an array of valid operation records.');

  if (aggregate && Number.isSafeInteger(aggregate.total) && aggregate.total >= 0
    && Number.isSafeInteger(aggregate.needsReview) && aggregate.needsReview >= 0
    && aggregate.needsReview <= aggregate.total) {
    return { total: aggregate.total, needsReview: aggregate.needsReview };
  }

  const unresolved = operations.filter((operation) => UNRESOLVED_OPERATION_STATUSES.has(operation.status));
  return {
    total: unresolved.length,
    needsReview: unresolved.filter((operation) => ['unknown', 'conflict', 'failed'].includes(operation.status)).length,
  };
}
/** Return a bounded health projection suitable for translated status labels. */
export function projectRuntimeHealth(health) {
  const allowed = new Set([
    'connected', 'not_configured', 'connecting', 'reconciling', 'degraded', 'retrying',
    'reconnect_required', 'ineligible', 'stopped', 'unknown', 'available', 'unsupported', 'unavailable',
  ]);
  const dependencies = health?.dependencies && typeof health.dependencies === 'object' ? health.dependencies : {};
  const state = (value) => typeof value === 'string' && allowed.has(value) ? value : 'unknown';
  const pingMs = Number.isInteger(dependencies.twitch_api_ping_ms) && dependencies.twitch_api_ping_ms >= 0
    ? dependencies.twitch_api_ping_ms : null;
  const lastReconciliationAt = typeof health?.last_reconciliation_at === 'string'
    && Number.isFinite(Date.parse(health.last_reconciliation_at)) ? health.last_reconciliation_at : null;
  return {
    bot: health?.status === 'ok' ? 'connected' : health?.status === 'unavailable' ? 'unavailable' : 'unknown',
    database: state(dependencies.database),
    twitchApi: state(dependencies.twitch_api),
    twitchIntegration: state(dependencies.twitch_integration),
    twitchChat: state(dependencies.twitch_chat),
    twitchRewards: state(dependencies.twitch_rewards),
    pingMs,
    lastReconciliationAt,
  };
}
