import { ApiClient } from '@twurple/api';
import { getTokenInfo, RefreshingAuthProvider } from '@twurple/auth';
import { clearInterval as clearNodeInterval, setInterval as setNodeInterval } from 'node:timers';
import { URLSearchParams } from 'node:url';
import { createOAuthStateStore, completeOAuthAuthorization, validateClientCredentials } from './oauth.mjs';
import { createTwitchApiAdapter } from './helix-adapter.mjs';
import { createRefreshingAuthRuntime } from './auth-runtime.mjs';
import { createEventSubRuntime } from './eventsub-runtime.mjs';
import { createTwitchRedemptionProcessor } from './redemption-processor.mjs';
import { createTwitchReconciler } from './reconciliation.mjs';
import { CHAT_COMMANDS, COMMAND_POLICY_MINIMUM_ROLES } from '../commands/catalog.mjs';

const INITIAL_RETRY_MS = 5_000;
const MAX_RETRY_MS = 5 * 60 * 1_000;

function retryDelay(attempt, random) {
  const base = Math.min(MAX_RETRY_MS, INITIAL_RETRY_MS * (2 ** attempt));
  const jittered = Math.round(base * (0.8 + random() * 0.4));
  return Math.min(MAX_RETRY_MS, Math.max(1, jittered));
}

/**
 * Start Twitch supervision without making local HTTP readiness depend on Twitch availability.
 * @param {{credentialRepository: any, repository: any, domainService: any, onChatMessage?: (event: object) => unknown, onStatus?: (status: object) => unknown, authRuntimeFactory?: (input: any) => Promise<any>, apiFactory?: (options: any) => any, adapterFactory?: (input: any) => any, eventSubRuntimeFactory?: (input: any) => any, reconcilerFactory?: (input: any) => any, setIntervalImpl?: typeof setInterval, clearIntervalImpl?: typeof clearInterval, setTimeoutImpl?: typeof setTimeout, clearTimeoutImpl?: typeof clearTimeout, random?: () => number, redirectUri?: string, fetchImpl?: typeof fetch, oauthStateStore?: any, authProviderFactory?: (config: any) => any, validateOAuthToken?: (token: string, clientId: string) => Promise<any>}} dependencies
 */
