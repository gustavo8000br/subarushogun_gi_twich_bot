// OPS-31 P6b (FT-90, U40-03, U40-04, SV-01): the live session wired into the Twitch integration. The live reconciliation is NOT behind the
// eligibility checks (startup, every reconnect, periodic), a revocation of a stream subscription takes an early branch that leaves chat and
// reward status alone, and the optional `liveSessionRepository` keeps every older caller working unchanged.
import { describe, expect, it, vi } from 'vitest';
import { createTwitchIntegration } from '../../apps/api/src/twitch/integration.mjs';

const credential = { clientId: 'client-1', broadcasterId: 'channel-1', accessToken: 'access-token', refreshToken: 'refresh-token' };

function harness({ eligible = true, withLive = true, answers = [] } = {}) {
  const callbacks = {};
  const timers = [];
  const cleared = [];
  const queued = [...answers];
  const adapter = {
    getChannelEligibility: vi.fn(async () => ({ eligible, broadcasterType: eligible ? 'affiliate' : 'unknown', channelPointsAvailable: eligible, rewardCount: 0, rewardLimit: 50, nearRewardLimit: false })),
    ping: vi.fn(async () => true),
    getCurrentStream: vi.fn(async () => queued.shift() ?? { state: 'unknown', reason: 'timeout' }),
  };
  const liveSessionRepository = {
    applyOnline: vi.fn(async () => ({ decision: 'opened', merged: false, reconcile: false })),
    applyOffline: vi.fn(async () => ({ decision: 'closed', merged: false, reconcile: false })),
    applyReconcileClose: vi.fn(async () => ({ decision: 'closed', merged: false, reconcile: false })),
    getLatest: vi.fn(async () => null),
    describeLiveSession: vi.fn(async (_broadcaster, { revoked }) => ({ state: revoked ? 'unknown' : 'offline', startedAt: null, endedAt: null, source: null, capWindow: 'fallback', fallbackReason: revoked ? 'revoked' : 'none_known' })),
  };
  const onStatus = vi.fn();
  const logEvent = vi.fn();
  const eventSubRuntimeFactory = vi.fn((options) => { Object.assign(callbacks, options); return { stop: vi.fn() }; });
  const promise = createTwitchIntegration({
    credentialRepository: { getAuthRecord: vi.fn(async () => credential), markReconnectRequired: vi.fn(async () => undefined), getPublicStatus: vi.fn(async () => ({})) },
    authRuntimeFactory: vi.fn(async () => ({ status: 'connected', provider: {}, stop: vi.fn() })),
    apiFactory: vi.fn(() => ({})), adapterFactory: vi.fn(() => adapter), eventSubRuntimeFactory,
    reconcilerFactory: vi.fn(() => ({ run: vi.fn(async () => ({ status: 'complete' })) })),
    ...(withLive ? { liveSessionRepository } : {}),
    onStatus, logEvent,
    setIntervalImpl: (handler, delay) => { timers.push({ handler, delay }); return timers.length; },
    clearIntervalImpl: (id) => cleared.push(id),
  });
  return { promise, callbacks, timers, cleared, adapter, liveSessionRepository, onStatus, logEvent, eventSubRuntimeFactory };
}

