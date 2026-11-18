// OPS-31 P5 (FT-74, AC 9, 12, 30): the per-queue `settlement` setting and the refund groups. Pure: no I/O.

export const SETTLEMENT_MODES = Object.freeze(['fulfill_on_start', 'refund_on_end']);
/** Fixed lookup order (AC 14): own list, moderator, VIP, subscriber; the broadcaster is always a member and has no switch. */
export const REFUND_GROUPS = Object.freeze(['own_list', 'moderator', 'vip', 'subscriber']);
/** Queue column of each group switch. */
export const REFUND_GROUP_COLUMNS = Object.freeze({
  subscriber: 'refundGroupSubscriber', moderator: 'refundGroupModerator', vip: 'refundGroupVip', own_list: 'refundGroupOwnList',
});
/** Scope each group needs (AC 16; the own list needs none). Scopes are requested by P6; here they only feed AC 12. */
export const REFUND_GROUP_SCOPES = Object.freeze({ subscriber: 'channel:read:subscriptions', moderator: 'moderation:read', vip: 'channel:read:vips', own_list: null });

/**
 * AC 30: until the refund-at-the-end slice (P7) is delivered the API refuses `refund_on_end`, so no queue can hold points
 * with half a feature. P7 lifts this with this one flag.
 */
export const REFUND_ON_END_DELIVERED = false;

/** @param {{refundGroupSubscriber?: boolean, refundGroupModerator?: boolean, refundGroupVip?: boolean, refundGroupOwnList?: boolean}} queue */
export function refundGroupsOf(queue) {
  return REFUND_GROUPS.filter((group) => queue?.[REFUND_GROUP_COLUMNS[group]] === true);
}

/** @param {unknown} value @returns {string[] | null} the groups in the fixed order, or `null` when the input is not a list of distinct known groups */
export function normalizeRefundGroups(value) {
  if (!Array.isArray(value) || value.length > REFUND_GROUPS.length) return null;
  if (!value.every((group) => typeof group === 'string' && REFUND_GROUPS.includes(group)) || new Set(value).size !== value.length) return null;
  return REFUND_GROUPS.filter((group) => value.includes(group));
}

/** The queue columns that express a set of groups (every switch written, so a removed group goes off). */
export function refundGroupColumnsFor(groups) {
  return Object.fromEntries(REFUND_GROUPS.map((group) => [REFUND_GROUP_COLUMNS[group], groups.includes(group)]));
}

/**
 * AC 12: the refund mode is available only when the reward was created by this product, skip-request-queue is off, the channel
 * is affiliate or partner and the scope of every enabled group is granted. Returns the FIRST failing reason (closed list) so the
 * panel can say it as text; `scope_missing` is not a disabled state in the panel ("waiting for reconnection", AC 16) but it is
 * a reason here. Nothing calls this before P7: the API refuses `refund_on_end` first (AC 30), so it is the tested rule that P6/P7 wire.
 * @param {{rewardOrigin?: string, skipRequestQueue?: boolean|null, broadcasterType?: string, groups?: string[], grantedScopes?: string[]}} input
 * @returns {{available: true, reason: null} | {available: false, reason: 'reward_not_managed'|'skip_request_queue_on'|'channel_not_eligible'|'scope_missing', group?: string}}
 */
export function evaluateRefundModeAvailability({ rewardOrigin, skipRequestQueue, broadcasterType, groups = [], grantedScopes = [] }) {
  if (rewardOrigin !== 'bot_created') return { available: false, reason: 'reward_not_managed' };
  if (skipRequestQueue !== false) return { available: false, reason: 'skip_request_queue_on' };
  if (!['affiliate', 'partner'].includes(broadcasterType ?? '')) return { available: false, reason: 'channel_not_eligible' };
  for (const group of REFUND_GROUPS) {
    const scope = REFUND_GROUP_SCOPES[group];
    if (groups.includes(group) && scope && !grantedScopes.includes(scope)) return { available: false, reason: 'scope_missing', group };
  }
  return { available: true, reason: null };
}
