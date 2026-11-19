// OPS-31 P6 (FT-75, AC 15, G-15): the read-only group lookup against Twitch (moderator, VIP, subscriber).
//
// What this module is: the I/O side of the membership decision. Given a group and a list of numeric Twitch ids it answers, per id,
// "member" or a closed reason code; it never answers "not a member" for an id it could not check (AC 15). What it is NOT: it does
// not decide eligibility, persist anything, or touch money (see `domain/group-membership.mjs` and P7).
//
// Safety properties (design section 9):
//  - the granted scope is checked BEFORE the call (`scope_missing`, zero calls);
//  - every call has a per-call timeout and the whole request has an overall bound (`deadlineAt`); Twurple 8.2.0 offers no abort
//    signal per call (checked in `node_modules/@twurple/api`), so the wrapper races the promise and discards a late result, which
//    is safe because these calls are read-only;
//  - a response with an unexpected shape or an id that was not asked for is `malformed_response` (fail closed);
//  - logs and reports carry only the group code, the outcome, the reason code, a latency bucket and a count: never an id or login.
import { twitchHttpError } from './http-error.mjs';
import { REFUND_GROUP_SCOPES } from '../domain/settlement-setting.mjs';

export const GROUP_LOOKUP_REASONS = Object.freeze([
  'scope_missing', 'unauthorized', 'forbidden', 'rate_limited', 'twitch_unavailable',
  'timeout', 'malformed_response', 'channel_not_eligible', 'lookup_error', 'bad_request',
]);
/** Groups answered by Twitch, in the fixed lookup order (AC 14). The own list is a database read and the broadcaster a rule. */
export const TWITCH_LOOKUP_GROUPS = Object.freeze(['moderator', 'vip', 'subscriber']);
/** Configuration (design 9, proposed values). */
export const GROUP_LOOKUP_PER_CALL_TIMEOUT_MS = 3_000;
export const GROUP_LOOKUP_OVERALL_TIMEOUT_MS = 8_000;
export const GROUP_LOOKUP_RATE_LIMIT_WAIT_MS = 5_000;
/**
 * Ids per call. Moderators are requested with `first = 100`. Twurple 8.2.0 gives no page size or cursor for the VIP and subscriber
 * checks, and Helix pages default to 20 items, so a 100-id chunk could be truncated and read as "not a member" (a silent false
 * negative that would fulfill instead of hold). A chunk of 20 cannot be truncated whatever the page rule is. HYPOTHESIS for the
 * `@analyst`: whether `first` is ignored when `user_id` is present; if so these two constants can become 100 (one-line change).
 */
export const GROUP_LOOKUP_CHUNK_SIZE = Object.freeze({ moderator: 100, vip: 20, subscriber: 20 });
/** Positive Twitch ids only: Helix answers 400 for a non-positive integer and one bad id would fail the whole chunk (research 2026-11-18). */
export const TWITCH_USER_ID_PATTERN = /^[1-9][0-9]{0,18}$/;
const NUMERIC_ID = TWITCH_USER_ID_PATTERN;

const latencyBucket = (ms) => (ms < 250 ? 'lt250ms' : ms < 1000 ? 'lt1s' : ms < 3000 ? 'lt3s' : 'gte3s');

function reasonFromError(error) {
  const { httpStatus } = twitchHttpError(error);
  // Twurple throws this (no HTTP status) before any request when the broadcaster's refresh token is known to be dead: same remedy as a 401.
  if (error && typeof error === 'object' && /** @type {{name?: unknown}} */ (error).name === 'CachedRefreshFailureError') return 'unauthorized';
  if (httpStatus === 400) return 'bad_request';
  if (httpStatus === 401) return 'unauthorized';
  if (httpStatus === 403) return 'forbidden';
  if (httpStatus === 429) return 'rate_limited';
  if (httpStatus !== null && httpStatus >= 500) return 'twitch_unavailable';
  return 'lookup_error';
}

const TIMED_OUT = Symbol('group_lookup_timeout');

/**
 * @param {{
 *   api: Record<string, any>, broadcasterId: string,
 *   authProvider?: {getCurrentScopesForUser?: (userId: string) => string[]},
 *   perCallTimeoutMs?: number, overallTimeoutMs?: number, rateLimitWaitMs?: number,
 *   now?: () => number, setTimer?: typeof setTimeout, clearTimer?: typeof clearTimeout,
 *   report?: (event: {group: string, outcome: 'ok'|'failed', reason: string|null, latencyBucket: string, count: number}) => void,
 * }} dependencies
 */