export async function createTwitchIntegration({
  credentialRepository, repository, domainService, onChatMessage = () => undefined,
  onStatus = () => undefined,
  authRuntimeFactory = (input) => createRefreshingAuthRuntime(input),
  apiFactory = (options) => new ApiClient(options),
  adapterFactory = (input) => createTwitchApiAdapter(input),
  eventSubRuntimeFactory = (input) => createEventSubRuntime(input),
  reconcilerFactory = (input) => createTwitchReconciler(input),
  setIntervalImpl = setNodeInterval, clearIntervalImpl = clearNodeInterval,
  setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout, random = Math.random,
  redirectUri = process.env.CALLBACK_URL ?? 'https://localhost:3000/callback',
  fetchImpl = fetch,
  oauthStateStore = createOAuthStateStore(),
  authProviderFactory = (config) => new RefreshingAuthProvider(config),
  validateOAuthToken = (token, clientId) => getTokenInfo(token, clientId),
}) {
  let credential = await credentialRepository.getAuthRecord();
  let status = credential?.accessToken && credential?.refreshToken ? 'connecting' : 'not_configured';
  let channelEligibility = null;
  let twitchApiProbe = null;
  let api;
  let twitch;
  let processor;
  let reconciler;
  let authRuntime;
  let eventSubRuntime;
  let reconcileTimer;
  let retryTimer;
  let retryAttempt = 0;
  let stopped = false;
  let attemptPromise = null;
  let lastAttempt = Promise.resolve();
  let reconciliationPromise = null;
  let authLost = false;
  let eventSubAvailable = false;
  const publishStatus = (nextStatus, details = {}) => {
    if (stopped) return;
    status = nextStatus;
    onStatus({ status: nextStatus, ...details });
  };
  const clearSession = () => {
    eventSubRuntime?.stop?.(); eventSubRuntime = undefined;
    authRuntime?.stop?.(); authRuntime = undefined;
    if (reconcileTimer) clearIntervalImpl(reconcileTimer);
    reconcileTimer = undefined;
    api = undefined; twitch = undefined; processor = undefined; reconciler = undefined; twitchApiProbe = null;
    eventSubAvailable = false;
  };
  const scheduleRetry = (reason) => {
    if (stopped || authLost || retryTimer) return;
    const delay = retryDelay(retryAttempt++, random);
    publishStatus('retrying', { retryInMs: delay, reason });
    retryTimer = setTimeoutImpl(() => {
      retryTimer = undefined;
      void initialize();
    }, delay);
  };
  const reconcile = async (trigger) => {
    if (stopped || !reconciler) return null;
    if (reconciliationPromise) return reconciliationPromise;
    publishStatus('reconciling', { trigger });
    reconciliationPromise = (async () => {
      try {
        const result = await reconciler.run();
        if (!stopped) publishStatus(result.status === 'complete' ? 'connected' : 'degraded', { lastReconciliation: result.finishedAt, issues: result.issues });
        return result;
      } catch {
        publishStatus('degraded', { reason: 'reconciliation_failed' });
        return { status: 'failed', issues: [{ code: 'reconciliation_failed' }] };
      } finally { reconciliationPromise = null; }
    })();
    return reconciliationPromise;
  };
  const startSession = async () => {
    api = apiFactory({ authProvider: authRuntime.provider });
    twitch = adapterFactory({ api, broadcasterId: credential.broadcasterId, authProvider: authRuntime.provider });
    twitchApiProbe = () => twitch.ping();
    channelEligibility = await twitch.getChannelEligibility();
    if (stopped) return;
    if (channelEligibility.reason === 'access_token_invalid') {
      if (typeof authRuntime?.validateNow !== 'function') {
        scheduleRetry('token_validation_unavailable');
        return;
      }
      const refreshed = await authRuntime.validateNow();
      if (!refreshed || stopped) return;
      channelEligibility = await twitch.getChannelEligibility();
      if (stopped) return;
    }
    if (!channelEligibility.eligible) {
      if (channelEligibility.reason === 'authorization_required') {
        authLost = true;
        await credentialRepository.markReconnectRequired(credential.clientId);
        authRuntime?.stop?.(); authRuntime = undefined;
        publishStatus('reconnect_required');
        return;
      }
      if (channelEligibility.reason === 'channel_points_unavailable') {
        scheduleRetry('channel_points_unavailable');
        return;
      }
      authRuntime?.stop?.(); authRuntime = undefined;
      publishStatus('ineligible', { broadcasterType: channelEligibility.broadcasterType });
      return;
    }
    processor = createTwitchRedemptionProcessor({ repository, domainService, broadcasterId: credential.broadcasterId });
    reconciler = reconcilerFactory({ repository, twitch, processor, broadcasterId: credential.broadcasterId });
    let initialReady = false;
    eventSubRuntime = eventSubRuntimeFactory({
      apiClient: api, broadcasterId: credential.broadcasterId,
      onRedemptionAdd: processor.onRedemptionAdd, onRedemptionUpdate: processor.onRedemptionUpdate, onChatMessage,
      onReady: () => {
        if (initialReady || stopped) return;
        initialReady = true;
        eventSubAvailable = true;
        retryAttempt = 0;
        reconcileTimer = setIntervalImpl(() => void reconcile('periodic'), 5 * 60 * 1000);
        return reconcile('startup');
      },
      onReconnected: () => { eventSubAvailable = true; return reconcile('reconnect'); },
      onDisconnect: ({ established }) => {
        eventSubAvailable = false;
        publishStatus('degraded', { reason: established ? 'eventsub_disconnected' : 'eventsub_startup_disconnected' });
        if (!established) {
          eventSubRuntime?.stop?.(); eventSubRuntime = undefined;
          scheduleRetry('eventsub_startup_disconnected');
        }
      },
      onRevoked: (type, revokeStatus) => {
        if (revokeStatus === 'authorization_revoked') {
          authLost = true; publishStatus('reconnect_required', { revokedSubscription: type });
          void credentialRepository.markReconnectRequired(credential.clientId);
          eventSubRuntime?.stop?.();
        } else publishStatus('degraded', { revokedSubscription: type, revokeStatus });
      },
    });
  };
  async function initialize() {
    if (stopped || authLost || !credential?.accessToken || !credential?.refreshToken) return attemptPromise;
    if (attemptPromise) return attemptPromise;
    if (retryTimer) clearTimeoutImpl(retryTimer);
    retryTimer = undefined;
    attemptPromise = (async () => {
      clearSession();
      publishStatus('connecting');
      try {
        authRuntime = await authRuntimeFactory({
          credential, credentialRepository, redirectUri, providerFactory: authProviderFactory,
          onAuthLost: () => { authLost = true; clearSession(); publishStatus('reconnect_required'); },
          onTransientFailure: () => publishStatus('retrying', { reason: 'token_validation_unavailable' }),
          onRecovered: () => {
            if (eventSubAvailable) publishStatus('connected');
            else if (!authLost && !stopped) void initialize();
          },
        });
        if (stopped) { clearSession(); return; }
        if (authRuntime.status === 'reconnect_required') {
          authLost = true; clearSession(); publishStatus('reconnect_required'); return;
        }
        if (authRuntime.status !== 'connected' || !authRuntime.provider) {
          clearSession(); scheduleRetry('token_validation_unavailable'); return;
        }
        await startSession();
      } catch {
        clearSession();
        channelEligibility = { eligible: false, broadcasterType: 'unknown', reason: 'eligibility_unknown' };
        scheduleRetry('twitch_unavailable');
      }
    })().finally(() => { attemptPromise = null; });
    lastAttempt = attemptPromise;
    return attemptPromise;
  }
  if (credential?.accessToken && credential?.refreshToken) void initialize();

  const integration = {
    oauthStateStore,
    get status() { return status; },
    get ready() { return lastAttempt; },
    async probeTwitchApi() { return twitchApiProbe ? twitchApiProbe() : false; },
    async validateAndSaveApplication({ clientId, clientSecret }) {
      const validated = await validateClientCredentials({ clientId, clientSecret, fetchImpl });
      const saved = await credentialRepository.saveValidatedApplication({ clientId: validated.clientId, clientSecret });
      credential = await credentialRepository.getAuthRecord();
      status = credential?.accessToken ? 'connecting' : 'not_connected';
      return saved;
    },
    async getSetupState() {
      const safe = await credentialRepository.getPublicStatus();
      return { ...safe, status, eligibility: channelEligibility };
    },
    async beginAuthorization(sessionId) {
      if (!credential?.clientId || !sessionId) return null;
      return oauthStateStore.issue({ sessionId, clientId: credential.clientId, redirectUri });
    },
    async beginFollowerAuthorization({ sessionId, expectedVersion, policies }) {
      if (!credential?.clientId || !sessionId || !Number.isInteger(expectedVersion) || expectedVersion < 1 || !policies || typeof policies !== 'object' || Array.isArray(policies)) {
        throw Object.assign(new Error('Follower authorization request is invalid'), { code: 'INVALID_FOLLOWER_AUTHORIZATION' });
      }
      const entries = Object.entries(policies);
      if (!entries.length || !entries.some(([, policy]) => policy?.mode === 'minimum_role' && policy.minimumRole === 'follower')
        || entries.some(([key, policy]) => {
          const definition = CHAT_COMMANDS.find((command) => command.key === key);
          return !definition || definition.immutableRoles || !policy || typeof policy !== 'object' || Array.isArray(policy)
            || policy.mode !== 'minimum_role' || !COMMAND_POLICY_MINIMUM_ROLES.includes(policy.minimumRole)
            || Object.keys(policy).some((property) => !['mode', 'minimumRole'].includes(property));
        })) throw Object.assign(new Error('Follower authorization request is invalid'), { code: 'INVALID_FOLLOWER_AUTHORIZATION' });
      return oauthStateStore.issue({ sessionId, clientId: credential.clientId, redirectUri, scopes: ['moderator:read:followers'], context: { kind: 'follower_policy', expectedVersion, policies } });
    },
    async completeAuthorization(input) {
      credential = await credentialRepository.getAuthRecord();
      if (!credential) throw Object.assign(new Error('Twitch app is not configured'), { code: 'TWITCH_APP_NOT_CONFIGURED' });
      const identity = await completeOAuthAuthorization({
        stateStore: oauthStateStore, ...input,
        exchangeCode: async ({ clientId, code, redirectUri: callbackUri }) => {
          const params = new URLSearchParams({ client_id: clientId, client_secret: credential.clientSecret, code, grant_type: 'authorization_code', redirect_uri: callbackUri });
          const response = await fetchImpl('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: params, signal: AbortSignal.timeout(10_000) });
          if (!response.ok) throw new Error('oauth_exchange_failed');
          const token = await response.json();
          return { accessToken: token.access_token, refreshToken: token.refresh_token, expiresIn: token.expires_in, obtainmentTimestamp: Date.now() };
        },
        validateToken: async (token) => validateOAuthToken(token, credential.clientId),
        assertCanBind: ({ clientId, broadcasterId }) => credentialRepository.assertCanBind({ clientId, broadcasterId }),
        persistTokens: (tokens) => credentialRepository.storeTokens({
          ...tokens,
          commitAdditional: tokens.authorizationContext?.kind === 'follower_policy' ? (tx) => repository.updateCommandPoliciesInTransaction(tx, {
            expectedVersion: tokens.authorizationContext.expectedVersion, policies: tokens.authorizationContext.policies,
            actorId: input.sessionId, origin: 'oauth_follower_consent',
          }) : undefined,
        }),
      });
      credential = await credentialRepository.getAuthRecord();
      authLost = false; retryAttempt = 0;
      clearSession();
      if (retryTimer) clearTimeoutImpl(retryTimer);
      retryTimer = undefined;
      publishStatus('connecting');
      void initialize();
      return identity;
    },
    async reconcileNow() { return reconcile('operator'); },
    async stop() {
      if (stopped) return;
      stopped = true;
      if (retryTimer) clearTimeoutImpl(retryTimer);
      retryTimer = undefined;
      clearSession();
      status = 'stopped';
      onStatus({ status });
    },
  };
  return integration;
}
