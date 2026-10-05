import { describe, expect, it, vi } from 'vitest';
import { completeOAuthAuthorization, createOAuthStateStore, validateClientCredentials } from '../../apps/api/src/twitch/oauth.mjs';

describe('Twitch OAuth client credential validation', () => {
  it('uses the Client Credentials grant and returns no token or secret', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ access_token: 'temporary-app-token', expires_in: 3600, token_type: 'bearer' }) }));
    const result = await validateClientCredentials({ clientId: 'client-123', clientSecret: 'secret-value', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][0]).toBe('https://id.twitch.tv/oauth2/token');
    expect(fetchImpl.mock.calls[0][1].method).toBe('POST');
    expect(fetchImpl.mock.calls[0][1].body.toString()).toContain('grant_type=client_credentials');
    expect(result).toEqual({ valid: true, clientId: 'client-123' });
    expect(JSON.stringify(result)).not.toContain('temporary-app-token');
    expect(JSON.stringify(result)).not.toContain('secret-value');
  });

  it('rejects failed validation with a sanitized error and no credential text', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({ message: 'secret-value is invalid' }) }));
    await expect(validateClientCredentials({ clientId: 'client-123', clientSecret: 'secret-value', fetchImpl }))
      .rejects.toMatchObject({ code: 'INVALID_TWITCH_CLIENT_CREDENTIALS', message: 'Twitch rejected the application credentials' });
  });

  it('rejects empty credentials before making a request', async () => {
    const fetchImpl = vi.fn();
    await expect(validateClientCredentials({ clientId: '', clientSecret: 'secret-value', fetchImpl }))
      .rejects.toMatchObject({ code: 'INVALID_TWITCH_CLIENT_CREDENTIALS' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('binds short-lived OAuth state to the initiating session and consumes it once', () => {
    let now = new Date('2026-10-03T12:00:00Z');
    let sequence = 0;
    const store = createOAuthStateStore({
      clock: () => now,
      stateFactory: () => `state-${++sequence}`,
    });
    const started = store.issue({
      sessionId: 'session-1', clientId: 'client-123', redirectUri: 'http://localhost:3000/callback',
    });
    expect(started.url).toContain('state=state-1');
    expect(started.url).toContain('channel%3Amanage%3Aredemptions');
    expect(store.consume({ state: started.state, sessionId: 'other-session' })).toBe(false);
    expect(store.consume({ state: started.state, sessionId: 'session-1' })).toBe(true);
    expect(store.consume({ state: started.state, sessionId: 'session-1' })).toBe(false);

    const expiring = store.issue({
      sessionId: 'session-1', clientId: 'client-123', redirectUri: 'http://localhost:3000/callback',
    });
    now = new Date(now.getTime() + 10 * 60 * 1000 + 1);
    expect(store.consume({ state: expiring.state, sessionId: 'session-1' })).toBe(false);
  });

  it('validates token identity/scopes and persists secrets only after a matching OAuth callback', async () => {
    const stateStore = createOAuthStateStore({ stateFactory: () => 'state-flow' });
    const { state } = stateStore.issue({
      sessionId: 'session-1', clientId: 'client-123', redirectUri: 'http://localhost:3000/callback',
    });
    const persistTokens = vi.fn();
    const result = await completeOAuthAuthorization({
      stateStore, sessionId: 'session-1', state, code: 'authorization-code',
      exchangeCode: vi.fn(async (input) => {
        expect(input).toMatchObject({ clientId: 'client-123', redirectUri: 'http://localhost:3000/callback', code: 'authorization-code' });
        return { accessToken: 'access-secret', refreshToken: 'refresh-secret', expiresIn: 3600, obtainmentTimestamp: 123 };
      }),
      validateToken: vi.fn(async () => ({
        clientId: 'client-123', userId: 'broadcaster-1', login: 'streamer', displayName: 'Streamer',
        scopes: ['channel:manage:redemptions', 'user:read:chat', 'user:write:chat'],
      })),
      persistTokens,
    });
    expect(result).toEqual({ broadcasterId: 'broadcaster-1', login: 'streamer', displayName: 'Streamer' });
    expect(persistTokens).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'access-secret', refreshToken: 'refresh-secret' }));
    expect(JSON.stringify(result)).not.toContain('access-secret');
    expect(JSON.stringify(result)).not.toContain('refresh-secret');
  });

  it('rejects mismatched client, broadcaster scopes, or channel binding without saving tokens', async () => {
    const stateStore = createOAuthStateStore({ stateFactory: () => 'state-mismatch' });
    const { state } = stateStore.issue({
      sessionId: 'session-1', clientId: 'configured-client', redirectUri: 'http://localhost:3000/callback',
    });
    const persistTokens = vi.fn();
    await expect(completeOAuthAuthorization({
      stateStore, sessionId: 'session-1', state, code: 'code',
      exchangeCode: async () => ({ accessToken: 'sensitive', refreshToken: 'sensitive', expiresIn: 3600 }),
      validateToken: async () => ({ clientId: 'another-client', userId: 'broadcaster-1', scopes: [] }),
      persistTokens,
    })).rejects.toMatchObject({ code: 'TWITCH_AUTHORIZATION_MISMATCH' });
    expect(persistTokens).not.toHaveBeenCalled();
  });
});
