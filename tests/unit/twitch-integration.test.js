import { describe, expect, it, vi } from 'vitest';
import { createTwitchIntegration } from '../../apps/api/src/twitch/integration.mjs';
import { createCredentialFingerprint } from '../../apps/api/src/twitch/credential-fingerprint.mjs';

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
  const logEvent = vi.fn();
  const timers = [];
  const integrationPromise = createTwitchIntegration({
    credentialRepository: {
      getAuthRecord: vi.fn(async () => credential),
      getPublicStatus: vi.fn(async () => ({ connected: Boolean(credential), clientId: credential?.clientId ?? null, secretConfigured: Boolean(credential) })),
    },
    authRuntimeFactory, apiFactory, adapterFactory, eventSubRuntimeFactory, reconcilerFactory,
    onStatus, logEvent, setIntervalImpl: (handler, delay) => { timers.push({ handler, delay }); return timers.length; },
    clearIntervalImpl: vi.fn(),
  });
  return { integrationPromise, listener, authRuntime, authRuntimeFactory, apiFactory, adapterFactory, eventSubRuntimeFactory, reconcilerFactory, callbacks, reconciler, onStatus, logEvent, timers };
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

  it('exposes the active Twitch adapter to durable outbox workers after initialization', async () => {
    const h = harness();
    const integration = await h.integrationPromise;
    await integration.ready;

    expect(integration.twitch).toBe(h.adapterFactory.mock.results[0].value);

    await integration.stop();
    expect(integration.twitch).toBeNull();
  });

  it('tracks the last completed reconciliation timestamp in memory for runtime health', async () => {
    const h = harness();
    const integration = await h.integrationPromise;
    await integration.ready;
    h.reconciler.run.mockResolvedValue({ status: 'complete', finishedAt: '2026-10-15T18:00:00.000Z' });

    expect(integration.lastReconciliationAt).toBeNull();
    await h.callbacks.onReady();
    expect(integration.lastReconciliationAt).toBe('2026-10-15T18:00:00.000Z');
    await integration.stop();
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
    const authRecord = { id: 'credential-1', clientId: 'client-1', clientSecret: 'secret', broadcasterId: 'channel-1',
      accessToken: 'access-1', refreshToken: 'refresh-1', scopes: ['user:read:chat'], authStatus: 'connected',
      updatedAt: new Date('2026-10-15T12:00:00.000Z') };
    const credentialRepository = {
      getAuthRecord: vi.fn(async () => authRecord),
      getPublicStatus: vi.fn(async () => ({})),
    };
    const integration = await createTwitchIntegration({ credentialRepository, oauthStateStore, redirectUri: 'https://localhost:3000/callback' });
    await expect(integration.beginFollowerAuthorization({ sessionId: 'session-1', expectedVersion: 4,
      policies: { 'queue:lista': { minimumRole: 'follower' } } }))
      .resolves.toEqual({ state: 'opaque-state', url: 'https://id.twitch.tv/oauth2/authorize?state=opaque-state' });
    expect(oauthStateStore.issue).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1', clientId: 'client-1', redirectUri: 'https://localhost:3000/callback',
      scopes: ['moderator:read:followers'], context: expect.objectContaining({
        kind: 'follower_policy', expectedVersion: 4,
        expectedCredentialFingerprint: createCredentialFingerprint(authRecord),
      }),
    }));
    const authorizationState = oauthStateStore.issue.mock.calls[0][0];
    expect(JSON.stringify(authorizationState)).not.toContain('secret');
    expect(JSON.stringify(authorizationState)).not.toContain('access-1');
    expect(credentialRepository.storeTokens).toBeUndefined();
    integration.stop();
  });

  it('captures the current credential generation for regular OAuth reconnects too', async () => {
    const authRecord = { id: 'credential-regular', clientId: 'client-1', clientSecret: 'private-secret', broadcasterId: 'channel-1',
      accessToken: 'private-access', refreshToken: 'private-refresh', scopes: ['user:read:chat'], authStatus: 'connected',
      updatedAt: new Date('2026-10-15T12:00:00.000Z') };
    const oauthStateStore = { issue: vi.fn(() => ({ state: 'regular-state', url: 'https://id.twitch.tv/oauth2/authorize' })) };
    const credentialRepository = { getAuthRecord: vi.fn(async () => authRecord) };
    const integration = await createTwitchIntegration({ credentialRepository, oauthStateStore });

    await integration.beginAuthorization('session-1');

    expect(oauthStateStore.issue).toHaveBeenCalledWith(expect.objectContaining({
      context: { kind: 'account_authorization', expectedCredentialFingerprint: createCredentialFingerprint(authRecord) },
    }));
    expect(JSON.stringify(oauthStateStore.issue.mock.calls[0][0])).not.toContain('private-secret');
    expect(JSON.stringify(oauthStateStore.issue.mock.calls[0][0])).not.toContain('private-access');
    integration.stop();
  });

  it('commits the staged follower policy with OAuth tokens only after validated callback', async () => {
    const authRecord = { id: 'credential-1', clientId: 'client-1', clientSecret: 'secret', broadcasterId: null,
      accessToken: null, refreshToken: null, scopes: [], authStatus: 'pending', updatedAt: new Date('2026-10-15T12:00:00.000Z') };
    const credentialRepository = {
      getAuthRecord: vi.fn(async () => authRecord),
      getPublicStatus: vi.fn(async () => ({})),
      assertCanBind: vi.fn(async () => undefined),
      storeTokens: vi.fn(async (tokens) => { await tokens.commitAdditional({ tx: 'same-transaction' }); }),
    };
    const repository = { updateCommandPoliciesInTransaction: vi.fn(async () => undefined) };
    const oauthStateStore = {
      take: vi.fn(() => ({ clientId: 'client-1', redirectUri: 'https://localhost:3000/callback',
        scopes: ['channel:manage:redemptions', 'user:read:chat', 'user:write:chat', 'moderator:read:followers'],
        context: { kind: 'follower_policy', expectedVersion: 4, policies: { 'queue:lista': { minimumRole: 'follower' } },
          expectedCredentialFingerprint: createCredentialFingerprint(authRecord) } })),
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
      expectedCredentialFingerprint: createCredentialFingerprint(authRecord),
      commitAdditional: expect.any(Function),
    }));
    expect(repository.updateCommandPoliciesInTransaction).toHaveBeenCalledWith({ tx: 'same-transaction' }, expect.objectContaining({
      expectedVersion: 4, actorId: 'session-1', origin: 'oauth_follower_consent',
    }));
    integration.stop();
  });

  it('stores exact scopes from scope-only OAuth without writing command policy or audit changes', async () => {
    const authRecord = { id: 'credential-scope', clientId: 'client-1', clientSecret: 'secret', broadcasterId: null,
      accessToken: null, refreshToken: null, scopes: [], authStatus: 'pending', updatedAt: new Date('2026-10-15T12:00:00.000Z') };
    const credentialRepository = {
      getAuthRecord: vi.fn(async () => authRecord),
      assertCanBind: vi.fn(async () => undefined),
      storeTokens: vi.fn(async () => undefined),
    };
    const repository = { updateCommandPoliciesInTransaction: vi.fn() };
    const oauthStateStore = { take: vi.fn(() => ({
      clientId: 'client-1', redirectUri: 'https://localhost:3000/callback',
      scopes: ['channel:manage:redemptions', 'user:read:chat', 'user:write:chat', 'moderator:read:followers'],
      context: { kind: 'follower_scope', expectedCredentialFingerprint: createCredentialFingerprint(authRecord) },
    })) };
    const integration = await createTwitchIntegration({ credentialRepository, repository, oauthStateStore,
      fetchImpl: vi.fn(async () => ({ ok: true, json: async () => ({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }) })),
      validateOAuthToken: async () => ({ clientId: 'client-1', userId: 'channel-1', login: 'channel', displayName: 'Channel',
        scopes: ['channel:manage:redemptions', 'user:read:chat', 'user:write:chat', 'moderator:read:followers'] }),
    });

    await integration.completeAuthorization({ sessionId: 'session-1', state: 'state', code: 'code' });

    expect(credentialRepository.storeTokens).toHaveBeenCalledWith(expect.objectContaining({
      scopes: ['channel:manage:redemptions', 'user:read:chat', 'user:write:chat', 'moderator:read:followers'],
      expectedCredentialFingerprint: createCredentialFingerprint(authRecord),
      commitAdditional: undefined,
    }));
    expect(repository.updateCommandPoliciesInTransaction).not.toHaveBeenCalled();
    integration.stop();
  });

  it('preserves the safe stale-credential conflict from the token repository', async () => {
    const authRecord = { id: 'credential-stale', clientId: 'client-1', clientSecret: 'secret', broadcasterId: null,
      accessToken: null, refreshToken: null, scopes: [], authStatus: 'pending', updatedAt: new Date('2026-10-15T12:00:00.000Z') };
    const credentialRepository = {
      getAuthRecord: vi.fn(async () => authRecord),
      assertCanBind: vi.fn(async () => undefined),
      storeTokens: vi.fn(async () => { throw Object.assign(new Error('stale OAuth credential'), { code: 'OAUTH_CREDENTIAL_STALE' }); }),
    };
    const oauthStateStore = { take: vi.fn(() => ({
      clientId: 'client-1', redirectUri: 'https://localhost:3000/callback', scopes: [],
      context: { kind: 'account_authorization', expectedCredentialFingerprint: createCredentialFingerprint(authRecord) },
    })) };
    const integration = await createTwitchIntegration({ credentialRepository, oauthStateStore,
      fetchImpl: vi.fn(async () => ({ ok: true, json: async () => ({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }) })),
      validateOAuthToken: async () => ({ clientId: 'client-1', userId: 'channel-1', login: 'channel', displayName: 'Channel', scopes: [] }),
    });

    await expect(integration.completeAuthorization({ sessionId: 'session-1', state: 'state', code: 'code' }))
      .rejects.toMatchObject({ code: 'OAUTH_CREDENTIAL_STALE' });
    expect(credentialRepository.storeTokens).toHaveBeenCalledWith(expect.objectContaining({
      expectedCredentialFingerprint: createCredentialFingerprint(authRecord),
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

  it('starts chat EventSub without reward processing when Channel Points capability is unavailable', async () => {
    const h = harness({ eligible: false });
    const integration = await h.integrationPromise;
    await integration.ready;
    expect(integration.status).toBe('ineligible');
    expect(integration.chatStatus).toBe('connecting');
    expect(h.eventSubRuntimeFactory).toHaveBeenCalledWith(expect.objectContaining({ redemptionsEnabled: false }));
    expect(h.reconcilerFactory).not.toHaveBeenCalled();
    await expect(integration.probeTwitchApi()).resolves.toBe(true);
    expect(h.adapterFactory).toHaveBeenCalledOnce();
    await h.callbacks.onReady();
    expect(integration.status).toBe('ineligible');
    expect(integration.chatStatus).toBe('connected');
    h.callbacks.onRevoked('channel.channel_points_custom_reward_redemption.add', 'authorization_revoked');
    expect(integration.chatStatus).toBe('connected');
    expect(integration.rewardStatus).toBe('reconnect_required');
    expect(h.listener.stop).not.toHaveBeenCalled();
    integration.stop();
    expect(h.authRuntime.stop).toHaveBeenCalledOnce();
  });

  it('keeps chat available when Twitch denies the Channel Points capability probe', async () => {
    const h = harness();
    h.adapterFactory.mockImplementation(() => ({
      getChannelEligibility: vi.fn(async () => ({
        eligible: false, broadcasterType: 'unknown', channelPointsAvailable: false, reason: 'channel_ineligible',
      })),
      ping: vi.fn(async () => true),
    }));
    const integration = await h.integrationPromise;
    await integration.ready;

    expect(integration.status).toBe('ineligible');
    expect(integration.rewardStatus).toBe('unsupported');
    expect(integration.chatStatus).toBe('connecting');
    expect(h.eventSubRuntimeFactory).toHaveBeenCalledWith(expect.objectContaining({ redemptionsEnabled: false }));
    expect(h.reconcilerFactory).not.toHaveBeenCalled();
    integration.stop();
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

  it('logs why a partial reconciliation publishes degraded, with codes and counts only (OPS-22 FT-24 AC 5)', async () => {
    const h = harness();
    const integration = await h.integrationPromise;
    await integration.ready;
    h.reconciler.run.mockResolvedValueOnce({ status: 'partial', finishedAt: new Date('2026-10-27T12:00:00Z'), issues: [
      { queueId: 'queue-1', redemptionId: 'fixture-redemption-1', code: 'redemption_verification_failed', httpStatus: 401 },
      { queueId: 'queue-1', redemptionId: 'fixture-redemption-2', code: 'redemption_verification_failed', httpStatus: 401 },
      { queueId: 'queue-2', code: 'reward_configuration_mismatch' },
    ] });
    await integration.reconcileNow();
    expect(integration.status).toBe('degraded');
    expect(h.logEvent).toHaveBeenCalledWith({
      event: 'twitch_reconciliation_degraded', level: 'warn', source: 'twitch.reconciliation',
      details: {
        trigger: 'operator', reason: 'reconciliation_partial', issueCount: 3,
        issueCounts: { redemption_verification_failed: 2, reward_configuration_mismatch: 1 },
        httpStatusCounts: { 401: 2 },
      },
    });
    expect(JSON.stringify(h.logEvent.mock.calls)).not.toMatch(/fixture-redemption|queue-1|queue-2|access-token|refresh-token|client-1/);
    integration.stop();
  });

  it('logs a failed reconciliation with its reason and HTTP status but no error message', async () => {
    const h = harness();
    const integration = await h.integrationPromise;
    await integration.ready;
    h.reconciler.run.mockRejectedValueOnce(Object.assign(new Error('sensitive helix body access-token'), { statusCode: 503 }));
    await integration.reconcileNow();
    expect(integration.status).toBe('degraded');
    expect(h.logEvent).toHaveBeenCalledWith({
      event: 'twitch_reconciliation_degraded', level: 'warn', source: 'twitch.reconciliation', statusCode: 503,
      details: { trigger: 'operator', reason: 'reconciliation_failed', issueCount: 1, issueCounts: { reconciliation_failed: 1 } },
    });
    expect(JSON.stringify(h.logEvent.mock.calls)).not.toMatch(/sensitive|access-token/);
    integration.stop();
  });

  it('does not log a degraded line for a complete reconciliation', async () => {
    const h = harness();
    const integration = await h.integrationPromise;
    await integration.ready;
    h.logEvent.mockClear();
    h.reconciler.run.mockResolvedValueOnce({ status: 'complete', issues: [] });
    await integration.reconcileNow();
    expect(h.logEvent).not.toHaveBeenCalledWith(expect.objectContaining({ event: 'twitch_reconciliation_degraded' }));
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
