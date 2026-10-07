import { describe, expect, it, vi } from 'vitest';
import { createTwitchIntegration } from '../../apps/api/src/twitch/integration.mjs';

function harness({ credential = { clientId: 'client-1', broadcasterId: 'channel-1', accessToken: 'access-token', refreshToken: 'refresh-token' }, eligible = true } = {}) {
  const listener = { stop: vi.fn() };
  const authRuntime = { status: credential ? 'connected' : 'not_configured', provider: {}, stop: vi.fn() };
  const api = { channelPoints: {}, users: {}, chat: {} };
  const callbacks = {};
  const authRuntimeFactory = vi.fn(async () => authRuntime);
  const apiFactory = vi.fn(() => api);
  const adapter = {
    getChannelEligibility: vi.fn(async () => ({ eligible, broadcasterType: eligible ? 'affiliate' : 'unknown', channelPointsAvailable: eligible, rewardCount: eligible ? 46 : 0, rewardLimit: 50, nearRewardLimit: eligible })),
    ping: vi.fn(async () => true),
  };
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
  it('returns the local integration while Twitch eligibility is still unreachable', async () => {
    let resolveEligibility;
    const eligibility = new Promise((resolve) => { resolveEligibility = resolve; });
    const h = harness();
    h.adapterFactory.mockImplementation(() => ({
      getChannelEligibility: vi.fn(() => eligibility), ping: vi.fn(async () => true),
    }));
    const integration = await Promise.race([
      h.integrationPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('local runtime waited for Twitch')), 25)),
    ]);

    expect(integration.status).toBe('connecting');
    resolveEligibility({ eligible: true, broadcasterType: 'affiliate', channelPointsAvailable: true, rewardCount: 0, rewardLimit: 50, nearRewardLimit: false });
    integration.stop();
  });

  it('retries transient authentication startup failures and cancels retries on stop', async () => {
    const callbacks = [];
    const delays = [];
    const authRuntimeFactory = vi.fn()
      .mockResolvedValueOnce({ status: 'degraded', provider: null, stop: vi.fn() })
      .mockResolvedValueOnce({ status: 'connected', provider: {}, stop: vi.fn() });
    const adapterFactory = vi.fn(() => ({
      getChannelEligibility: vi.fn(async () => ({ eligible: true, broadcasterType: 'affiliate' })),
      ping: vi.fn(async () => true),
    }));
    const eventSubRuntimeFactory = vi.fn(() => ({ stop: vi.fn() }));
    const integration = await createTwitchIntegration({
      credentialRepository: { getAuthRecord: vi.fn(async () => ({ clientId: 'client-1', clientSecret: 'secret', broadcasterId: 'channel-1', accessToken: 'access', refreshToken: 'refresh' })) },
      authRuntimeFactory,
      apiFactory: vi.fn(() => ({})),
      adapterFactory,
      eventSubRuntimeFactory,
      reconcilerFactory: vi.fn(() => ({ run: vi.fn(async () => ({ status: 'complete' })) })),
      setTimeoutImpl: (callback, delay) => { callbacks.push(callback); delays.push(delay); return callbacks.length; },
      clearTimeoutImpl: vi.fn(), random: () => 0.5,
    });
    await integration.ready;
    expect(integration.status).toBe('retrying');
    expect(delays[0]).toBe(5_000);
    await callbacks[0]();
    await integration.ready;
    expect(authRuntimeFactory).toHaveBeenCalledTimes(2);
    expect(adapterFactory).toHaveBeenCalledOnce();
    expect(eventSubRuntimeFactory).toHaveBeenCalledOnce();
    integration.stop();
  });

  it('keeps jittered integration retries at or below the 300-second maximum', async () => {
    const callbacks = [];
    const delays = [];
    const integration = await createTwitchIntegration({
      credentialRepository: { getAuthRecord: vi.fn(async () => ({ clientId: 'client-1', clientSecret: 'secret', broadcasterId: 'channel-1', accessToken: 'access', refreshToken: 'refresh' })) },
      authRuntimeFactory: vi.fn(async () => ({ status: 'degraded', provider: null, stop: vi.fn() })),
      setTimeoutImpl: (callback, delay) => { callbacks.push(callback); delays.push(delay); return callbacks.length; },
      clearTimeoutImpl: vi.fn(), random: () => 0.999,
    });
    await integration.ready;

    for (let attempt = 0; attempt < 7; attempt += 1) {
      callbacks[attempt]();
      await integration.ready;
    }

    expect(delays.at(-1)).toBeLessThanOrEqual(300_000);
    integration.stop();
  });

  it('cancels a scheduled initialization retry during shutdown and ignores its late callback', async () => {
    let retryCallback;
    const clearTimeoutImpl = vi.fn();
    const authRuntimeFactory = vi.fn(async () => ({ status: 'degraded', provider: null, stop: vi.fn() }));
    const integration = await createTwitchIntegration({
      credentialRepository: { getAuthRecord: vi.fn(async () => ({ clientId: 'client-1', clientSecret: 'secret', broadcasterId: 'channel-1', accessToken: 'access', refreshToken: 'refresh' })) },
      authRuntimeFactory,
      setTimeoutImpl: (callback) => { retryCallback = callback; return 'retry-timer'; },
      clearTimeoutImpl, random: () => 0.5,
    });
    await integration.ready;
    await integration.stop();
    expect(clearTimeoutImpl).toHaveBeenCalledWith('retry-timer');
    retryCallback();
    await Promise.resolve();
    expect(authRuntimeFactory).toHaveBeenCalledOnce();
  });

  it('retries transient Channel Points eligibility failures instead of treating them as permanent ineligibility', async () => {
    const timeoutCallbacks = [];
    const adapterFactory = vi.fn()
      .mockImplementationOnce(() => ({ getChannelEligibility: vi.fn(async () => ({ eligible: false, broadcasterType: 'affiliate', reason: 'channel_points_unavailable' })), ping: vi.fn() }))
      .mockImplementationOnce(() => ({ getChannelEligibility: vi.fn(async () => ({ eligible: true, broadcasterType: 'affiliate' })), ping: vi.fn() }));
    const eventSubRuntimeFactory = vi.fn(() => ({ stop: vi.fn() }));
    const integration = await createTwitchIntegration({
      credentialRepository: { getAuthRecord: vi.fn(async () => ({ clientId: 'client-1', clientSecret: 'secret', broadcasterId: 'channel-1', accessToken: 'access', refreshToken: 'refresh' })) },
      authRuntimeFactory: vi.fn(async () => ({ status: 'connected', provider: {}, stop: vi.fn() })),
      apiFactory: vi.fn(() => ({})), adapterFactory, eventSubRuntimeFactory,
      reconcilerFactory: vi.fn(() => ({ run: vi.fn(async () => ({ status: 'complete' })) })),
      setTimeoutImpl: (callback, delay) => { timeoutCallbacks.push({ callback, delay }); return timeoutCallbacks.length; },
      clearTimeoutImpl: vi.fn(), random: () => 0.5,
    });
    await integration.ready;
    expect(integration.status).toBe('retrying');
    expect(timeoutCallbacks[0].delay).toBe(5_000);
    await timeoutCallbacks[0].callback();
    await integration.ready;
    expect(eventSubRuntimeFactory).toHaveBeenCalledOnce();
    expect(integration.status).toBe('connecting');
    integration.stop();
  });

  it('requires OAuth reconnection when Channel Points returns an authorization denial', async () => {
    const markReconnectRequired = vi.fn(async () => undefined);
    const eventSubRuntimeFactory = vi.fn();
    const integration = await createTwitchIntegration({
      credentialRepository: {
        getAuthRecord: vi.fn(async () => ({ clientId: 'client-1', clientSecret: 'secret', broadcasterId: 'channel-1', accessToken: 'access', refreshToken: 'refresh' })),
        markReconnectRequired,
      },
      authRuntimeFactory: vi.fn(async () => ({ status: 'connected', provider: {}, stop: vi.fn() })),
      apiFactory: vi.fn(() => ({})),
      adapterFactory: vi.fn(() => ({ getChannelEligibility: vi.fn(async () => ({ eligible: false, broadcasterType: 'affiliate', reason: 'authorization_required' })), ping: vi.fn() })),
      eventSubRuntimeFactory,
    });
    await integration.ready;
    expect(integration.status).toBe('reconnect_required');
    expect(markReconnectRequired).toHaveBeenCalledWith('client-1');
    expect(eventSubRuntimeFactory).not.toHaveBeenCalled();
    integration.stop();
  });

  it('refreshes a rejected Helix access token and retries eligibility before requesting OAuth', async () => {
    let validationCallback;
    const getChannelEligibility = vi.fn()
      .mockResolvedValueOnce({ eligible: false, broadcasterType: 'affiliate', reason: 'access_token_invalid' })
      .mockResolvedValueOnce({ eligible: true, broadcasterType: 'affiliate', channelPointsAvailable: true });
    const eventSubRuntimeFactory = vi.fn(() => ({ stop: vi.fn() }));
    const integration = await createTwitchIntegration({
      credentialRepository: { getAuthRecord: vi.fn(async () => ({ clientId: 'client-1', clientSecret: 'secret', broadcasterId: 'channel-1', accessToken: 'access', refreshToken: 'refresh' })), markReconnectRequired: vi.fn() },
      authRuntimeFactory: vi.fn(async () => {
        validationCallback = vi.fn(async () => true);
        return { status: 'connected', provider: {}, validateNow: validationCallback, stop: vi.fn() };
      }),
      apiFactory: vi.fn(() => ({})),
      adapterFactory: vi.fn(() => ({ getChannelEligibility, ping: vi.fn(async () => true) })),
      eventSubRuntimeFactory,
      reconcilerFactory: vi.fn(() => ({ run: vi.fn(async () => ({ status: 'complete' })) })),
    });
    await integration.ready;
    expect(validationCallback).toHaveBeenCalledOnce();
    expect(getChannelEligibility).toHaveBeenCalledTimes(2);
    expect(eventSubRuntimeFactory).toHaveBeenCalledOnce();
    expect(integration.status).toBe('connecting');
    integration.stop();
  });

  it('restarts EventSub after startup socket exhaustion while preserving the local runtime', async () => {
    const timeoutCallbacks = [];
    const listenerOptions = [];
    const authRuntimeFactory = vi.fn(async () => ({ status: 'connected', provider: {}, stop: vi.fn() }));
    const integration = await createTwitchIntegration({
      credentialRepository: { getAuthRecord: vi.fn(async () => ({ clientId: 'client-1', clientSecret: 'secret', broadcasterId: 'channel-1', accessToken: 'access', refreshToken: 'refresh' })) },
      authRuntimeFactory,
      apiFactory: vi.fn(() => ({})),
      adapterFactory: vi.fn(() => ({
        getChannelEligibility: vi.fn(async () => ({ eligible: true, broadcasterType: 'affiliate' })),
        ping: vi.fn(async () => true),
      })),
      eventSubRuntimeFactory: vi.fn((options) => { listenerOptions.push(options); return { stop: vi.fn() }; }),
      reconcilerFactory: vi.fn(() => ({ run: vi.fn(async () => ({ status: 'complete' })) })),
      setTimeoutImpl: (callback, delay) => { timeoutCallbacks.push({ callback, delay }); return timeoutCallbacks.length; },
      clearTimeoutImpl: vi.fn(), random: () => 0.5,
    });
    await integration.ready;
    listenerOptions[0].onDisconnect({ established: false });
    expect(integration.status).toBe('retrying');
    expect(timeoutCallbacks[0].delay).toBe(5_000);
    await timeoutCallbacks[0].callback();
    await integration.ready;
    expect(authRuntimeFactory).toHaveBeenCalledTimes(2);
    expect(listenerOptions).toHaveLength(2);
    listenerOptions[1].onDisconnect({ established: false });
    expect(timeoutCallbacks[1].delay).toBe(10_000);
    integration.stop();
  });

  it('leaves retrying after scheduled token validation recovers only when EventSub is ready', async () => {
    let authCallbacks;
    const h = harness();
    h.authRuntimeFactory.mockImplementation(async (options) => {
      authCallbacks = options;
      return h.authRuntime;
    });
    const integration = await h.integrationPromise;
    await integration.ready;
    authCallbacks.onTransientFailure({ reason: 'token_validation_unavailable' });
    expect(integration.status).toBe('retrying');
    authCallbacks.onRecovered();
    await integration.ready;
    expect(integration.status).toBe('connecting');
    await h.callbacks.onReady();
    authCallbacks.onTransientFailure({ reason: 'token_validation_unavailable' });
    authCallbacks.onRecovered();
    expect(integration.status).toBe('connected');
    integration.stop();
  });

  it('starts a session-bound follower authorization without saving staged policy before callback', async () => {
    const oauthStateStore = { issue: vi.fn(() => ({ state: 'opaque-state', url: 'https://id.twitch.tv/oauth2/authorize?state=opaque-state' })) };
    const credentialRepository = {
      getAuthRecord: vi.fn(async () => ({ clientId: 'client-1', clientSecret: 'secret', broadcasterId: 'channel-1' })),
      getPublicStatus: vi.fn(async () => ({})),
    };
    const integration = await createTwitchIntegration({ credentialRepository, oauthStateStore, redirectUri: 'https://localhost:3000/callback' });
    await expect(integration.beginFollowerAuthorization({ sessionId: 'session-1', expectedVersion: 4,
      policies: { 'queue:lista': { mode: 'minimum_role', minimumRole: 'follower' } } }))
      .resolves.toEqual({ state: 'opaque-state', url: 'https://id.twitch.tv/oauth2/authorize?state=opaque-state' });
    expect(oauthStateStore.issue).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1', clientId: 'client-1', redirectUri: 'https://localhost:3000/callback',
      scopes: ['moderator:read:followers'], context: expect.objectContaining({ kind: 'follower_policy', expectedVersion: 4 }),
    }));
    expect(credentialRepository.storeTokens).toBeUndefined();
    integration.stop();
  });

  it('commits the staged follower policy with OAuth tokens only after validated callback', async () => {
    const credentialRepository = {
      getAuthRecord: vi.fn(async () => ({ clientId: 'client-1', clientSecret: 'secret', broadcasterId: null })),
      getPublicStatus: vi.fn(async () => ({})),
      assertCanBind: vi.fn(async () => undefined),
      storeTokens: vi.fn(async (tokens) => { await tokens.commitAdditional({ tx: 'same-transaction' }); }),
    };
    const repository = { updateCommandPoliciesInTransaction: vi.fn(async () => undefined) };
    const oauthStateStore = {
      take: vi.fn(() => ({ clientId: 'client-1', redirectUri: 'https://localhost:3000/callback',
        scopes: ['channel:manage:redemptions', 'user:read:chat', 'user:write:chat', 'moderator:read:followers'],
        context: { kind: 'follower_policy', expectedVersion: 4, policies: { 'queue:lista': { mode: 'minimum_role', minimumRole: 'follower' } } } })),
    };
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }) }));
    const integration = await createTwitchIntegration({ credentialRepository, repository, oauthStateStore, fetchImpl,
      validateOAuthToken: async () => ({ clientId: 'client-1', userId: 'channel-1', login: 'channel', displayName: 'Channel',
        scopes: ['channel:manage:redemptions', 'user:read:chat', 'user:write:chat', 'moderator:read:followers'] }) });
    await expect(integration.completeAuthorization({ sessionId: 'session-1', state: 'state', code: 'code' }))
      .resolves.toMatchObject({ broadcasterId: 'channel-1', displayName: 'Channel' });
    expect(credentialRepository.storeTokens).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'client-1', broadcasterId: 'channel-1', accessToken: 'access', refreshToken: 'refresh',
      authorizationContext: expect.objectContaining({ kind: 'follower_policy' }),
      commitAdditional: expect.any(Function),
    }));
    expect(repository.updateCommandPoliciesInTransaction).toHaveBeenCalledWith({ tx: 'same-transaction' }, expect.objectContaining({
      expectedVersion: 4, actorId: 'session-1', origin: 'oauth_follower_consent',
    }));
    integration.stop();
  });

  it('stays available but unconfigured without credentials', async () => {
    const h = harness({ credential: null });
    const integration = await h.integrationPromise;
    expect(integration.status).toBe('not_configured');
    expect(h.eventSubRuntimeFactory).not.toHaveBeenCalled();
  });

  it('does not retry while a Twitch app is saved but the channel has not completed OAuth', async () => {
    const authRuntimeFactory = vi.fn();
    const setTimeoutImpl = vi.fn();
    const integration = await createTwitchIntegration({
      credentialRepository: { getAuthRecord: vi.fn(async () => ({ clientId: 'client-1', clientSecret: 'saved-secret', broadcasterId: null, accessToken: null, refreshToken: null })) },
      authRuntimeFactory, setTimeoutImpl,
    });
    await integration.ready;
    expect(integration.status).toBe('not_configured');
    expect(authRuntimeFactory).not.toHaveBeenCalled();
    expect(setTimeoutImpl).not.toHaveBeenCalled();
    integration.stop();
  });

  it('requires Affiliate or Partner eligibility before opening reward/chat EventSub', async () => {
    const h = harness({ eligible: false });
    const integration = await h.integrationPromise;
    await integration.ready;
    expect(integration.status).toBe('ineligible');
    expect(h.eventSubRuntimeFactory).not.toHaveBeenCalled();
    await expect(integration.probeTwitchApi()).resolves.toBe(true);
    expect(h.adapterFactory).toHaveBeenCalledOnce();
    integration.stop();
    expect(h.authRuntime.stop).toHaveBeenCalledOnce();
  });

  it('starts observation before reconciliation, reconciles after readiness/reconnect and shuts down cleanly', async () => {
    const h = harness();
    const integration = await h.integrationPromise;
    await integration.ready;
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

  it('exposes operator reconciliation and coalesces overlapping requests', async () => {
    const h = harness();
    const integration = await h.integrationPromise;
    await integration.ready;
    let resolveRun;
    h.reconciler.run.mockImplementationOnce(() => new Promise((resolve) => { resolveRun = resolve; }));
    const first = integration.reconcileNow();
    const second = integration.reconcileNow();
    expect(h.reconciler.run).toHaveBeenCalledTimes(1);
    resolveRun({ status: 'complete', imported: 1, issues: [] });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'complete', imported: 1, issues: [] }, { status: 'complete', imported: 1, issues: [] },
    ]);
    expect(integration.status).toBe('connected');
    integration.stop();
  });

  it('exposes a safe Twitch API probe only after an eligible authenticated adapter is ready', async () => {
    const h = harness();
    const integration = await h.integrationPromise;
    await integration.ready;
    await expect(integration.probeTwitchApi()).resolves.toBe(true);
    expect(h.adapterFactory).toHaveBeenCalledOnce();
  });
});
