/** Load the distinct operator projection, runtime state, setup eligibility and catalog sources. */
export async function loadPanelSnapshot(request) {
  const [bundle, state, setup, queues, health] = await Promise.all([
    request('/api/localization/catalogs'),
    request('/api/state'),
    request('/api/setup'),
    request('/api/queues'),
    request('/health').catch(() => unavailableHealth()),
  ]);
  validateQueueProjection(queues);
  validateStateProjection(state);
  return { bundle, state, setup, queues, health };
}

/** Reload the operator-facing runtime data without refetching static/runtime catalogs. */
export async function loadPanelRuntimeSnapshot(request) {
  const [state, setup, queues, health] = await Promise.all([
    request('/api/state'), request('/api/setup'), request('/api/queues'),
    request('/health'),
  ]);
  validateStateProjection(state);
  validateQueueProjection(queues);
  return { state, setup, queues, health };
}

function unavailableHealth() {
  return {
    status: 'unavailable', last_reconciliation_at: null,
    dependencies: {
      database: 'unavailable', twitch_api: 'unknown', twitch_integration: 'unknown',
      twitch_api_ping_ms: null, twitch_chat: 'unknown', twitch_rewards: 'unknown',
    },
  };
}

export function validateStateProjection(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)
    || typeof state.product_version !== 'string'
    || !state.account || typeof state.account !== 'object' || typeof state.account.label !== 'string'
    || !Array.isArray(state.pending_operations)
    || (state.unresolved_operation_summary !== undefined && state.unresolved_operation_summary !== null
      && (!Number.isSafeInteger(state.unresolved_operation_summary.total) || state.unresolved_operation_summary.total < 0
        || !Number.isSafeInteger(state.unresolved_operation_summary.needsReview) || state.unresolved_operation_summary.needsReview < 0
        || state.unresolved_operation_summary.needsReview > state.unresolved_operation_summary.total))) {
    throw Object.assign(new Error('The local runtime projection is invalid.'), { code: 'INVALID_RUNTIME_PROJECTION' });
  }
  return state;
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
