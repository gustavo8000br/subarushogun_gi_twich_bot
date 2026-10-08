import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { registerLocalSession } from '../../apps/api/src/http/local-session.mjs';
import { registerQueueRoutes } from '../../apps/api/src/http/queue-routes.mjs';
import { createClearConfirmationService } from '../../apps/api/src/domain/clear-confirmation.mjs';
import { registerOverlayRoutes } from '../../apps/api/src/http/overlay-routes.mjs';
import { createQueueDomainService, createQueueDomainServiceProxy } from '../../apps/api/src/domain/queue-service.mjs';

async function createHarness({ domainService, resolveUser = async () => null, beforeSession = async () => undefined, getSetupCatalogs, reportDiagnostic, logEvent } = {}) {
  const app = Fastify();
  registerLocalSession(app, { port: 3000 });
  const queue = { id: 'queue-id', slug: 'abismo', title: 'Abismo', cost: 100, uidMode: 'visible', showUidInOverlay: false, isOpen: false, isArchived: false, lifecycleStatus: 'active', version: 1 };
  queue.entries = [{ id: 'entry-id', status: 'waiting', position: 1, userLogin: 'viewer', displayName: 'Viewer', uid: '123456789' }];
  const repository = {
    getProductLocale: vi.fn(async () => ({ locale: 'pt-BR', revision: 1 })),
    beginPanelOperation: vi.fn(async () => ({ status: 'started' })),
    completePanelOperation: vi.fn(async () => true),
    createQueue: vi.fn(async (input) => ({ ...queue, ...input, uidMode: input.uidMode })),
    createManualQueue: vi.fn(async (input) => ({ ...queue, ...input, cost: null, queueMode: 'manual_only', rewardOrigin: 'none', rewardId: null, remoteSyncStatus: 'local_only', isOpen: false })),
    createQueueWithRewardIntent: vi.fn(async (input) => ({ status: 'pending', queue: { ...queue, ...input, remoteSyncStatus: 'pending_create' } })),
    getQueueById: vi.fn(async () => queue),
    addManualEntry: vi.fn(async () => ({ status: 'created', entry: { id: 'entry-id', status: 'waiting', position: 1 } })),
    setEntryPriority: vi.fn(async () => ({ status: 'updated', priorityClass: 'priority', position: 1 })),
    listQueueProjection: vi.fn(async () => [queue]),
    transitionEntry: vi.fn(async () => ({ id: 'entry-id', status: 'called' })),
    listEntriesByStatus: vi.fn(async () => [{ id: 'entry-id', version: 1, status: 'waiting', source: 'redemption', redemptionId: 'redemption-id' }]),
    callNext: vi.fn(async () => [{ id: 'entry-id', status: 'called' }]),
    callSpecificEntry: vi.fn(async () => ({ id: 'entry-id', status: 'called' })),
    getEntry: vi.fn(async () => ({ id: 'entry-id', queueId: 'queue-id', status: 'waiting' })),
    enqueueCallNotification: vi.fn(async () => undefined),
    clearActiveEntries: vi.fn(async ({ snapshot }) => ({ status: 'cleared', count: snapshot.length, refundsRequested: 1 })),
    setDefaultAccountLabel: vi.fn(async (label) => ({ label, defaultLabel: label, source: 'default' })),
    getCommandPolicyState: vi.fn(async () => ({ schemaVersion: 3, version: 1, policies: {} })),
    updateCommandPolicies: vi.fn(async ({ expectedVersion, policies }) => ({ schemaVersion: 3, version: expectedVersion + 1, policies })),
  };
  const integrations = { status: 'not_configured', twitch: null };
  const clearConfirmation = createClearConfirmationService({ repository });
  registerQueueRoutes(app, { repository, domainService, integrations, clearConfirmation, resolveUser, getSetupCatalogs, reportDiagnostic, logEvent, publicBaseUrl: 'https://localhost:3000', productVersion: 'v0.1.0-1234567-alpha' });
  await beforeSession({ app, repository });
  const inject = app.inject.bind(app);
  const rawInject = app.inject.bind(app);
  app.inject = (options) => {
    const method = options.method ?? 'GET';
    const headers = { ...(options.headers ?? {}) };
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && headers['x-csrf-token'] && !headers['idempotency-key']) headers['idempotency-key'] = randomUUID();
    return inject({ ...options, headers });
  };
  const session = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000' } });
  const cookie = session.cookies[0];
  const sessionHeaders = { host: 'localhost:3000', origin: 'https://localhost:3000', cookie: `${cookie.name}=${cookie.value}` };
  const headers = { ...sessionHeaders, 'x-csrf-token': session.json().csrfToken };
  return { app, repository, integrations, headers, sessionHeaders, rawInject };
}

