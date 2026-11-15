// OPS-15 FT-68: bounded, idempotent API shutdown (Fastify/Node convention: close(), then drop connections that
// outlive a grace period, plus an unref'd hard-exit timer so no stuck step can keep the process alive).
export const SHUTDOWN_GRACE_MS = 5_000;
export const SHUTDOWN_HARD_TIMEOUT_MS = 15_000;

/**
 * @param {{
 *   stop: () => Promise<unknown>,
 *   closeIdleConnections?: () => void,
 *   closeAllConnections?: () => void,
 *   exit?: (code: number) => void,
 *   writeError?: (text: string) => unknown,
 *   graceMs?: number, hardTimeoutMs?: number,
 *   setTimeoutImpl?: typeof setTimeout, clearTimeoutImpl?: typeof clearTimeout,
 * }} options
 */
export function createGracefulShutdown({
  stop, closeIdleConnections = () => undefined, closeAllConnections = () => undefined,
  exit = (code) => process.exit(code), writeError = (text) => process.stderr.write(text),
  graceMs = SHUTDOWN_GRACE_MS, hardTimeoutMs = SHUTDOWN_HARD_TIMEOUT_MS,
  setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout,
}) {
  /** @type {Promise<number> | null} */
  let running = null;
  const safely = (action) => { try { action(); } catch { /* A connection cleanup failure must not stop the shutdown. */ } };

  async function run() {
    let exitCode = 0;
    safely(closeIdleConnections);
    // Requests that never finish (half-sent body, stalled client) are dropped after the grace period.
    const graceTimer = setTimeoutImpl(() => safely(closeAllConnections), graceMs);
    // Last resort: still alive after the hard limit means a stuck step or handle; exit with a failure code.
    const hardTimer = setTimeoutImpl(() => {
      writeError('Local application server shutdown timed out; forcing exit.\n');
      exit(1);
    }, hardTimeoutMs);
    graceTimer.unref?.();
    hardTimer.unref?.();
    try {
      await stop();
    } catch {
      exitCode = 1;
      writeError('Local application server shutdown failed; no details are logged.\n');
    }
    clearTimeoutImpl(graceTimer);
    if (exitCode !== 0) {
      clearTimeoutImpl(hardTimer);
      exit(exitCode);
    }
    // On success the hard timer stays armed and unref'd: it only fires if some handle still holds the process.
    return exitCode;
  }

  return {
    /** Idempotent: every caller receives the same in-flight shutdown. */
    shutdown() {
      running ??= run();
      return running;
    },
    get closing() { return running !== null; },
  };
}
