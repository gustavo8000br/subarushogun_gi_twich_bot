import { CachedRefreshFailureError, getTokenInfo, InvalidTokenError, RefreshingAuthProvider } from '@twurple/auth';
import { clearInterval as clearNodeInterval, setInterval as setNodeInterval } from 'node:timers';

const requiredScopes = ['channel:manage:redemptions', 'user:read:chat', 'user:write:chat'];
const authValidationIntervalMs = 60 * 60 * 1000;
const initialRetryDelayMs = 5_000;
const maximumRetryDelayMs = 5 * 60 * 1000;

function identityMatches(info, credential) {
  return info.clientId === credential.clientId
    && info.userId === credential.broadcasterId
    && requiredScopes.every((scope) => info.scopes.includes(scope));
}

function isInvalidToken(error) {
  return error instanceof InvalidTokenError || error?.name === 'InvalidTokenError';
}

/** Only classify structured status from the known Twitch token endpoint; never inspect/log its body. */
function isDefinitiveRefreshFailure(error) {
  const status = error?.statusCode;
  const endpoint = typeof error?.url === 'string' ? error.url : '';
  return [400, 401].includes(status) && endpoint.startsWith('https://id.twitch.tv/oauth2/token');
}

function retryDelay(attempt, random) {
  const base = Math.min(maximumRetryDelayMs, initialRetryDelayMs * (2 ** Math.max(0, attempt)));
  return Math.min(maximumRetryDelayMs, Math.max(1, Math.round(base * (0.8 + (random() * 0.4)))));
}

