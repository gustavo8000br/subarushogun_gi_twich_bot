/** @typedef {{refundIfRemovedWhileCalled?: boolean, refundOnNoShow?: boolean, refundIfViewerLeavesWhileCalled?: boolean}} TransitionPolicy */
/** @typedef {{from: string, to: string, source?: string, origin?: string, reason?: string|null, policy?: TransitionPolicy}} TransitionInput */

const allowedTransitions = new Set([
  'waiting:called',
  'waiting:removed',
  'called:in_progress',
  'called:completed',
  'called:removed',
  'called:no_show',
  'in_progress:completed',
  'in_progress:removed',
]);

/** @param {TransitionInput} input */
function shouldRequestCancellation({ from, source, origin, to, policy = {} }) {
  if (source !== 'redemption' || to !== 'removed') return false;
  if (from === 'waiting') return true;
  if (from !== 'called' && from !== 'in_progress') return false;
  if (origin === 'viewer') return policy.refundIfViewerLeavesWhileCalled === true;
  return policy.refundIfRemovedWhileCalled === true;
}

/** @param {Pick<TransitionInput, 'source'|'to'>} input */
function shouldRequestFulfillment({ source, to }) {
  return source === 'redemption' && to === 'completed';
}

/** @param {Pick<TransitionInput, 'source'|'to'|'policy'>} input */
function shouldRequestNoShowCancellation({ source, to, policy = {} }) {
  return source === 'redemption' && to === 'no_show' && policy.refundOnNoShow === true;
}

/** @param {TransitionInput} input */
export function decideEntryTransition(input) {
  const { from, to, source = 'redemption', origin = 'system', reason = null, policy = {} } = input;
  const isExternalTerminalObservation = origin === 'external'
    && ['waiting', 'called', 'in_progress'].includes(from)
    && ['completed', 'removed'].includes(to);
  if (!allowedTransitions.has(`${from}:${to}`) && !isExternalTerminalObservation) {
    throw Object.assign(new Error(`Transition from ${from} to ${to} is not allowed`), {
      code: 'INVALID_ENTRY_TRANSITION',
    });
  }

  const policySnapshot = { ...policy };
  let financialDecision = 'no_operation';
  const queueRemovalOverridesRefundPolicy = source === 'redemption' && to === 'removed' && ['queue_cleared', 'queue_deleted'].includes(reason);
  if (origin !== 'external' && (queueRemovalOverridesRefundPolicy
      || shouldRequestCancellation({ from, source, origin, to, policy: policySnapshot })
      || shouldRequestNoShowCancellation({ source, to, policy: policySnapshot }))) {
    financialDecision = 'request_cancel';
  } else if (origin !== 'external' && shouldRequestFulfillment({ source, to })) {
    financialDecision = 'request_fulfill';
  }

  return {
    accepted: true,
    previousStatus: from,
    nextStatus: to,
    terminalReason: reason,
    actorOrigin: origin,
    financialDecision,
    policySnapshot,
  };
}
