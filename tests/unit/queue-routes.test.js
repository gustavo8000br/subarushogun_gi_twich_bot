import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerLocalSession } from '../../apps/api/src/http/local-session.mjs';
import { registerQueueRoutes } from '../../apps/api/src/http/queue-routes.mjs';
import { createClearConfirmationService } from '../../apps/api/src/domain/clear-confirmation.mjs';

async function createHarness({ domainService } = {}) {
  const app = Fastify();
  registerLocalSession(app, { port: 3000 });
  const queue = { id: 'queue-id', slug: 'abismo', title: 'Abismo', cost: 100, uidMode: 'visible', showUidInOverlay: false, isOpen: false, isArchived: false, lifecycleStatus: 'active', version: 1 };
  queue.entries = [{ id: 'entry-id', status: 'waiting', position: 1, userLogin: 'viewer', displayName: 'Viewer', uid: '123456789' }];
  const repository = {
    createQueue: vi.fn(async (input) => ({ ...queue, ...input, uidMode: input.uidMode })),
    createQueueWithRewardIntent: vi.fn(async (input) => ({ status: 'pending', queue: { ...queue, ...input, remoteSyncStatus: 'pending_create' } })),
    getQueueById: vi.fn(async () => queue),
    addManualEntry: vi.fn(async () => ({ status: 'created', entry: { id: 'entry-id', status: 'waiting', position: 1 } })),
    listQueueProjection: vi.fn(async () => [queue]),
    transitionEntry: vi.fn(async () => ({ id: 'entry-id', status: 'called' })),
    listEntriesByStatus: vi.fn(async () => [{ id: 'entry-id', version: 1, status: 'waiting', source: 'redemption', redemptionId: 'redemption-id' }]),
    callNext: vi.fn(async () => [{ id: 'entry-id', status: 'called' }]),
    callSpecificEntry: vi.fn(async () => ({ id: 'entry-id', status: 'called' })),
    getEntry: vi.fn(async () => ({ id: 'entry-id', queueId: 'queue-id', status: 'waiting' })),
    enqueueCallNotification: vi.fn(async () => undefined),
    clearActiveEntries: vi.fn(async ({ snapshot }) => ({ status: 'cleared', count: snapshot.length, refundsRequested: 1 })),
    setDefaultAccountLabel: vi.fn(async (label) => ({ label, defaultLabel: label, source: 'default' })),
  };
  const integrations = { status: 'not_configured', twitch: null };
  const clearConfirmation = createClearConfirmationService({ repository });
  registerQueueRoutes(app, { repository, domainService, integrations, clearConfirmation, publicBaseUrl: 'https://localhost:3000', productVersion: 'v0.1.0-1234567-alpha' });
  const session = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000' } });
  const cookie = session.cookies[0];
  const sessionHeaders = { host: 'localhost:3000', origin: 'https://localhost:3000', cookie: `${cookie.name}=${cookie.value}` };
  const headers = { ...sessionHeaders, 'x-csrf-token': session.json().csrfToken };
  return { app, repository, integrations, headers, sessionHeaders };
}

describe('local queue and setup API', () => {
  it('returns a safe setup projection and never emits configured secrets', async () => {
    const h = await createHarness();
    h.integrations.getSetupState = vi.fn(async () => ({ callbackUrl: 'https://localhost:3000/callback', clientId: 'client-id', secretConfigured: true, clientSecret: 'must-not-leak', eligibility: { eligible: true, broadcasterType: 'affiliate', channelPointsAvailable: true, rewardCount: 46, rewardLimit: 50, nearRewardLimit: true, privateToken: 'must-not-leak' } }));
    const response = await h.app.inject({ method: 'GET', url: '/api/setup', headers: h.sessionHeaders });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ callbackUrl: 'https://localhost:3000/callback', clientId: 'client-id', secretConfigured: true, connected: false, broadcasterId: null, scopes: [], status: 'not_configured', eligibility: { eligible: true, broadcasterType: 'affiliate', channelPointsAvailable: true, rewardCount: 46, rewardLimit: 50, nearRewardLimit: true } });
    expect(response.body).not.toContain('must-not-leak');
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
    expect(response.json()).toEqual([{ id: 'delete-task', type: 'reward.delete', entityId: 'queue-id', status: 'unknown', attempts: 3, lastError: 'queue_delete_result_unknown', nextAttemptAt: null }]);
    expect(response.body).not.toContain('must-not-leak');
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
