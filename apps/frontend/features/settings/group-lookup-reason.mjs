// OPS-31 X2 (UX report ux-ops31-p5p6-texts, section 1): the group lookup failure codes collapse into four texts by class, because the
// person can act in only three ways (reconnect, wait/decide, nothing) and Twitch merges a missing scope with an expired or revoked
// token under one 401. The panel never prints the code, an id or a Twitch message; an unknown code is `failed`, never blank.
// There is no screen for these texts before P7; this closed map is the contract that screen will use.

const RECONNECT = 'panel.group_lookup.reason.reconnect';
const SLOW = 'panel.group_lookup.reason.slow';
const NOT_ELIGIBLE = 'panel.group_lookup.reason.not_eligible';
const FAILED = 'panel.group_lookup.reason.failed';

const REASON_KEYS = Object.freeze({
  scope_missing: RECONNECT,
  unauthorized: RECONNECT,
  timeout: SLOW,
  rate_limited: SLOW,
  twitch_unavailable: SLOW,
  channel_not_eligible: NOT_ELIGIBLE,
  // `forbidden` is deliberately not "reconnect": Twitch documents no 403 here, so a reconnect cannot be promised to fix it.
  forbidden: FAILED,
  malformed_response: FAILED,
  lookup_error: FAILED,
  bad_request: FAILED,
});

/** Every catalog key this map can return (the contract test checks each one in all three catalogs). */
export const GROUP_LOOKUP_REASON_KEYS = Object.freeze([RECONNECT, SLOW, NOT_ELIGIBLE, FAILED]);

/** Whether the person's way out is the Reconnect button (one button per section, label `panel.connection.reconnect`). */
export function groupLookupReasonNeedsReconnect(code) {
  return groupLookupReasonKey(code) === RECONNECT;
}

/** @param {unknown} code API reason code of a group lookup failure. @returns {string} catalog key of its text. */
export function groupLookupReasonKey(code) {
  return typeof code === 'string' && Object.hasOwn(REASON_KEYS, code) ? REASON_KEYS[code] : FAILED;
}
