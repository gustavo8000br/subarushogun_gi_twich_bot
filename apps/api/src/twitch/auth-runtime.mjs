import { getTokenInfo, RefreshingAuthProvider } from '@twurple/auth';
import { clearInterval as clearNodeInterval, setInterval as setNodeInterval } from 'node:timers';

const requiredScopes = ['channel:manage:redemptions', 'user:read:chat', 'user:write:chat'];

function identityMatches(info, credential) {
  return info.clientId === credential.clientId
    && info.userId === credential.broadcasterId
    && requiredScopes.every((scope) => info.scopes.includes(scope));
}

/** @param {{credential: any, credentialRepository: any, validateToken?: (token: string, clientId: string) => Promise<any>, providerFactory?: (config: {clientId: string, clientSecret: string, redirectUri: string}) => any, redirectUri?: string, clock?: () => Date, setIntervalImpl?: typeof setInterval, clearIntervalImpl?: typeof clearInterval, onAuthLost?: () => unknown, onError?: (code: string) => unknown}} input */
export async function createRefreshingAuthRuntime({
  credential, credentialRepository, validateToken = getTokenInfo,
  providerFactory = (config) => new RefreshingAuthProvider(config),
  redirectUri = 'http://localhost:3000/callback', clock = () => new Date(),
  setIntervalImpl = setNodeInterval, clearIntervalImpl = clearNodeInterval,
  onAuthLost = () => undefined, onError = () => undefined,
}) {
  if (!credential?.accessToken || !credential?.refreshToken || credential.authStatus === 'reconnect_required') {
    return { status: 'not_configured', provider: null, stop() {} };
  }

  let validationTimer;
  let validating = false;
  let active = true;
  const loseAuth = async () => {
    await credentialRepository.markReconnectRequired(credential.clientId);
    if (active) onAuthLost();
  };
  let tokenInfo;
  try {
    tokenInfo = await validateToken(credential.accessToken, credential.clientId);
  } catch {
    await loseAuth();
    return { status: 'reconnect_required', provider: null, stop() {} };
  }
  if (!identityMatches(tokenInfo, credential)) {
    await loseAuth();
    return { status: 'reconnect_required', provider: null, stop() {} };
  }

  const provider = providerFactory({ clientId: credential.clientId, clientSecret: credential.clientSecret, redirectUri });
  const now = clock();
  const expiresIn = credential.tokenExpiresAt
    ? Math.max(0, Math.floor((new Date(credential.tokenExpiresAt).getTime() - now.getTime()) / 1000))
    : null;
  provider.addUser(credential.broadcasterId, {
    accessToken: credential.accessToken,
    refreshToken: credential.refreshToken,
    scope: credential.scopes,
    expiresIn,
    obtainmentTimestamp: now.getTime(),
  });
  provider.onRefresh((userId, token) => {
    void credentialRepository.storeTokens({
      clientId: credential.clientId,
      broadcasterId: userId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      scopes: token.scope,
      expiresIn: token.expiresIn,
      obtainmentTimestamp: token.obtainmentTimestamp,
    }).catch(() => onError('token_persistence_failed'));
  });
  provider.onRefreshFailure((userId) => {
    if (userId === credential.broadcasterId) void loseAuth().catch(() => onError('auth_state_persistence_failed'));
  });

  validationTimer = setIntervalImpl(async () => {
    if (validating || !active) return;
    validating = true;
    try {
      const currentToken = await provider.getAccessTokenForUser(credential.broadcasterId, requiredScopes);
      if (!currentToken) throw new Error('token_unavailable');
      const currentInfo = await validateToken(currentToken.accessToken, credential.clientId);
      if (!identityMatches(currentInfo, credential)) throw new Error('identity_mismatch');
    } catch {
      await loseAuth().catch(() => onError('auth_state_persistence_failed'));
    } finally {
      validating = false;
    }
  }, 60 * 60 * 1000);

  return {
    status: 'connected',
    provider,
    stop() {
      active = false;
      if (validationTimer) clearIntervalImpl(validationTimer);
    },
  };
}
