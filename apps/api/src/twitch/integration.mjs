import { ApiClient } from '@twurple/api';
import { getTokenInfo } from '@twurple/auth';
import { createTwitchApiAdapter } from './helix-adapter.mjs';
import { createRefreshingAuthRuntime } from './auth-runtime.mjs';
import { createEventSubRuntime } from './eventsub-runtime.mjs';
import { createTwitchRedemptionProcessor } from './redemption-processor.mjs';
import { createTwitchReconciler } from './reconciliation.mjs';
import { clearInterval as clearNodeInterval, setInterval as setNodeInterval } from 'node:timers';
import { createOAuthStateStore, completeOAuthAuthorization, validateClientCredentials } from './oauth.mjs';
import { URLSearchParams } from 'node:url';
import { RefreshingAuthProvider } from '@twurple/auth';

/** @param {{credentialRepository: any, repository: any, domainService: any, onChatMessage?: (event: object) => unknown, onStatus?: (status: object) => unknown, authRuntimeFactory?: (input: any) => Promise<any>, apiFactory?: (options: any) => any, adapterFactory?: (input: any) => any, eventSubRuntimeFactory?: (input: any) => any, reconcilerFactory?: (input: any) => any, setIntervalImpl?: typeof setInterval, clearIntervalImpl?: typeof clearInterval, redirectUri?: string, fetchImpl?: typeof fetch, oauthStateStore?: any, authProviderFactory?: (config: any) => any}} dependencies */
export async function createTwitchIntegration({
  credentialRepository, repository, domainService, onChatMessage = () => undefined,
  onStatus = () => undefined,
  authRuntimeFactory = (input) => createRefreshingAuthRuntime(input),
  apiFactory = (options) => new ApiClient(options),
  adapterFactory = (input) => createTwitchApiAdapter(input),
  eventSubRuntimeFactory = (input) => createEventSubRuntime(input),
  reconcilerFactory = (input) => createTwitchReconciler(input),
  setIntervalImpl = setNodeInterval, clearIntervalImpl = clearNodeInterval,
  redirectUri = process.env.CALLBACK_URL ?? 'https://localhost:3000/callback',
  fetchImpl = fetch,
  oauthStateStore = createOAuthStateStore(),
  authProviderFactory = (config) => new RefreshingAuthProvider(config),
}) {
  let credential = await credentialRepository.getAuthRecord();
  let status = credential ? 'connecting' : 'not_configured';
  let channelEligibility = null;
  let twitchApiProbe = null;
  let stopIntegration = () => undefined;
  const integration = {
    oauthStateStore,
    get status() { return status; },
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
    async completeAuthorization(input) {
      credential = await credentialRepository.getAuthRecord();
      if (!credential) throw Object.assign(new Error('Twitch app is not configured'), { code: 'TWITCH_APP_NOT_CONFIGURED' });
      const identity = await completeOAuthAuthorization({
        stateStore: oauthStateStore,
        ...input,
        exchangeCode: async ({ clientId, code, redirectUri: callbackUri }) => {
          const params = new URLSearchParams({ client_id: clientId, client_secret: credential.clientSecret, code, grant_type: 'authorization_code', redirect_uri: callbackUri });
          const response = await fetchImpl('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: params, signal: AbortSignal.timeout(10_000) });
          if (!response.ok) throw new Error('oauth_exchange_failed');
          const token = await response.json();
          return { accessToken: token.access_token, refreshToken: token.refresh_token, expiresIn: token.expires_in, obtainmentTimestamp: Date.now() };
        },
        validateToken: async (token) => getTokenInfo(token, credential.clientId),
        assertCanBind: ({ clientId, broadcasterId }) => credentialRepository.assertCanBind({ clientId, broadcasterId }),
        persistTokens: (tokens) => credentialRepository.storeTokens(tokens),
      });
      status = 'connecting';
      credential = await credentialRepository.getAuthRecord();
      const authRuntime = await authRuntimeFactory({
        credential, credentialRepository, redirectUri,
        providerFactory: authProviderFactory,
        onAuthLost: () => { status = 'reconnect_required'; stopIntegration(); },
      });
      stopIntegration = () => { authRuntime.stop?.(); status = 'stopped'; };
      if (authRuntime.status === 'connected' && authRuntime.provider) {
        const api = apiFactory({ authProvider: authRuntime.provider });
        const adapter = adapterFactory({ api, broadcasterId: credential.broadcasterId });
        channelEligibility = await adapter.getChannelEligibility().catch(() => ({ eligible: false, broadcasterType: 'unknown', reason: 'eligibility_unknown' }));
        twitchApiProbe = () => adapter.ping();
        if (channelEligibility.eligible) {
          const processor = createTwitchRedemptionProcessor({ repository, domainService, broadcasterId: credential.broadcasterId });
          const reconciler = reconcilerFactory({ repository, twitch: adapter, processor, broadcasterId: credential.broadcasterId });
          let listener;
          let reconcileTimer;
          let stopped = false;
          let reconciliationPromise = null;
          const reconcile = async () => {
            if (stopped) return null;
            if (reconciliationPromise) return reconciliationPromise;
            status = 'reconciling';
            reconciliationPromise = (async () => {
              try {
                const outcome = await reconciler.run();
                status = outcome.status === 'complete' ? 'connected' : 'degraded';
                return outcome;
              } catch {
                status = 'degraded';
                return { status: 'failed', issues: [{ code: 'reconciliation_failed' }] };
              } finally { reconciliationPromise = null; }
            })();
            return reconciliationPromise;
          };
          listener = eventSubRuntimeFactory({ apiClient: api, broadcasterId: credential.broadcasterId,
            onRedemptionAdd: processor.onRedemptionAdd, onRedemptionUpdate: processor.onRedemptionUpdate, onChatMessage,
            onReady: () => { reconcileTimer ??= setIntervalImpl(() => void reconcile(), 5 * 60 * 1000); return reconcile(); },
            onReconnected: reconcile,
            onRevoked: (_type, revokeStatus) => { if (revokeStatus === 'authorization_revoked') { status = 'reconnect_required'; void credentialRepository.markReconnectRequired(credential.clientId); listener?.stop(); } else status = 'degraded'; },
          });
          stopIntegration = () => { if (stopped) return; stopped = true; if (reconcileTimer) clearIntervalImpl(reconcileTimer); listener?.stop(); authRuntime.stop?.(); status = 'stopped'; };
          Object.assign(integration, { api, twitch: adapter, processor, reconciler, reconcileNow: () => reconcile() });
        } else {
          status = 'ineligible';
        }
      } else status = authRuntime.status;
      return identity;
    },
    stop() { stopIntegration(); },
  };
  if (!credential) { status = 'not_configured'; return integration; }

  let eventSubRuntime;
  let reconcileTimer;
  let stopped = false;
  status = 'connecting';
  let reconciler;
  let reconciliationPromise = null;
  const publishStatus = (nextStatus, details = {}) => {
    status = nextStatus;
    onStatus({ status, ...details });
  };
  const authRuntime = await authRuntimeFactory({
    credential,
    credentialRepository,
    redirectUri,
    onAuthLost: () => {
      publishStatus('reconnect_required');
      eventSubRuntime?.stop();
    },
  });
  let authStopped = false;
  const stopAuth = () => {
    if (authStopped) return;
    authStopped = true;
    authRuntime.stop?.();
  };
  if (authRuntime.status !== 'connected' || !authRuntime.provider) {
    status = authRuntime.status;
    stopIntegration = stopAuth;
    return integration;
  }

  const api = apiFactory({ authProvider: authRuntime.provider });
  const twitch = adapterFactory({ api, broadcasterId: credential.broadcasterId });
  let eligibility;
  try {
      eligibility = await twitch.getChannelEligibility();
  } catch {
    channelEligibility = { eligible: false, broadcasterType: 'unknown', reason: 'eligibility_unknown' };
    stopAuth();
    status = 'eligibility_unknown';
    stopIntegration = stopAuth;
    return integration;
  }
  channelEligibility = eligibility;
  twitchApiProbe = () => twitch.ping();
  if (!eligibility.eligible) {
    onStatus({ status: 'ineligible', broadcasterType: eligibility.broadcasterType });
    status = 'ineligible';
    stopIntegration = stopAuth;
    return integration;
  }

  twitchApiProbe = () => twitch.ping();

  const processor = createTwitchRedemptionProcessor({ repository, domainService, broadcasterId: credential.broadcasterId });
  reconciler = reconcilerFactory({ repository, twitch, processor, broadcasterId: credential.broadcasterId });
  let firstReady = false;
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
        if (!stopped) publishStatus('degraded', { lastError: 'reconciliation_failed' });
        return { status: 'failed', issues: [{ code: 'reconciliation_failed' }] };
      } finally {
        reconciliationPromise = null;
      }
    })();
    return reconciliationPromise;
  };
  eventSubRuntime = eventSubRuntimeFactory({
    apiClient: api,
    broadcasterId: credential.broadcasterId,
    onRedemptionAdd: processor.onRedemptionAdd,
    onRedemptionUpdate: processor.onRedemptionUpdate,
    onChatMessage,
    onReady: () => {
      if (!firstReady && !stopped) {
        firstReady = true;
        reconcileTimer = setIntervalImpl(() => void reconcile('periodic'), 5 * 60 * 1000);
        return reconcile('startup');
      }
      return undefined;
    },
    onReconnected: () => reconcile('reconnect'),
    onRevoked: (type, revokeStatus) => {
      if (revokeStatus === 'authorization_revoked') {
        publishStatus('reconnect_required', { revokedSubscription: type });
        void credentialRepository.markReconnectRequired(credential.clientId);
        eventSubRuntime?.stop();
      } else {
        publishStatus('degraded', { revokedSubscription: type, revokeStatus });
      }
    },
  });

  Object.assign(integration, {
    api, twitch, processor, reconciler,
    reconcileNow: () => reconcile('operator'),
    stop() {
      if (stopped) return;
      stopped = true;
      if (reconcileTimer) clearIntervalImpl(reconcileTimer);
      eventSubRuntime?.stop();
      stopAuth();
      publishStatus('stopped');
    },
  });
  stopIntegration = () => integration.stop();
  return integration;
}