/** @param {{credential: any, credentialRepository: any, validateToken?: (token: string, clientId: string) => Promise<any>, providerFactory?: (config: {clientId: string, clientSecret: string, redirectUri: string}) => any, redirectUri?: string, clock?: () => Date, setIntervalImpl?: typeof setInterval, clearIntervalImpl?: typeof clearInterval, setTimeoutImpl?: typeof setTimeout, clearTimeoutImpl?: typeof clearTimeout, random?: () => number, onAuthLost?: () => unknown, onTransientFailure?: (details: {reason: string, providerMustBeRebuilt: boolean}) => unknown, onRecovered?: () => unknown, onError?: (code: string) => unknown}} input */
export async function createRefreshingAuthRuntime({
  credential, credentialRepository, validateToken = getTokenInfo,
  providerFactory = (config) => new RefreshingAuthProvider(config),
  redirectUri = 'https://localhost:3000/callback', clock = () => new Date(),
  setIntervalImpl = setNodeInterval, clearIntervalImpl = clearNodeInterval,
  setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout, random = Math.random,
  onAuthLost = () => undefined, onTransientFailure = () => undefined,
  onRecovered = () => undefined, onError = () => undefined,
}) {
  if (!credential?.accessToken || !credential?.refreshToken) {
    return { status: 'not_configured', provider: null, stop() {} };
  }
  if (credential.authStatus === 'reconnect_required') {
    return { status: 'reconnect_required', provider: null, stop() {} };
  }

  let validationTimer;
  let retryTimer;
  let validating = false;
  let active = true;
  let authorizationLost = false;
  let authorizationLossPromise;
  let retryAttempt = 0;
  let refreshPersistence = Promise.resolve();
  let refreshPersistenceFailed = false;
  let provider;

  const loseAuth = () => {
    if (authorizationLossPromise) return authorizationLossPromise;
    authorizationLost = true;
    authorizationLossPromise = (async () => {
      await credentialRepository.markReconnectRequired(credential.clientId);
      if (active) onAuthLost();
    })();
    return authorizationLossPromise;
  };
  const reportTransient = (reason, providerMustBeRebuilt = false) => {
    if (active) onTransientFailure({ reason, providerMustBeRebuilt });
  };
  const persistRefresh = (userId, token) => {
    if (userId !== credential.broadcasterId) return;
    refreshPersistence = refreshPersistence.then(async () => {
      if (refreshPersistenceFailed) return;
      try {
        await credentialRepository.storeTokens({
          clientId: credential.clientId,
          broadcasterId: userId,
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          scopes: token.scope,
          expiresIn: token.expiresIn,
          obtainmentTimestamp: token.obtainmentTimestamp,
        });
      } catch {
        refreshPersistenceFailed = true;
        onError('token_persistence_failed');
      }
    });
  };
  const awaitRefreshPersistence = async () => {
    await refreshPersistence;
    if (refreshPersistenceFailed) throw Object.assign(new Error('token_persistence_failed'), { code: 'TOKEN_PERSISTENCE_FAILED' });
  };
  const createProvider = () => {
    const nextProvider = providerFactory({ clientId: credential.clientId, clientSecret: credential.clientSecret, redirectUri });
    const now = clock();
    const nextExpiresIn = credential.tokenExpiresAt
      ? Math.max(0, Math.floor((new Date(credential.tokenExpiresAt).getTime() - now.getTime()) / 1000))
      : null;
    nextProvider.addUser(credential.broadcasterId, {
      accessToken: credential.accessToken,
      refreshToken: credential.refreshToken,
      scope: credential.scopes,
      expiresIn: nextExpiresIn,
      obtainmentTimestamp: now.getTime(),
    });
    nextProvider.onRefresh(persistRefresh);
    nextProvider.onRefreshFailure((userId, error) => {
      if (userId !== credential.broadcasterId || !active) return;
      if (isDefinitiveRefreshFailure(error)) {
        void loseAuth().catch(() => onError('auth_state_persistence_failed'));
        return;
      }
      reportTransient('token_refresh_failed', true);
    });
    return nextProvider;
  };

  let tokenInfo;
  let refreshExpiredToken = false;
  try {
    tokenInfo = await validateToken(credential.accessToken, credential.clientId);
  } catch (error) {
    if (isInvalidToken(error)) refreshExpiredToken = true;
    else {
      reportTransient('token_validation_unavailable', false);
      return { status: 'degraded', provider: null, stop() {} };
    }
  }
  if (tokenInfo && !identityMatches(tokenInfo, credential)) {
    await loseAuth();
    return { status: 'reconnect_required', provider: null, stop() {} };
  }

  provider = createProvider();

  if (refreshExpiredToken) {
    try {
      const refreshedToken = await provider.refreshAccessTokenForUser(credential.broadcasterId);
      await awaitRefreshPersistence();
      tokenInfo = await validateToken(refreshedToken.accessToken, credential.clientId);
      if (!identityMatches(tokenInfo, credential)) {
        await loseAuth();
        return { status: 'reconnect_required', provider: null, stop() {} };
      }
    } catch (error) {
      if (isDefinitiveRefreshFailure(error) || isInvalidToken(error)) {
        await loseAuth();
        return { status: 'reconnect_required', provider: null, stop() {} };
      }
      reportTransient('token_refresh_unavailable', true);
      return { status: 'degraded', provider: null, stop() {} };
    }
  }

  async function validateCurrentToken() {
    if (validating || !active) return false;
    validating = true;
    try {
      let token;
      try {
        token = await provider.getAccessTokenForUser(credential.broadcasterId, requiredScopes);
      } catch (error) {
        // Twurple caches failed refreshes per provider. A new provider retries from the persisted token.
        if (authorizationLost) throw error;
        if (error instanceof CachedRefreshFailureError || !isDefinitiveRefreshFailure(error)) {
          provider = createProvider();
        }
        throw error;
      }
      if (!token) throw Object.assign(new Error('token_unavailable'), { code: 'TOKEN_UNAVAILABLE' });
      let info;
      try {
        info = await validateToken(token.accessToken, credential.clientId);
      } catch (error) {
        if (!isInvalidToken(error)) throw error;
        try {
          token = await provider.refreshAccessTokenForUser(credential.broadcasterId);
        } catch (error) {
          if (!isDefinitiveRefreshFailure(error)) provider = createProvider();
          throw error;
        }
        await awaitRefreshPersistence();
        info = await validateToken(token.accessToken, credential.clientId);
      }
      await awaitRefreshPersistence();
      if (!identityMatches(info, credential)) {
        await loseAuth();
        return false;
      }
      retryAttempt = 0;
      if (retryTimer) clearTimeoutImpl(retryTimer);
      retryTimer = undefined;
      onRecovered();
      return true;
    } catch (error) {
      if (isDefinitiveRefreshFailure(error) || isInvalidToken(error)) {
        await loseAuth().catch(() => onError('auth_state_persistence_failed'));
      } else {
        reportTransient('token_validation_unavailable', error?.code === 'TOKEN_PERSISTENCE_FAILED');
        if (active && !retryTimer) {
          const delay = retryDelay(retryAttempt, random);
          retryAttempt += 1;
          retryTimer = setTimeoutImpl(() => {
            retryTimer = undefined;
            return validateCurrentToken();
          }, delay);
        }
      }
      return false;
    } finally {
      validating = false;
    }
  }

  validationTimer = setIntervalImpl(validateCurrentToken, authValidationIntervalMs);
  return {
    status: 'connected',
    provider,
    validateNow: validateCurrentToken,
    stop() {
      active = false;
      if (validationTimer) clearIntervalImpl(validationTimer);
      if (retryTimer) clearTimeoutImpl(retryTimer);
      retryTimer = undefined;
    },
  };
}
