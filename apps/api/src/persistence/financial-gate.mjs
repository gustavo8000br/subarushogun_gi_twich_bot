// OPS-31 P1: the single financial gate (design v2, section 4).
//
// This module is the ONLY place that may create a financial outbox row (`redemption.cancel` / `redemption.fulfill`),
// build its idempotency key, or write `redemptions.expected_status`. An OpenGrep rule (`financial-intent-single-writer`
// in `.opengrep/rules.yml`) keeps it that way. It also owns the settlement policy loader, the pure action resolver and the
// cap-window port, so no other module reads the policy columns (P5b adds `loadStoredSettlementPolicy`, the reader of the policy API).
//
// P1 changed NO behavior for today's data: the policy provider is a constant (`legacy` S1, `wait` for the rest) and the cap
// window is the constant fallback. Since P5 (M2a) the gate reads `settlement_state` under the row lock and writes
// `intent_recorded` in the same statement as `expected_status`; the held states exist in the database but nothing writes
// them before P7. The decision functions already have their final shape; later packages only swap the providers.

import { SETTLEMENT_VALUES } from '../domain/settlement-policy.mjs';

/** @typedef {'cancel' | 'fulfill'} FinancialOperation */
/** @typedef {'created' | 'already_same' | 'contradictory' | 'held_blocked'} FinancialIntentStatus */

const OPERATION_TYPES = Object.freeze({ cancel: 'redemption.cancel', fulfill: 'redemption.fulfill' });
const EXPECTED_STATUSES = Object.freeze({ cancel: 'CANCELED', fulfill: 'FULFILLED' });
const OPERATION_BY_TYPE = Object.freeze({ 'redemption.cancel': 'cancel', 'redemption.fulfill': 'fulfill' });
const TERMINAL_REMOTE_FOR = Object.freeze({ cancel: 'CANCELED', fulfill: 'FULFILLED' });
const PERSON_ORIGINS = new Set(['panel', 'chat', 'moderator', 'viewer']);

/** Settlement states in which no financial row may be written by an ordinary caller (design 3.2). */
export const HELD_SETTLEMENT_STATES = Object.freeze(['held_for_service', 'awaiting_choice', 'check_group']);
/** States that already carry the terminal decision; nothing more may be written (design 3.2, rule 1). */
export const ABSORBING_SETTLEMENT_STATES = Object.freeze(['intent_recorded', 'settled_external']);
/** Causes only the settlement service may pass (P7 extends this list together with its callers). */
export const SETTLEMENT_CAUSES = Object.freeze(['group_refund_on_end', 'streamer_choice', 'streamer_bulk', 'policy_refund', 'policy_fulfill']);

const heldStates = new Set(HELD_SETTLEMENT_STATES);
const absorbingStates = new Set(ABSORBING_SETTLEMENT_STATES);
const settlementCauses = new Set(SETTLEMENT_CAUSES);

/** The idempotency key of the single financial task of a redemption. Nobody else builds it. */
export function financialIdempotencyKey(redemptionId) {
  return `financial:${redemptionId}`;
}

/** Read-only lookup of the single financial task of a redemption (any status). */
export function findFinancialTask(tx, redemptionId) {
  return tx.outbox.findUnique({ where: { idempotencyKey: financialIdempotencyKey(redemptionId) } });
}

function gateError(code, message) {
  return Object.assign(new Error(message), { code });
}

/**
 * Pure decision of the gate. No I/O; the transaction wrapper feeds it the locked row.
 * @param {{operation: FinancialOperation, cause: string, settlementState?: string, allowFrom?: string[], remoteStatus: string, existingOperation?: FinancialOperation|null}} input
 * @returns {{status: FinancialIntentStatus, reason: string|null}}
 */
