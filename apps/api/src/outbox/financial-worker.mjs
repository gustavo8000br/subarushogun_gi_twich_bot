/** @typedef {{id: string, redemptionId: string, rewardId: string, operationType: string, attempts: number, leaseToken: string}} FinancialTask */

const maxRetryMs = 60 * 60 * 1000;

function expectedRemoteStatus(task) {
  if (task.operationType === 'redemption.cancel') return 'CANCELED';
  if (task.operationType === 'redemption.fulfill') return 'FULFILLED';
  throw Object.assign(new Error('Unsupported financial operation'), { code: 'UNSUPPORTED_OPERATION' });
}

function retryDelay(error, attempts, random) {
  if (error.status === 429 && Number.isFinite(error.retryAfterSeconds)) {
    return Math.max(0, error.retryAfterSeconds * 1000);
  }
  const base = Math.min(maxRetryMs, 1000 * (2 ** Math.min(attempts, 12)));
  return Math.min(maxRetryMs, Math.round(base * (0.5 + random())));
}

function errorCode(error, fallback) {
  return typeof error?.code === 'string' ? error.code.slice(0, 64) : fallback;
}

function isPermanentHttpFailure(error) {
  return Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 && error.status !== 429;
}

function classifyRemoteState(actual, expected) {
  if (actual === expected) return 'confirmed';
  if (actual === 'UNFULFILLED') return 'pending';
  if (actual === 'CANCELED' || actual === 'FULFILLED') return 'conflict';
  return 'unknown';
}

/** @param {{repository: Record<string, Function>, twitch?: Record<string, Function>, getTwitch?: () => Record<string, Function>|null, clock?: () => Date, random?: () => number}} dependencies */
export function createFinancialOutboxWorker({ repository, twitch, getTwitch, clock = () => new Date(), random = Math.random }) {
  return {
    async processOne() {
      const adapter = getTwitch?.() ?? twitch;
      if (!adapter) return 'idle';
      /** @type {FinancialTask|null} */
      const task = await repository.claimNext({ now: clock() });
      if (!task) return 'idle';
      let expected;
      try {
        expected = expectedRemoteStatus(task);
      } catch {
        await repository.failed(task.id, 'unsupported_operation', task.leaseToken);
        return 'failed';
      }

      let actual;
      try {
        actual = await adapter.getRedemptionStatus(task.redemptionId, task.rewardId);
      } catch (error) {
        if (error.status === 401) {
          await repository.unknown(task.id, 'authorization_required', task.leaseToken);
          return 'blocked_auth';
        }
        if (error.status === 404) {
          await repository.unknown(task.id, 'remote_state_unavailable', task.leaseToken);
          return 'unknown';
        }
        if (isPermanentHttpFailure(error)) {
          await repository.failed(task.id, errorCode(error, 'remote_lookup_rejected'), task.leaseToken);
          return 'failed';
        }
        const delayMs = retryDelay(error, task.attempts, random);
        await repository.retry(task.id, {
          delayMs,
          errorCode: errorCode(error, 'remote_lookup_failed'),
          nextAttemptAt: new Date(clock().getTime() + delayMs),
        }, task.leaseToken);
        return 'retry';
      }

      let classification = classifyRemoteState(actual, expected);
      if (classification === 'confirmed') {
        await repository.confirm(task.id, expected, task.leaseToken);
        return 'confirmed';
      }
      if (classification === 'conflict') {
        await repository.conflict(task.id, `remote_${actual.toLowerCase()}_opposes_${expected.toLowerCase()}`, task.leaseToken);
        return 'conflict';
      }
      if (classification === 'unknown') {
        await repository.unknown(task.id, 'remote_state_unavailable', task.leaseToken);
        return 'unknown';
      }

      let retryError = { status: 503 };
      try {
        const response = await adapter.setRedemptionStatus(task.redemptionId, expected, task.rewardId);
        if (response?.status === expected) {
          await repository.confirm(task.id, expected, task.leaseToken);
          return 'confirmed';
        }
        actual = await adapter.getRedemptionStatus(task.redemptionId, task.rewardId);
      } catch (error) {
        retryError = error;
        if (error.status === 401) {
          await repository.unknown(task.id, 'authorization_required', task.leaseToken);
          return 'blocked_auth';
        }
        try {
          actual = await adapter.getRedemptionStatus(task.redemptionId, task.rewardId);
        } catch (lookupError) {
          if (lookupError.status === 401) {
            await repository.unknown(task.id, 'authorization_required', task.leaseToken);
            return 'blocked_auth';
          }
          if (lookupError.status === 404) {
            await repository.unknown(task.id, 'remote_state_unavailable', task.leaseToken);
            return 'unknown';
          }
          const delayMs = retryDelay(error, task.attempts, random);
          await repository.retry(task.id, {
            delayMs,
            errorCode: errorCode(error, 'remote_operation_failed'),
            nextAttemptAt: new Date(clock().getTime() + delayMs),
          }, task.leaseToken);
          return 'retry';
        }
      }

      classification = classifyRemoteState(actual, expected);
      if (classification === 'confirmed') {
        await repository.confirm(task.id, expected, task.leaseToken);
        return 'confirmed';
      }
      if (classification === 'conflict') {
        await repository.conflict(task.id, `remote_${actual.toLowerCase()}_opposes_${expected.toLowerCase()}`, task.leaseToken);
        return 'conflict';
      }
      if (classification === 'unknown') {
        await repository.unknown(task.id, 'remote_state_unavailable', task.leaseToken);
        return 'unknown';
      }

      if (retryError.status === 404) {
        await repository.unknown(task.id, 'remote_state_unavailable', task.leaseToken);
        return 'unknown';
      }
      if (isPermanentHttpFailure(retryError)) {
        await repository.failed(task.id, errorCode(retryError, 'remote_operation_rejected'), task.leaseToken);
        return 'failed';
      }

      const delayMs = retryDelay(retryError, task.attempts, random);
      await repository.retry(task.id, {
        delayMs,
        errorCode: errorCode(retryError, 'remote_state_still_unfulfilled'),
        nextAttemptAt: new Date(clock().getTime() + delayMs),
      }, task.leaseToken);
      return 'retry';
    },
  };
}
