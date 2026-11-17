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

const REMOTE_STATUS_KEYS = Object.freeze({
  UNFULFILLED: 'panel.operation.conflict.remote.unfulfilled',
  FULFILLED: 'panel.operation.conflict.remote.fulfilled',
  CANCELED: 'panel.operation.conflict.remote.canceled',
});

/** Catalog key of the remote status a `conflict` row carries (closed set); null when absent or unknown. */
export function getConflictRemoteStatusKey(operation) {
  return operation?.status === 'conflict' && typeof operation.remoteStatus === 'string' && Object.hasOwn(REMOTE_STATUS_KEYS, operation.remoteStatus)
    ? REMOTE_STATUS_KEYS[operation.remoteStatus] : null;
}

/** Catalog key of what the app asked Twitch to do, by operation type. */
export function getConflictIntentKey(operation) {
  return operation?.type === 'redemption.fulfill' ? 'panel.operation.conflict.intent.fulfill' : 'panel.operation.conflict.intent.cancel';
}

/** Confirmation copy key of the manual resolution, specific per status. */
export function getResolveConfirmationKey(operation) {
  if (operation?.status === 'conflict' && getConflictRemoteStatusKey(operation)) return 'panel.operation.confirm.resolve_conflict';
  if (operation?.status === 'failed') return 'panel.operation.confirm.resolve_failed';
  return 'panel.operation.confirm.resolve';
}

export function getOperationIdentifier(operation) {
  return operation?.redemptionId ?? operation?.entityId ?? operation?.id ?? '';
}

export function getOperationActions(operation) {
  if (!operation || !['unknown', 'conflict', 'failed'].includes(operation.status)) return [];
  if (operation.type === 'reward.delete' || (operation.type === 'reward.set_open' && operation.requiresDeleteConfirmation === true)) return ['continue_delete'];
  return [
    // OPS-31 P0 (O-1): `conflict` and `failed` get the same audited manual exit as `unknown` (never a Twitch confirmation).
    ...(operation.type.startsWith('redemption.') ? ['resolve_unknown'] : []),
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
      || (operation.remoteStatus !== undefined && typeof operation.remoteStatus !== 'string')
      || (operation.conflictDetectedAt !== undefined && typeof operation.conflictDetectedAt !== 'string')
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
  } catch (error) {
    return { result, operations: null, refreshFailed: true, refreshReferenceId: error?.referenceId ?? null };
  }
}
