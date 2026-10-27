import { describe, expect, it, vi } from 'vitest';
import { createTwitchApiAdapter } from '../../apps/api/src/twitch/helix-adapter.mjs';
import { createFinancialOutboxWorker } from '../../apps/api/src/outbox/financial-worker.mjs';
import { createTwitchReconciler } from '../../apps/api/src/twitch/reconciliation.mjs';
import { helixRedemption, twurpleHttpError } from '../helpers/twurple-real-instances.mjs';

// OPS-22 FT-24 (#82): contract tests with REAL Twurple 8.2.0 instances, never plain-object fakes.

function adapterReturning(redemption, extra = {}) {
  const getRedemptionById = vi.fn(async () => redemption);
  return {
    getRedemptionById,
    adapter: createTwitchApiAdapter({ api: { channelPoints: { getRedemptionById, ...extra } }, broadcasterId: '100000001' }),
  };
}

function financialHarness({ operationType = 'redemption.fulfill', twitch }) {
  const task = { id: 'outbox-1', redemptionId: 'fixture-redemption-1', rewardId: 'fixture-reward-1', operationType, attempts: 0, leaseToken: 'lease-1' };
  const repository = {
    claimNext: vi.fn(async () => task),
    confirm: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
    conflict: vi.fn(async () => undefined),
    unknown: vi.fn(async () => undefined),
    failed: vi.fn(async () => undefined),
  };
  return { task, repository, worker: createFinancialOutboxWorker({ repository, twitch, clock: () => new Date('2026-10-27T12:00:00Z'), random: () => 0 }) };
}

describe('Helix redemption read contract with real Twurple instances (AC 1-3)', () => {
  it.each(['UNFULFILLED', 'FULFILLED', 'CANCELED'])('maps raw Helix status %s to the same adapter status', async (status) => {
    const { adapter, getRedemptionById } = adapterReturning(helixRedemption({ status }));
    await expect(adapter.getRedemptionStatus('fixture-redemption-1', 'fixture-reward-1')).resolves.toBe(status);
    expect(getRedemptionById).toHaveBeenCalledWith('100000001', 'fixture-reward-1', 'fixture-redemption-1');
  });

  it('keeps a status outside the documented set as UNKNOWN instead of guessing', async () => {
    const { adapter } = adapterReturning(helixRedemption({ status: 'SOMETHING_NEW' }));
    await expect(adapter.getRedemptionStatus('fixture-redemption-1', 'fixture-reward-1')).resolves.toBe('UNKNOWN');
  });

  it('maps the real Update Redemption Status response instance', async () => {
    const updateRedemptionStatusByIds = vi.fn(async () => [helixRedemption({ status: 'FULFILLED' })]);
    const { adapter } = adapterReturning(null, { updateRedemptionStatusByIds });
    await expect(adapter.setRedemptionStatus('fixture-redemption-1', 'FULFILLED', 'fixture-reward-1')).resolves.toEqual({ status: 'FULFILLED' });
  });

  it('lists paginated unfulfilled redemptions with their real status (AC 2)', async () => {
    async function* paginator() {
      yield helixRedemption({ id: 'fixture-redemption-1' });
      yield helixRedemption({ id: 'fixture-redemption-2', redeemed_at: '2026-10-27T12:01:00Z' });
    }
    const getRedemptionsForBroadcasterPaginated = vi.fn(() => paginator());
    const adapter = createTwitchApiAdapter({ api: { channelPoints: { getRedemptionsForBroadcasterPaginated } }, broadcasterId: '100000001' });
    const items = await adapter.listUnfulfilledRedemptions('fixture-reward-1');
    expect(items.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 'fixture-redemption-1', status: 'UNFULFILLED' },
      { id: 'fixture-redemption-2', status: 'UNFULFILLED' },
    ]);
  });

  it('lets the financial worker serve an UNFULFILLED redemption instead of parking it as unknown (D-5)', async () => {
    const getRedemptionById = vi.fn(async () => helixRedemption({ status: 'UNFULFILLED' }));
    const updateRedemptionStatusByIds = vi.fn(async () => [helixRedemption({ status: 'FULFILLED' })]);
    const twitch = createTwitchApiAdapter({ api: { channelPoints: { getRedemptionById, updateRedemptionStatusByIds } }, broadcasterId: '100000001' });
    const h = financialHarness({ twitch });
    expect(await h.worker.processOne()).toBe('confirmed');
    expect(updateRedemptionStatusByIds).toHaveBeenCalledWith('100000001', 'fixture-reward-1', ['fixture-redemption-1'], 'FULFILLED');
    expect(h.repository.unknown).not.toHaveBeenCalled();
    expect(h.repository.confirm).toHaveBeenCalledWith('outbox-1', 'FULFILLED', 'lease-1');
  });

  it('never treats an unrecognized remote status as confirmation (AC 3)', async () => {
    const getRedemptionById = vi.fn(async () => helixRedemption({ status: 'SOMETHING_NEW' }));
    const updateRedemptionStatusByIds = vi.fn();
    const twitch = createTwitchApiAdapter({ api: { channelPoints: { getRedemptionById, updateRedemptionStatusByIds } }, broadcasterId: '100000001' });
    const h = financialHarness({ twitch });
    expect(await h.worker.processOne()).toBe('unknown');
    expect(h.repository.unknown).toHaveBeenCalledWith('outbox-1', 'remote_state_unavailable', 'lease-1');
    expect(h.repository.confirm).not.toHaveBeenCalled();
    expect(updateRedemptionStatusByIds).not.toHaveBeenCalled();
  });
});