describe('OPS-31 P6b integration wiring', () => {
  it('passes the live callbacks to the EventSub runtime and routes an online event to the repository', async () => {
    const h = harness();
    const integration = await h.promise; await integration.ready;
    expect(h.callbacks.onStreamOnline).toEqual(expect.any(Function));
    expect(h.callbacks.onStreamOffline).toEqual(expect.any(Function));
    await h.callbacks.onStreamOnline({ streamId: 's1', type: 'live', startedAt: new Date('2030-01-01T10:00:00.000Z'), broadcasterId: 'channel-1' });
    expect(h.liveSessionRepository.applyOnline).toHaveBeenCalledWith({ broadcasterId: 'channel-1', streamId: 's1', type: 'live', startedAt: new Date('2030-01-01T10:00:00.000Z'), source: 'event' });
    await integration.stop();
  });

  it('without a liveSessionRepository nothing live is wired: no callbacks, no extra timer, getLiveSession is null (older callers unchanged)', async () => {
    const h = harness({ withLive: false });
    const integration = await h.promise; await integration.ready;
    expect(h.callbacks.onStreamOnline).toBeUndefined();
    expect(h.callbacks.onStreamOffline).toBeUndefined();
    await h.callbacks.onReady();
    expect(h.timers).toHaveLength(1); // the existing 5-minute redemption reconciliation only
    expect(await integration.getLiveSession()).toBeNull();
    await integration.stop();
  });

  it('startup reconciliation runs EVEN WHEN the channel is not eligible, and a periodic live tick of 5 minutes is armed', async () => {
    const h = harness({ eligible: false, answers: [{ state: 'live', id: 'live-1', type: 'live', startedAt: new Date('2030-01-01T10:00:00.000Z') }] });
    const integration = await h.promise; await integration.ready;
    await h.callbacks.onReady();
    expect(h.adapter.getCurrentStream).toHaveBeenCalledTimes(1);
    expect(h.liveSessionRepository.applyOnline).toHaveBeenCalledWith(expect.objectContaining({ streamId: 'live-1', source: 'reconciled' }));
    expect(h.timers.map((timer) => timer.delay)).toEqual([5 * 60 * 1000]);
    h.adapter.getCurrentStream.mockClear();
    await h.timers[0].handler();
    expect(h.adapter.getCurrentStream).toHaveBeenCalledTimes(1);
    await integration.stop();
    expect(h.cleared).toContain(1);
  });

  it('every reconnect reconciles the live session even when the channel is not eligible', async () => {
    const h = harness({ eligible: false });
    const integration = await h.promise; await integration.ready;
    await h.callbacks.onReady();
    h.adapter.getCurrentStream.mockClear();
    await h.callbacks.onReconnected();
    expect(h.adapter.getCurrentStream).toHaveBeenCalledTimes(1);
    await integration.stop();
  });

  it('an eligible channel keeps its redemption reconciliation and gets the live one too', async () => {
    const h = harness({ eligible: true });
    const integration = await h.promise; await integration.ready;
    await h.callbacks.onReady();
    expect(h.timers.map((timer) => timer.delay)).toEqual([5 * 60 * 1000, 5 * 60 * 1000]);
    expect(h.adapter.getCurrentStream).toHaveBeenCalledTimes(1);
    await integration.stop();
  });

  it.each(['stream.online', 'stream.offline'])('revocation of %s (any status) takes the early branch: no reconnect_required, chat and reward status untouched, a closed degraded code, the cap flag set (U40-04)', async (type) => {
    const h = harness();
    const integration = await h.promise; await integration.ready;
    await h.callbacks.onReady();
    const before = { chat: integration.chatStatus, reward: integration.rewardStatus };
    h.onStatus.mockClear();
    h.callbacks.onRevoked(type, 'authorization_revoked');
    expect(h.onStatus).toHaveBeenCalledWith({ status: 'degraded', reason: 'live_events_unavailable' });
    expect(h.onStatus).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'reconnect_required' }));
    expect({ chat: integration.chatStatus, reward: integration.rewardStatus }).toEqual(before);
    expect(integration.liveEventsRevoked).toBe(true);
    expect((await integration.getLiveSession())).toMatchObject({ state: 'unknown', fallbackReason: 'revoked' });
    expect(h.logEvent).toHaveBeenCalledWith(expect.objectContaining({ event: 'twitch_integration_degraded', details: { reason: 'live_events_unavailable' } }));
    await integration.stop();
  });

  it('the revocation flag clears after a new subscription (ready) and one good reconciliation', async () => {
    const h = harness({ answers: [{ state: 'offline' }] });
    const integration = await h.promise; await integration.ready;
    h.callbacks.onRevoked('stream.online', 'notification_failures_exceeded');
    expect(integration.liveEventsRevoked).toBe(true);
    await h.callbacks.onReady(); // subscribes again and reconciles: offline with no open session is a good answer
    expect(integration.liveEventsRevoked).toBe(false);
    await integration.stop();
  });

  it('a revocation of a chat subscription is unchanged by P6b (still reconnect_required on authorization_revoked)', async () => {
    const h = harness();
    const integration = await h.promise; await integration.ready;
    h.callbacks.onRevoked('channel.chat.message', 'authorization_revoked');
    expect(h.onStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'reconnect_required' }));
    expect(integration.liveEventsRevoked).toBe(false);
    await integration.stop();
  });

  it('getLiveSession returns the repository description for the channel with the revocation flag', async () => {
    const h = harness();
    const integration = await h.promise; await integration.ready;
    expect(await integration.getLiveSession()).toMatchObject({ state: 'offline' });
    expect(h.liveSessionRepository.describeLiveSession).toHaveBeenCalledWith('channel-1', { revoked: false });
    await integration.stop();
  });
});