export function decideFinancialIntent({ operation, cause, settlementState = 'none', allowFrom = [], remoteStatus, existingOperation = null }) {
  if (!OPERATION_TYPES[operation]) throw gateError('FINANCIAL_OPERATION_INVALID', 'Financial operation is invalid');
  if (heldStates.has(settlementState)) {
    const allowed = settlementCauses.has(cause) && allowFrom.includes(settlementState);
    if (!allowed) return { status: 'held_blocked', reason: settlementState };
  }
  if (absorbingStates.has(settlementState)) {
    return { status: existingOperation === operation ? 'already_same' : 'contradictory', reason: settlementState };
  }
  if (existingOperation) {
    return existingOperation === operation
      ? { status: 'already_same', reason: 'task_exists' }
      : { status: 'contradictory', reason: 'task_exists_other_operation' };
  }
  if (remoteStatus !== 'UNFULFILLED') {
    return remoteStatus === TERMINAL_REMOTE_FOR[operation]
      ? { status: 'already_same', reason: 'remote_terminal_same' }
      : { status: 'contradictory', reason: 'remote_terminal_other' };
  }
  return { status: 'created', reason: null };
}

/**
 * Records the single financial intent of a redemption. The caller holds the queue advisory lock (or, for a redemption it
 * has just created, no lock is needed). Never throws on a duplicate: the `UNIQUE` key is the last line of defence and the
 * loser of a race gets `already_same`.
 * `redemptionPatch` adds fields to the same `redemptions` update (for example `rejectionReason`); `reassertExisting`
 * re-applies the pending expectation when the same operation already exists (the deletion re-list does this).
 * @param {any} tx
 * @param {{redemptionId: string, operation: FinancialOperation, cause: string, entryId?: string|null, origin?: string, actorId?: string|null, allowFrom?: string[], redemptionPatch?: Record<string, unknown>, reassertExisting?: boolean}} input
 * @returns {Promise<{status: FinancialIntentStatus, reason: string|null}>}
 */
export async function recordFinancialIntent(tx, { redemptionId, operation, cause, entryId = null, origin = 'system', actorId = null, allowFrom = [], redemptionPatch = {}, reassertExisting = false }) {
  if (typeof cause !== 'string' || !cause) throw gateError('FINANCIAL_CAUSE_REQUIRED', 'Financial cause is required');
  const rows = await tx.$queryRaw`SELECT remote_status, settlement_state FROM redemptions WHERE redemption_id = ${redemptionId} FOR UPDATE`;
  if (!rows.length) throw gateError('REDEMPTION_NOT_FOUND', 'Redemption was not found');
  const remoteStatus = String(rows[0].remote_status);
  const settlementState = String(rows[0].settlement_state);
  const existing = await findFinancialTask(tx, redemptionId);
  const existingOperation = existing ? OPERATION_BY_TYPE[existing.operationType] ?? null : null;
  const decision = decideFinancialIntent({ operation, cause, settlementState, allowFrom, remoteStatus, existingOperation });
  // The intent and its settlement state are one statement. A row that leaves `awaiting_choice` also loses its cause (the
  // cause `CHECK` ties it to that state); rows that existed before M2a (`none` with an expectation) become `intent_recorded`.
  const intentData = (op) => ({ ...redemptionPatch, expectedStatus: EXPECTED_STATUSES[op], syncStatus: 'pending', settlementState: 'intent_recorded', settlementCause: null });

  if (decision.status === 'created') {
    const inserted = await tx.outbox.createMany({
      data: [{
        operationType: OPERATION_TYPES[operation],
        entityType: 'redemption',
        entityId: redemptionId,
        idempotencyKey: financialIdempotencyKey(redemptionId),
        payload: {},
        entryId,
        redemptionId,
      }],
      skipDuplicates: true,
    });
    if (inserted.count !== 1) return { status: 'already_same', reason: 'duplicate_key' };
    await tx.redemption.update({
      where: { redemptionId },
      data: intentData(operation),
    });
    return decision;
  }
  if (decision.status === 'already_same' && reassertExisting && existingOperation === operation) {
    await tx.redemption.update({
      where: { redemptionId },
      data: intentData(operation),
    });
  }
  if (decision.status === 'contradictory' && PERSON_ORIGINS.has(origin)) {
    const queueRow = await tx.redemption.findUnique({ where: { redemptionId }, select: { queueId: true } });
    await tx.auditLog.create({ data: {
      queueId: queueRow?.queueId ?? null,
      entryId,
      redemptionId,
      event: 'redemption.financial_intent_contradictory',
      actorId,
      origin,
      reason: 'contradictory_intent',
      safeDetail: { operation, cause, detail: decision.reason },
    } });
  }
  return decision;
}

