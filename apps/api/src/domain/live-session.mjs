// OPS-31 P6b (FT-90, AC 40; design v2.8 3.11 B and 3.12): the pure live-session reducer and the merge-window setting rules.
// Invariant LIVE-1 (owner rule 2026-11-15): the end or start of a live never changes queues, entries or redemptions. This module
// has no I/O, no clock and no import of any queue code; it only decides what to do with the rows of ONE channel's stream_sessions.
import { randomUUID } from 'node:crypto';

export const DEFAULT_MERGE_MINUTES = 10;
export const MERGE_MINUTES_RANGE = Object.freeze({ min: 1, max: 60 });
export const STREAM_ID_MAX_LENGTH = 64;
const LIVE_SOURCE = Object.freeze({ event: 'event', reconciled: 'reconciled' });

/** @param {unknown} value @returns {{ok: true, value: number} | {ok: false}} */
export function parseMergeMinutes(value) {
  return Number.isInteger(value) && /** @type {number} */ (value) >= MERGE_MINUTES_RANGE.min && /** @type {number} */ (value) <= MERGE_MINUTES_RANGE.max
    ? { ok: true, value: /** @type {number} */ (value) } : { ok: false };
}

function liveError(code, message) {
  return Object.assign(new Error(message), { code });
}

const isValidStreamId = (value) => typeof value === 'string' && value.length >= 1 && value.length <= STREAM_ID_MAX_LENGTH;
const isValidDate = (value) => value instanceof Date && Number.isFinite(value.getTime());

/** Rows ordered the way the design orders them: by `started_at`, then by `twitch_stream_id` (never by arrival). */
function ordered(rows) {
  return [...rows].sort((a, b) => (a.startedAt.getTime() - b.startedAt.getTime()) || (a.streamId < b.streamId ? -1 : a.streamId > b.streamId ? 1 : 0));
}

function noWrite(decision, extra = {}) {
  return { decision, actions: [], reconcile: false, merged: false, ...extra };
}

/**
 * @typedef {{streamId: string, sessionId: string, startedAt: Date, endedAt: Date | null, source: 'event' | 'reconciled'}} LiveRow
 * @typedef {{op: 'open', row: LiveRow} | {op: 'close', streamId: string, endedAt: Date, source?: 'reconciled'}} LiveAction
 * @typedef {{kind: 'online', streamId: string, type: string, startedAt: Date, source?: 'event' | 'reconciled'} | {kind: 'offline', streamId: string, receivedAt: Date} | {kind: 'reconcile_close', streamId: string, at: Date}} LiveEvent
 */

/**
 * Decides what an event does to the rows of one channel. Never mutates `state`.
 * @param {{rows: readonly LiveRow[]}} state the stored rows of the channel (any order; the latest few are enough)
 * @param {LiveEvent} event
 * @param {Date} now
 * @param {number} mergeWindowMs inclusive merge window in milliseconds (1..60 minutes)
 * @param {() => string} [newSessionId]
 * @returns {{decision: string, actions: LiveAction[], reconcile: boolean, merged: boolean}}
 */
export function applyLiveEvent(state, event, now, mergeWindowMs, newSessionId = randomUUID) {
  if (!Number.isFinite(mergeWindowMs) || mergeWindowMs <= 0) throw liveError('LIVE_WINDOW_INVALID', 'The merge window must be a positive number of milliseconds');
  if (!isValidDate(now)) throw liveError('LIVE_EVENT_INVALID', 'The reducer needs a valid time');
  const rows = ordered(state?.rows ?? []);
  if (event?.kind === 'online') {
    if (!isValidStreamId(event.streamId) || !isValidDate(event.startedAt)) throw liveError('LIVE_EVENT_INVALID', 'The online event is invalid');
    // Q-4: only `type = live` opens a session; every other type is logged by the caller and writes nothing.
    if (event.type !== 'live') return noWrite('ignored_type');
    if (rows.some((row) => row.streamId === event.streamId)) return noWrite('duplicate_ignored');
    const latest = rows.at(-1);
    // DB-8: a late online of an OLDER stream is ignored so stored session ids never change after the fact.
    if (latest && event.startedAt.getTime() < latest.startedAt.getTime()) return noWrite('late_online_ignored');
    const start = event.startedAt;
    /** @type {LiveAction[]} */
    const actions = [];
    // DB-7: close any other open row FIRST, then insert (the partial unique index would refuse two open rows).
    for (const open of rows.filter((row) => row.endedAt === null)) {
      actions.push({ op: 'close', streamId: open.streamId, endedAt: new Date(Math.max(open.startedAt.getTime(), start.getTime())), source: 'reconciled' });
    }
    let sessionId;
    let merged = false;
    if (latest) {
      const sessionRows = rows.filter((row) => row.sessionId === latest.sessionId);
      const lastEnd = latest.endedAt === null ? start.getTime() : Math.max(...sessionRows.map((row) => (row.endedAt ?? row.startedAt).getTime()));
      if (start.getTime() - lastEnd <= mergeWindowMs) { sessionId = latest.sessionId; merged = true; }
    }
    sessionId ??= newSessionId();
    const source = event.source === LIVE_SOURCE.reconciled ? LIVE_SOURCE.reconciled : LIVE_SOURCE.event;
    actions.push({ op: 'open', row: { streamId: event.streamId, sessionId, startedAt: start, endedAt: null, source } });
    return { decision: 'opened', actions, reconcile: false, merged };
  }
  if (event?.kind === 'offline' || event?.kind === 'reconcile_close') {
    const when = event.kind === 'offline' ? event.receivedAt : event.at;
    if (!isValidStreamId(event.streamId) || !isValidDate(when)) throw liveError('LIVE_EVENT_INVALID', 'The close event is invalid');
    const target = rows.find((row) => row.streamId === event.streamId);
    if (!target) return noWrite('unknown_stream', { reconcile: event.kind === 'offline' });
    if (target.endedAt !== null) return noWrite('duplicate_ignored');
    // ended_at = GREATEST(started_at, LEAST(receive time, start of the next row of the same session)).
    const next = rows.find((row) => row.sessionId === target.sessionId && row !== target && ordered([target, row])[0] === target);
    const capped = next ? Math.min(when.getTime(), next.startedAt.getTime()) : when.getTime();
    const endedAt = new Date(Math.max(target.startedAt.getTime(), capped));
    return { decision: 'closed', actions: [{ op: 'close', streamId: target.streamId, endedAt, ...(event.kind === 'reconcile_close' ? { source: 'reconciled' } : {}) }], reconcile: false, merged: false };
  }
  throw liveError('LIVE_EVENT_INVALID', 'The live event kind is unknown');
}
