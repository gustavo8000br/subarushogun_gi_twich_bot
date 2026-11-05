import { performance } from 'node:perf_hooks';

/**
 * OPS-26 slice A / D-8: the single Twitch API latency measurement read by `/health` and by the `!fila ping` chat command.
 * One `GET /helix/users?id=<broadcaster>` (the adapter `ping()`), timed with a monotonic clock, cached (success 30 s,
 * failure 5 s), single-flight, bounded at 5 s and invalidated when the integration leaves `connected` or the Twurple
 * session is rebuilt. Error text never leaves this module: failures are the fixed codes below.
 */
export const SHARED_API_PROBE_DEFAULTS = Object.freeze({ ttlMs: 30_000, failureTtlMs: 5_000, timeoutMs: 5_000 });
export const TWITCH_PROBE_FAILED = 'TWITCH_PROBE_FAILED';
export const TWITCH_NOT_CONNECTED = 'TWITCH_NOT_CONNECTED';
const CONNECTED_STATUSES = new Set(['connected', 'degraded', 'reconciling', 'ineligible']);
const NOT_CONNECTED = Object.freeze({ state: 'not_connected', code: TWITCH_NOT_CONNECTED });
const FAILED = Object.freeze({ state: 'failed', code: TWITCH_PROBE_FAILED });

/**
 * @param {{ probe: () => Promise<unknown>, getIntegrationStatus: () => string, getEpoch?: () => unknown, nowMs?: () => number, ttlMs?: number, failureTtlMs?: number, timeoutMs?: number, setTimeoutImpl?: typeof setTimeout, clearTimeoutImpl?: typeof clearTimeout }} dependencies
 * @returns {{ read: () => Promise<{state: 'ok', ms: number} | {state: 'failed', code: string} | {state: 'not_connected', code: string}>, invalidate: () => void }}
 */
export function createSharedApiProbe({
  probe, getIntegrationStatus, getEpoch = () => 0, nowMs = () => performance.now(),
  ttlMs = SHARED_API_PROBE_DEFAULTS.ttlMs, failureTtlMs = SHARED_API_PROBE_DEFAULTS.failureTtlMs, timeoutMs = SHARED_API_PROBE_DEFAULTS.timeoutMs,
  setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout,
}) {
  let cached = null;
  let pending = null;
  const readStatus = () => { try { return getIntegrationStatus(); } catch { return 'unknown'; } };
  const readEpoch = () => { try { return getEpoch(); } catch { return 0; } };

  async function measure() {
    let timer;
    const startedAt = nowMs();
    try {
      const timeout = new Promise((_resolve, reject) => { timer = setTimeoutImpl(() => reject(new Error('probe timeout')), timeoutMs); });
      if (await Promise.race([probe(), timeout]) !== true) return FAILED;
      return { state: 'ok', ms: Math.max(0, Math.round(nowMs() - startedAt)) };
    } catch {
      return FAILED;
    } finally {
      clearTimeoutImpl(timer);
    }
  }

  return {
    invalidate() { cached = null; },
    async read() {
      if (typeof probe !== 'function' || !CONNECTED_STATUSES.has(readStatus())) {
        cached = null;
        return NOT_CONNECTED;
      }
      const epoch = readEpoch();
      const now = nowMs();
      if (cached && cached.epoch === epoch && now >= cached.at && now - cached.at < cached.ttl) return cached.result;
      if (pending && pending.epoch === epoch) return pending.promise;
      const current = { epoch, promise: null };
      current.promise = (async () => {
        try {
          const result = await measure();
          cached = { result, at: nowMs(), ttl: result.state === 'ok' ? ttlMs : failureTtlMs, epoch };
          return result;
        } finally {
          if (pending === current) pending = null;
        }
      })();
      pending = current;
      return current.promise;
    },
  };
}
