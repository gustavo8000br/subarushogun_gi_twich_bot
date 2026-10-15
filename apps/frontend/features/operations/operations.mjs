const OPERATION_STATUSES = new Set([
  'pending', 'retry', 'processing', 'unknown', 'conflict', 'failed',
  'confirmed', 'resolved_manual', 'cancelled', 'cancel_verification',
]);

const OPERATION_TYPE_KEYS = Object.freeze({
  'redemption.cancel': 'panel.operation.type.refund',
  'redemption.fulfill': 'panel.operation.type.fulfillment',
  'reward.update': 'panel.operation.type.reward_update',
  'reward.delete': 'panel.operation.type.queue_delete',
});

export function getOperationGroup(operation) {
  if (operation?.type === 'redemption.cancel') return 'points_refund';
  if (operation?.type === 'redemption.fulfill') return 'redemption_fulfillment';
  return 'twitch_sync';
}

export function getOperationTypeKey(type) {
  return OPERATION_TYPE_KEYS[type] ?? 'panel.operation.type.other';
}

export function getOperationStatusKey(status) {
  return `panel.operation.status.${OPERATION_STATUSES.has(status) ? status : 'unknown'}`;
}

export function getOperationIdentifier(operation) {
  return operation?.redemptionId ?? operation?.entityId ?? operation?.id ?? '';
}

export function getOperationActions(operation) {
  if (!operation || !['unknown', 'conflict', 'failed'].includes(operation.status)) return [];
  if (operation.type === 'reward.delete' || (operation.type === 'reward.set_open' && operation.requiresDeleteConfirmation === true)) return ['continue_delete'];
  return [
    ...(operation.status === 'unknown' && operation.type.startsWith('redemption.') ? ['resolve_unknown'] : []),
    'retry',
  ];
}

/** Validate an API operation projection before rendering any rows. */
export function validateOperationsProjection(operations) {
  if (!Array.isArray(operations) || operations.some((operation) => (
    !operation || typeof operation.id !== 'string' || typeof operation.type !== 'string'
      || typeof operation.status !== 'string' || !Number.isInteger(operation.attempts) || operation.attempts < 0
      || (operation.redemptionId !== undefined && operation.redemptionId !== null && typeof operation.redemptionId !== 'string')
      || (operation.entityId !== undefined && operation.entityId !== null && typeof operation.entityId !== 'string')
      || (operation.requiresDeleteConfirmation !== undefined && typeof operation.requiresDeleteConfirmation !== 'boolean')
  ))) {
    throw Object.assign(new TypeError('The operation projection is invalid.'), { code: 'INVALID_OPERATION_PROJECTION' });
  }
  return operations;
}

function assertActionAvailable(operation, action) {
  if (!getOperationActions(operation).includes(action)) {
    throw Object.assign(new Error('The requested operation action is unavailable.'), { code: 'INVALID_OPERATION_ACTION' });
  }
}

/** Perform an existing, confirmed operation action and preserve accepted mutations if refresh fails. */
export async function performOperationActionWithRefresh({ request, operation, action }) {
  assertActionAvailable(operation, action);

  let result;
  if (action === 'resolve_unknown') {
    result = await request(`/api/operations/${encodeURIComponent(operation.id)}/resolve-unknown`, {
      method: 'POST', body: '{}',
    });
    if (result?.status !== 'resolved_manual' || result.remoteConfirmed !== false) {
      throw Object.assign(new Error('The manual resolution result was invalid.'), { code: 'INVALID_OPERATION_RESULT' });
    }
  } else {
    result = await request(`/api/operations/${encodeURIComponent(operation.id)}/retry`, {
      method: 'POST', body: '{}',
    });
    if (result?.status !== 'pending') {
      throw Object.assign(new Error('The retry result was invalid.'), { code: 'INVALID_OPERATION_RESULT' });
    }
  }

  try {
    const operations = validateOperationsProjection(await request('/api/operations'));
    return { result, operations, refreshFailed: false };
  } catch {
    return { result, operations: null, refreshFailed: true };
  }
}
