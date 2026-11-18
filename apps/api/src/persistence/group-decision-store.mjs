// OPS-31 P6 (FT-75, AC 13): persists the group decision of ONE redemption, once, before any Twitch write call. This writer only
// stores the facts (`group_decision`, `matched_group`, `group_unknown_reason`, `group_checked_at`, `settlement_mode`); it never
// moves `settlement_state`, never writes `expected_status` (the financial gate is the only writer) and never creates an outbox row.
// Moving a row into a held/awaiting/check state belongs to the settlement service (P7).
//
// Rules, enforced here under the row lock and again by the M2a guard trigger:
//  - a conclusive decision (`eligible`, `not_eligible`) is immutable: a second write changes nothing and returns the stored one;
//  - `unknown` is replaced only when the caller says it is a "retry now" AND the row is still in state `none` (no intent, not yet
//    moved to `check_group`, whose state CHECK ties it to `unknown`; that transition is P7's);
//  - a redemption that already has an intent (`expected_status` set) never gets a decision.
const DECISIONS = Object.freeze(['eligible', 'not_eligible', 'unknown']);
const MODES = Object.freeze(['fulfill_on_start', 'refund_on_end']);
const GROUPS = Object.freeze(['broadcaster', 'own_list', 'moderator', 'vip', 'subscriber']);
const REASONS = Object.freeze(['scope_missing', 'unauthorized', 'forbidden', 'rate_limited', 'twitch_unavailable', 'timeout', 'malformed_response', 'channel_not_eligible', 'lookup_error']);

function invalid(message) {
  return Object.assign(new Error(message), { code: 'GROUP_DECISION_INVALID' });
}

const stored = (row) => ({
  decision: row.groupDecision, matchedGroup: row.matchedGroup ?? null, unknownReason: row.groupUnknownReason ?? null,
  settlementMode: row.settlementMode, checkedAt: row.groupCheckedAt,
});

/** @param {{transact: (callback: (tx: any) => Promise<any>) => Promise<any>, clock?: () => Date}} deps */
export function createGroupDecisionStore({ transact, clock = () => new Date() }) {
  return {
    /**
     * @param {{redemptionId: string, decision: {decision: string, matchedGroup?: string, unknownReason?: string}, settlementMode: string, retryUnknown?: boolean}} input
     * @returns {Promise<{written: boolean, reason: 'written'|'replaced_unknown'|'already_decided'|'unknown_kept'|'intent_exists'|'not_found', stored: object|null}>}
     */
    async recordGroupDecision({ redemptionId, decision, settlementMode, retryUnknown = false }) {
      const value = decision?.decision;
      if (typeof redemptionId !== 'string' || !redemptionId || !DECISIONS.includes(value) || !MODES.includes(settlementMode)
        || (value === 'eligible') !== (typeof decision.matchedGroup === 'string')
        || (decision.matchedGroup !== undefined && !GROUPS.includes(decision.matchedGroup))
        || (value === 'unknown') !== (typeof decision.unknownReason === 'string')
        || (decision.unknownReason !== undefined && !REASONS.includes(decision.unknownReason))) throw invalid('The group decision is invalid');
      return transact(async (tx) => {
        const rows = await tx.$queryRaw`SELECT redemption_id FROM redemptions WHERE redemption_id = ${redemptionId} FOR UPDATE`;
        if (rows.length === 0) return { written: false, reason: 'not_found', stored: null };
        const row = await tx.redemption.findUnique({ where: { redemptionId } });
        if (row.expectedStatus !== null || row.settlementState === 'intent_recorded') return { written: false, reason: 'intent_exists', stored: row.groupDecision ? stored(row) : null };
        if (row.groupDecision === 'eligible' || row.groupDecision === 'not_eligible') return { written: false, reason: 'already_decided', stored: stored(row) };
        if (row.groupDecision === 'unknown' && !(retryUnknown && row.settlementState === 'none')) return { written: false, reason: 'unknown_kept', stored: stored(row) };
        const updated = await tx.redemption.update({ where: { redemptionId }, data: {
          groupDecision: value, matchedGroup: value === 'eligible' ? decision.matchedGroup : null,
          groupUnknownReason: value === 'unknown' ? decision.unknownReason : null, groupCheckedAt: clock(), settlementMode,
        } });
        return { written: true, reason: row.groupDecision === 'unknown' ? 'replaced_unknown' : 'written', stored: stored(updated) };
      });
    },
  };
}
