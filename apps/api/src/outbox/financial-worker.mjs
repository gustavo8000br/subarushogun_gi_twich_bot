import { twitchHttpError } from '../twitch/http-error.mjs';
import { FINANCIAL_TERMINAL_REASON, cycleAttemptOf, isCycleExhausted, retryDelayMs } from './financial-retry-policy.mjs';

/** @typedef {{id: string, redemptionId: string, rewardId: string, operationType: string, attempts: number, leaseToken: string, payload?: Record<string, any>|null}} FinancialTask */

const MAX_CODE_LENGTH = 64;

function expectedRemoteStatus(task) {
  if (task.operationType === 'redemption.cancel') return 'CANCELED';
  if (task.operationType === 'redemption.fulfill') return 'FULFILLED';
  throw Object.assign(new Error('Unsupported financial operation'), { code: 'UNSUPPORTED_OPERATION' });
}

function httpStatus(error) {
  return twitchHttpError(error).httpStatus;
}

function errorCode(error, fallback) {
  return typeof error?.code === 'string' ? error.code.slice(0, MAX_CODE_LENGTH) : fallback;
}

function isPermanentHttpFailure(error) {
  const status = httpStatus(error);
  return status !== null && status >= 400 && status < 500 && status !== 429;
}

function classifyRemoteState(actual, expected) {
  if (actual === expected) return 'confirmed';
  if (actual === 'UNFULFILLED') return 'pending';
  if (actual === 'CANCELED' || actual === 'FULFILLED') return 'conflict';
  return 'unknown';
}

/** A guarded repository write that matched no row lost the lease (DATA §2.3, AC 7): never an error. */
function leaseLost(result) {
  return result === false || (result !== null && typeof result === 'object' && result.count === 0);
}

/**
 * OPS-22 FT-25: bounded retry (6 attempts per cycle), read-only re-verification, and one safe log line per attempt.
 * @param {{repository: Record<string, Function>, twitch?: Record<string, Function>, getTwitch?: () => Record<string, Function>|null, clock?: () => Date, random?: () => number, logEvent?: (event: Record<string, any>) => unknown}} dependencies
 */