export function createGroupLookup({
  api, broadcasterId, authProvider,
  perCallTimeoutMs = GROUP_LOOKUP_PER_CALL_TIMEOUT_MS, overallTimeoutMs = GROUP_LOOKUP_OVERALL_TIMEOUT_MS,
  rateLimitWaitMs = GROUP_LOOKUP_RATE_LIMIT_WAIT_MS,
  now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, report,
}) {
  const emit = (event) => { try { report?.(event); } catch { /* a report hook never changes a lookup result */ } };

  function sleep(ms) { return new Promise((resolve) => { setTimer(resolve, ms); }); }

  /** Races the call against the timeout; a late result is discarded (read-only call). */
  function withTimeout(start, ms) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimer(() => { if (!settled) { settled = true; resolve(TIMED_OUT); } }, ms);
      Promise.resolve().then(start).then(
        (value) => { if (!settled) { settled = true; clearTimer(timer); resolve(value); } },
        (error) => { if (!settled) { settled = true; clearTimer(timer); reject(error); } },
      );
    });
  }

  const invokers = {
    moderator: async (ids) => {
      if (typeof api?.moderation?.getModerators !== 'function') throw new Error('moderator lookup is not configured');
      const result = await api.moderation.getModerators(broadcasterId, { userId: ids, limit: 100 });
      return { items: result?.data, idOf: (item) => item?.userId };
    },
    vip: async (ids) => {
      if (typeof api?.channels?.checkVipForUsers !== 'function') throw new Error('VIP lookup is not configured');
      return { items: await api.channels.checkVipForUsers(broadcasterId, ids), idOf: (item) => item?.id };
    },
    subscriber: async (ids) => {
      if (typeof api?.subscriptions?.getSubscriptionsForUsers !== 'function') throw new Error('subscriber lookup is not configured');
      return { items: await api.subscriptions.getSubscriptionsForUsers(broadcasterId, ids), idOf: (item) => item?.userId };
    },
  };

  /** One chunk, one group. Resolves `{members}` or `{reason}`; never throws. */
  async function callChunk(group, ids, deadlineAt, allowRateLimitWait) {
    const remaining = deadlineAt - now();
    if (remaining <= 0) return { reason: 'timeout' };
    let outcome;
    try {
      outcome = await withTimeout(() => invokers[group](ids), Math.min(perCallTimeoutMs, remaining));
    } catch (error) {
      const reason = reasonFromError(error);
      const { retryAfterSeconds } = twitchHttpError(error);
      if (reason === 'rate_limited' && allowRateLimitWait && retryAfterSeconds !== null) {
        const waitMs = retryAfterSeconds * 1000;
        if (waitMs <= rateLimitWaitMs && now() + waitMs < deadlineAt) {
          await sleep(waitMs);
          return callChunk(group, ids, deadlineAt, false);
        }
      }
      return { reason };
    }
    if (outcome === TIMED_OUT) return { reason: 'timeout' };
    const { items, idOf } = outcome;
    if (!Array.isArray(items)) return { reason: 'malformed_response' };
    const asked = new Set(ids);
    const members = new Set();
    for (const item of items) {
      const id = idOf(item);
      if (typeof id !== 'string' || !asked.has(id)) return { reason: 'malformed_response' };
      members.add(id);
    }
    return { members };
  }

  /**
   * @param {string} group one of TWITCH_LOOKUP_GROUPS
   * @param {string[]} userIds numeric Twitch ids
   * @param {{deadlineAt?: number}} [options] absolute deadline (ms) of the whole request; default: now + the overall bound
   * @returns {Promise<{members: Set<string>, failures: Map<string, string>}>} every id is in `members`, in `failures`, or answered "not a member"
   */
  return async function lookupGroupMembers(group, userIds, { deadlineAt = now() + overallTimeoutMs } = {}) {
    const members = new Set();
    const failures = new Map();
    const unique = [...new Set(userIds)];
    const failAll = (ids, reason) => { for (const id of ids) failures.set(id, reason); };
    if (!TWITCH_LOOKUP_GROUPS.includes(group)) { failAll(unique, 'lookup_error'); return { members, failures }; }
    const valid = unique.filter((id) => typeof id === 'string' && NUMERIC_ID.test(id));
    failAll(unique.filter((id) => !valid.includes(id)), 'lookup_error');
    if (valid.length === 0) return { members, failures };
    const scopes = authProvider?.getCurrentScopesForUser?.(broadcasterId);
    if (!Array.isArray(scopes) || !scopes.includes(REFUND_GROUP_SCOPES[group])) {
      failAll(valid, 'scope_missing');
      emit({ group, outcome: 'failed', reason: 'scope_missing', latencyBucket: 'lt250ms', count: valid.length });
      return { members, failures };
    }
    const size = GROUP_LOOKUP_CHUNK_SIZE[group];
    for (let index = 0; index < valid.length; index += size) {
      const chunk = valid.slice(index, index + size);
      const startedAt = now();
      const result = await callChunk(group, chunk, deadlineAt, true);
      const bucket = latencyBucket(Math.max(0, now() - startedAt));
      if (result.members) {
        for (const id of result.members) members.add(id);
        emit({ group, outcome: 'ok', reason: null, latencyBucket: bucket, count: chunk.length });
      } else {
        failAll(chunk, result.reason);
        emit({ group, outcome: 'failed', reason: result.reason, latencyBucket: bucket, count: chunk.length });
      }
    }
    return { members, failures };
  };
}
