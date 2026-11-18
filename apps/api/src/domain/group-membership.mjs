// OPS-31 P6 (FT-75, AC 13-15): the group membership decision. Pure orchestration: no database, no Twitch client of its own, no clock
// except the injected one. It returns the decision; it never persists it and never acts on it (P7 does both).
//
// Rules (design 3.3): the broadcaster is eligible by rule with no call; then the own list (a set loaded by the caller); then the
// Twitch groups in the fixed order moderator, VIP, subscriber, only for enabled groups and only for the people still unmatched.
// Eligibility is the union: a failure in one group never hides a positive answer in another. No positive answer and at least one
// failure is `unknown` with the reason of the FIRST failure (in group order); all answered and none positive is `not_eligible`.
import { REFUND_GROUPS } from './settlement-setting.mjs';
import { TWITCH_LOOKUP_GROUPS, GROUP_LOOKUP_OVERALL_TIMEOUT_MS } from '../twitch/group-lookup.mjs';

const NUMERIC_ID = /^[0-9]{1,32}$/;

/**
 * @typedef {{decision: 'eligible', matchedGroup: string} | {decision: 'not_eligible'} | {decision: 'unknown', unknownReason: string}} GroupDecision
 */

/**
 * @param {{
 *   userIds: string[], broadcasterId: string, groups: string[],
 *   ownListMembers?: ReadonlySet<string>,
 *   lookupGroup: (group: string, ids: string[], options: {deadlineAt: number}) => Promise<{members: Set<string>, failures: Map<string, string>}>,
 *   broadcasterType?: string | null,
 *   now?: () => number, overallTimeoutMs?: number,
 * }} input `broadcasterType` null/undefined means "not checked"; any other value other than affiliate/partner fails the Twitch groups as `channel_not_eligible` without a call.
 * @returns {Promise<Map<string, GroupDecision>>} one decision per distinct input id
 */
export async function decideGroupMembership({
  userIds, broadcasterId, groups, ownListMembers = new Set(), lookupGroup, broadcasterType = null,
  now = () => Date.now(), overallTimeoutMs = GROUP_LOOKUP_OVERALL_TIMEOUT_MS,
}) {
  const decisions = new Map();
  const enabled = REFUND_GROUPS.filter((group) => groups.includes(group));
  const ids = [...new Set(userIds)];
  /** @type {Map<string, string>} first failure per person, in group order */
  const firstFailure = new Map();
  const deadlineAt = now() + overallTimeoutMs;
  const open = () => ids.filter((id) => !decisions.has(id));

  for (const id of ids) {
    if (typeof id !== 'string' || !NUMERIC_ID.test(id)) firstFailure.set(id, 'lookup_error');
    else if (id === broadcasterId) decisions.set(id, { decision: 'eligible', matchedGroup: 'broadcaster' });
    else if (enabled.includes('own_list') && ownListMembers.has(id)) decisions.set(id, { decision: 'eligible', matchedGroup: 'own_list' });
  }

  for (const group of TWITCH_LOOKUP_GROUPS) {
    if (!enabled.includes(group)) continue;
    const askable = open().filter((id) => typeof id === 'string' && NUMERIC_ID.test(id));
    if (askable.length === 0) continue;
    if (broadcasterType !== null && broadcasterType !== undefined && !['affiliate', 'partner'].includes(String(broadcasterType).toLowerCase())) {
      for (const id of askable) if (!firstFailure.has(id)) firstFailure.set(id, 'channel_not_eligible');
      continue;
    }
    let answer;
    try {
      answer = await lookupGroup(group, askable, { deadlineAt });
    } catch {
      answer = { members: new Set(), failures: new Map(askable.map((id) => [id, 'lookup_error'])) };
    }
    for (const id of askable) {
      if (answer.members.has(id)) decisions.set(id, { decision: 'eligible', matchedGroup: group });
      else if (answer.failures.has(id) && !firstFailure.has(id)) firstFailure.set(id, answer.failures.get(id));
    }
  }

  for (const id of ids) {
    if (decisions.has(id)) continue;
    decisions.set(id, firstFailure.has(id)
      ? { decision: 'unknown', unknownReason: firstFailure.get(id) }
      : { decision: 'not_eligible' });
  }
  return decisions;
}
