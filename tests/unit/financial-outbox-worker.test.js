import { describe, expect, it, vi } from 'vitest';
import { createFinancialOutboxWorker } from '../../apps/api/src/outbox/financial-worker.mjs';
import { twurpleHttpError } from '../helpers/twurple-real-instances.mjs';

function createHarness({ remoteStatus = 'UNFULFILLED', mutate = vi.fn(async () => ({ status: 'CANCELED' })), lookup = vi.fn(async () => remoteStatus), now = new Date('2026-10-03T12:00:00Z'), attempts = 0, payload = {}, random = () => 0 } = {}) {
  const task = {
    id: 'outbox-1',
    redemptionId: 'redemption-1',
    rewardId: 'reward-1',
    operationType: 'redemption.cancel',
    attempts,
    payload,
    leaseToken: 'lease-token-1',
  };
  const repository = {
    claimNext: vi.fn(async () => task),
    confirm: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
    conflict: vi.fn(async () => undefined),
    unknown: vi.fn(async () => undefined),
    failed: vi.fn(async () => undefined),
  };
  const twitch = { getRedemptionStatus: lookup, setRedemptionStatus: mutate };
  const logEvent = vi.fn();
  return { worker: createFinancialOutboxWorker({ repository, twitch, clock: () => now, random, logEvent }), repository, twitch, task, now, logEvent };
}