// ---------------------------------------------------------------------------------------------------------------------
// Settlement policy (design 3.10): provider, pure resolver, cap window port.
// ---------------------------------------------------------------------------------------------------------------------

export { SETTLEMENT_VALUES };

const CONSTANT_POLICY = Object.freeze({
  rev: 0,
  source: 'constant',
  onCloseSwitchOff: 'legacy',
  onDirectConclusion: 'wait',
  onModeratorConclude: 'wait',
  onChatClear: 'wait',
  reentryRefundCap: null,
  reentryWindowHours: 12,
  reentryCapHold: 'after_n',
  reentryCapCountsManual: true,
});

/**
 * The only reader of the policy columns. Call it AFTER the queue advisory lock. P1 provider: a constant object, so the
 * gate already has its final shape and P5b/P7 only swap this function body.
 * @returns {Promise<Readonly<typeof CONSTANT_POLICY>>}
 */
export async function loadSettlementPolicy(_tx, _queueId) {
  return CONSTANT_POLICY;
}

/**
 * P5b (FT-74b): reads the STORED policy columns of one queue (the only reader besides the decision loader above; the
 * policy API goes through here). Call it inside the queue advisory lock when the result feeds a write. It is not yet the
 * decision provider: `loadSettlementPolicy` stays the constant object until P7 turns enforcement on, so a stored value can
 * never change what a closing does before the settlement service exists.
 * @param {Record<string, any>} tx a Prisma client or interactive transaction
 * @returns {Promise<Readonly<{rev: number, source: 'stored'}> & Record<string, unknown> | null>} `null` when the queue does not exist
 */
export async function loadStoredSettlementPolicy(tx, queueId) {
  const queue = await tx.queue.findUnique({ where: { id: queueId }, select: {
    id: true, lifecycleStatus: true, isArchived: true, settlementPolicyRev: true, settlementOnCloseSwitchOff: true,
    settlementOnDirectConclusion: true, settlementOnModeratorConclude: true, settlementOnChatClear: true,
    reentryRefundCap: true, reentryWindowHours: true, reentryCapHold: true, reentryCapCountsManual: true,
  } });
  if (!queue) return null;
  return Object.freeze({
    rev: queue.settlementPolicyRev,
    source: 'stored',
    lifecycleStatus: queue.lifecycleStatus,
    isArchived: queue.isArchived === true,
    onCloseSwitchOff: queue.settlementOnCloseSwitchOff,
    onDirectConclusion: queue.settlementOnDirectConclusion,
    onModeratorConclude: queue.settlementOnModeratorConclude,
    onChatClear: queue.settlementOnChatClear,
    reentryRefundCap: queue.reentryRefundCap,
    reentryWindowHours: queue.reentryWindowHours,
    reentryCapHold: queue.reentryCapHold,
    reentryCapCountsManual: queue.reentryCapCountsManual,
  });
}

/**
 * Port of the cap window (design 3.11 C). Constant `fallback` until P6b (live session) swaps the provider.
 * @returns {Promise<{kind: 'session', start: Date} | {kind: 'fallback', start: Date, reason: string}>}
 */
export async function capWindowStart(_tx, _broadcasterId, now, { reentryWindowHours = CONSTANT_POLICY.reentryWindowHours } = {}) {
  return { kind: 'fallback', start: new Date(now.getTime() - reentryWindowHours * 3_600_000), reason: 'no_session_provider' };
}

function assertIn(values, value, name) {
  if (!values.includes(value)) throw gateError('SETTLEMENT_INPUT_INVALID', `${name} is not a known value`);
}

function result(action, source, policy, settingId, cause = null) {
  return Object.freeze({ action, source, policyRev: policy.rev, settingId, cause });
}

/** Budget of the automatic refunds in the window (design 3.15 B): N with `after_n`, N - 1 with `at_n`. */
export function reentryBudget(policy) {
  if (policy.reentryRefundCap == null) return null;
  return policy.reentryCapHold === 'at_n' ? policy.reentryRefundCap - 1 : policy.reentryRefundCap;
}

