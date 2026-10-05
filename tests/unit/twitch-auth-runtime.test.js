import { describe, expect, it, vi } from 'vitest';
import { createRefreshingAuthRuntime } from '../../apps/api/src/twitch/auth-runtime.mjs';

function providerFake() {
  const handlers = {};
  return {
    handlers,
    addUser: vi.fn(),
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

  it('marks authorization for reconnection when startup token validation fails', async () => {
    const markReconnectRequired = vi.fn();
    const runtime = await createRefreshingAuthRuntime({
      credential, credentialRepository: { storeTokens: vi.fn(), markReconnectRequired },
      validateToken: async () => { throw new Error('sensitive token error'); },
      providerFactory: () => providerFake(),
    });
    expect(runtime.status).toBe('reconnect_required');
    expect(markReconnectRequired).toHaveBeenCalledWith('client-1');
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