describe('financial outbox worker', () => {
  it('checks remote state before mutation and confirms already-applied operations', async () => {
    const h = createHarness({ remoteStatus: 'CANCELED' });
    expect(await h.worker.processOne()).toBe('confirmed');
    expect(h.twitch.setRedemptionStatus).not.toHaveBeenCalled();
    expect(h.repository.confirm).toHaveBeenCalledWith(h.task.id, 'CANCELED', h.task.leaseToken);
  });

  it('records a conflict when the remote terminal state opposes the local intent', async () => {
    const h = createHarness({ remoteStatus: 'FULFILLED' });
    expect(await h.worker.processOne()).toBe('conflict');
    expect(h.twitch.setRedemptionStatus).not.toHaveBeenCalled();
    expect(h.repository.conflict).toHaveBeenCalledWith(h.task.id, expect.any(String), h.task.leaseToken);
  });

  it('requests the intended remote state and confirms only a matching response', async () => {
    const h = createHarness();
    expect(await h.worker.processOne()).toBe('confirmed');
    expect(h.twitch.setRedemptionStatus).toHaveBeenCalledWith('redemption-1', 'CANCELED', 'reward-1');
    expect(h.repository.confirm).toHaveBeenCalledWith(h.task.id, 'CANCELED', h.task.leaseToken);
  });

  it('queries remote state after a lost response and does not repeat a successful mutation', async () => {
    const h = createHarness({
      mutate: vi.fn(async () => { throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }); }),
      lookup: vi.fn().mockResolvedValueOnce('UNFULFILLED').mockResolvedValueOnce('CANCELED'),
    });
    expect(await h.worker.processOne()).toBe('confirmed');
    expect(h.twitch.setRedemptionStatus).toHaveBeenCalledTimes(1);
    expect(h.twitch.getRedemptionStatus).toHaveBeenCalledTimes(2);
  });

  // OPS-22 FT-25 (ARCH §1): a 429 follows the schedule; a supplied delay is honored only when it is longer.
  it('backs off on 429 honoring a longer Retry-After over the schedule and does not confirm the operation', async () => {
    const h = createHarness({ attempts: 1, mutate: vi.fn(async () => { throw Object.assign(new Error('limited'), { status: 429, retryAfterSeconds: 170 }); }) });
    expect(await h.worker.processOne()).toBe('retry');
    expect(h.repository.retry).toHaveBeenCalledWith(h.task.id, expect.objectContaining({ delayMs: 170_000 }), h.task.leaseToken);
    expect(h.repository.confirm).not.toHaveBeenCalled();
    const shorter = createHarness({ attempts: 1, mutate: vi.fn(async () => { throw Object.assign(new Error('limited'), { status: 429, retryAfterSeconds: 17 }); }) });
    expect(await shorter.worker.processOne()).toBe('retry');
    expect(shorter.repository.retry).toHaveBeenCalledWith(shorter.task.id, expect.objectContaining({ delayMs: 48_000 }), shorter.task.leaseToken);
  });

  it('halts automatic attempts after authorization failure', async () => {
    const h = createHarness({ mutate: vi.fn(async () => { throw Object.assign(new Error('unauthorized'), { status: 401 }); }) });
    expect(await h.worker.processOne()).toBe('blocked_auth');
    expect(h.repository.unknown).toHaveBeenCalledWith(h.task.id, 'authorization_required', h.task.leaseToken);
    expect(h.repository.retry).not.toHaveBeenCalled();
  });

  it('shows permanent Twitch failures without retrying them forever', async () => {
    const h = createHarness({ mutate: vi.fn(async () => { throw Object.assign(new Error('forbidden'), { status: 403, code: 'FORBIDDEN' }); }) });
    expect(await h.worker.processOne()).toBe('failed');
    expect(h.repository.failed).toHaveBeenCalledWith(h.task.id, 'FORBIDDEN', h.task.leaseToken);
    expect(h.repository.retry).not.toHaveBeenCalled();
  });

  // OPS-22 FT-25 (AC 6): a 404 on the read is non-conclusive and consumes the budget; it never claims cancellation.
  it('U25-08 treats a 404 on the read as non-conclusive: retry within the budget, never a write, never refunded', async () => {
    const h = createHarness({
      attempts: 2,
      lookup: vi.fn(async () => { throw twurpleHttpError(404, 'Not Found'); }),
    });
    expect(await h.worker.processOne()).toBe('retry');
    expect(h.twitch.setRedemptionStatus).not.toHaveBeenCalled();
    expect(h.repository.unknown).not.toHaveBeenCalled();
    expect(h.repository.confirm).not.toHaveBeenCalled();
    expect(h.repository.retry).toHaveBeenCalledWith(h.task.id, expect.objectContaining({
      errorCode: 'remote_redemption_not_found', reasonClass: 'remote_not_found', delayMs: 4 * 60_000 * 0.8,
    }), h.task.leaseToken);
  });

  it('calculates bounded exponential retry delay with jitter for transient failure', async () => {
    const h = createHarness({
      attempts: 2,
      mutate: vi.fn(async () => { throw Object.assign(new Error('unavailable'), { status: 503 }); }),
    });
    expect(await h.worker.processOne()).toBe('retry');
    expect(h.repository.retry).toHaveBeenCalledWith(h.task.id, expect.objectContaining({ delayMs: expect.any(Number) }), h.task.leaseToken);
    expect(h.repository.retry.mock.calls[0][1].delayMs).toBeGreaterThan(0);
  });
  it('U25-04 the sixth non-conclusive attempt ends in unknown/attempts_exhausted instead of another retry', async () => {
    for (const lookup of [
      vi.fn(async () => 'UNKNOWN'),
      vi.fn(async () => { throw twurpleHttpError(503, 'Service Unavailable'); }),
      vi.fn(async () => { throw twurpleHttpError(404, 'Not Found'); }),
      vi.fn(async () => { throw Object.assign(new Error('socket'), { code: 'ETIMEDOUT' }); }),
    ]) {
      const h = createHarness({ attempts: 6, lookup });
      expect(await h.worker.processOne()).toBe('unknown');
      expect(h.repository.retry).not.toHaveBeenCalled();
      expect(h.repository.unknown).toHaveBeenCalledWith(h.task.id, 'attempts_exhausted', h.task.leaseToken, expect.objectContaining({ reasonClass: expect.any(String) }));
      expect(h.repository.confirm).not.toHaveBeenCalled();
      expect(h.twitch.setRedemptionStatus).not.toHaveBeenCalled();
    }
    const fifth = createHarness({ attempts: 5, lookup: vi.fn(async () => 'UNKNOWN') });
    expect(await fifth.worker.processOne()).toBe('retry');
    expect(fifth.repository.retry).toHaveBeenCalledWith(fifth.task.id, expect.objectContaining({ errorCode: 'remote_status_unrecognized', reasonClass: 'remote_read_unrecognized', delayMs: 48 * 60_000 }), fifth.task.leaseToken);
  });

  it('U25-05/U25-06 counts the cycle from payload.cycleStartAttempts after "retry now" (fresh cycle of 6)', async () => {
    const h = createHarness({ attempts: 7, payload: { cycleStartAttempts: 6 }, lookup: vi.fn(async () => 'UNKNOWN') });
    expect(await h.worker.processOne()).toBe('retry');
    expect(h.repository.retry).toHaveBeenCalledWith(h.task.id, expect.objectContaining({ delayMs: 48_000 }), h.task.leaseToken);
    const end = createHarness({ attempts: 12, payload: { cycleStartAttempts: 6 }, lookup: vi.fn(async () => 'UNKNOWN') });
    expect(await end.worker.processOne()).toBe('unknown');
    expect(end.repository.unknown).toHaveBeenCalledWith(end.task.id, 'attempts_exhausted', end.task.leaseToken, expect.any(Object));
  });

  it('U25-07 a real Twurple 401 never consumes the budget: unknown(authorization_required), even on the sixth attempt', async () => {
    for (const where of ['read', 'write']) {
      const h = createHarness({
        attempts: 6,
        lookup: where === 'read' ? vi.fn(async () => { throw twurpleHttpError(401, 'Unauthorized'); }) : vi.fn(async () => 'UNFULFILLED'),
        mutate: vi.fn(async () => { throw twurpleHttpError(401, 'Unauthorized'); }),
      });
      expect(await h.worker.processOne()).toBe('blocked_auth');
      expect(h.repository.unknown).toHaveBeenCalledWith(h.task.id, 'authorization_required', h.task.leaseToken);
      expect(h.repository.unknown).not.toHaveBeenCalledWith(h.task.id, 'attempts_exhausted', expect.anything(), expect.anything());
      expect(h.repository.retry).not.toHaveBeenCalled();
    }
  });

  it('U25-09 re-verification is read-only: a non-conclusive read records zero write calls', async () => {
    for (const lookup of [vi.fn(async () => 'UNKNOWN'), vi.fn(async () => { throw twurpleHttpError(500, 'Server Error'); })]) {
      const h = createHarness({ attempts: 3, lookup });
      expect(await h.worker.processOne()).toBe('retry');
      expect(h.twitch.setRedemptionStatus).not.toHaveBeenCalled();
      expect(h.repository.confirm).not.toHaveBeenCalled();
    }
  });

  it('U25-10 positive read confirms, opposite read is a conflict, and a 0-row guarded write is lease_lost (not an error)', async () => {
    const confirmed = createHarness({ attempts: 3, remoteStatus: 'CANCELED' });
    expect(await confirmed.worker.processOne()).toBe('confirmed');
    expect(confirmed.repository.confirm).toHaveBeenCalledWith(confirmed.task.id, 'CANCELED', confirmed.task.leaseToken);
    const opposite = createHarness({ attempts: 3, remoteStatus: 'FULFILLED' });
    expect(await opposite.worker.processOne()).toBe('conflict');
    const lostConfirm = createHarness({ attempts: 3, remoteStatus: 'CANCELED' });
    lostConfirm.repository.confirm.mockResolvedValueOnce(false);
    expect(await lostConfirm.worker.processOne()).toBe('lease_lost');
    const lostRetry = createHarness({ attempts: 3, remoteStatus: 'UNKNOWN' });
    lostRetry.repository.retry.mockResolvedValueOnce({ count: 0 });
    expect(await lostRetry.worker.processOne()).toBe('lease_lost');
    const lostExhaustion = createHarness({ attempts: 6, remoteStatus: 'UNKNOWN' });
    lostExhaustion.repository.unknown.mockResolvedValueOnce({ count: 0 });
    expect(await lostExhaustion.worker.processOne()).toBe('lease_lost');
  });

  it('U25-11 logs one financial.attempt line per attempt with the exact key set and no error message, body or viewer data', async () => {
    const canaries = ['oauth:canary-token-123', 'canary_viewer_login', 'Bearer canary'];
    const failing = createHarness({
      attempts: 2,
      lookup: vi.fn(async () => { throw Object.assign(twurpleHttpError(503, 'Service Unavailable'), { message: canaries.join(' ') }); }),
    });
    expect(await failing.worker.processOne()).toBe('retry');
    const confirmed = createHarness({ attempts: 1, remoteStatus: 'CANCELED' });
    expect(await confirmed.worker.processOne()).toBe('confirmed');
    const longCode = createHarness({ attempts: 1, lookup: vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'e'.repeat(90) }); }) });
    await longCode.worker.processOne();
    for (const h of [failing, confirmed, longCode]) {
      expect(h.logEvent).toHaveBeenCalledTimes(1);
      const [line] = h.logEvent.mock.calls[0];
      expect(Object.keys(line).sort()).toEqual(['details', 'event', 'level', 'source']);
      expect(line.event).toBe('financial.attempt');
      expect(Object.keys(line.details).sort()).toEqual(['attempt', 'httpStatus', 'nextAttemptAt', 'operationType', 'outboxId', 'outcome', 'twitchErrorCode']);
      expect(line.details.twitchErrorCode === null || line.details.twitchErrorCode.length <= 64).toBe(true);
      const serialized = JSON.stringify(h.logEvent.mock.calls);
      for (const canary of canaries) expect(serialized).not.toContain(canary);
      expect(serialized).not.toContain('api.twitch.tv');
    }
    expect(failing.logEvent.mock.calls[0][0].details).toEqual({
      operationType: 'redemption.cancel', outboxId: 'outbox-1', attempt: 2, httpStatus: 503,
      twitchErrorCode: 'remote_lookup_failed', nextAttemptAt: new Date(failing.now.getTime() + 4 * 60_000 * 0.8).toISOString(), outcome: 'retry',
    });
    expect(confirmed.logEvent.mock.calls[0][0].details).toMatchObject({ outcome: 'confirmed', httpStatus: null, twitchErrorCode: null, nextAttemptAt: null });
    expect(longCode.logEvent.mock.calls[0][0].details.twitchErrorCode).toHaveLength(64);
  });
});