describe('real Twurple HttpStatusCodeError classification in the financial worker (AC 4)', () => {
  function workerFailingLookup(statusCode, extra = {}) {
    const error = Object.assign(twurpleHttpError(statusCode), extra);
    const twitch = { getRedemptionStatus: vi.fn(async () => { throw error; }), setRedemptionStatus: vi.fn() };
    return { error, twitch, ...financialHarness({ twitch }) };
  }

  it('exposes statusCode and no status field, matching the research note', () => {
    const error = twurpleHttpError(404);
    expect(error.statusCode).toBe(404);
    expect(/** @type {any} */ (error).status).toBeUndefined();
  });

  it('sends a real 401 to blocked_auth', async () => {
    const h = workerFailingLookup(401);
    expect(await h.worker.processOne()).toBe('blocked_auth');
    expect(h.repository.unknown).toHaveBeenCalledWith('outbox-1', 'authorization_required', 'lease-1');
    expect(h.repository.retry).not.toHaveBeenCalled();
  });

  it('sends a real 404 to the not-found branch', async () => {
    const h = workerFailingLookup(404);
    expect(await h.worker.processOne()).toBe('unknown');
    expect(h.repository.unknown).toHaveBeenCalledWith('outbox-1', 'remote_state_unavailable', 'lease-1');
    expect(h.repository.retry).not.toHaveBeenCalled();
  });

  it('treats a real 403 as a permanent rejection, not a transient retry', async () => {
    const h = workerFailingLookup(403);
    expect(await h.worker.processOne()).toBe('failed');
    expect(h.repository.failed).toHaveBeenCalledWith('outbox-1', 'remote_lookup_rejected', 'lease-1');
    expect(h.repository.retry).not.toHaveBeenCalled();
  });

  it('honors Retry-After on a real 429', async () => {
    const h = workerFailingLookup(429, { retryAfterSeconds: 17 });
    expect(await h.worker.processOne()).toBe('retry');
    expect(h.repository.retry).toHaveBeenCalledWith('outbox-1', expect.objectContaining({ delayMs: 17_000 }), 'lease-1');
  });

  it.each([500, 502, 503])('treats a real %s as transient', async (statusCode) => {
    const h = workerFailingLookup(statusCode);
    expect(await h.worker.processOne()).toBe('retry');
    expect(h.repository.retry).toHaveBeenCalledWith('outbox-1', expect.objectContaining({ delayMs: 500, errorCode: 'remote_lookup_failed' }), 'lease-1');
    expect(h.repository.failed).not.toHaveBeenCalled();
    expect(h.repository.unknown).not.toHaveBeenCalled();
  });

  it('sends a real 401 raised by the status update to blocked_auth', async () => {
    const twitch = {
      getRedemptionStatus: vi.fn(async () => 'UNFULFILLED'),
      setRedemptionStatus: vi.fn(async () => { throw twurpleHttpError(401); }),
    };
    const h = financialHarness({ twitch });
    expect(await h.worker.processOne()).toBe('blocked_auth');
    expect(twitch.getRedemptionStatus).toHaveBeenCalledTimes(1);
  });

  it('re-reads after a real 404 on update and confirms an already-applied state', async () => {
    const twitch = {
      getRedemptionStatus: vi.fn().mockResolvedValueOnce('UNFULFILLED').mockResolvedValueOnce('FULFILLED'),
      setRedemptionStatus: vi.fn(async () => { throw twurpleHttpError(404); }),
    };
    const h = financialHarness({ twitch });
    expect(await h.worker.processOne()).toBe('confirmed');
    expect(h.repository.confirm).toHaveBeenCalledWith('outbox-1', 'FULFILLED', 'lease-1');
  });
});

