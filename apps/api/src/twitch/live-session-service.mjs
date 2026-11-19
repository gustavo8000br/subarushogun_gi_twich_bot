// OPS-31 P6b (FT-90, AC 40; design v2.8 3.11 B, 3.12): the worker-side live-session service. It feeds the session repository from the
// EventSub `stream.online` / `stream.offline` events and from the Get Streams reconciliation (start, every reconnect, periodic).
//
// LIVE-1: this module (like the reducer and the repository it uses) has NO access to the queue repository: the end or the start of a live
// writes only `stream_sessions`. Logs carry closed codes only: never a stream id, a title, a login, a viewer id or the channel id.
import { setTimeout as nodeSetTimeout } from 'node:timers';

/** Configuration (design 3.11 B 6, proposed value; a code constant, not a column). */
export const LIVE_CONFIRM_DELAY_MS = 30_000;
/** Value of the "live events unavailable" flag, and the cap fallback reason that goes with it. */
export const LIVE_REVOKED_FLAG = 'revoked';
const IGNORED_TYPES = new Set(['rerun', 'premiere', 'playlist', 'watch_party']);

const durationBucket = (ms) => (!Number.isFinite(ms) || ms < 0 ? 'unknown' : ms < 5 * 60_000 ? 'lt5m' : ms < 3_600_000 ? 'lt1h' : ms < 6 * 3_600_000 ? 'lt6h' : 'gte6h');

/**
 * @param {{
 *   repository: {applyOnline: Function, applyOffline: Function, applyReconcileClose: Function, getLatest: Function},
 *   getTwitch: () => ({getCurrentStream?: () => Promise<any>} | null | undefined), broadcasterId: string,
 *   clock?: () => Date, sleep?: (ms: number) => Promise<unknown>, logEvent?: (event: Record<string, any>) => unknown,
 *   confirmDelayMs?: number,
 * }} dependencies
 */
export function createLiveSessionService({
  repository, getTwitch, broadcasterId, clock = () => new Date(),
  sleep = (ms) => new Promise((resolve) => { nodeSetTimeout(resolve, ms); }),
  logEvent = () => undefined, confirmDelayMs = LIVE_CONFIRM_DELAY_MS,
}) {
  let revoked = false;
  let resubscribed = false;
  let inFlight = null;
  const log = (event, details) => {
    try { logEvent({ event, level: 'info', source: 'twitch.live_session', details }); } catch { /* observability never changes a session decision */ }
  };

  /** One check of Twitch; a throw or a missing adapter is `unknown`, never `offline`. */
  async function check() {
    const twitch = getTwitch();
    if (typeof twitch?.getCurrentStream !== 'function') return { state: 'unknown' };
    try { return await twitch.getCurrentStream(); } catch { return { state: 'unknown' }; }
  }

  function logDecision(result, { source }) {
    switch (result?.decision) {
      case 'opened': log('live_session.opened', { source, merged: result.merged === true }); break;
      case 'closed': log('live_session.closed', { source, durationBucket: durationBucket(result.durationMs) }); break;
      case 'duplicate_ignored': log('live_session.duplicate_ignored', {}); break;
      case 'late_online_ignored': log('live_session.late_online_ignored', {}); break;
      default: break;
    }
  }

  async function handleLive(answer) {
    if (answer.type !== 'live') { log('live_session.ignored_type', { type: IGNORED_TYPES.has(answer.type) ? answer.type : 'other' }); return 'unchanged'; }
    const latest = await repository.getLatest(broadcasterId);
    if (latest && latest.endedAt === null && latest.streamId === answer.id) return 'unchanged';
    const result = await repository.applyOnline({ broadcasterId, streamId: answer.id, type: 'live', startedAt: answer.startedAt, source: 'reconciled' });
    logDecision(result, { source: 'reconciled' });
    return result?.decision === 'opened' ? 'opened' : 'unchanged';
  }

  async function runReconcile(trigger, closeHint) {
    const firstCheckAt = clock();
    const first = await check();
    if (first.state === 'unknown') return 'unknown';
    if (first.state === 'live') return handleLive(first);
    const latest = await repository.getLatest(broadcasterId);
    if (!latest || latest.endedAt !== null) return 'unchanged';
    // 3.11 B 6: a null right after an online may be Helix lag (Twurple warns about caching): never close on it.
    if (firstCheckAt.getTime() - latest.startedAt.getTime() < 2 * confirmDelayMs) return 'unchanged';
    await sleep(confirmDelayMs);
    const second = await check();
    if (second.state === 'unknown') return 'unknown';
    if (second.state === 'live') return handleLive(second);
    const result = await repository.applyReconcileClose({ broadcasterId, streamId: latest.streamId, at: closeHint ?? firstCheckAt });
    logDecision(result, { source: 'reconciled' });
    return result?.decision === 'closed' ? 'closed' : 'unchanged';
  }

  /**
   * Compares Twitch with the stored session. Single-flight. Never throws: an error is `unknown` (never closes).
   * @param {string} trigger startup | reconnect | periodic | unknown_offline | offline_without_id
   * @param {Date | null} [closeHint] the receive time of an offline event that carried no stream id
   * @returns {Promise<'opened' | 'closed' | 'unchanged' | 'unknown'>}
   */
  function reconcile(trigger, closeHint = null) {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      let result;
      try { result = await runReconcile(trigger, closeHint); } catch { result = 'unknown'; }
      log('live_session.reconcile', { trigger, result });
      // The flag clears after the next successful subscription AND one reconciliation that got a real answer from Twitch.
      if (revoked && resubscribed && result !== 'unknown') { revoked = false; resubscribed = false; }
      return result;
    })().finally(() => { inFlight = null; });
    return inFlight;
  }

  return {
    reconcile,
    isRevoked: () => revoked,
    markRevoked() { revoked = true; resubscribed = false; },
    noteSubscribed() { if (revoked) resubscribed = true; },
    async onOnline({ streamId, type, startedAt }) {
      const result = await repository.applyOnline({ broadcasterId, streamId, type, startedAt, source: 'event' });
      if (result?.decision === 'ignored_type') log('live_session.ignored_type', { type: IGNORED_TYPES.has(type) ? type : 'other' });
      else logDecision(result, { source: 'event' });
      return result;
    },
    async onOffline({ streamId, receivedAt }) {
      if (typeof streamId !== 'string') {
        // Twurple exposes no stream id on the offline event: never close on a guess; ask for the two-check reconciliation instead.
        await reconcile('offline_without_id', receivedAt);
        return { decision: 'reconcile_requested' };
      }
      const result = await repository.applyOffline({ broadcasterId, streamId, receivedAt });
      logDecision(result, { source: 'event' });
      if (result?.reconcile) await reconcile('unknown_offline');
      return result;
    },
  };
}
