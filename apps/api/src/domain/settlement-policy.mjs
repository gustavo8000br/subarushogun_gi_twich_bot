// OPS-31 P5b (FT-74b, AC 34, 35; design v2.8 3.10, 3.14 D, 3.15): the per-queue settlement policy S1..S5 and its edit rules.
// Pure: no I/O. The only reader of the stored columns is `financial-gate.mjs`; this module validates a request body, finds
// what changed and decides whether the change may be stored yet.

export const SETTLEMENT_VALUES = Object.freeze({
  onCloseSwitchOff: Object.freeze(['legacy', 'wait', 'fulfill', 'refund']),
  onDirectConclusion: Object.freeze(['wait', 'refund', 'fulfill']),
  onModeratorConclude: Object.freeze(['wait', 'refund']),
  onChatClear: Object.freeze(['wait', 'refund', 'fulfill']),
  reentryCapHold: Object.freeze(['after_n', 'at_n']),
});
export const REENTRY_CAP_RANGE = Object.freeze({ min: 1, max: 20 });
export const REENTRY_WINDOW_RANGE = Object.freeze({ min: 1, max: 72 });

/** The stored defaults of a queue that never touched the policy (also the values an equal body is compared against). */
export const POLICY_FIELDS = Object.freeze([
  'onCloseSwitchOff', 'onDirectConclusion', 'onModeratorConclude', 'onChatClear',
  'reentryRefundCap', 'reentryWindowHours', 'reentryCapHold', 'reentryCapCountsManual',
]);

/**
 * AC 35 (design 3.14 D): enforcement of the policy is a CODE constant switched in the P7 release, never a database or
 * environment setting, so nothing can enable it without the settlement service. Until then a change is refused.
 */
export const SETTLEMENT_ENFORCEMENT_ACTIVE = false;

const integerIn = (value, { min, max }) => Number.isInteger(value) && value >= min && value <= max;

/**
 * Validates a `PUT` body. A missing field means unchanged; nothing is coerced (a string is not a number or a boolean).
 * @param {unknown} input
 * @returns {{ok: true, expectedPolicyRev: number, changes: Record<string, unknown>, field?: undefined} | {ok: false, field: string}}
 */
export function parsePolicyBody(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, field: 'body' };
  const body = /** @type {Record<string, any>} */ (input);
  const allowed = new Set(['expectedPolicyRev', ...POLICY_FIELDS]);
  for (const key of Object.keys(body)) if (!allowed.has(key)) return { ok: false, field: key };
  if (!Number.isInteger(body.expectedPolicyRev) || body.expectedPolicyRev < 0) return { ok: false, field: 'expectedPolicyRev' };
  const changes = {};
  for (const field of POLICY_FIELDS) {
    if (!(field in body)) continue;
    const value = body[field];
    const valid = field === 'reentryRefundCap' ? value === null || integerIn(value, REENTRY_CAP_RANGE)
      : field === 'reentryWindowHours' ? integerIn(value, REENTRY_WINDOW_RANGE)
        : field === 'reentryCapCountsManual' ? typeof value === 'boolean'
          : SETTLEMENT_VALUES[field].includes(value);
    if (!valid) return { ok: false, field };
    changes[field] = value;
  }
  return { ok: true, expectedPolicyRev: body.expectedPolicyRev, changes };
}

/** The fields of `changes` whose value differs from the stored policy (an equal body yields `{}`). */
export function changedFields(stored, changes) {
  return Object.fromEntries(Object.entries(changes).filter(([field, value]) => stored[field] !== value));
}

/** Design 3.15 B: the budget of automatic refunds, `N` with `after_n`, `N - 1` with `at_n`; `null` when there is no cap. */
export function effectiveBudget(policy) {
  if (policy.reentryRefundCap == null) return null;
  return policy.reentryCapHold === 'at_n' ? policy.reentryRefundCap - 1 : policy.reentryRefundCap;
}

/**
 * May this (already validated, already narrowed to real changes) edit be stored? Checked inside the queue lock after the
 * revision compare. `legacy` is a one-way door (design 3.13 B.1); until P7 no value other than the stored one is accepted.
 * @returns {null | {reason: 'legacy_not_selectable' | 'policy_not_active'}}
 */
export function refusalFor(stored, changed, { enforcementActive = SETTLEMENT_ENFORCEMENT_ACTIVE } = {}) {
  if (Object.keys(changed).length === 0) return null;
  if (changed.onCloseSwitchOff === 'legacy' && stored.onCloseSwitchOff !== 'legacy') return { reason: 'legacy_not_selectable' };
  if (!enforcementActive) return { reason: 'policy_not_active' };
  return null;
}

/** The API shape of a stored policy (design 3.10 "Reading", 3.14 D, 3.15 E). Closed values and numbers only. */
export function policyDto(stored, { enforcementActive = SETTLEMENT_ENFORCEMENT_ACTIVE } = {}) {
  return {
    settlementPolicyRev: stored.rev,
    onCloseSwitchOff: stored.onCloseSwitchOff,
    onDirectConclusion: stored.onDirectConclusion,
    onModeratorConclude: stored.onModeratorConclude,
    onChatClear: stored.onChatClear,
    reentryRefundCap: stored.reentryRefundCap,
    reentryWindowHours: stored.reentryWindowHours,
    reentryCapHold: stored.reentryCapHold,
    reentryCapCountsManual: stored.reentryCapCountsManual,
    effectiveBudget: effectiveBudget(stored),
    legacySelectable: stored.onCloseSwitchOff === 'legacy',
    enforcementActive: enforcementActive === true,
  };
}
