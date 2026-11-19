// OPS-31 P6b (FT-90; design v2.8 3.12 "Reconciliation procedure"): the read-only "is the channel live now" call (Helix Get Streams
// through Twurple `streams.getStreamByUserId`; user or app token, no scope). It answers `live`, `offline` or `unknown`; a failure,
// a timeout or an answer of an unexpected shape is `unknown` and never `offline`, so no caller can close a session on an error.
// Only the id, the type and the UTC start leave this module (no title, game or login: AC 40). Twurple 8.2.0 gives no abort signal,
// so the call is raced against a timeout and a late result is discarded (read-only, safe). Per the Helix research note the
// Twurple limiter hides a plain 429 and retries 5xx, so a TIMEOUT is the signal that the limit or Twitch is slow.
import { twitchHttpError } from './http-error.mjs';

export const CURRENT_STREAM_TIMEOUT_MS = 5_000;
export const CURRENT_STREAM_REASONS = Object.freeze(['unauthorized', 'forbidden', 'rate_limited', 'twitch_unavailable', 'bad_request', 'timeout', 'malformed_response', 'lookup_error']);

const TIMED_OUT = Symbol('current_stream_timeout');

function reasonFromError(error) {
  const { httpStatus } = twitchHttpError(error);
  if (error && typeof error === 'object' && /** @type {{name?: unknown}} */ (error).name === 'CachedRefreshFailureError') return 'unauthorized';
  if (httpStatus === 400) return 'bad_request';
  if (httpStatus === 401) return 'unauthorized';
  if (httpStatus === 403) return 'forbidden';
  if (httpStatus === 429) return 'rate_limited';
  if (httpStatus !== null && httpStatus >= 500) return 'twitch_unavailable';
  return 'lookup_error';
}

/**
 * @param {{api: Record<string, any>, broadcasterId: string, timeoutMs?: number, setTimer?: typeof setTimeout, clearTimer?: typeof clearTimeout}} dependencies
 * @returns {() => Promise<{state: 'live', id: string, type: string, startedAt: Date} | {state: 'offline'} | {state: 'unknown', reason: string}>}
 */
export function createCurrentStreamReader({ api, broadcasterId, timeoutMs = CURRENT_STREAM_TIMEOUT_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
  return async function getCurrentStream() {
    if (typeof api?.streams?.getStreamByUserId !== 'function') return { state: 'unknown', reason: 'lookup_error' };
    let outcome;
    try {
      outcome = await new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimer(() => { if (!settled) { settled = true; resolve(TIMED_OUT); } }, timeoutMs);
        Promise.resolve().then(() => api.streams.getStreamByUserId(broadcasterId)).then(
          (value) => { if (!settled) { settled = true; clearTimer(timer); resolve(value); } },
          (error) => { if (!settled) { settled = true; clearTimer(timer); reject(error); } },
        );
      });
    } catch (error) {
      return { state: 'unknown', reason: reasonFromError(error) };
    }
    if (outcome === TIMED_OUT) return { state: 'unknown', reason: 'timeout' };
    if (outcome === null) return { state: 'offline' };
    const id = outcome?.id;
    const startedAt = outcome?.startDate;
    if (Array.isArray(outcome) || typeof outcome !== 'object' || typeof id !== 'string' || id.length < 1 || id.length > 64
        || !(startedAt instanceof Date) || !Number.isFinite(startedAt.getTime()) || typeof outcome.type !== 'string') {
      return { state: 'unknown', reason: 'malformed_response' };
    }
    return { state: 'live', id, type: outcome.type, startedAt };
  };
}
