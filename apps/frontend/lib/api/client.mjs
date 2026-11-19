import { WRONG_ORIGIN_CODE, announceWrongOrigin } from './wrong-origin.mjs';

const REMOTE_DELETE_REASONS = new Set(['authorization_required', 'verification_unavailable', 'reward_absent', 'reward_diverged', 'reward_not_paused']);
// OPS-31 K72-01b: closed list of `reason` values of an ENTRY_RESTORE_NOT_ALLOWED refusal (anything else is dropped).
const RESTORE_REFUSAL_REASONS = new Set(['intent_recorded', 'other_active_entry']);
const SAFE_ERROR = Object.freeze({ code: 'REQUEST_FAILED', status: 0 });
const SAFE_TIMEOUT_ERROR = Object.freeze({ code: 'REQUEST_TIMEOUT', status: 0, timedOut: true });
const TIMED_OUT = Symbol('read timed out');
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * LA-19 (FT-44): upper bound for one panel read. Measured on 2026-11-13 against a disposable PostgreSQL 18.6:
 * the heaviest local read (`listQueueProjection`, behind GET /api/queues) took a median of 13 ms (200 entries),
 * 191 ms (5,000 entries) and 1.07 s (30,000 active entries in 300 queues). The slowest read the server itself bounds is
 * GET /health, which waits for the shared Twitch API probe (5 s budget, `SHARED_API_PROBE_DEFAULTS.timeoutMs`).
 * 10 s is twice that budget and about nine times the extreme database case, so a healthy API is never cut off,
 * while a hung one ends in an error state instead of an endless "loading".
 */
export const READ_TIMEOUT_MS = 10_000;

/**
 * Abort signal for one read: it fires after `timeoutMs` (a plain timer, so fake timers can drive it in tests) or when the
 * caller's own signal fires. Mutations never get a timeout: aborting one could hide an already-sent change.
 */
function createReadSignal(callerSignal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const signal = callerSignal ? AbortSignal.any([controller.signal, callerSignal]) : controller.signal;
  return { signal, didTimeOut: () => timedOut, dispose: () => clearTimeout(timer) };
}

/**
 * Build a same-origin API client that preserves the local session, CSRF,
 * idempotency, and optimistic revision contracts used by the current panel.
 * Error bodies are never exposed to UI callers.
 * @param {{fetchImpl?: typeof fetch, createIdempotencyKey?: () => string, readTimeoutMs?: number}} [options]
 */
export function createApiClient({ fetchImpl = globalThis.fetch, createIdempotencyKey = () => globalThis.crypto.randomUUID(), readTimeoutMs = READ_TIMEOUT_MS } = {}) {
  let csrfToken = null;

  async function request(path, options = {}) {
    if (typeof path !== 'string' || !(path.startsWith('/api/') || path === '/health')) {
      throw new TypeError('API paths must be same-origin /api routes or /health');
    }
    const method = (options.method ?? 'GET').toUpperCase();
    const mutating = !READ_METHODS.has(method);
    const headers = new globalThis.Headers(options.headers ?? {});
    if (options.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
    if (mutating) {
      if (!csrfToken) await initializeSession();
      headers.set('x-csrf-token', csrfToken);
      headers.set('idempotency-key', options.idempotencyKey ?? createIdempotencyKey());
    }
    const read = mutating ? null : createReadSignal(options.signal, readTimeoutMs);
    try {
      let response;
      try {
        response = await fetchImpl(path, {
          ...options,
          method,
          body: options.body,
          headers,
          credentials: 'same-origin',
          ...(read ? { signal: read.signal } : {}),
        });
      } catch {
        // The request may have reached the server even when the response was lost.
        // Keep transport details private and let action-specific UI choose safe guidance.
        throw Object.assign(new Error('The request could not be completed.'), read?.didTimeOut() ? SAFE_TIMEOUT_ERROR : SAFE_ERROR);
      }
      if (response.status === 204) return null;
      const payload = await response.json().catch(() => (read?.didTimeOut() ? TIMED_OUT : {}));
      if (payload === TIMED_OUT) throw Object.assign(new Error('The request could not be completed.'), SAFE_TIMEOUT_ERROR);
      if (!response.ok) {
        if (response.status === 403 && payload?.code === WRONG_ORIGIN_CODE) announceWrongOrigin();
        throw Object.assign(new Error('The request could not be completed.'), {
          code: typeof payload?.code === 'string' ? payload.code : SAFE_ERROR.code,
          referenceId: typeof payload?.referenceId === 'string' ? payload.referenceId : response.headers.get('x-error-reference'),
          status: response.status,
          // FT-53: the one additive field, only for the possibly-sent DELETE refusal and only from the API's closed list.
          ...(payload?.code === 'QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED' && typeof payload.reason === 'string' && REMOTE_DELETE_REASONS.has(payload.reason) ? { reason: payload.reason } : {}),
          ...(payload?.code === 'ENTRY_RESTORE_NOT_ALLOWED' && typeof payload.reason === 'string' && RESTORE_REFUSAL_REASONS.has(payload.reason) ? { reason: payload.reason } : {}),
        });
      }
      return payload;
    } finally {
      read?.dispose();
    }
  }

  async function initializeSession() {
    // The session request is a read: a hung API must not leave the panel waiting forever (the mutation that
    // triggered it has not been sent yet, so aborting is safe).
    const read = createReadSignal(undefined, readTimeoutMs);
    try {
      let response;
      try {
        response = await fetchImpl('/api/session', { credentials: 'same-origin', headers: { accept: 'application/json' }, signal: read.signal });
      } catch {
        throw Object.assign(new Error('The local session could not be initialized.'), {
          code: 'SESSION_INITIALIZATION_FAILED',
          status: 0,
          ...(read.didTimeOut() ? { timedOut: true } : {}),
        });
      }
      const payload = response.ok ? await response.json().catch(() => ({})) : {};
      if (typeof payload?.csrfToken !== 'string' || payload.csrfToken.length < 16) {
        throw Object.assign(new Error('The local session could not be initialized.'), {
          code: 'SESSION_INITIALIZATION_FAILED',
          status: response.status,
          ...(read.didTimeOut() ? { timedOut: true } : {}),
        });
      }
      csrfToken = payload.csrfToken;
      return payload;
    } finally {
      read.dispose();
    }
  }

  return Object.freeze({ request, initializeSession });
}

export const apiClient = createApiClient();