function refundThroughCap(policy, capState, source, settingId) {
  const budget = reentryBudget(policy);
  if (budget === null) return result('refund', source, policy, settingId);
  if (!capState || !Number.isInteger(capState.count) || capState.count < 0) {
    throw gateError('SETTLEMENT_INPUT_INVALID', 'The cap count is required when a cap is set');
  }
  return capState.count < budget
    ? result('refund', source, policy, settingId)
    : result('wait', source, policy, 'S5', 'reentry_cap');
}

function actOnValue(value, policy, capState, settingId) {
  if (value === 'wait') return result('wait', 'policy', policy, settingId, 'policy_wait');
  if (value === 'fulfill') return result('fulfill', 'policy', policy, settingId);
  return refundThroughCap(policy, capState, 'policy', settingId);
}

/**
 * Pure resolver of the settlement policy (design 3.10; truth table in the QA plan, section 12).
 * `event.kind`: `close_switch_off` (S1), `direct_conclusion` (S2, plus S3 when `byModerator`), `held_conclusion`
 * (end of the service of a held member; S3 when `byModerator`), `chat_clear` (S4), `other`.
 * `context.membership`: `member`, `non_member` or `unknown` (a lookup answered `unknown`); `context.switchOn` is the matching
 * refund switch for `close_switch_off`. `capState.count` is the number of counted refunds of the person in the window,
 * read inside the queue lock before the decision.
 * `rule` means "no policy applies": today's rule runs (non-members, members asked by the settlement service, `unknown`).
 * @param {{kind: string, byModerator?: boolean}} event
 * @param {{membership: 'member'|'non_member'|'unknown', switchOn?: boolean}} context
 * @param {Readonly<typeof CONSTANT_POLICY>} policy
 * @param {{count: number}|null} [capState]
 */
export function resolveSettlementAction(event, context, policy, capState = null) {
  assertIn(['close_switch_off', 'direct_conclusion', 'held_conclusion', 'chat_clear', 'other'], event?.kind, 'event.kind');
  assertIn(['member', 'non_member', 'unknown'], context?.membership, 'context.membership');
  const rule = () => result('rule', 'rule', policy, null);
  if (context.membership === 'unknown') return rule();

  if (event.kind === 'close_switch_off') {
    if (context.membership === 'member' || context.switchOn === true) return rule();
    assertIn(SETTLEMENT_VALUES.onCloseSwitchOff, policy.onCloseSwitchOff, 'policy.onCloseSwitchOff');
    return policy.onCloseSwitchOff === 'legacy' ? rule() : actOnValue(policy.onCloseSwitchOff, policy, capState, 'S1');
  }
  if (context.membership === 'non_member') return rule();

  if (event.kind === 'direct_conclusion') {
    assertIn(SETTLEMENT_VALUES.onDirectConclusion, policy.onDirectConclusion, 'policy.onDirectConclusion');
    if (!event.byModerator) return actOnValue(policy.onDirectConclusion, policy, capState, 'S2');
    assertIn(SETTLEMENT_VALUES.onModeratorConclude, policy.onModeratorConclude, 'policy.onModeratorConclude');
    // Two applicable settings that disagree always give `wait`: never the more generous one.
    return policy.onDirectConclusion === policy.onModeratorConclude
      ? actOnValue(policy.onDirectConclusion, policy, capState, 'S2')
      : result('wait', 'policy', policy, 'S2', 'policy_wait');
  }
  if (event.kind === 'held_conclusion') {
    if (!event.byModerator) return refundThroughCap(policy, capState, 'rule', null);
    assertIn(SETTLEMENT_VALUES.onModeratorConclude, policy.onModeratorConclude, 'policy.onModeratorConclude');
    return actOnValue(policy.onModeratorConclude, policy, capState, 'S3');
  }
  if (event.kind === 'chat_clear') {
    assertIn(SETTLEMENT_VALUES.onChatClear, policy.onChatClear, 'policy.onChatClear');
    return actOnValue(policy.onChatClear, policy, capState, 'S4');
  }
  return rule();
}