describe('reconciliation with real Twurple instances and errors (AC 2, AC 4)', () => {
  function reconcilerFor(twitch, repositoryOverrides = {}) {
    const repository = {
      listManagedQueues: vi.fn(async () => [{ id: 'queue-1', rewardId: 'fixture-reward-1', isOpen: true, isArchived: false, lifecycleStatus: 'active', uidMode: 'hidden' }]),
      claimConvertedTombstoneReconciliationPage: vi.fn(async () => ({ status: 'unavailable', queues: [] })),
      listActiveRedemptionEntries: vi.fn(async () => []),
      markQueueRemoteDivergence: vi.fn(async () => undefined),
      markQueueRemoteUnknown: vi.fn(async () => undefined),
      markRedemptionUnknown: vi.fn(async () => undefined),
      ...repositoryOverrides,
    };
    const processor = { onRedemptionAdd: vi.fn(async () => ({ status: 'added' })), onRedemptionUpdate: vi.fn(async () => ({ status: 'completed' })) };
    return { repository, processor, reconciler: createTwitchReconciler({ repository, twitch, processor, broadcasterId: '100000001', clock: () => new Date('2026-10-27T12:00:00Z') }) };
  }
  const reward = { id: 'fixture-reward-1', autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: false, isInStock: true, userInputRequired: false };

  it('imports a redemption missed by EventSub with its real UNFULFILLED status', async () => {
    async function* paginator() { yield helixRedemption(); }
    const adapter = createTwitchApiAdapter({ api: { channelPoints: { getRedemptionsForBroadcasterPaginated: vi.fn(() => paginator()) } }, broadcasterId: '100000001' });
    const twitch = { getReward: vi.fn(async () => reward), listUnfulfilledRedemptions: adapter.listUnfulfilledRedemptions, getRedemptionStatus: vi.fn() };
    const h = reconcilerFor(twitch);
    const result = await h.reconciler.run();
    expect(result).toMatchObject({ status: 'complete', imported: 1, issues: [] });
    expect(h.processor.onRedemptionAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'fixture-redemption-1', status: 'UNFULFILLED', rewardId: 'fixture-reward-1' }));
  });

  it('routes a real 404 from an active-entry status check to remote_history_unavailable', async () => {
    const twitch = { getReward: vi.fn(async () => reward), listUnfulfilledRedemptions: vi.fn(async () => []), getRedemptionStatus: vi.fn(async () => { throw twurpleHttpError(404); }) };
    const h = reconcilerFor(twitch, { listActiveRedemptionEntries: vi.fn(async () => [{ redemptionId: 'fixture-redemption-9' }]) });
    const result = await h.reconciler.run();
    expect(h.repository.markRedemptionUnknown).toHaveBeenCalledWith('fixture-redemption-9', 'remote_history_unavailable');
    expect(result.status).toBe('complete');
  });

  it('records the HTTP status of a real 401 on the reconciliation issue without any other remote detail', async () => {
    const twitch = { getReward: vi.fn(async () => reward), listUnfulfilledRedemptions: vi.fn(async () => []), getRedemptionStatus: vi.fn(async () => { throw twurpleHttpError(401); }) };
    const h = reconcilerFor(twitch, { listActiveRedemptionEntries: vi.fn(async () => [{ redemptionId: 'fixture-redemption-9' }]) });
    const result = await h.reconciler.run();
    expect(h.repository.markRedemptionUnknown).not.toHaveBeenCalled();
    expect(result.status).toBe('partial');
    expect(result.issues).toEqual([{ queueId: 'queue-1', redemptionId: 'fixture-redemption-9', code: 'redemption_verification_failed', httpStatus: 401 }]);
  });
});
