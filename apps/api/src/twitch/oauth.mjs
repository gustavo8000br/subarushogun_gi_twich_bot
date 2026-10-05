import { createHash, randomBytes } from 'node:crypto';
import { URLSearchParams } from 'node:url';

const tokenEndpoint = 'https://id.twitch.tv/oauth2/token';

function invalidCredentials() {
  return Object.assign(new Error('Twitch rejected the application credentials'), {
    code: 'INVALID_TWITCH_CLIENT_CREDENTIALS',
  });
}

/** Validates an app using Twitch's Client Credentials grant without exposing its token. */
/** @param {{clientId: string, clientSecret: string, fetchImpl?: typeof fetch}} input */
export async function validateClientCredentials({ clientId, clientSecret, fetchImpl = fetch }) {
  if (typeof clientId !== 'string' || !clientId.trim() || typeof clientSecret !== 'string' || !clientSecret) {
    throw invalidCredentials();
  }
  const body = new URLSearchParams({
    client_id: clientId.trim(),
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });
  try {
    const response = await fetchImpl(tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw invalidCredentials();
    const token = await response.json();
    if (typeof token.access_token !== 'string' || token.access_token.length === 0) throw invalidCredentials();
    return { valid: true, clientId: clientId.trim() };
  } catch (error) {
    if (error?.code === 'INVALID_TWITCH_CLIENT_CREDENTIALS') throw error;
    throw invalidCredentials();
  }
}

const requiredScopes = ['channel:manage:redemptions', 'user:read:chat', 'user:write:chat'];

/** @param {{clock?: () => Date, stateFactory?: () => string, ttlMs?: number}} options */
export function createOAuthStateStore({ clock = () => new Date(), stateFactory = () => randomBytes(32).toString('hex'), ttlMs = 10 * 60 * 1000 } = {}) {
  const pending = new Map();
  const hashState = (state) => createHash('sha256').update(state).digest('hex');
  function take({ state, sessionId }) {
    if (typeof state !== 'string' || typeof sessionId !== 'string') return null;
    const key = hashState(state);
    const record = pending.get(key);
    if (!record) return null;
    if (record.expiresAt <= clock().getTime()) { pending.delete(key); return null; }
    if (record.sessionId !== sessionId) return null;
    pending.delete(key);
    return { clientId: record.clientId, redirectUri: record.redirectUri };
  }
  return {
    /** @param {{sessionId: string, clientId: string, redirectUri: string}} input */
    issue({ sessionId, clientId, redirectUri }) {
      if (!sessionId || !clientId || !redirectUri) throw Object.assign(new Error('OAuth session is unavailable'), { code: 'INVALID_OAUTH_SESSION' });
      const state = stateFactory();
      const now = clock();
      for (const [key, record] of pending) if (record.expiresAt <= now.getTime()) pending.delete(key);
      pending.set(hashState(state), { sessionId, clientId, redirectUri, expiresAt: now.getTime() + ttlMs });
      const url = new URL('https://id.twitch.tv/oauth2/authorize');
      url.search = new URLSearchParams({
        response_type: 'code', client_id: clientId, redirect_uri: redirectUri,
        scope: requiredScopes.join(' '), state,
      }).toString();
      return { state, url: url.toString() };
    },
    /** @param {{state: string, sessionId: string}} input */
    consume({ state, sessionId }) {
      return take({ state, sessionId }) !== null;
    },
    take,
  };
}

/** @param {Record<string, any>} dependencies */
export async function completeOAuthAuthorization({
  stateStore, sessionId, state, code, exchangeCode, validateToken, persistTokens,
  assertCanBind = async () => undefined,
}) {
  const authorization = stateStore.take({ state, sessionId });
  if (!authorization || typeof code !== 'string' || !code) {
    throw Object.assign(new Error('OAuth callback is invalid or expired'), { code: 'INVALID_OAUTH_CALLBACK' });
  }
  try {
    const token = await exchangeCode({ ...authorization, code });
    const identity = await validateToken(token.accessToken);
    const scopes = Array.isArray(identity.scopes) ? identity.scopes : [];
    const missingScopes = requiredScopes.filter((scope) => !scopes.includes(scope));
    if (identity.clientId !== authorization.clientId || !identity.userId || missingScopes.length > 0) {
      throw Object.assign(new Error('Twitch authorization does not match the configured application'), { code: 'TWITCH_AUTHORIZATION_MISMATCH' });
    }
    await assertCanBind({ clientId: identity.clientId, broadcasterId: identity.userId });
    await persistTokens({
      clientId: identity.clientId,
      broadcasterId: identity.userId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      scopes,
      expiresIn: token.expiresIn,
      obtainmentTimestamp: token.obtainmentTimestamp,
    });
    return { broadcasterId: identity.userId, login: identity.login, displayName: identity.displayName };
  } catch (error) {
    if (error?.code === 'TWITCH_AUTHORIZATION_MISMATCH' || error?.code === 'CHANNEL_BINDING_LOCKED') throw error;
    throw Object.assign(new Error('Twitch authorization failed'), { code: 'TWITCH_AUTHORIZATION_FAILED' });
  }
}
