// OPS-15 D-1: node-postgres emits 'error' on the Pool when an idle client loses its connection (for example PostgreSQL
// stopped or restarted: SQLSTATE 57P01). Without a listener Node throws `Unhandled 'error' event` and the API dies.
// The pool already discards the broken client and opens a new one on the next query, so the handler only records a
// safe event: no message, stack, connection string or host (those can carry secrets).
const SQLSTATE = /^[0-9A-Z]{5}$/;
const SYSTEM_CODE = /^E[A-Z0-9_]{1,31}$/;

/** @param {unknown} error */
export function safePoolErrorCode(error) {
  const code = error && typeof error === 'object' ? /** @type {{code?: unknown}} */ (error).code : undefined;
  if (typeof code !== 'string') return null;
  if (SYSTEM_CODE.test(code)) return code;
  if (SQLSTATE.test(code)) return `sqlstate_${code}`;
  return null;
}

/**
 * @param {{ on: (event: 'error', listener: (error: unknown) => void) => unknown }} pool
 * @param {{ logEvent: (input: Record<string, unknown>) => unknown }} options
 */
export function attachPoolErrorHandler(pool, { logEvent }) {
  pool.on('error', (error) => {
    try {
      logEvent({
        event: 'database_pool_error', level: 'error', source: 'api.database',
        errorType: 'DatabasePoolError', errorCode: safePoolErrorCode(error),
        details: { reason: 'idle_client_lost' },
      });
    } catch { /* Logging must never turn a recoverable pool error into a crash. */ }
  });
  return pool;
}
