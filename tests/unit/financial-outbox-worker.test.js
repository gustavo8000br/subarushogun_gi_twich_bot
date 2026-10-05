import { describe, expect, it, vi } from 'vitest';
import { createFinancialOutboxWorker } from '../../apps/api/src/outbox/financial-worker.mjs';

function createHarness({ remoteStatus = 'UNFULFILLED', mutate = vi.fn(async () => ({ status: 'CANCELED' })), lookup = vi.fn(async () => remoteStatus), now = new Date('2026-10-03T12:00:00Z'), attempts = 0 } = {}) {
  const task = {
    id: 'outbox-1',
    redemptionId: 'redemption-1',
    rewardId: 'reward-1',
    operationType: 'redemption.cancel',
    attempts,
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
  return { worker: createFinancialOutboxWorker({ repository, twitch, clock: () => now, random: () => 0 }), repository, twitch, task, now };
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

  it('backs off on 429 using Retry-After and does not confirm the operation', async () => {
    const h = createHarness({ mutate: vi.fn(async () => { throw Object.assign(new Error('limited'), { status: 429, retryAfterSeconds: 17 }); }) });
    expect(await h.worker.processOne()).toBe('retry');
    expect(h.repository.retry).toHaveBeenCalledWith(h.task.id, expect.objectContaining({ delayMs: 17_000 }), h.task.leaseToken);
    expect(h.repository.confirm).not.toHaveBeenCalled();
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

  it('keeps 404 and unavailable remote history unknown instead of claiming cancellation', async () => {
    const h = createHarness({
      lookup: vi.fn(async () => { throw Object.assign(new Error('missing'), { status: 404 }); }),
    });
    expect(await h.worker.processOne()).toBe('unknown');
    expect(h.twitch.setRedemptionStatus).not.toHaveBeenCalled();
    expect(h.repository.unknown).toHaveBeenCalledWith(h.task.id, 'remote_state_unavailable', h.task.leaseToken);
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
});
