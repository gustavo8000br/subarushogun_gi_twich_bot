import { describe, expect, it, vi } from 'vitest';
import { createTwitchIntegration } from '../../apps/api/src/twitch/integration.mjs';

function harness({ credential = { clientId: 'client-1', broadcasterId: 'channel-1' }, eligible = true } = {}) {
  const listener = { stop: vi.fn() };
  const authRuntime = { status: credential ? 'connected' : 'not_configured', provider: {}, stop: vi.fn() };
  const api = { channelPoints: {}, users: {}, chat: {} };
  const callbacks = {};
  const authRuntimeFactory = vi.fn(async () => authRuntime);
  const apiFactory = vi.fn(() => api);
  const adapter = { getChannelEligibility: vi.fn(async () => ({ eligible, broadcasterType: eligible ? 'affiliate' : 'unknown', channelPointsAvailable: eligible, rewardCount: eligible ? 46 : 0, rewardLimit: 50, nearRewardLimit: eligible })) };
  const adapterFactory = vi.fn(() => adapter);
  const eventSubRuntimeFactory = vi.fn((options) => { Object.assign(callbacks, options); return listener; });
  const reconciler = { run: vi.fn(async () => ({ status: 'complete' })) };
  const reconcilerFactory = vi.fn(() => reconciler);
  const onStatus = vi.fn();
  const timers = [];
  const integrationPromise = createTwitchIntegration({
    credentialRepository: {
      getAuthRecord: vi.fn(async () => credential),
      getPublicStatus: vi.fn(async () => ({ connected: Boolean(credential), clientId: credential?.clientId ?? null, secretConfigured: Boolean(credential) })),
    },
    authRuntimeFactory, apiFactory, adapterFactory, eventSubRuntimeFactory, reconcilerFactory,
    onStatus, setIntervalImpl: (handler, delay) => { timers.push({ handler, delay }); return timers.length; },
    clearIntervalImpl: vi.fn(),
  });
  return { integrationPromise, listener, authRuntime, authRuntimeFactory, apiFactory, adapterFactory, eventSubRuntimeFactory, callbacks, reconciler, onStatus, timers };
}

describe('Twitch integration lifecycle', () => {
  it('stays available but unconfigured without credentials', async () => {
    const h = harness({ credential: null });
    const integration = await h.integrationPromise;
    expect(integration.status).toBe('not_configured');
    expect(h.eventSubRuntimeFactory).not.toHaveBeenCalled();
  });

  it('requires Affiliate or Partner eligibility before opening reward/chat EventSub', async () => {
    const h = harness({ eligible: false });
    const integration = await h.integrationPromise;
    expect(integration.status).toBe('ineligible');
    expect(h.eventSubRuntimeFactory).not.toHaveBeenCalled();
    integration.stop();
    expect(h.authRuntime.stop).toHaveBeenCalledOnce();
  });

  it('starts observation before reconciliation, reconciles after readiness/reconnect and shuts down cleanly', async () => {
    const h = harness();
    const integration = await h.integrationPromise;
    await expect(integration.getSetupState()).resolves.toMatchObject({ eligibility: {
      eligible: true, broadcasterType: 'affiliate', channelPointsAvailable: true,
      rewardCount: 46, rewardLimit: 50, nearRewardLimit: true,
    } });
    expect(integration.status).toBe('connecting');
    expect(h.eventSubRuntimeFactory).toHaveBeenCalledWith(expect.objectContaining({ broadcasterId: 'channel-1' }));
    await h.callbacks.onReady();
    expect(h.reconciler.run).toHaveBeenCalledTimes(1);
    expect(h.timers[0].delay).toBe(5 * 60 * 1000);
    await h.callbacks.onReconnected();
    expect(h.reconciler.run).toHaveBeenCalledTimes(2);
    integration.stop();
    expect(h.listener.stop).toHaveBeenCalledOnce();
    expect(h.authRuntime.stop).toHaveBeenCalledOnce();
  });
});
