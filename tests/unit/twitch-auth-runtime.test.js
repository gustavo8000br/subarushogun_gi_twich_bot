import { describe, expect, it, vi } from 'vitest';
import { InvalidTokenError } from '@twurple/auth';
import { createRefreshingAuthRuntime } from '../../apps/api/src/twitch/auth-runtime.mjs';

function providerFake() {
  const handlers = {};
  return {
    handlers,
    addUser: vi.fn(),
    getAccessTokenForUser: vi.fn(async () => ({ accessToken: 'access-token' })),
    refreshAccessTokenForUser: vi.fn(async () => {
      const token = { accessToken: 'rotated-access', refreshToken: 'rotated-refresh', scope: credential.scopes,
        expiresIn: 3600, obtainmentTimestamp: 12345 };
      await handlers.refresh?.('channel-1', token);
      return token;
    }),
    onRefresh: (handler) => { handlers.refresh = handler; },
    onRefreshFailure: (handler) => { handlers.failure = handler; },
  };
}

const credential = {
  clientId: 'client-1', clientSecret: 'private-secret', broadcasterId: 'channel-1',
  accessToken: 'access-token', refreshToken: 'refresh-token', scopes: ['channel:manage:redemptions', 'user:read:chat', 'user:write:chat'],
  tokenExpiresAt: new Date('2026-10-03T13:00:00Z'), authStatus: 'connected',
};

