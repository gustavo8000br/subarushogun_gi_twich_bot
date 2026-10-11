import { randomUUID } from 'node:crypto';
import { PENDING_QUEUE_REWARD_MISMATCH_REASONS } from '../twitch/pending-queue-reward-compatibility.mjs';

const LEVELS = ['emergency', 'alert', 'critical', 'error', 'warn', 'notice', 'info', 'verbose', 'debug', 'trace'];
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const REFERENCE_ID = /^(?:[A-Fa-f0-9]{8}-[A-Fa-f0-9-]{27}|[A-Za-z][A-Za-z0-9_.-]{0,63})$/;
const SAFE_REASON = /^[a-z][a-z0-9_]{0,63}$/;
const SAFE_MISMATCH_REASONS = new Set(PENDING_QUEUE_REWARD_MISMATCH_REASONS);
const SAFE_DETAIL_KEYS = new Set(['errorType', 'errorCode', 'statusCode', 'stage', 'managedRewardCount', 'candidateCount', 'rejectedRewardCount', 'queueMode', 'remoteSyncStatus']);

export function resolveLogLevel(level) {
  return LEVELS.includes(level) ? level : 'info';
}

function safeDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return undefined;
  const safe = {};
  for (const [key, value] of Object.entries(details)) {
    if (key === 'mismatchCounts' && value && typeof value === 'object' && !Array.isArray(value)) {
      const counts = Object.fromEntries(Object.entries(value).filter(([reason, count]) => SAFE_REASON.test(reason) && SAFE_MISMATCH_REASONS.has(reason) && Number.isSafeInteger(count) && count >= 0));
      if (Object.keys(counts).length) safe.mismatchCounts = counts;
    } else if (SAFE_DETAIL_KEYS.has(key) && ((Number.isSafeInteger(value) && value >= 0) || (typeof value === 'string' && IDENTIFIER.test(value)))) {
      safe[key] = value;
    }
  }
  return Object.keys(safe).length ? safe : undefined;
}

/** @param {{level?: string, write?: (line: string) => unknown, clock?: () => Date, idFactory?: () => string}} [options] */
export function createStructuredLogger({ level = process.env.APP_LOG_LEVEL ?? 'info', write = (line) => process.stdout.write(line), clock = () => new Date(), idFactory = randomUUID } = {}) {
  const threshold = LEVELS.indexOf(resolveLogLevel(level));
  return (/** @type {{event?: string, level?: string, source?: string, referenceId?: string, details?: Record<string, any>, errorType?: string, errorCode?: string|null, statusCode?: number}} */ input = {}) => {
    const { event, level: eventLevel = 'info', source = 'unknown', referenceId, details, errorType, errorCode, statusCode } = input;
    const normalizedLevel = resolveLogLevel(eventLevel);
    const safeReferenceId = typeof referenceId === 'string' && REFERENCE_ID.test(referenceId) ? referenceId : idFactory();
    if (LEVELS.indexOf(normalizedLevel) > threshold) return safeReferenceId;
    const safe = safeDetails(details);
    const record = {
      event: typeof event === 'string' && IDENTIFIER.test(event) ? event : 'application_event',
      level: normalizedLevel,
      referenceId: safeReferenceId,
      occurredAt: clock().toISOString(),
      source: typeof source === 'string' && IDENTIFIER.test(source) ? source : 'unknown',
      ...(safe ? { details: safe } : {}),
      ...(typeof errorType === 'string' && IDENTIFIER.test(errorType) ? { errorType } : {}),
      ...(typeof errorCode === 'string' && IDENTIFIER.test(errorCode) ? { errorCode } : {}),
      ...(errorCode === null ? { errorCode: null } : {}),
      ...(Number.isSafeInteger(statusCode) && statusCode >= 0 ? { statusCode } : {}),
    };
    try { write(`${JSON.stringify(record)}\n`); } catch { /* Logging must never break application behavior. */ }
    return record.referenceId;
  };
}
