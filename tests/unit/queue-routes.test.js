import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { registerLocalSession } from '../../apps/api/src/http/local-session.mjs';
import { registerQueueRoutes } from '../../apps/api/src/http/queue-routes.mjs';
import { createClearConfirmationService } from '../../apps/api/src/domain/clear-confirmation.mjs';
import { registerOverlayRoutes } from '../../apps/api/src/http/overlay-routes.mjs';

async function createHarness({ domainService, resolveUser = async () => null, beforeSession = async () => undefined, getSetupCatalogs } = {}) {
  const app = Fastify();
  registerLocalSession(app, { port: 3000 });
  const queue = { id: 'queue-id', slug: 'abismo', title: 'Abismo', cost: 100, uidMode: 'visible', showUidInOverlay: false, isOpen: false, isArchived: false, lifecycleStatus: 'active', version: 1 };
  queue.entries = [{ id: 'entry-id', status: 'waiting', position: 1, userLogin: 'viewer', displayName: 'Viewer', uid: '123456789' }];
  const repository = {
    getProductLocale: vi.fn(async () => ({ locale: 'pt-BR', revision: 1 })),
    beginPanelOperation: vi.fn(async () => ({ status: 'started' })),
    completePanelOperation: vi.fn(async () => true),
    createQueue: vi.fn(async (input) => ({ ...queue, ...input, uidMode: input.uidMode })),
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
    getCommandPolicyState: vi.fn(async () => ({ version: 1, policies: {} })),
    updateCommandPolicies: vi.fn(async ({ expectedVersion, policies }) => ({ version: expectedVersion + 1, policies })),
  };
  const integrations = { status: 'not_configured', twitch: null };
  const clearConfirmation = createClearConfirmationService({ repository });
  registerQueueRoutes(app, { repository, domainService, integrations, clearConfirmation, resolveUser, getSetupCatalogs, publicBaseUrl: 'https://localhost:3000', productVersion: 'v0.1.0-1234567-alpha' });
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
    h.repository.getCommandPolicyState.mockResolvedValue({ version: 7, policies: { 'queue:add': ['everyone'], 'global:conta:set': ['everyone'] } });
    const denied = await h.app.inject({ method: 'GET', url: '/api/command-catalog', headers: { host: 'localhost:3000' } });
    expect(denied.statusCode).toBe(401);
    const response = await h.app.inject({ method: 'GET', url: '/api/command-catalog', headers: h.sessionHeaders });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ version: 7, commands: expect.arrayContaining([
      expect.objectContaining({ key: 'queue:add', allowedRoles: ['streamer', 'moderator'], immutableRoles: ['streamer', 'moderator'], configurable: false }),
      expect.objectContaining({ key: 'global:conta:set', allowedRoles: ['streamer', 'moderator'], immutableRoles: ['streamer', 'moderator'], configurable: false }),
      expect.objectContaining({ key: 'global:queue:ping', allowedRoles: ['streamer', 'moderator'], configurable: false }),
    ]) });
    expect(JSON.stringify(response.json())).not.toContain('clientSecret');
  });

  it('updates only known mutable command policies through CSRF, idempotency and optimistic version checks', async () => {
    const h = await createHarness();
    const payload = { expectedVersion: 1, policies: { 'queue:lista': ['subscriber', 'moderator'] } };
    const denied = await h.app.inject({ method: 'PATCH', url: '/api/command-policies', headers: h.sessionHeaders, payload });
    expect(denied.statusCode).toBe(403);
    const invalid = await h.app.inject({ method: 'PATCH', url: '/api/command-policies', headers: h.headers, payload: { ...payload, policies: { 'global:conta:set': ['everyone'] } } });
    expect(invalid.statusCode).toBe(400);
    expect(h.repository.updateCommandPolicies).not.toHaveBeenCalled();
    const updated = await h.app.inject({ method: 'PATCH', url: '/api/command-policies', headers: h.headers, payload });
    expect(updated.statusCode).toBe(200);
    expect(h.repository.updateCommandPolicies).toHaveBeenCalledWith({ expectedVersion: 1, policies: payload.policies, actorId: expect.any(String), origin: 'panel' });
    expect(updated.json()).toEqual({ version: 2, policies: payload.policies });
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
    h.integrations.getSetupState = vi.fn(async () => ({ callbackUrl: 'https://localhost:3000/callback', clientId: 'client-id', secretConfigured: true, clientSecret: 'must-not-leak', eligibility: { eligible: true, broadcasterType: 'affiliate', channelPointsAvailable: true, rewardCount: 46, rewardLimit: 50, nearRewardLimit: true, privateToken: 'must-not-leak' } }));
    const response = await h.app.inject({ method: 'GET', url: '/api/setup', headers: h.sessionHeaders });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ callbackUrl: 'https://localhost:3000/callback', clientId: 'client-id', secretConfigured: true, connected: false, broadcasterId: null, scopes: [], status: 'not_configured', eligibility: { eligible: true, broadcasterType: 'affiliate', channelPointsAvailable: true, rewardCount: 46, rewardLimit: 50, nearRewardLimit: true } });
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

  it('updates only validated local queue settings through the protected route', async () => {
    const h = await createHarness();
    h.repository.updateLocalQueueSettings = vi.fn(async ({ settings }) => ({ id: 'queue-id', slug: 'abismo', title: 'Abismo', cost: 100, uidMode: 'visible', ...settings, version: 2 }));
    const denied = await h.app.inject({ method: 'PATCH', url: '/api/queues/queue-id/settings', headers: h.sessionHeaders, payload: { expectedVersion: 1, callTimeoutMin: null } });
    expect(denied.statusCode).toBe(403);
    const invalid = await h.app.inject({ method: 'PATCH', url: '/api/queues/queue-id/settings', headers: h.headers, payload: { expectedVersion: 1, callTimeoutMin: 0 } });
    expect(invalid.statusCode).toBe(400);
    expect(h.repository.updateLocalQueueSettings).not.toHaveBeenCalled();
    const remoteOnly = await h.app.inject({ method: 'PATCH', url: '/api/queues/queue-id/settings', headers: h.headers, payload: { expectedVersion: 1, uidMode: 'hidden' } });
    expect(remoteOnly.statusCode).toBe(400);
    expect(h.repository.updateLocalQueueSettings).not.toHaveBeenCalled();
    const response = await h.app.inject({ method: 'PATCH', url: '/api/queues/queue-id/settings', headers: h.headers, payload: { expectedVersion: 1, callTimeoutMin: null, showUidInList: true, autoSwitchAccount: true } });
    expect(response.statusCode).toBe(200);
    expect(h.repository.updateLocalQueueSettings).toHaveBeenCalledWith(expect.objectContaining({
      queueId: 'queue-id', expectedVersion: 1, settings: { callTimeoutMin: null, showUidInList: true, autoSwitchAccount: true },
      actorId: h.headers.cookie.split('=')[1], origin: 'panel',
    }));
    await h.app.close();
  });

  it('requests version-checked Twitch reward edits through a durable repository operation', async () => {
    const h = await createHarness();
    h.repository.updateQueueRewardSettings = vi.fn(async () => ({ status: 'pending', queue: { id: 'queue-id', title: 'Teatro', cost: 200, version: 2, remoteSyncStatus: 'pending_update' } }));
    const denied = await h.app.inject({ method: 'PATCH', url: '/api/queues/queue-id/reward-settings', headers: h.sessionHeaders, payload: { expectedVersion: 1, title: 'Teatro', cost: 200 } });
    expect(denied.statusCode).toBe(403);
    const invalid = await h.app.inject({ method: 'PATCH', url: '/api/queues/queue-id/reward-settings', headers: h.headers, payload: { expectedVersion: 1, title: 'Teatro', cost: 0 } });
    expect(invalid.statusCode).toBe(400);
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
      { id: 'candidate', title: 'Abismo', cost: 100, prompt: 'Send UID', userInputRequired: true, autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: true },
      { id: 'other', title: 'Different', cost: 100, prompt: 'Send UID', userInputRequired: true, autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: true },
    ]) };
    h.repository.resolveUnknownRewardCreation = vi.fn(async (input) => ({ status: 'resolved', queue: { ...h.repository.getQueueById.mock.results[0].value, ...input, remoteSyncStatus: 'synced_manual' } }));

    const candidates = await h.app.inject({ method: 'GET', url: '/api/queues/queue-id/reward-candidates', headers: h.sessionHeaders });
    expect(candidates.statusCode).toBe(200);
    expect(candidates.json()).toEqual([{ id: 'candidate', title: 'Abismo', cost: 100, prompt: 'Send UID' }]);
    const denied = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/resolve-reward', headers: h.sessionHeaders, payload: { rewardId: 'candidate' } });
    expect(denied.statusCode).toBe(403);
    expect(h.repository.resolveUnknownRewardCreation).not.toHaveBeenCalled();
    const resolved = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/resolve-reward', headers: h.headers, payload: { rewardId: 'candidate' } });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toMatchObject({ status: 'resolved', remoteConfirmed: false });
    expect(h.repository.resolveUnknownRewardCreation).toHaveBeenCalledWith({ queueId: 'queue-id', rewardId: 'candidate', actorId: h.headers.cookie.split('=')[1] });
    await h.app.close();
  });

  it('refuses reward association when the selected managed reward no longer matches the intended configuration', async () => {
    const h = await createHarness();
    h.repository.getQueueById.mockResolvedValue({ id: 'queue-id', title: 'Abismo', cost: 100, rewardPrompt: 'Send UID', uidMode: 'visible', remoteSyncStatus: 'create_unknown' });
    h.integrations.twitch = { getManagedRewards: vi.fn(async () => [{ id: 'candidate', title: 'Abismo', cost: 999, prompt: 'Send UID', userInputRequired: true, autoFulfill: false, shouldRedemptionsSkipRequestQueue: false, isEnabled: true, isPaused: true }]) };
    h.repository.resolveUnknownRewardCreation = vi.fn();
    const response = await h.app.inject({ method: 'POST', url: '/api/queues/queue-id/resolve-reward', headers: h.headers, payload: { rewardId: 'candidate' } });
    expect(response.statusCode).toBe(409);
    expect(h.repository.resolveUnknownRewardCreation).not.toHaveBeenCalled();
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

  it('includes a stable product locale and revision in the protected state projection', async () => {
    const h = await createHarness();
    h.repository.getLocalState = vi.fn(async () => ({ productLocale: { locale: 'de', revision: 4 } }));
    const response = await h.app.inject({ method: 'GET', url: '/api/state', headers: h.sessionHeaders });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ product_locale: { locale: 'de', revision: 4 } });
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
});