describe('local queue and setup API', () => {
  it('returns a trace reference and reports unexpected queue creation failures without exposing their details', async () => {
    const reportDiagnostic = vi.fn(() => '11111111-1111-4111-8111-111111111111');
    const h = await createHarness({ reportDiagnostic });
    h.repository.createQueueWithRewardIntent.mockRejectedValue(Object.assign(new Error('secret token and SQL details'), { code: 'P2002' }));

    const response = await h.app.inject({
      method: 'POST', url: '/api/queues', headers: h.headers,
      payload: { slug: 'trace-queue', title: 'Trace queue', cost: 100 },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ code: 'INTERNAL_ERROR', error: 'Não foi possível concluir. Tente novamente.', referenceId: '11111111-1111-4111-8111-111111111111' });
    expect(response.body).not.toContain('secret token');
    expect(reportDiagnostic).toHaveBeenCalledWith({ source: 'http.queue.create', error: expect.objectContaining({ message: 'secret token and SQL details', code: 'P2002' }) });
    await h.app.close();
  });

  it('replays a mutation response for a repeated idempotency key without repeating its effect', async () => {
    const h = await createHarness();
    const outcomes = new Map();
    h.repository.beginPanelOperation = vi.fn(async ({ operationKey, fingerprint }) => {
      const prior = outcomes.get(operationKey);
      if (!prior) { outcomes.set(operationKey, { fingerprint, state: 'processing' }); return { status: 'started' }; }
      if (prior.fingerprint !== fingerprint) return { status: 'conflict' };
      return prior.state === 'completed'
        ? { status: 'replay', statusCode: prior.statusCode, responseBody: prior.responseBody }
        : { status: 'in_progress' };
    });
    h.repository.completePanelOperation = vi.fn(async ({ operationKey, statusCode, responseBody }) => {
      const prior = outcomes.get(operationKey);
      outcomes.set(operationKey, { ...prior, state: 'completed', statusCode, responseBody });
    });
    const headers = { ...h.headers, 'idempotency-key': 'test-create-queue-001' };
    const payload = { slug: 'replay-queue', title: 'Replay', cost: 100 };
    const first = await h.app.inject({ method: 'POST', url: '/api/queues', headers, payload });
    const replay = await h.app.inject({ method: 'POST', url: '/api/queues', headers, payload });
    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(h.repository.createQueueWithRewardIntent).toHaveBeenCalledOnce();
    const conflict = await h.app.inject({ method: 'POST', url: '/api/queues', headers, payload: { ...payload, title: 'Different request' } });
    expect(conflict.statusCode).toBe(409);
    expect(h.repository.createQueueWithRewardIntent).toHaveBeenCalledOnce();
    await h.app.close();
  });

  it('never replays a one-time OBS capability URL from the idempotency store', async () => {
    const outcomes = new Map();
    const capabilityUrl = 'https://localhost:3000/overlay.html#one-time-secret-must-not-replay';
    const widgetService = { create: vi.fn(async () => ({ widget: { id: 'widget-id', sourceType: 'fixed_text', version: 1 }, capabilityUrl })) };
    let h;
    h = await createHarness({ beforeSession: async ({ app, repository }) => {
      repository.beginPanelOperation = vi.fn(async ({ operationKey, fingerprint }) => {
        const previous = outcomes.get(operationKey);
        if (!previous) { outcomes.set(operationKey, { fingerprint, state: 'processing' }); return { status: 'started' }; }
        if (previous.fingerprint !== fingerprint) return { status: 'conflict' };
        return { status: 'replay', statusCode: previous.statusCode, responseBody: previous.responseBody };
      });
      repository.completePanelOperation = vi.fn(async ({ operationKey, statusCode, responseBody }) => {
        outcomes.set(operationKey, { ...outcomes.get(operationKey), state: 'completed', statusCode, responseBody });
      });
      repository.list = vi.fn(async () => []);
      registerOverlayRoutes(app, { repository, widgetService, projectionService: { readWithCapability: async () => null } });
    } });
    const headers = { ...h.headers, 'idempotency-key': 'one-time-overlay-0001' };
    const payload = { sourceType: 'fixed_text', fixedText: 'Ready' };
    const first = await h.app.inject({ method: 'POST', url: '/api/overlay-widgets', headers, payload });
    const replay = await h.app.inject({ method: 'POST', url: '/api/overlay-widgets', headers, payload });
    expect(first.statusCode).toBe(201);
    expect(first.body).toContain(capabilityUrl);
    expect(replay.statusCode).toBe(409);
    expect(replay.body).not.toContain('one-time-secret-must-not-replay');
    expect(widgetService.create).toHaveBeenCalledOnce();
    expect(h.repository.completePanelOperation).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409, responseBody: { code: 'OVERLAY_LINK_ALREADY_ISSUED', error: 'O link foi emitido uma vez. Gere outro se precisar copiá-lo novamente.' } }));
    await h.app.close();
  });

  it('returns a session-protected safe catalog projection with effective command roles', async () => {
    const h = await createHarness();
    h.repository.getCommandPolicyState.mockResolvedValue({ schemaVersion: 3, version: 7, policies: { 'queue:lista': { minimumRole: 'subscriber' } } });
    const denied = await h.app.inject({ method: 'GET', url: '/api/command-catalog', headers: { host: 'localhost:3000' } });
    expect(denied.statusCode).toBe(401);
    const response = await h.app.inject({ method: 'GET', url: '/api/command-catalog', headers: h.sessionHeaders });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ schemaVersion: 3, version: 7, commands: expect.arrayContaining([
      expect.objectContaining({ key: 'queue:lista', policy: { minimumRole: 'subscriber', kind: 'configurable' }, access: { kind: 'configurable', minimumRole: 'everyone' }, configurable: true }),
      expect.objectContaining({ key: 'queue:add', policy: { minimumRole: 'moderator', kind: 'fixed' }, access: { kind: 'fixed', minimumRole: 'moderator' }, configurable: false }),
      expect.objectContaining({ key: 'global:conta:set', policy: { minimumRole: 'streamer', kind: 'fixed' }, access: { kind: 'fixed', minimumRole: 'streamer' }, configurable: false }),
      expect.objectContaining({ key: 'global:queue:ping', policy: { minimumRole: 'moderator', kind: 'fixed' }, configurable: false }),
    ]) });
    expect(JSON.stringify(response.json())).not.toContain('clientSecret');
  });

  it('projects follower authorization readiness as a boolean without returning tokens or scopes', async () => {
    const h = await createHarness();
    h.integrations.getSetupState = vi.fn(async () => ({
      scopes: ['channel:manage:redemptions', 'user:read:chat', 'user:write:chat', 'moderator:read:followers'],
      accessToken: 'sensitive-access-token',
      refreshToken: 'sensitive-refresh-token',
    }));
    const response = await h.app.inject({ method: 'GET', url: '/api/command-catalog', headers: h.headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ followerScopeReady: true });
    expect(JSON.stringify(response.json())).not.toContain('sensitive-');
    expect(response.json()).not.toHaveProperty('scopes');
  });

  it('starts session-bound follower consent without saving policies before OAuth callback', async () => {
    const h = await createHarness();
    h.integrations.beginFollowerAuthorization = vi.fn(async (input) => ({ url: 'https://id.twitch.tv/oauth2/authorize?state=opaque', input }));
    const payload = {
      expectedVersion: 9,
      policies: { 'queue:lista': { minimumRole: 'follower' } },
    };
    const response = await h.app.inject({ method: 'POST', url: '/api/command-policies/follower-authorization', headers: h.headers, payload });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ authorizationUrl: 'https://id.twitch.tv/oauth2/authorize?state=opaque' });
    expect(h.integrations.beginFollowerAuthorization).toHaveBeenCalledWith({
      sessionId: expect.any(String), expectedVersion: 9, policies: payload.policies,
    });
    expect(h.repository.updateCommandPolicies).not.toHaveBeenCalled();
  });

  it('rejects follower consent requests without a follower threshold', async () => {
    const h = await createHarness();
    h.integrations.beginFollowerAuthorization = vi.fn();
    const response = await h.app.inject({ method: 'POST', url: '/api/command-policies/follower-authorization', headers: h.headers, payload: {
      expectedVersion: 1, policies: { 'queue:lista': { minimumRole: 'subscriber' } },
    } });
    expect(response.statusCode).toBe(400);
    expect(h.integrations.beginFollowerAuthorization).not.toHaveBeenCalled();
    expect(h.repository.updateCommandPolicies).not.toHaveBeenCalled();
  });

  it('sanitizes failures while starting follower consent', async () => {
    const h = await createHarness();
    h.integrations.beginFollowerAuthorization = vi.fn(async () => { throw new Error('client secret leaked'); });
    const response = await h.app.inject({ method: 'POST', url: '/api/command-policies/follower-authorization', headers: h.headers, payload: {
      expectedVersion: 1, policies: { 'queue:lista': { minimumRole: 'follower' } },
    } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Não foi possível iniciar a autorização adicional da Twitch.' });
    expect(response.body).not.toContain('client secret leaked');
    await h.app.close();
  });

  it('updates only known mutable command policies through CSRF, idempotency and optimistic version checks', async () => {
    const h = await createHarness();
    const payload = { expectedVersion: 1, policies: { 'queue:lista': { minimumRole: 'subscriber' } } };
    const denied = await h.app.inject({ method: 'PATCH', url: '/api/command-policies', headers: h.sessionHeaders, payload });
    expect(denied.statusCode).toBe(403);
    const invalid = await h.app.inject({ method: 'PATCH', url: '/api/command-policies', headers: h.headers, payload: { ...payload, policies: { 'global:conta:set': { minimumRole: 'everyone' } } } });
    expect(invalid.statusCode).toBe(400);
    expect(h.repository.updateCommandPolicies).not.toHaveBeenCalled();
    const updated = await h.app.inject({ method: 'PATCH', url: '/api/command-policies', headers: h.headers, payload });
    expect(updated.statusCode).toBe(200);
    expect(h.repository.updateCommandPolicies).toHaveBeenCalledWith({ expectedVersion: 1, policies: payload.policies, actorId: expect.any(String), origin: 'panel' });
    expect(updated.json()).toEqual({ schemaVersion: 3, version: 2, policies: payload.policies });
  });

  it('rejects mutations that omit a valid idempotency key', async () => {
    const h = await createHarness();
    const response = await h.rawInject({ method: 'POST', url: '/api/queues', headers: { ...h.headers, 'idempotency-key': 'bad' }, payload: { slug: 'missing-key', title: 'No key', cost: 10 } });
    expect(response.statusCode).toBe(400);
    expect(h.repository.createQueueWithRewardIntent).not.toHaveBeenCalled();
    await h.app.close();
  });

  it('reports that operator reconciliation is unavailable until Twitch is connected', async () => {
    const h = await createHarness();
    const response = await h.app.inject({ method: 'POST', url: '/api/reconciliation', headers: h.headers, payload: {} });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'A integração Twitch não está pronta para sincronização.' });
    await h.app.close();
  });

  it('lets an authenticated operator request Twitch reconciliation', async () => {
    const h = await createHarness();
    h.integrations.reconcileNow = vi.fn(async () => ({ status: 'complete', imported: 2, issues: [] }));
    const denied = await h.app.inject({ method: 'POST', url: '/api/reconciliation', headers: h.sessionHeaders, payload: {} });
    expect(denied.statusCode).toBe(403);
    const response = await h.app.inject({ method: 'POST', url: '/api/reconciliation', headers: h.headers, payload: {} });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'complete', imported: 2 });
    expect(h.integrations.reconcileNow).toHaveBeenCalledTimes(1);
    await h.app.close();
  });

  it('returns a safe setup projection and never emits configured secrets', async () => {
    const h = await createHarness();
    h.integrations.getSetupState = vi.fn(async () => ({ callbackUrl: 'https://localhost:3000/callback', clientId: 'client-id', secretConfigured: true, clientSecret: 'must-not-leak', chatStatus: 'connected', rewardStatus: 'unsupported', eligibility: { eligible: false, broadcasterType: 'unknown', channelPointsAvailable: false, rewardCount: 46, rewardLimit: 50, nearRewardLimit: true, privateToken: 'must-not-leak' } }));
    const response = await h.app.inject({ method: 'GET', url: '/api/setup', headers: h.sessionHeaders });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ callbackUrl: 'https://localhost:3000/callback', clientId: 'client-id', secretConfigured: true, connected: false, broadcasterId: null, scopes: [], status: 'not_configured', chatStatus: 'connected', rewardStatus: 'unsupported', eligibility: { eligible: false, broadcasterType: 'unknown', channelPointsAvailable: false, rewardCount: 46, rewardLimit: 50, nearRewardLimit: true } });
    expect(response.body).not.toContain('must-not-leak');
    await h.app.close();
  });

  it('renders an on-brand OAuth callback confirmation with a 30-second return to the panel', async () => {
    const h = await createHarness();
    h.integrations.completeAuthorization = vi.fn(async () => ({ displayName: '<Canal>' }));
    const response = await h.app.inject({ method: 'GET', url: '/callback?code=auth-code&state=valid-state', headers: h.sessionHeaders });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('Fila Local');
    expect(response.body).toContain('callback-card');
    expect(response.body).toContain('&lt;Canal&gt;');
    expect(response.body).toContain('window.setTimeout');
    expect(response.body).toContain('30000');
    expect(response.body).toContain("window.history.replaceState(null,'','/callback')");
    expect(response.body).toContain('href="/"');
    expect(response.body).not.toContain('auth-code');
    await h.app.close();
  });

  it('renders the OAuth callback with the selected product locale and escaped channel text', async () => {
    const catalogs = {
      en: {
        'translation.unavailable': 'Product text unavailable.',
        'setup.callback.success_title': 'Channel connected',
        'setup.callback.success_message': 'The channel {channel} is authorized for this installation.',
        'setup.callback.secure': 'Secure connection',
        'setup.callback.local_installation': 'Local installation',
        'setup.callback.return_message': 'You can return now. This page returns to the panel in {seconds} seconds.',
        'setup.callback.return_action': 'Return to panel',
        'setup.callback.eyebrow_success': 'SETUP COMPLETE',
      },
    };
    const h = await createHarness({ getSetupCatalogs: async () => catalogs });
    h.repository.getProductLocale.mockResolvedValue({ locale: 'en', revision: 2 });
    h.integrations.completeAuthorization = vi.fn(async () => ({ displayName: '<Channel>' }));
    const response = await h.app.inject({ method: 'GET', url: '/callback?code=auth-code&state=valid-state', headers: h.sessionHeaders });
    expect(response.body).toContain('<html lang="en">');
    expect(response.body).toContain('Channel connected');
    expect(response.body).toContain('The channel &lt;Channel&gt; is authorized for this installation.');
    expect(response.body).toContain('Return to panel');
    expect(response.body).not.toContain('<Channel>');
    await h.app.close();
  });

  it('renders a safe on-brand callback recovery page when Twitch authorization is declined', async () => {
    const h = await createHarness();
    const response = await h.app.inject({ method: 'GET', url: '/callback?error=access_denied&error_description=secret-data&state=oauth-state', headers: h.sessionHeaders });
    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('callback-card');
    expect(response.body).toContain('Não foi possível conectar a Twitch');
    expect(response.body).toContain('id="callback-countdown">30');
    expect(response.body).toContain('window.setTimeout');
    expect(response.body).toContain('30000');
    expect(response.body).toContain('href="/"');
    expect(response.body).toContain("window.history.replaceState(null,'','/callback')");
    expect(response.body).not.toContain('secret-data');
    expect(response.body).not.toContain('oauth-state');
    await h.app.close();
  });

  it('validates queue configuration, requires a CSRF protected session, and returns an explicit DTO', async () => {
    const h = await createHarness();
    const denied = await h.app.inject({ method: 'POST', url: '/api/queues', headers: { host: 'localhost:3000', origin: 'https://localhost:3000' }, payload: {} });
    expect(denied.statusCode).toBe(401);
    const invalid = await h.app.inject({ method: 'POST', url: '/api/queues', headers: h.headers, payload: { slug: 'add', title: '<script>', cost: 0 } });
    expect(invalid.statusCode).toBe(400);
    expect(h.repository.createQueue).not.toHaveBeenCalled();
    const created = await h.app.inject({ method: 'POST', url: '/api/queues', headers: h.headers, payload: { slug: 'abismo', title: 'Abismo', cost: 100 } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ id: 'queue-id', slug: 'abismo', uidMode: 'hidden', remoteSyncStatus: 'pending_create' });
    expect(h.repository.createQueueWithRewardIntent).toHaveBeenCalledWith(expect.objectContaining({ slug: 'abismo', title: 'Abismo', cost: 100, uidMode: 'hidden', isOpen: false }));
    expect(h.repository.createQueue).not.toHaveBeenCalled();
    expect(created.json()).toHaveProperty('entries');
    await h.app.close();
  });

  it('validates and persists the Twitch-native limits when creating a queue', async () => {
    const h = await createHarness();
    const response = await h.app.inject({ method: 'POST', url: '/api/queues', headers: h.headers, payload: {
      slug: 'abismo', title: 'Abismo', cost: 100,
      maxRedemptionsPerStream: 20, maxRedemptionsPerUserPerStream: 2, globalCooldownSeconds: 90,
    } });
    expect(response.statusCode).toBe(201);
    expect(h.repository.createQueueWithRewardIntent).toHaveBeenCalledWith(expect.objectContaining({
      maxRedemptionsPerStream: 20, maxRedemptionsPerUserPerStream: 2, globalCooldownSeconds: 90,
    }));
    expect(response.json()).toMatchObject({
      maxRedemptionsPerStream: 20, maxRedemptionsPerUserPerStream: 2, globalCooldownSeconds: 90,
    });
    const invalid = await h.app.inject({ method: 'POST', url: '/api/queues', headers: h.headers, payload: {
      slug: 'outro', title: 'Outra', cost: 100, maxRedemptionsPerStream: 0,
    } });
    expect(invalid.statusCode).toBe(400);
    expect(h.repository.createQueueWithRewardIntent).toHaveBeenCalledTimes(1);
    await h.app.close();
  });

  it('creates a manual-only queue through the protected API without a reward or cost', async () => {
    const h = await createHarness();
    const response = await h.app.inject({ method: 'POST', url: '/api/queues', headers: h.headers, payload: {
      slug: 'free-queue', title: 'Fila gratuita', queueMode: 'manual_only',
      callMessage: '{user}, sua vez chegou!', callTimeoutMin: null, uidMode: 'visible',
    } });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ queueMode: 'manual_only', rewardOrigin: 'none', rewardId: null, cost: null, isOpen: false, remoteSyncStatus: 'local_only' });
    expect(h.repository.createManualQueue).toHaveBeenCalledWith(expect.objectContaining({ slug: 'free-queue', title: 'Fila gratuita', callMessage: '{user}, sua vez chegou!', callTimeoutMin: null, uidMode: 'visible', actorId: h.headers.cookie.split('=')[1] }));
    expect(h.repository.createQueueWithRewardIntent).not.toHaveBeenCalled();
    await h.app.close();
  });

  it('requests a durable switch to manual-only mode through a protected route', async () => {
    const h = await createHarness();
    h.repository.requestManualModeTransition = vi.fn(async () => ({ status: 'pending', queue: { ...h.repository.queue, queueMode: 'channel_points', modeTransitionStatus: 'pending_pause', isOpen: false, remoteSyncStatus: 'pending_close', rewardId: 'reward-1' } }));
    const denied = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/manual-mode', headers: h.sessionHeaders, payload: {} });
    expect(denied.statusCode).toBe(403);
    const response = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/manual-mode', headers: h.headers, payload: {} });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ status: 'pending', queue: { queueMode: 'channel_points', modeTransitionStatus: 'pending_pause', rewardId: 'reward-1' } });
    expect(h.repository.requestManualModeTransition).toHaveBeenCalledWith(expect.objectContaining({ queueId: 'queue-id', actorId: h.headers.cookie.split('=')[1], origin: 'panel' }));
    await h.app.close();
  });

  it('updates only validated local queue settings through the protected route', async () => {
    const h = await createHarness();
    h.repository.updateLocalQueueSettings = vi.fn(async ({ settings }) => ({ id: 'queue-id', slug: 'abismo', title: 'Abismo', cost: 100, uidMode: 'visible', ...settings, version: 2 }));
    const denied = await h.app.inject({ method: 'PATCH', url: '/api/queues/queue-id/settings', headers: h.sessionHeaders, payload: { expectedVersion: 1, callTimeoutMin: null } });
    expect(denied.statusCode).toBe(403);
    const invalid = await h.app.inject({ method: 'PATCH', url: '/api/queues/queue-id/settings', headers: h.headers, payload: { expectedVersion: 1, callTimeoutMin: 0 } });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ code: 'INVALID_QUEUE_SETTINGS' });
    expect(h.repository.updateLocalQueueSettings).not.toHaveBeenCalled();
    const remoteOnly = await h.app.inject({ method: 'PATCH', url: '/api/queues/queue-id/settings', headers: h.headers, payload: { expectedVersion: 1, uidMode: 'hidden' } });
    expect(remoteOnly.statusCode).toBe(400);
    expect(remoteOnly.json()).toMatchObject({ code: 'INVALID_LOCAL_QUEUE_SETTING' });
    const invalidTemplate = await h.app.inject({ method: 'PATCH', url: '/api/queues/queue-id/settings', headers: h.headers, payload: { expectedVersion: 1, callMessage: '{secret}' } });
    expect(invalidTemplate.statusCode).toBe(400);
    expect(invalidTemplate.json()).toMatchObject({ code: 'INVALID_CALL_MESSAGE_TEMPLATE' });
    expect(h.repository.updateLocalQueueSettings).not.toHaveBeenCalled();
    const response = await h.app.inject({ method: 'PATCH', url: '/api/queues/queue-id/settings', headers: h.headers, payload: { expectedVersion: 1, callTimeoutMin: null, showUidInList: true, autoSwitchAccount: true } });
    expect(response.statusCode).toBe(200);
    expect(h.repository.updateLocalQueueSettings).toHaveBeenCalledWith(expect.objectContaining({
      queueId: 'queue-id', expectedVersion: 1, settings: { callTimeoutMin: null, showUidInList: true, autoSwitchAccount: true },
      actorId: h.headers.cookie.split('=')[1], origin: 'panel',
    }));
    await h.app.close();
  });

  it('returns a stable code for an expected stale queue-settings conflict', async () => {
    const h = await createHarness();
    h.repository.updateLocalQueueSettings = vi.fn().mockRejectedValue(Object.assign(new Error('version conflict'), { code: 'STALE_QUEUE_VERSION' }));

    const response = await h.app.inject({ method: 'PATCH', url: '/api/queues/queue-id/settings', headers: h.headers, payload: {
      expectedVersion: 1, callTimeoutMin: 15,
    } });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'STALE_QUEUE_VERSION' });
    await h.app.close();
  });

  it('returns a safe diagnostic reference when saving local queue settings fails unexpectedly', async () => {
    const referenceId = '33333333-3333-4333-8333-333333333333';
    const reportDiagnostic = vi.fn(() => referenceId);
    const h = await createHarness({ reportDiagnostic });
    h.repository.updateLocalQueueSettings = vi.fn().mockRejectedValue(new Error('database password and raw SQL'));

    const response = await h.app.inject({ method: 'PATCH', url: '/api/queues/queue-id/settings', headers: h.headers, payload: {
      expectedVersion: 1, callTimeoutMin: 15,
    } });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ code: 'INTERNAL_ERROR', error: 'Não foi possível salvar as configurações da fila.', referenceId });
    expect(response.headers['x-error-reference']).toBe(referenceId);
    expect(response.body).not.toMatch(/database password|raw SQL/);
    expect(reportDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ source: 'http.queue.settings', error: expect.any(Error) }));
    await h.app.close();
  });

  it('requests version-checked Twitch reward edits through a durable repository operation', async () => {
    const h = await createHarness();
    h.repository.updateQueueRewardSettings = vi.fn(async () => ({ status: 'pending', queue: { id: 'queue-id', title: 'Teatro', cost: 200, version: 2, remoteSyncStatus: 'pending_update' } }));
    const denied = await h.app.inject({ method: 'PATCH', url: '/api/queues/queue-id/reward-settings', headers: h.sessionHeaders, payload: { expectedVersion: 1, title: 'Teatro', cost: 200 } });
    expect(denied.statusCode).toBe(403);
    const invalid = await h.app.inject({ method: 'PATCH', url: '/api/queues/queue-id/reward-settings', headers: h.headers, payload: { expectedVersion: 1, title: 'Teatro', cost: 0 } });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ code: 'INVALID_REWARD_SETTINGS' });
    expect(h.repository.updateQueueRewardSettings).not.toHaveBeenCalled();
    const response = await h.app.inject({ method: 'PATCH', url: '/api/queues/queue-id/reward-settings', headers: h.headers, payload: {
      expectedVersion: 1, title: 'Teatro', cost: 200, rewardPrompt: 'UID opcional', uidMode: 'visible',
      maxRedemptionsPerStream: 30, maxRedemptionsPerUserPerStream: 3, globalCooldownSeconds: 120,
    } });
    expect(response.statusCode).toBe(202);
    expect(h.repository.updateQueueRewardSettings).toHaveBeenCalledWith(expect.objectContaining({
      queueId: 'queue-id', expectedVersion: 1,
      settings: { title: 'Teatro', cost: 200, rewardPrompt: 'UID opcional', uidMode: 'visible', maxRedemptionsPerStream: 30, maxRedemptionsPerUserPerStream: 3, globalCooldownSeconds: 120 },
      actorId: h.headers.cookie.split('=')[1], origin: 'panel',
    }));
    await h.app.close();
  });

  it('records local operator identity on manual admission requests', async () => {
    const resolveUser = vi.fn(async () => ({ id: 'twitch-user', login: 'viewer', displayName: 'Viewer' }));
    const h = await createHarness({ resolveUser });
    h.repository.addManualEntry = vi.fn(async () => ({ status: 'created', entry: { id: 'entry-id', status: 'waiting', position: 1 } }));
    const response = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/manual-entries', headers: h.headers, payload: { login: 'viewer' } });
    expect(response.statusCode).toBe(201);
    expect(resolveUser).toHaveBeenCalledWith('viewer');
    expect(h.repository.addManualEntry).toHaveBeenCalledWith(expect.objectContaining({ actorId: h.headers.cookie.split('=')[1], origin: 'panel' }));
    await h.app.close();
  });

  it('requires an operator supplied benefit category and records verified priority via the repository', async () => {
    const resolveUser = vi.fn(async () => ({ id: 'twitch-user', login: 'viewer', displayName: 'Viewer' }));
    const h = await createHarness({ resolveUser });
    const invalid = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/manual-entries', headers: h.headers, payload: { login: 'viewer', priority: true } });
    expect(invalid.statusCode).toBe(400);
    expect(h.repository.addManualEntry).not.toHaveBeenCalled();
    const created = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/manual-entries', headers: h.headers, payload: { login: 'viewer', priority: true, priorityReason: 'external_payment' } });
    expect(created.statusCode).toBe(201);
    expect(h.repository.addManualEntry).toHaveBeenCalledWith(expect.objectContaining({ priorityReason: 'external_payment', actorId: h.headers.cookie.split('=')[1], origin: 'panel' }));
    const updated = await h.app.inject({ method: 'POST', url: '/api/entries/entry-id/priority', headers: h.headers, payload: { priority: true, reason: 'bits' } });
    expect(updated.statusCode).toBe(200);
    expect(h.repository.setEntryPriority).toHaveBeenCalledWith({ queueId: 'queue-id', entryId: 'entry-id', priority: true, reason: 'bits', actorId: h.headers.cookie.split('=')[1], origin: 'panel' });
    await h.app.close();
  });

  it('offers only exact matching app-managed rewards and requires CSRF for operator association', async () => {
    const h = await createHarness();
    h.repository.getQueueById.mockResolvedValue({ ...h.repository.getQueueById.mock.results[0]?.value, id: 'queue-id', title: 'Abismo', cost: 100, rewardPrompt: 'Send UID', uidMode: 'visible', remoteSyncStatus: 'create_unknown' });
    h.integrations.twitch = { getManagedRewards: vi.fn(async () => [
      { id: 'candidate', title: 'Abismo', cost: 100, prompt: 'Send UID', userInputRequired: true, maxRedemptionsPerStream: null, maxRedemptionsPerUserPerStream: null, globalCooldown: null, autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: true },
      { id: 'other', title: 'Different', cost: 100, prompt: 'Send UID', userInputRequired: true, maxRedemptionsPerStream: null, maxRedemptionsPerUserPerStream: null, globalCooldown: null, autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: true },
    ]) };
    h.repository.resolveUnknownRewardCreation = vi.fn(async (input) => ({ status: 'resolved', queue: { ...h.repository.getQueueById.mock.results[0].value, ...input, remoteSyncStatus: 'synced_manual' } }));

    const candidates = await h.app.inject({ method: 'GET', url: '/api/queues/queue-id/reward-candidates', headers: h.sessionHeaders });
    expect(candidates.statusCode).toBe(200);
    expect(candidates.json()).toMatchObject({
      candidates: [{ id: 'candidate', title: 'Abismo', cost: 100, prompt: 'Send UID' }],
      diagnostics: { managedRewardCount: 2, candidateCount: 1, rejectedRewardCount: 1, mismatchCounts: { title_mismatch: 1 } },
    });
    const denied = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/resolve-reward', headers: h.sessionHeaders, payload: { rewardId: 'candidate' } });
    expect(denied.statusCode).toBe(403);
    expect(h.repository.resolveUnknownRewardCreation).not.toHaveBeenCalled();
    const resolved = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/resolve-reward', headers: h.headers, payload: { rewardId: 'candidate' } });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toMatchObject({ status: 'resolved', remoteConfirmed: false });
    expect(h.repository.resolveUnknownRewardCreation).toHaveBeenCalledWith({ queueId: 'queue-id', rewardId: 'candidate', actorId: h.headers.cookie.split('=')[1] });
    await h.app.close();
  });

  it('logs safe mismatch counts when Twitch returns managed rewards but none are compatible', async () => {
    const logEvent = vi.fn();
    const h = await createHarness({ logEvent });
    h.repository.getQueueById.mockResolvedValue({ id: 'queue-id', title: 'Private queue title', cost: 100, rewardPrompt: 'private prompt', uidMode: 'hidden', remoteSyncStatus: 'create_unknown' });
    h.integrations.twitch = { getManagedRewards: vi.fn(async () => [{
      id: 'private-reward-id', title: 'Different private title', cost: 900, prompt: 'private reward prompt',
      userInputRequired: false, autoFulfill: false, shouldRedemptionsSkipRequestQueue: false,
      isEnabled: true, isPaused: false,
    }]) };
    const response = await h.app.inject({ method: 'GET', url: '/api/queues/queue-id/reward-candidates', headers: h.sessionHeaders });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      candidates: [],
      diagnostics: {
        managedRewardCount: 1, candidateCount: 0, rejectedRewardCount: 1,
        mismatchCounts: { title_mismatch: 1, cost_mismatch: 1, prompt_mismatch: 1, reward_not_paused: 1 },
      },
    });
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'queue_reward_candidates_evaluated', level: 'info',
      details: { managedRewardCount: 1, candidateCount: 0, rejectedRewardCount: 1 },
    }));
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'queue_reward_candidates_rejected', level: 'verbose',
      details: { mismatchCounts: expect.objectContaining({ title_mismatch: 1, cost_mismatch: 1, prompt_mismatch: 1, reward_not_paused: 1 }) },
    }));
    expect(JSON.stringify(logEvent.mock.calls)).not.toMatch(/Private queue title|private prompt|private-reward-id|Different private title|900/);
    await h.app.close();
  });

  it('correlates reward-candidate lookup failures without returning the raw Twitch error', async () => {
    const reportDiagnostic = vi.fn(() => '11111111-1111-4111-8111-111111111111');
    const h = await createHarness({ reportDiagnostic });
    h.repository.getQueueById.mockResolvedValue({ id: 'queue-id', title: 'Abismo', cost: 100, rewardPrompt: 'UID', uidMode: 'visible', remoteSyncStatus: 'create_unknown' });
    h.integrations.twitch = { getManagedRewards: vi.fn(async () => { throw new Error('authorization=secret raw response'); }) };

    const response = await h.app.inject({ method: 'GET', url: '/api/queues/queue-id/reward-candidates', headers: h.sessionHeaders });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Não foi possível consultar as recompensas gerenciáveis da Twitch.', referenceId: '11111111-1111-4111-8111-111111111111' });
    expect(response.headers['x-error-reference']).toBe('11111111-1111-4111-8111-111111111111');
    expect(response.body).not.toMatch(/authorization=secret|raw response/);
    expect(reportDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ source: 'http.queue.reward_candidates', error: expect.any(Error) }));
    await h.app.close();
  });

  it('correlates unavailable Twitch adapter responses for reward recovery', async () => {
    const reportDiagnostic = vi.fn(() => '22222222-2222-4222-8222-222222222222');
    const h = await createHarness({ reportDiagnostic });
    h.repository.getQueueById.mockResolvedValue({ id: 'queue-id', title: 'Abismo', cost: 100, rewardPrompt: 'UID', uidMode: 'visible', remoteSyncStatus: 'create_unknown' });
    h.integrations.twitch = null;

    const candidates = await h.app.inject({ method: 'GET', url: '/api/queues/queue-id/reward-candidates', headers: h.sessionHeaders });
    const association = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/resolve-reward', headers: h.headers, payload: { rewardId: 'candidate' } });

    for (const response of [candidates, association]) {
      expect(response.statusCode).toBe(503);
      expect(response.json().referenceId).toBe('22222222-2222-4222-8222-222222222222');
      expect(response.headers['x-error-reference']).toBe('22222222-2222-4222-8222-222222222222');
    }
    expect(reportDiagnostic).toHaveBeenCalledTimes(2);
    expect(reportDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ source: 'http.queue.reward_candidates' }));
    expect(reportDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ source: 'http.queue.resolve_reward' }));
    await h.app.close();
  });

  it('refuses reward association when the selected managed reward no longer matches the intended configuration', async () => {
    const h = await createHarness();
    h.repository.getQueueById.mockResolvedValue({ id: 'queue-id', title: 'Abismo', cost: 100, rewardPrompt: 'Send UID', uidMode: 'visible', remoteSyncStatus: 'create_unknown' });
    h.integrations.twitch = { getManagedRewards: vi.fn(async () => [{ id: 'candidate', title: 'Abismo', cost: 999, prompt: 'Send UID', userInputRequired: true, maxRedemptionsPerStream: null, maxRedemptionsPerUserPerStream: null, globalCooldown: null, autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: true }]) };
    h.repository.resolveUnknownRewardCreation = vi.fn();
    const response = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/resolve-reward', headers: h.headers, payload: { rewardId: 'candidate' } });
    expect(response.statusCode).toBe(409);
    expect(h.repository.resolveUnknownRewardCreation).not.toHaveBeenCalled();
    await h.app.close();
  });

  it('refuses association when a previously listed reward is no longer returned by Twitch', async () => {
    const h = await createHarness();
    h.repository.getQueueById.mockResolvedValue({ id: 'queue-id', title: 'Abismo', cost: 100, rewardPrompt: 'Send UID', uidMode: 'visible', remoteSyncStatus: 'create_unknown' });
    h.integrations.twitch = { getManagedRewards: vi.fn(async () => []) };
    h.repository.resolveUnknownRewardCreation = vi.fn();

    const response = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/resolve-reward', headers: h.headers, payload: { rewardId: 'reward-that-disappeared' } });

    expect(response.statusCode).toBe(409);
    expect(response.body).not.toContain('reward-that-disappeared');
    expect(h.repository.resolveUnknownRewardCreation).not.toHaveBeenCalled();
    await h.app.close();
  });

  it('returns a correlated safe response when an unexpected failure starts queue deletion', async () => {
    const reportDiagnostic = vi.fn(() => '33333333-3333-4333-8333-333333333333');
    const domainService = { deleteQueue: vi.fn(async () => { throw new Error('database password and raw SQL'); }) };
    const h = await createHarness({ domainService, reportDiagnostic });

    const response = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/delete', headers: h.headers, payload: { confirm: true } });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ code: 'QUEUE_DELETE_UNAVAILABLE', error: 'A exclusão não pôde ser iniciada.', referenceId: '33333333-3333-4333-8333-333333333333' });
    expect(response.headers['x-error-reference']).toBe('33333333-3333-4333-8333-333333333333');
    expect(response.body).not.toMatch(/database password|raw SQL/);
    expect(reportDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ source: 'http.queue.delete', error: expect.any(Error) }));
    await h.app.close();
  });

  it('returns operator entries and UIDs only from the protected queue endpoint', async () => {
    const h = await createHarness();
    const publicState = await h.app.inject({ method: 'GET', url: '/api/state', headers: h.sessionHeaders });
    expect(publicState.statusCode).toBe(200);
    expect(publicState.json()).toMatchObject({ product_version: 'v0.1.0-1234567-alpha', api_contract_version: '1', revision: 1 });
    expect(publicState.json().queues[0].entries[0].uid).toBeUndefined();
    const operatorQueues = await h.app.inject({ method: 'GET', url: '/api/queues', headers: h.sessionHeaders });
    expect(operatorQueues.json()[0].entries[0]).toMatchObject({ id: 'entry-id', userLogin: 'viewer', uid: '123456789' });
    await h.app.close();
  });

  it('returns the settings needed to reopen and edit a queue in the operator projection', async () => {
    const h = await createHarness();
    h.repository.listQueueProjection.mockResolvedValue([{
      ...h.repository.getQueueById.mock.results[0]?.value,
      callMessage: 'Sua vez, {user}!', callTimeoutMin: 25,
      autoSwitchAccount: true, refundIfRemovedWhileCalled: false,
      refundOnNoShow: true, refundIfViewerLeavesCalled: true,
    }]);

    const response = await h.app.inject({ method: 'GET', url: '/api/queues', headers: h.sessionHeaders });

    expect(response.statusCode).toBe(200);
    expect(response.json()[0]).toMatchObject({
      callMessage: 'Sua vez, {user}!', callTimeoutMin: 25,
      autoSwitchAccount: true, refundIfRemovedWhileCalled: false,
      refundOnNoShow: true, refundIfViewerLeavesCalled: true,
    });
    await h.app.close();
  });

  it('projects call delivery and persisted deadline only in the protected operator queue response', async () => {
    const h = await createHarness();
    const calledAt = new Date('2026-10-07T12:00:00.000Z');
    const callNotifiedAt = new Date('2026-10-07T12:00:04.000Z');
    const callDeadlineAt = new Date('2026-10-07T12:10:04.000Z');
    h.repository.listQueueProjection.mockResolvedValue([{ ...h.repository.createQueue.mock.results[0]?.value, entries: [{
      id: 'called-entry', status: 'called', position: null, userLogin: 'viewer', displayName: 'Viewer', uid: null,
      calledAt, callNotifiedAt, callDeadlineAt,
    }] }]);

    const operatorQueues = await h.app.inject({ method: 'GET', url: '/api/queues', headers: h.sessionHeaders });
    expect(operatorQueues.json()[0].entries[0]).toMatchObject({ calledAt: calledAt.toISOString(), callNotifiedAt: callNotifiedAt.toISOString(), callDeadlineAt: callDeadlineAt.toISOString() });
    const panelProjection = await h.app.inject({ method: 'GET', url: '/api/state', headers: h.sessionHeaders });
    expect(panelProjection.json().queues[0].entries[0].callDeadlineAt).toBe(callDeadlineAt.toISOString());
    await h.app.close();
  });

  it('includes a stable product locale and revision in the protected state projection', async () => {
    const h = await createHarness();
    h.repository.getLocalState = vi.fn(async () => ({ productLocale: { locale: 'de', revision: 4 } }));
    const response = await h.app.inject({ method: 'GET', url: '/api/state', headers: h.sessionHeaders });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ product_locale: { locale: 'de', revision: 4 } });
    await h.app.close();
  });

  it('projects Twitch API, chat, and reward capability separately to the local panel', async () => {
    const h = await createHarness();
    h.integrations.status = 'ineligible';
    h.integrations.chatStatus = 'connected';
    h.integrations.rewardStatus = 'unsupported';
    const response = await h.app.inject({ method: 'GET', url: '/api/state', headers: h.sessionHeaders });
    expect(response.json().connectivity).toEqual({ database: 'connected', twitch: 'ineligible', twitch_chat: 'connected', twitch_rewards: 'unsupported' });
    await h.app.close();
  });

  it('serves terminal queue history only through the protected operator route', async () => {
    const h = await createHarness();
    h.repository.getQueueById.mockResolvedValue({ id: 'queue-id', lifecycleStatus: 'active' });
    h.repository.listQueueHistoryProjection = vi.fn(async () => [{ id: 'old-entry', displayName: 'Former viewer', status: 'completed', finishedAt: new Date('2026-01-01T00:00:00Z'), terminalReason: 'service_completed' }]);
    const denied = await h.app.inject({ method: 'GET', url: '/api/queues/queue-id/history', headers: { host: 'localhost:3000' } });
    expect(denied.statusCode).toBe(401);
    const response = await h.app.inject({ method: 'GET', url: '/api/queues/queue-id/history', headers: h.sessionHeaders });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([{ id: 'old-entry', displayName: 'Former viewer', status: 'completed', finishedAt: '2026-01-01T00:00:00.000Z', terminalReason: 'service_completed' }]);
    expect(h.repository.listQueueHistoryProjection).toHaveBeenCalledWith('queue-id', { limit: 100 });
    await h.app.close();
  });

  it('moves only waiting entries through the protected panel API with a validated position', async () => {
    const h = await createHarness();
    h.repository.moveWaitingEntry = vi.fn(async () => ({ status: 'moved', entryId: 'entry-id', position: 2 }));
    const denied = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/move', headers: h.sessionHeaders, payload: { entryId: 'entry-id', position: 2 } });
    expect(denied.statusCode).toBe(403);
    const invalid = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/move', headers: h.headers, payload: { entryId: 'entry-id', position: 0 } });
    expect(invalid.statusCode).toBe(400);
    expect(h.repository.moveWaitingEntry).not.toHaveBeenCalled();
    const moved = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/move', headers: h.headers, payload: { entryId: 'entry-id', position: 2 } });
    expect(moved.statusCode).toBe(200);
    expect(moved.json()).toEqual({ status: 'moved', entryId: 'entry-id', position: 2 });
    expect(h.repository.moveWaitingEntry).toHaveBeenCalledWith({ queueId: 'queue-id', entryId: 'entry-id', position: 2 });
    await h.app.close();
  });

  it('queues an explicit call notification resend through the protected panel API', async () => {
    const h = await createHarness();
    h.repository.resendCallNotification = vi.fn(async () => ({ status: 'queued', entryId: 'entry-id' }));
    const response = await h.app.inject({ method: 'POST', url: '/api/entries/entry-id/call-notification/resend', headers: h.headers, payload: {} });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'queued', entryId: 'entry-id' });
    expect(h.repository.resendCallNotification).toHaveBeenCalledWith({ entryId: 'entry-id', actorId: h.headers.cookie.split('=')[1] });
    await h.app.close();
  });

  it('requires the local session and CSRF token for call notification resend', async () => {
    const h = await createHarness();
    h.repository.resendCallNotification = vi.fn();
    const response = await h.app.inject({ method: 'POST', url: '/api/entries/entry-id/call-notification/resend', headers: h.sessionHeaders, payload: {} });
    expect(response.statusCode).toBe(403);
    expect(h.repository.resendCallNotification).not.toHaveBeenCalled();
    await h.app.close();
  });

  it('archives and unarchives queues through explicit protected routes', async () => {
    const h = await createHarness();
    h.repository.archiveQueue = vi.fn(async () => ({ status: 'pending', queue: { id: 'queue-id', isArchived: true, isOpen: false, lifecycleStatus: 'active' } }));
    h.repository.unarchiveQueue = vi.fn(async () => ({ status: 'unarchived', queue: { id: 'queue-id', isArchived: false, isOpen: false, lifecycleStatus: 'active' } }));

    const archived = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/archive', headers: h.headers, payload: {} });
    expect(archived.statusCode).toBe(200);
    expect(archived.json()).toMatchObject({ status: 'pending', queue: { isArchived: true } });
    expect(h.repository.archiveQueue).toHaveBeenCalledWith({ queueId: 'queue-id', actorId: h.headers.cookie.split('=')[1], origin: 'panel' });
    const unarchived = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/unarchive', headers: h.headers, payload: {} });
    expect(unarchived.statusCode).toBe(200);
    expect(unarchived.json()).toMatchObject({ status: 'unarchived', queue: { isArchived: false, isOpen: false } });
    await h.app.close();
  });

  it('requires CSRF and calls the domain service to request queue deletion', async () => {
    const domainService = { deleteQueue: vi.fn(async () => ({ status: 'pending', activeRemoved: 2, refundsRequested: 1, queue: { id: 'queue-id', isArchived: true, isOpen: false, lifecycleStatus: 'deleting' } })) };
    const h = await createHarness({ domainService });
    const denied = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/delete', headers: h.sessionHeaders, payload: {} });
    expect(denied.statusCode).toBe(403);
    expect(domainService.deleteQueue).not.toHaveBeenCalled();
    const missingConfirmation = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/delete', headers: h.headers, payload: {} });
    expect(missingConfirmation.statusCode).toBe(400);
    expect(domainService.deleteQueue).not.toHaveBeenCalled();
    const accepted = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/delete', headers: h.headers, payload: { confirm: true } });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ status: 'pending', activeRemoved: 2, refundsRequested: 1, queue: { lifecycleStatus: 'deleting' } });
    expect(domainService.deleteQueue).toHaveBeenCalledWith({ queueId: 'queue-id', actorId: h.headers.cookie.split('=')[1], origin: 'panel' });
    await h.app.close();
  });

  it('returns a stable safe error code when confirmed reward state blocks queue deletion', async () => {
    const domainService = { deleteQueue: vi.fn(async () => { throw Object.assign(new Error('private database detail'), { code: 'QUEUE_REWARD_NOT_READY' }); }) };
    const h = await createHarness({ domainService });

    const response = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/delete', headers: h.headers, payload: { confirm: true } });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'QUEUE_REWARD_NOT_READY' });
    expect(response.body).not.toContain('private database detail');
    await h.app.close();
  });

  it('includes a visible UID in the state projection only when the overlay toggle is enabled', async () => {
    const h = await createHarness();
    h.repository.listQueueProjection.mockResolvedValue([{ ...h.repository.createQueue.mock.results[0]?.value, uidMode: 'visible', showUidInOverlay: true, entries: [{ id: 'entry-id', status: 'waiting', uid: '123456789' }] }]);
    const response = await h.app.inject({ method: 'GET', url: '/api/state', headers: h.sessionHeaders });
    expect(response.json().queues[0].entries[0].uid).toBe('123456789');
    await h.app.close();
  });

  it('refuses Twitch credential mutation while integration setup is unavailable', async () => {
    const h = await createHarness();
    const response = await h.app.inject({ method: 'POST', url: '/api/setup/application', headers: h.headers, payload: { clientId: 'id', clientSecret: 'secret' } });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('secret');
    await h.app.close();
  });

  it('requires the local session and CSRF token to resolve unknown points state', async () => {
    const h = await createHarness();
    h.repository.resolveUnknownFinancialOperation = vi.fn(async (id, actorId) => ({ status: 'resolved_manual', id, actorId }));
    const denied = await h.app.inject({ method: 'POST', url: '/api/operations/op-id/resolve-unknown', headers: h.sessionHeaders, payload: {} });
    expect(denied.statusCode).toBe(403);
    expect(h.repository.resolveUnknownFinancialOperation).not.toHaveBeenCalled();
    const response = await h.app.inject({ method: 'POST', url: '/api/operations/op-id/resolve-unknown', headers: h.headers, payload: {} });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'resolved_manual', remoteConfirmed: false });
    expect(h.repository.resolveUnknownFinancialOperation).toHaveBeenCalledWith('op-id', h.headers.cookie.split('=')[1]);
    await h.app.close();
  });

  it('exposes only safe queue-deletion operation fields to the protected operations panel', async () => {
    const h = await createHarness();
    h.repository.listFinancialOperations = vi.fn(async () => [{ id: 'delete-task', operationType: 'reward.delete', entityId: 'queue-id', status: 'unknown', attempts: 3, lastError: 'queue_delete_result_unknown', secret: 'must-not-leak' }]);
    const response = await h.app.inject({ method: 'GET', url: '/api/operations', headers: h.sessionHeaders });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([{ id: 'delete-task', type: 'reward.delete', entityId: 'queue-id', status: 'unknown', attempts: 3, nextAttemptAt: null }]);
    expect(response.body).not.toContain('must-not-leak');
    expect(response.body).not.toContain('queue_delete_result_unknown');
    await h.app.close();
  });

  it('uses a same-session review and confirmation for panel queue clearing', async () => {
    const h = await createHarness();
    const preview = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/clear-preview', headers: h.headers, payload: {} });
    expect(preview.json()).toMatchObject({ status: 'confirmation_required', count: 1, refundsRequested: 1 });
    expect(h.repository.clearActiveEntries).not.toHaveBeenCalled();
    const cleared = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/clear-confirm', headers: h.headers, payload: {} });
    expect(cleared.json()).toMatchObject({ status: 'cleared', count: 1, refundsRequested: 1 });
    expect(h.repository.clearActiveEntries).toHaveBeenCalledOnce();
    await h.app.close();
  });

  it('routes a confirmed panel deletion through the late-bound production domain proxy', async () => {
    const h = await createHarness();
    h.repository.requestQueueDeletion = vi.fn(async ({ queueId }) => ({ status: 'pending', activeRemoved: 0, refundsRequested: 0, queue: { id: queueId, lifecycleStatus: 'deleting' } }));
    const runtimeService = createQueueDomainService({ repository: h.repository });
    const proxy = createQueueDomainServiceProxy({ getService: () => runtimeService });
    const app = Fastify();
    registerLocalSession(app, { port: 3000 });
    registerQueueRoutes(app, { repository: h.repository, domainService: proxy, integrations: h.integrations });
    const session = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000' } });
    const cookie = session.cookies[0];
    const headers = { host: 'localhost:3000', origin: 'https://localhost:3000', cookie: `${cookie.name}=${cookie.value}`, 'x-csrf-token': session.json().csrfToken, 'idempotency-key': 'delete-proxy-test-01' };

    const response = await app.inject({ method: 'POST', url: '/api/queues/queue-id/delete', headers, payload: { confirm: true } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'pending', queue: { lifecycleStatus: 'deleting' } });
    expect(h.repository.requestQueueDeletion).toHaveBeenCalledOnce();
    await app.close();
    await h.app.close();
  });

  it('returns a conflict when opening a queue whose Twitch reward is not confirmed', async () => {
    const h = await createHarness();
    h.repository.setQueueOpen = vi.fn(async () => { throw Object.assign(new Error('internal reward state'), { code: 'QUEUE_REWARD_NOT_READY' }); });

    const response = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/open-state', headers: h.headers, payload: { isOpen: true } });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'QUEUE_REWARD_NOT_READY' });
    expect(response.body).not.toContain('internal reward state');
    expect(h.repository.setQueueOpen).toHaveBeenCalledOnce();
    await h.app.close();
  });

  it('correlates unexpected failures from queue open, archive, unarchive, and mode-switch actions', async () => {
    const reportDiagnostic = vi.fn(({ source }) => `33333333-3333-4333-8333-${source.endsWith('archive') ? '333333333331' : '333333333332'}`);
    const h = await createHarness({ reportDiagnostic });
    const failure = new Error('secret database and Twitch details');
    h.repository.setQueueOpen = vi.fn().mockRejectedValue(failure);
    h.repository.archiveQueue = vi.fn().mockRejectedValue(failure);
    h.repository.unarchiveQueue = vi.fn().mockRejectedValue(failure);
    h.repository.requestManualModeTransition = vi.fn().mockRejectedValue(failure);

    const results = await Promise.all([
      h.app.inject({ method: 'POST', url: '/api/queues/queue-id/open-state', headers: h.headers, payload: { isOpen: true } }),
      h.app.inject({ method: 'POST', url: '/api/queues/queue-id/archive', headers: h.headers, payload: {} }),
      h.app.inject({ method: 'POST', url: '/api/queues/queue-id/unarchive', headers: h.headers, payload: {} }),
      h.app.inject({ method: 'POST', url: '/api/queues/queue-id/manual-mode', headers: h.headers, payload: {} }),
    ]);

    expect(results.map(({ statusCode }) => statusCode)).toEqual([500, 503, 503, 500]);
    for (const response of results) {
      expect(response.headers['x-error-reference']).toMatch(/^[0-9a-f-]{36}$/i);
      expect(response.body).not.toMatch(/secret database|Twitch details/);
    }
    expect(reportDiagnostic).toHaveBeenCalledTimes(4);
    expect(reportDiagnostic.mock.calls.map(([event]) => event.source)).toEqual(expect.arrayContaining([
      'http.queue.open_state', 'http.queue.archive', 'http.queue.unarchive', 'http.queue.manual_mode',
    ]));
    await h.app.close();
  });

  it('keeps an open-state request pending until Twitch confirmation instead of reporting it as completed', async () => {
    const h = await createHarness();
    h.repository.setQueueOpen = vi.fn(async (_queueId, isOpen) => ({ status: 'pending', isOpen, remoteSyncStatus: 'pending_open' }));

    const response = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/open-state', headers: h.headers, payload: { isOpen: true } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'pending', isOpen: true, remoteSyncStatus: 'pending_open' });
    expect(response.json().status).not.toBe('confirmed');
    expect(h.repository.setQueueOpen).toHaveBeenCalledWith('queue-id', true, expect.any(String));
    await h.app.close();
  });

  it('returns a stable conflict when a manual-mode transition is already unavailable', async () => {
    const h = await createHarness();
    h.repository.requestManualModeTransition = vi.fn(async () => { throw Object.assign(new Error('internal transition detail'), { code: 'QUEUE_MODE_TRANSITION_UNAVAILABLE' }); });

    const response = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/manual-mode', headers: h.headers, payload: {} });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'QUEUE_MODE_TRANSITION_UNAVAILABLE' });
    expect(response.body).not.toContain('internal transition detail');
    expect(h.repository.requestManualModeTransition).toHaveBeenCalledOnce();
    await h.app.close();
  });

  it('retries only available financial operations and reports stale or completed operations safely', async () => {
    const h = await createHarness();
    h.repository.retryOutboxManually = vi.fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const retried = await h.app.inject({ method: 'POST', url: '/api/operations/op-1/retry', headers: h.headers, payload: {} });
    const unavailable = await h.app.inject({ method: 'POST', url: '/api/operations/op-2/retry', headers: h.headers, payload: {} });

    expect(retried.statusCode).toBe(200);
    expect(retried.json()).toEqual({ status: 'pending' });
    expect(unavailable.statusCode).toBe(409);
    expect(unavailable.body).not.toContain('op-2');
    expect(h.repository.retryOutboxManually).toHaveBeenNthCalledWith(1, 'op-1');
    expect(h.repository.retryOutboxManually).toHaveBeenNthCalledWith(2, 'op-2');
    await h.app.close();
  });

  it('validates and saves Twitch application credentials without returning the secret', async () => {
    const h = await createHarness();
    h.integrations.validateAndSaveApplication = vi.fn(async ({ clientId, clientSecret }) => {
      expect(clientSecret).toBe('private-secret');
      return { clientId };
    });

    const response = await h.app.inject({ method: 'POST', url: '/api/setup/application', headers: h.headers, payload: { clientId: ' public-client ', clientSecret: 'private-secret' } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'validated', clientId: 'public-client', secretConfigured: true });
    expect(response.body).not.toContain('private-secret');
    expect(h.integrations.validateAndSaveApplication).toHaveBeenCalledOnce();
    await h.app.close();
  });

  it('does not persist or expose rejected Twitch application credentials', async () => {
    const h = await createHarness();
    h.integrations.validateAndSaveApplication = vi.fn(async () => { throw Object.assign(new Error('private secret and provider response'), { code: 'INVALID_TWITCH_CLIENT_CREDENTIALS' }); });

    const response = await h.app.inject({ method: 'POST', url: '/api/setup/application', headers: h.headers, payload: { clientId: 'client', clientSecret: 'private-secret' } });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain('private-secret');
    expect(response.body).not.toContain('provider response');
    expect(response.json()).toEqual({ error: 'Não foi possível validar as credenciais da Twitch.' });
    await h.app.close();
  });

  it('starts Twitch authorization for the current local session and fails closed when unavailable', async () => {
    const h = await createHarness();
    h.integrations.beginAuthorization = vi.fn(async (sessionId) => ({ url: `https://id.twitch.tv/oauth2/authorize?state=${sessionId}` }));

    const response = await h.app.inject({ method: 'POST', url: '/api/setup/connect', headers: h.headers, payload: {} });

    expect(response.statusCode).toBe(200);
    expect(response.json().authorizationUrl).toContain('https://id.twitch.tv/oauth2/authorize?state=');
    expect(h.integrations.beginAuthorization).toHaveBeenCalledWith(expect.any(String));
    h.integrations.beginAuthorization = undefined;
    const unavailable = await h.app.inject({ method: 'POST', url: '/api/setup/connect', headers: h.headers, payload: {} });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.body).not.toContain('state=');
    await h.app.close();
  });

  it('updates the current account label through the protected panel route and sanitizes failures', async () => {
    const h = await createHarness();
    h.repository.setCurrentAccount = vi.fn(async (label, actorId) => ({ label: label.trim(), source: 'manual', actorId }));

    const updated = await h.app.inject({ method: 'POST', url: '/api/account', headers: h.headers, payload: { label: '  Spiral Abyss  ' } });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ label: 'Spiral Abyss', source: 'manual' });
    expect(h.repository.setCurrentAccount).toHaveBeenCalledWith('  Spiral Abyss  ', expect.any(String));
    h.repository.setCurrentAccount.mockRejectedValueOnce(Object.assign(new Error('private database detail'), { code: 'DATABASE_FAILURE' }));
    const failed = await h.app.inject({ method: 'POST', url: '/api/account', headers: h.headers, payload: { label: 'Other' } });
    expect(failed.statusCode).toBe(500);
    expect(failed.body).not.toContain('private database detail');
    await h.app.close();
  });

  it('updates the default account label through a session and CSRF protected route', async () => {
    const h = await createHarness();
    const response = await h.app.inject({ method: 'POST', url: '/api/account/default', headers: h.headers, payload: { label: 'World Level 9' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ label: 'World Level 9', defaultLabel: 'World Level 9' });
    expect(h.repository.setDefaultAccountLabel).toHaveBeenCalledWith('World Level 9', h.headers.cookie.split('=')[1]);
    await h.app.close();
  });

  it('routes panel transitions through the shared domain service', async () => {
    const domainService = { transitionEntry: vi.fn(async () => ({ id: 'entry-id', status: 'called', financialDecision: 'no_operation' })) };
    const h = await createHarness({ domainService });
    const response = await h.app.inject({ method: 'POST', url: '/api/entries/entry-id/transitions', headers: h.headers, payload: { to: 'called', reason: 'operator_call' } });
    expect(response.statusCode).toBe(200);
    expect(domainService.transitionEntry).toHaveBeenCalledWith(expect.objectContaining({ entryId: 'entry-id', to: 'called', origin: 'panel' }));
    expect(h.repository.transitionEntry).not.toHaveBeenCalled();
    await h.app.close();
  });

  it('routes panel queue calls through the shared domain service', async () => {
    const domainService = { callNext: vi.fn(async () => [{ id: 'entry-id', status: 'called' }]) };
    const h = await createHarness({ domainService });
    const response = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/call', headers: h.headers, payload: { count: 1 } });
    expect(response.statusCode).toBe(200);
    expect(domainService.callNext).toHaveBeenCalledWith(expect.objectContaining({ queueId: 'queue-id', count: 1 }));
    expect(h.repository.callNext).not.toHaveBeenCalled();
    await h.app.close();
  });

  it('returns a stable conflict code when reward-to-manual conversion blocks calls', async () => {
    const conflict = async () => { throw Object.assign(new Error('internal detail'), { code: 'QUEUE_MODE_TRANSITION_PENDING' }); };
    const domainService = { callNext: vi.fn(conflict), callSpecificEntry: vi.fn(conflict) };
    const h = await createHarness({ domainService });
    const groupResponse = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/call', headers: h.headers, payload: { count: 1 } });
    expect(groupResponse.statusCode).toBe(409);
    expect(groupResponse.json()).toMatchObject({ code: 'QUEUE_MODE_TRANSITION_PENDING' });
    expect(groupResponse.body).not.toContain('internal detail');
    const singleResponse = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/call', headers: h.headers, payload: { entryId: 'entry-id' } });
    expect(singleResponse.statusCode).toBe(409);
    expect(singleResponse.json()).toMatchObject({ code: 'QUEUE_MODE_TRANSITION_PENDING' });
    expect(singleResponse.body).not.toContain('internal detail');
    expect(h.repository.enqueueCallNotification).not.toHaveBeenCalled();
    await h.app.close();
  });
});
