// OPS-31 P2 (AC 4, design 7.3): ONE in-memory sliding-window limiter for every chat message the product sends (the call
// worker, the notice worker and the command replies), so none of them bypasses the Twitch ceiling. Priority 0 (the "your
// turn" call and command answers) may use the whole ceiling and waits a short, bounded time when the window is full;
// priorities 1 and 2 (informational notices) may use only the share not reserved for priority 0 and never wait: they are
// told "not delivered" so the notice worker can expire them. The clock and the sleep are injected (no real wait in tests).

/** Twitch allows 100 messages / 30 s for the broadcaster as sender (design note section 6); 80 leaves a margin. */
export const DEFAULT_CHAT_LIMITER_CONFIG = Object.freeze({
  ceiling: 80,
  windowMs: 30_000,
  reservedForPriorityZero: 20,
  warmupMs: 30_000,
  warmupFactor: 0.5,
  maxWaitMs: 5_000,
});

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * @param {{ceiling?: number, windowMs?: number, reservedForPriorityZero?: number, warmupMs?: number, warmupFactor?: number,
 *   maxWaitMs?: number, clock?: () => number, sleep?: (ms: number) => Promise<void>, onEvent?: (event: object) => void}} [options]
 */
export function createChatLimiter(options = {}) {
  /** @type {{ceiling: number, windowMs: number, reservedForPriorityZero: number, warmupMs: number, warmupFactor: number, maxWaitMs: number}} */
  const config = { ...DEFAULT_CHAT_LIMITER_CONFIG };
  config.ceiling = positiveInteger(options.ceiling, config.ceiling);
  config.windowMs = positiveInteger(options.windowMs, config.windowMs);
  config.reservedForPriorityZero = Number.isInteger(options.reservedForPriorityZero) && options.reservedForPriorityZero >= 0
    && options.reservedForPriorityZero < config.ceiling ? options.reservedForPriorityZero : Math.min(config.reservedForPriorityZero, config.ceiling - 1);
  config.warmupMs = Number.isInteger(options.warmupMs) && options.warmupMs >= 0 ? options.warmupMs : config.warmupMs;
  config.warmupFactor = typeof options.warmupFactor === 'number' && options.warmupFactor > 0 && options.warmupFactor <= 1 ? options.warmupFactor : config.warmupFactor;
  config.maxWaitMs = Number.isInteger(options.maxWaitMs) && options.maxWaitMs >= 0 ? options.maxWaitMs : config.maxWaitMs;
  const clock = options.clock ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const onEvent = options.onEvent ?? (() => undefined);
  const startedAt = clock();
  /** @type {number[]} */
  const sends = [];
  const stats = { granted: 0, denied: 0, dropped: 0, waited: 0 };

  function effective(limit, now) {
    return now - startedAt < config.warmupMs ? Math.max(1, Math.floor(limit * config.warmupFactor)) : limit;
  }
  function capFor(priority, now) {
    const total = effective(config.ceiling, now);
    return priority === 0 ? total : Math.max(0, total - effective(config.reservedForPriorityZero, now));
  }
  function prune(now) {
    while (sends.length && sends[0] <= now - config.windowMs) sends.shift();
  }

  /**
   * @param {0|1|2} [priority]
   * @returns {Promise<{granted: boolean, reason?: 'rate_limited'|'wait_exceeded'}>}
   */
  async function acquire(priority = 0) {
    const begin = clock();
    for (;;) {
      const now = clock();
      prune(now);
      if (sends.length < capFor(priority, now)) {
        sends.push(now);
        stats.granted += 1;
        if (now > begin) stats.waited += 1;
        return { granted: true };
      }
      if (priority !== 0) {
        stats.denied += 1;
        onEvent({ event: 'chat.limiter', outcome: 'denied', priority, windowUsed: sends.length, droppedCount: stats.denied + stats.dropped });
        return { granted: false, reason: 'rate_limited' };
      }
      const remaining = config.maxWaitMs - (now - begin);
      if (remaining <= 0) {
        stats.dropped += 1;
        onEvent({ event: 'chat.limiter', outcome: 'dropped', priority, windowUsed: sends.length, droppedCount: stats.denied + stats.dropped });
        return { granted: false, reason: 'wait_exceeded' };
      }
      const untilFree = sends.length ? sends[0] + config.windowMs - now : 1;
      await sleep(Math.max(1, Math.min(remaining, untilFree)));
    }
  }

  return {
    acquire,
    config: Object.freeze({ ...config }),
    snapshot() {
      const now = clock();
      prune(now);
      return { windowUsed: sends.length, ...stats, warmingUp: now - startedAt < config.warmupMs };
    },
  };
}

/**
 * Wrap an adapter so its `sendChatMessage(message, {priority})` goes through the limiter. A refused send answers
 * `{sent: false, rateLimited: true}`, the same shape callers already treat as "not delivered". The adapter is returned
 * unchanged when it has no sender.
 * @template T
 * @param {T & {sendChatMessage?: (message: string, options?: {priority?: number}) => Promise<any>}} adapter
 * @param {ReturnType<typeof createChatLimiter>} limiter
 * @returns {T}
 */
export function withChatLimiter(adapter, limiter) {
  if (!adapter || typeof adapter.sendChatMessage !== 'function') return adapter;
  const send = adapter.sendChatMessage.bind(adapter);
  adapter.sendChatMessage = async (message, options = {}) => {
    const priority = options?.priority === 1 || options?.priority === 2 ? options.priority : 0;
    const grant = await limiter.acquire(priority);
    if (!grant.granted) return { sent: false, rateLimited: true, dropReasonCode: 'local_rate_limit' };
    return send(message, options);
  };
  return adapter;
}
