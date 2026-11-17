/** @typedef {{refundIfRemovedWhileCalled?: boolean, refundOnNoShow?: boolean, refundIfViewerLeavesWhileCalled?: boolean}} TransitionPolicy */
/** @typedef {{from: string, to: string, source?: string, origin?: string, trigger?: string, reason?: string|null, policy?: TransitionPolicy}} TransitionInput */

// OPS-31 P1 (G-14): what caused a transition is a typed `trigger`, never a free `reason`. `reason` stays an audit label.
// Only the clear and delete code paths of the repository pass `queue_cleared` / `queue_deleted`; the single-entry entry
// points refuse them (`isSingleEntryTrigger`).
export const ENTRY_TRIGGERS = Object.freeze(['panel_action', 'queue_cleared', 'queue_deleted', 'timer', 'viewer', 'moderator_chat', 'external']);
export const BATCH_TRIGGERS = Object.freeze(['queue_cleared', 'queue_deleted']);
const TRIGGER_BY_ORIGIN = Object.freeze({ panel: 'panel_action', chat: 'moderator_chat', moderator: 'moderator_chat', viewer: 'viewer', timer: 'timer', external: 'external', system: 'panel_action' });

/** @param {unknown} trigger */
export function isSingleEntryTrigger(trigger) {
  return ENTRY_TRIGGERS.includes(/** @type {string} */ (trigger)) && !BATCH_TRIGGERS.includes(/** @type {string} */ (trigger));
}

/** @param {string|undefined} origin */
export function triggerForOrigin(origin) {
  return TRIGGER_BY_ORIGIN[/** @type {keyof typeof TRIGGER_BY_ORIGIN} */ (origin ?? 'system')] ?? 'panel_action';
}

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

/** @param {Pick<TransitionInput, 'from'|'source'|'to'>} input */
function shouldRequestFulfillment({ from, source, to }) {
  return source === 'redemption' && (to === 'completed' || (from === 'called' && to === 'in_progress'));
}

/** @param {Pick<TransitionInput, 'source'|'to'|'policy'>} input */
function shouldRequestNoShowCancellation({ source, to, policy = {} }) {
  return source === 'redemption' && to === 'no_show' && policy.refundOnNoShow === true;
}

/** @param {TransitionInput} input */
export function decideEntryTransition(input) {
  const { from, to, source = 'redemption', origin = 'system', reason = null, policy = {} } = input;
  const trigger = input.trigger ?? triggerForOrigin(origin);
  if (!ENTRY_TRIGGERS.includes(trigger)) {
    throw Object.assign(new Error('Transition trigger is not known'), { code: 'INVALID_ENTRY_TRIGGER' });
  }
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
  const queueRemovalOverridesRefundPolicy = source === 'redemption' && to === 'removed' && BATCH_TRIGGERS.includes(trigger);
  if (origin !== 'external' && (queueRemovalOverridesRefundPolicy
      || shouldRequestCancellation({ from, source, origin, to, policy: policySnapshot })
      || shouldRequestNoShowCancellation({ source, to, policy: policySnapshot }))) {
    financialDecision = 'request_cancel';
  } else if (origin !== 'external' && shouldRequestFulfillment({ from, source, to })) {
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