export function createFinancialOutboxWorker({ repository, twitch, getTwitch, clock = () => new Date(), random = Math.random, logEvent = () => undefined }) {
  return {
    async processOne() {
      const adapter = getTwitch?.() ?? twitch;
      if (!adapter) return 'idle';
      /** @type {FinancialTask|null} */
      const task = await repository.claimNext({ now: clock() });
      if (!task) return 'idle';

      const finish = (outcome, { status = null, code = null, nextAttemptAt = null } = {}) => {
        try {
          logEvent({
            event: 'financial.attempt', level: outcome === 'retry' || outcome === 'confirmed' ? 'info' : 'warn', source: 'outbox.financial',
            details: {
              operationType: task.operationType, outboxId: task.id, attempt: task.attempts,
              httpStatus: Number.isInteger(status) ? status : null,
              twitchErrorCode: typeof code === 'string' ? code.slice(0, MAX_CODE_LENGTH) : null,
              nextAttemptAt: nextAttemptAt instanceof Date ? nextAttemptAt.toISOString() : null,
              outcome,
            },
          });
        } catch { /* Logging must never change the financial outcome. */ }
        return outcome;
      };
      const settle = async (outcome, write, details) => (leaseLost(await write()) ? finish('lease_lost', details) : finish(outcome, details));

      let expected;
      try {
        expected = expectedRemoteStatus(task);
      } catch {
        return settle('failed', () => repository.failed(task.id, 'unsupported_operation', task.leaseToken), { code: 'unsupported_operation' });
      }

      const blockedByAuthorization = () => settle(
        'blocked_auth',
        () => repository.unknown(task.id, 'authorization_required', task.leaseToken),
        { status: 401, code: 'authorization_required' },
      );

      // Non-conclusive or transient result: retry inside the cycle budget, terminal `unknown` when it is spent.
      const scheduleRetry = async (code, reasonClass, error = null) => {
        const status = error ? httpStatus(error) : null;
        if (isCycleExhausted(task)) {
          return settle(
            'unknown',
            () => repository.unknown(task.id, FINANCIAL_TERMINAL_REASON, task.leaseToken, { reasonClass }),
            { status, code: FINANCIAL_TERMINAL_REASON },
          );
        }
        const cycleAttempt = cycleAttemptOf(task);
        const { retryAfterSeconds } = twitchHttpError(error);
        const scheduled = retryDelayMs(cycleAttempt, random);
        const delayMs = status === 429 && retryAfterSeconds !== null ? Math.max(scheduled, retryAfterSeconds * 1000) : scheduled;
        const nextAttemptAt = new Date(clock().getTime() + delayMs);
        return settle('retry', () => repository.retry(task.id, {
          delayMs, errorCode: code, nextAttemptAt, reasonClass, attempt: task.attempts, cycleAttempt, httpStatus: status,
        }, task.leaseToken), { status, code, nextAttemptAt });
      };

      const settleClassified = (classification, actual) => {
        if (classification === 'confirmed') return settle('confirmed', () => repository.confirm(task.id, expected, task.leaseToken));
        if (classification === 'conflict') {
          const code = `remote_${actual.toLowerCase()}_opposes_${expected.toLowerCase()}`;
          return settle('conflict', () => repository.conflict(task.id, code, task.leaseToken), { code });
        }
        return scheduleRetry('remote_status_unrecognized', 'remote_read_unrecognized');
      };

      // Read-only re-verification: every attempt starts with a read; a write happens only after a positive UNFULFILLED read.
      let actual;
      try {
        actual = await adapter.getRedemptionStatus(task.redemptionId, task.rewardId);
      } catch (error) {
        const status = httpStatus(error);
        if (status === 401) return blockedByAuthorization();
        if (status === 404) return scheduleRetry('remote_redemption_not_found', 'remote_not_found', error);
        if (isPermanentHttpFailure(error)) {
          const code = errorCode(error, 'remote_lookup_rejected');
          return settle('failed', () => repository.failed(task.id, code, task.leaseToken), { status, code });
        }
        return scheduleRetry(errorCode(error, 'remote_lookup_failed'), 'remote_read_transient', error);
      }

      let classification = classifyRemoteState(actual, expected);
      if (classification !== 'pending') return settleClassified(classification, actual);

      /** @type {unknown} */
      let retryError = null;
      try {
        const response = await adapter.setRedemptionStatus(task.redemptionId, expected, task.rewardId);
        if (response?.status === expected) return settle('confirmed', () => repository.confirm(task.id, expected, task.leaseToken));
        actual = await adapter.getRedemptionStatus(task.redemptionId, task.rewardId);
      } catch (error) {
        retryError = error;
        if (httpStatus(error) === 401) return blockedByAuthorization();
        try {
          actual = await adapter.getRedemptionStatus(task.redemptionId, task.rewardId);
        } catch (lookupError) {
          if (httpStatus(lookupError) === 401) return blockedByAuthorization();
          if (httpStatus(lookupError) === 404) return scheduleRetry('remote_redemption_not_found', 'remote_not_found', lookupError);
          return scheduleRetry(errorCode(error, 'remote_operation_failed'), 'remote_read_transient', error);
        }
      }

      classification = classifyRemoteState(actual, expected);
      if (classification !== 'pending') return settleClassified(classification, actual);

      // 404 on the write means "re-read"; a re-read that still shows UNFULFILLED is non-conclusive.
      if (httpStatus(retryError) === 404) return scheduleRetry('remote_write_not_found', 'remote_not_found', retryError);
      if (isPermanentHttpFailure(retryError)) {
        const code = errorCode(retryError, 'remote_operation_rejected');
        return settle('failed', () => repository.failed(task.id, code, task.leaseToken), { status: httpStatus(retryError), code });
      }
      return scheduleRetry(errorCode(retryError, 'remote_state_still_unfulfilled'), 'remote_read_transient', retryError);
    },
  };
}