describe('Twitch refreshing auth runtime', () => {
  it('validates account/client/scopes at startup and persists each token refresh', async () => {
    const provider = providerFake();
    const storeTokens = vi.fn(async () => undefined);
    const credentialRepository = { storeTokens, markReconnectRequired: vi.fn() };
    const runtime = await createRefreshingAuthRuntime({
      credential, credentialRepository, providerFactory: () => provider,
      validateToken: vi.fn(async () => ({
        clientId: 'client-1', userId: 'channel-1', scopes: credential.scopes,
      })),
      clock: () => new Date('2026-10-03T12:00:00Z'),
    });
    expect(runtime.status).toBe('connected');
    expect(provider.addUser).toHaveBeenCalledWith('channel-1', expect.objectContaining({
      accessToken: 'access-token', refreshToken: 'refresh-token', scope: credential.scopes,
    }));
    await provider.handlers.refresh('channel-1', {
      accessToken: 'rotated-access', refreshToken: 'rotated-refresh', scope: credential.scopes,
      expiresIn: 3600, obtainmentTimestamp: 12345,
    });
    expect(storeTokens).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'client-1', broadcasterId: 'channel-1', accessToken: 'rotated-access', refreshToken: 'rotated-refresh',
    }));
    runtime.stop();
  });

  it('marks authorization for reconnection only when the saved refresh token is definitively rejected', async () => {
    const markReconnectRequired = vi.fn();
    const provider = providerFake();
    provider.refreshAccessTokenForUser.mockRejectedValue(Object.assign(new Error('sensitive refresh error'), {
      statusCode: 401, url: 'https://id.twitch.tv/oauth2/token',
    }));
    const runtime = await createRefreshingAuthRuntime({
      credential, credentialRepository: { storeTokens: vi.fn(), markReconnectRequired },
      validateToken: async () => { throw new InvalidTokenError(); },
      providerFactory: () => provider,
    });
    expect(runtime.status).toBe('reconnect_required');
    expect(markReconnectRequired).toHaveBeenCalledWith('client-1');
  });

  it('waits for reconnect-required persistence when Twurple reports a rejected refresh callback', async () => {
    let resolveMark;
    let markSettled = false;
    const markReconnectRequired = vi.fn(() => new Promise((resolve) => {
      resolveMark = () => { markSettled = true; resolve(); };
    }));
    const provider = providerFake();
    const rejection = Object.assign(new Error('private token response'), {
      statusCode: 401, url: 'https://id.twitch.tv/oauth2/token',
    });
    provider.refreshAccessTokenForUser.mockImplementationOnce(async () => {
      provider.handlers.failure('channel-1', rejection);
      throw rejection;
    });
    const runtimePromise = createRefreshingAuthRuntime({
      credential, credentialRepository: { storeTokens: vi.fn(), markReconnectRequired },
      validateToken: async () => { throw new InvalidTokenError(); },
      providerFactory: () => provider,
    });
    let runtimeSettled = false;
    void runtimePromise.then(() => { runtimeSettled = true; });
    await vi.waitFor(() => expect(markReconnectRequired).toHaveBeenCalledWith('client-1'));
    expect(markSettled).toBe(false);
    expect(runtimeSettled).toBe(false);
    resolveMark();
    const runtime = await runtimePromise;
    expect(runtime.status).toBe('reconnect_required');
  });

  it('keeps saved credentials recoverable when startup validation fails transiently', async () => {
    const markReconnectRequired = vi.fn();
    const runtime = await createRefreshingAuthRuntime({
      credential, credentialRepository: { storeTokens: vi.fn(), markReconnectRequired },
      validateToken: async () => { throw new TypeError('fetch failed'); },
      providerFactory: () => providerFake(),
    });

    expect(runtime.status).toBe('degraded');
    expect(runtime.provider).toBeNull();
    expect(markReconnectRequired).not.toHaveBeenCalled();
  });

  it('refreshes an invalid access token with saved authorization before requesting new consent', async () => {
    const provider = providerFake();
    const storeTokens = vi.fn(async () => undefined);
    const validateToken = vi.fn()
      .mockRejectedValueOnce(new InvalidTokenError())
      .mockResolvedValueOnce({ clientId: 'client-1', userId: 'channel-1', scopes: credential.scopes });
    const runtime = await createRefreshingAuthRuntime({
      credential, credentialRepository: { storeTokens, markReconnectRequired: vi.fn() },
      validateToken, providerFactory: () => provider,
    });

    expect(runtime.status).toBe('connected');
    expect(provider.refreshAccessTokenForUser).toHaveBeenCalledWith('channel-1');
    expect(storeTokens).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'client-1', broadcasterId: 'channel-1', accessToken: 'rotated-access', refreshToken: 'rotated-refresh',
    }));
    expect(validateToken).toHaveBeenLastCalledWith('rotated-access', 'client-1');
    runtime.stop();
  });

  it('retries transient hourly validation failures without marking saved authorization lost', async () => {
    const provider = providerFake();
    const markReconnectRequired = vi.fn();
    const intervalCallbacks = [];
    const timeoutCallbacks = [];
    const clearTimeoutImpl = vi.fn();
    const onTransientFailure = vi.fn();
    const onRecovered = vi.fn();
    const validateToken = vi.fn()
      .mockResolvedValueOnce({ clientId: 'client-1', userId: 'channel-1', scopes: credential.scopes })
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce({ clientId: 'client-1', userId: 'channel-1', scopes: credential.scopes });
    const runtime = await createRefreshingAuthRuntime({
      credential, credentialRepository: { storeTokens: vi.fn(), markReconnectRequired },
      validateToken, providerFactory: () => provider,
      setIntervalImpl: (callback) => { intervalCallbacks.push(callback); return intervalCallbacks.length; },
      clearIntervalImpl: vi.fn(),
      setTimeoutImpl: (callback, delay) => { timeoutCallbacks.push({ callback, delay }); return timeoutCallbacks.length; },
      clearTimeoutImpl, random: () => 0.5, onTransientFailure, onRecovered,
    });

    await intervalCallbacks[0]();
    expect(runtime.status).toBe('connected');
    expect(markReconnectRequired).not.toHaveBeenCalled();
    expect(onTransientFailure).toHaveBeenCalledWith({ reason: 'token_validation_unavailable', providerMustBeRebuilt: false });
    expect(timeoutCallbacks[0].delay).toBe(5_000);

    await timeoutCallbacks[0].callback();
    expect(markReconnectRequired).not.toHaveBeenCalled();
    expect(onRecovered).toHaveBeenCalledOnce();
    runtime.stop();
    expect(clearTimeoutImpl).not.toHaveBeenCalled();
  });

  it('keeps jittered hourly retries at or below the 300-second maximum', async () => {
    const intervalCallbacks = [];
    const timeoutCallbacks = [];
    const validateToken = vi.fn()
      .mockResolvedValueOnce({ clientId: 'client-1', userId: 'channel-1', scopes: credential.scopes })
      .mockRejectedValue(new TypeError('temporary network outage'));
    const runtime = await createRefreshingAuthRuntime({
      credential, credentialRepository: { storeTokens: vi.fn(), markReconnectRequired: vi.fn() },
      validateToken, providerFactory: () => providerFake(),
      setIntervalImpl: (callback) => { intervalCallbacks.push(callback); return intervalCallbacks.length; },
      clearIntervalImpl: vi.fn(),
      setTimeoutImpl: (callback, delay) => { timeoutCallbacks.push({ callback, delay }); return timeoutCallbacks.length; },
      clearTimeoutImpl: vi.fn(), random: () => 0.999,
    });

    for (let attempt = 0; attempt < 7; attempt += 1) {
      if (attempt === 0) await intervalCallbacks[0]();
      else await timeoutCallbacks[attempt - 1].callback();
    }

    expect(timeoutCallbacks.at(-1).delay).toBeLessThanOrEqual(300_000);
    runtime.stop();
  });

  it('rebuilds the refresh provider after a transient hourly refresh failure', async () => {
    const providers = [providerFake(), providerFake()];
    providers[0].refreshAccessTokenForUser.mockRejectedValueOnce(Object.assign(new Error('temporary outage'), {
      statusCode: 503, url: 'https://id.twitch.tv/oauth2/token',
    }));
    const providerFactory = vi.fn(() => providers.shift());
    const intervalCallbacks = [];
    const timeoutCallbacks = [];
    const validateToken = vi.fn()
      .mockResolvedValueOnce({ clientId: 'client-1', userId: 'channel-1', scopes: credential.scopes })
      .mockRejectedValueOnce(new InvalidTokenError())
      .mockResolvedValueOnce({ clientId: 'client-1', userId: 'channel-1', scopes: credential.scopes });
    const runtime = await createRefreshingAuthRuntime({
      credential, credentialRepository: { storeTokens: vi.fn(), markReconnectRequired: vi.fn() },
      validateToken, providerFactory,
      setIntervalImpl: (callback) => { intervalCallbacks.push(callback); return intervalCallbacks.length; },
      clearIntervalImpl: vi.fn(),
      setTimeoutImpl: (callback) => { timeoutCallbacks.push(callback); return timeoutCallbacks.length; },
      clearTimeoutImpl: vi.fn(), random: () => 0.5,
    });

    await intervalCallbacks[0]();
    expect(timeoutCallbacks).toHaveLength(1);
    await timeoutCallbacks[0]();

    expect(providerFactory).toHaveBeenCalledTimes(2);
    expect(validateToken).toHaveBeenLastCalledWith('access-token', 'client-1');
    runtime.stop();
  });

  it('rebuilds the provider when access-token acquisition itself cached a transient refresh failure', async () => {
    const providers = [providerFake(), providerFake()];
    providers[0].getAccessTokenForUser.mockRejectedValueOnce(Object.assign(new Error('temporary outage'), {
      statusCode: 503, url: 'https://id.twitch.tv/oauth2/token',
    }));
    const providerFactory = vi.fn(() => providers.shift());
    const intervalCallbacks = [];
    const timeoutCallbacks = [];
    const validateToken = vi.fn().mockResolvedValue({ clientId: 'client-1', userId: 'channel-1', scopes: credential.scopes });
    const runtime = await createRefreshingAuthRuntime({
      credential, credentialRepository: { storeTokens: vi.fn(), markReconnectRequired: vi.fn() },
      validateToken, providerFactory,
      setIntervalImpl: (callback) => { intervalCallbacks.push(callback); return intervalCallbacks.length; },
      clearIntervalImpl: vi.fn(),
      setTimeoutImpl: (callback) => { timeoutCallbacks.push(callback); return timeoutCallbacks.length; },
      clearTimeoutImpl: vi.fn(), random: () => 0.5,
    });

    await intervalCallbacks[0]();
    expect(timeoutCallbacks).toHaveLength(1);
    await timeoutCallbacks[0]();
    expect(providerFactory).toHaveBeenCalledTimes(2);
    expect(runtime.status).toBe('connected');
    runtime.stop();
  });

  it('does not activate a token for a different app, channel, or insufficient scopes', async () => {
    const providerFactory = vi.fn(() => providerFake());
    const markReconnectRequired = vi.fn();
    const runtime = await createRefreshingAuthRuntime({
      credential, credentialRepository: { storeTokens: vi.fn(), markReconnectRequired },
      validateToken: async () => ({ clientId: 'other-client', userId: 'other-channel', scopes: [] }),
      providerFactory,
    });
    expect(runtime.status).toBe('reconnect_required');
    expect(providerFactory).not.toHaveBeenCalled();
    expect(markReconnectRequired).toHaveBeenCalledWith('client-1');
  });

  it('defaults the authorization callback to the HTTPS localhost endpoint', async () => {
    const providerFactory = vi.fn(() => providerFake());
    const runtime = await createRefreshingAuthRuntime({
      credential,
      credentialRepository: { storeTokens: vi.fn(), markReconnectRequired: vi.fn() },
      validateToken: async () => ({ clientId: 'client-1', userId: 'channel-1', scopes: credential.scopes }),
      providerFactory,
    });
    expect(providerFactory).toHaveBeenCalledWith(expect.objectContaining({ redirectUri: 'https://localhost:3000/callback' }));
    runtime.stop();
  });
});
