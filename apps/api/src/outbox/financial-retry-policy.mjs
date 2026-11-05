// OPS-22 FT-25 (AC 6, 8, 20): the single, pure retry policy of financial outbox tasks.
// Values are owner/architect decisions (ARCH §1, architect-review-ft36 item 2); no environment variable.

/** Six attempts in total per cycle, the first try included. */
export const FINANCIAL_MAX_ATTEMPTS = 6;
/** Wait after attempt n = min(cap, base x factor^(n-1)): nominal 1, 4, 16, 60, 60 min. */
export const FINANCIAL_RETRY_BASE_MS = 60_000;
export const FINANCIAL_RETRY_FACTOR = 4;
export const FINANCIAL_RETRY_CAP_MS = 60 * 60_000;
/** Multiplicative jitter x0.8..x1.2 (±20 %) drawn from the injected `random`. */
export const FINANCIAL_RETRY_JITTER_MIN = 0.8;
export const FINANCIAL_RETRY_JITTER_MAX = 1.2;
/** Terminal `lastError` once a cycle ends non-conclusive (DATA §1, architect-review-ft36 item 1). */
export const FINANCIAL_TERMINAL_REASON = 'attempts_exhausted';
/** Enumerated reason classes stored in `payload.reasonClass` (DATA §1). */
export const FINANCIAL_REASON_CLASSES = Object.freeze(['remote_read_unrecognized', 'remote_read_transient', 'remote_not_found', 'authorization_required']);

const RETRYABLE_STATUSES = new Set(['retry', 'processing']);
const REVIEW_STATUSES = new Set(['unknown', 'conflict', 'failed']);

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** Nominal wait (ms) after the cycle attempt `attempt` (1-based); values below 1 read as 1. */
export function nominalRetryDelayMs(attempt) {
  const exponent = Math.max(1, Math.trunc(Number(attempt) || 1)) - 1;
  return Math.min(FINANCIAL_RETRY_CAP_MS, FINANCIAL_RETRY_BASE_MS * (FINANCIAL_RETRY_FACTOR ** Math.min(exponent, 8)));
}

/** Jittered wait (ms): nominal x (0.8 + 0.4 x random()), random clamped to [0, 1]. */
export function retryDelayMs(attempt, random = Math.random) {
  const draw = Math.min(1, Math.max(0, Number(random()) || 0));
  const factor = FINANCIAL_RETRY_JITTER_MIN + ((FINANCIAL_RETRY_JITTER_MAX - FINANCIAL_RETRY_JITTER_MIN) * draw);
  return Math.round(nominalRetryDelayMs(attempt) * factor);
}

/** Start of the current cycle; a missing or invalid key (legacy row) reads as 0. */
export function cycleStartAttemptsOf(task) {
  return nonNegativeInteger(task?.payload?.cycleStartAttempts);
}

/** Attempts of the current cycle = attempts - cycleStartAttempts (never negative). */
export function cycleAttemptOf(task) {
  return Math.max(0, nonNegativeInteger(task?.attempts) - cycleStartAttemptsOf(task));
}

/** True when the attempt just claimed is the last one of the cycle (or past it, for legacy rows). */
export function isCycleExhausted(task) {
  return cycleAttemptOf(task) >= FINANCIAL_MAX_ATTEMPTS;
}

/** "Retry now" opens a fresh cycle of 6: the new start is the current monotonic `attempts`. */
export function freshCycleStart(task) {
  return nonNegativeInteger(task?.attempts);
}

/** A 401 gives back the attempt the claim counted, never above `attempts` (0 <= start <= attempts). */
export function authorizationRefundCycleStart(task) {
  const attempts = nonNegativeInteger(task?.attempts);
  return Math.min(cycleStartAttemptsOf(task) + 1, attempts);
}

/**
 * Derived health of a financial operation (no new outbox status, DATA C1).
 * @param {{status?: string}} [operation]
 */
export function financialOperationHealth({ status } = {}) {
  if (RETRYABLE_STATUSES.has(status)) return 'degraded';
  if (REVIEW_STATUSES.has(status)) return 'needs_review';
  return null;
}
