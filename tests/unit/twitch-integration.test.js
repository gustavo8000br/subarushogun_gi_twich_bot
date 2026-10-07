import { describe, expect, it, vi } from 'vitest';
import { createTwitchIntegration } from '../../apps/api/src/twitch/integration.mjs';

function harness({ credential = { clientId: 'client-1', broadcasterId: 'channel-1' }, eligible = true } = {}) {
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

  it('requires Affiliate or Partner eligibility before opening reward/chat EventSub', async () => {
    const h = harness({ eligible: false });
    const integration = await h.integrationPromise;
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
    await expect(integration.probeTwitchApi()).resolves.toBe(true);
    expect(h.adapterFactory).toHaveBeenCalledOnce();
  });
});
