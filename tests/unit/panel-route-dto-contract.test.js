// OPS-15 FT-06 (ledger #17): Fastify route-level DTO contract for the families the route/action matrix marked as
// "repository layer only" or "—" (SES, STA, SET, REC, ACC, and WID-03/06). Evidence class: U (real Fastify
// `inject`, injected fakes for the repository and the Twitch integration). It proves the response shape the panel
// can rely on, not persistence (see tests/integration/panel-account-route-postgres.test.js) and not Twitch.
//
// The four production defects found by this package (account DTO leak, ACC-01/ACC-02 error shape, widget sendError
// without referenceId) were fixed on 2026-11-15; their former `it.fails` tests now run as normal tests.
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { registerLocalSession } from '../../apps/api/src/http/local-session.mjs';
import { registerQueueRoutes } from '../../apps/api/src/http/queue-routes.mjs';
import { registerOverlayRoutes } from '../../apps/api/src/http/overlay-routes.mjs';
import { registerSafeHttpErrorHandler } from '../../apps/api/src/http/safe-http-error-handler.mjs';
import { createTwitchReconciler } from '../../apps/api/src/twitch/reconciliation.mjs';

const REFERENCE = '44444444-4444-4444-8444-444444444444';
const GENERIC_500 = { code: 'INTERNAL_ERROR', error: 'Não foi possível concluir. Tente novamente.', referenceId: REFERENCE };
const PRIVATE = 'private-database-detail token=abc stack at Object.<anonymous> (/srv/app.mjs:1:1)';

function coded(message, code) { return Object.assign(new Error(message), { code }); }

async function openSession(app) {
  const session = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000' } });
  const cookie = session.cookies[0];
  const sessionHeaders = { host: 'localhost:3000', origin: 'https://localhost:3000', cookie: `${cookie.name}=${cookie.value}` };
  const headers = { ...sessionHeaders, 'x-csrf-token': session.json().csrfToken };
  return { session, cookie, sessionHeaders, headers };
}

/** Same registration order as apps/api/src/server.mjs: safe error handler, session, queue routes, overlay routes. */
async function createHarness({ integrations = {}, repositoryOverrides = {}, overlay = false } = {}) {
  const app = Fastify();
  const reportDiagnostic = vi.fn(() => REFERENCE);
  registerSafeHttpErrorHandler(app, { reportDiagnostic });
  registerLocalSession(app, { port: 3000 });
  const repository = {
    beginPanelOperation: vi.fn(async () => ({ status: 'started' })),
    completePanelOperation: vi.fn(async () => true),
    listQueueProjection: vi.fn(async () => []),
    listFinancialOperations: vi.fn(async () => []),
    ...repositoryOverrides,
  };
  registerQueueRoutes(app, {
    repository, integrations, reportDiagnostic, publicBaseUrl: 'https://localhost:3000', productVersion: 'v1.2.3-beta',
  });
  const overlayRepository = {
    list: vi.fn(async () => []),
    update: vi.fn(),
    delete: vi.fn(),
  };
  if (overlay) {
    registerOverlayRoutes(app, {
      repository: overlayRepository,
      widgetService: { create: vi.fn(), regenerate: vi.fn(), revoke: vi.fn() },
      projectionService: { readWithCapability: vi.fn(async () => null) },
      reportDiagnostic,
    });
  }
  const opened = await openSession(app);
  const post = (url, payload, headers = opened.headers) => app.inject({
    method: 'POST', url, payload, headers: { ...headers, 'idempotency-key': randomUUID() },
  });
  const send = (method, url, payload, headers = opened.headers) => app.inject({
    method, url, payload, headers: { ...headers, 'idempotency-key': randomUUID() },
  });
  return { app, repository, overlayRepository, reportDiagnostic, post, send, ...opened };
}

describe('SES-01 GET /api/session', () => {
  it('returns exactly {csrfToken} and sets one HttpOnly SameSite=Lax Secure session cookie that is never in the body', async () => {
    const h = await createHarness();
    expect(h.session.statusCode).toBe(200);
    expect(Object.keys(h.session.json())).toEqual(['csrfToken']);
    expect(h.session.json().csrfToken).toMatch(/^[0-9a-f]{64}$/);
    expect(h.session.cookies).toHaveLength(1);
    expect(h.cookie).toMatchObject({ name: 'queuebot_session', httpOnly: true, sameSite: 'Lax', secure: true, path: '/' });
    expect(h.cookie.value).toMatch(/^[0-9a-f]{64}$/);
    expect(h.session.body).not.toContain(h.cookie.value);
    expect(h.cookie.value).not.toBe(h.session.json().csrfToken);
    await h.app.close();
  });

  it('is idempotent for a session that already has a cookie (same token, no new cookie) and gives a new browser a new pair', async () => {
    const h = await createHarness();
    const again = await h.app.inject({ method: 'GET', url: '/api/session', headers: h.sessionHeaders });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ csrfToken: h.session.json().csrfToken });
    expect(again.headers['set-cookie']).toBeUndefined();
    const other = await h.app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000' } });
    expect(other.json().csrfToken).not.toBe(h.session.json().csrfToken);
    expect(other.cookies[0].value).not.toBe(h.cookie.value);
    await h.app.close();
  });

  it('refuses a foreign host or origin with a body that has only safe fields', async () => {
    const h = await createHarness();
    const host = await h.app.inject({ method: 'GET', url: '/api/session', headers: { host: 'attacker.example' } });
    expect(host.statusCode).toBe(403);
    expect(host.json()).toEqual({ error: 'Acesso local inválido.' });
    const origin = await h.app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000', origin: 'https://attacker.example' } });
    expect(origin.statusCode).toBe(403);
    expect(origin.json()).toEqual({ error: 'Origem inválida.', code: 'ORIGIN_NOT_ALLOWED' });
    expect(origin.headers['set-cookie']).toBeUndefined();
    await h.app.close();
  });

  it('answers 401 with a safe body on a protected read without a session, and 403 on a mutation without the CSRF token', async () => {
    const h = await createHarness();
    const anonymous = await h.app.inject({ method: 'GET', url: '/api/state', headers: { host: 'localhost:3000' } });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual({ error: 'Abra o painel local para iniciar uma sessão.' });
    const noCsrf = await h.app.inject({ method: 'POST', url: '/api/reconciliation', headers: { ...h.sessionHeaders, 'idempotency-key': randomUUID() }, payload: {} });
    expect(noCsrf.statusCode).toBe(403);
    expect(noCsrf.json()).toEqual({ error: 'Sessão ou proteção CSRF inválida.' });
    await h.app.close();
  });
});

describe('STA-01 GET /api/state', () => {
  const STATE_KEYS = [
    'account', 'api_contract_version', 'connectivity', 'generated_at', 'pending_operations', 'product_locale', 'product_version',
    'queues', 'revision', 'unresolved_operation_summary',
  ];

  it('returns the exact top-level projection with typed fields and defaults when the repository has no state', async () => {
    const h = await createHarness();
    const response = await h.app.inject({ method: 'GET', url: '/api/state', headers: h.sessionHeaders });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Object.keys(body).sort()).toEqual(STATE_KEYS);
    expect(body).toMatchObject({
      product_version: 'v1.2.3-beta', api_contract_version: '1', revision: 1,
      account: { label: 'Streamer', source: 'default' }, product_locale: { locale: 'pt-BR', revision: 1 },
      connectivity: { database: 'connected', twitch: 'not_configured', twitch_chat: 'not_configured', twitch_rewards: 'unknown' },
      queues: [], pending_operations: [], unresolved_operation_summary: null,
    });
    expect(Number.isNaN(Date.parse(body.generated_at))).toBe(false);
    expect(new Date(body.generated_at).toISOString()).toBe(body.generated_at);
    expect(Object.keys(body.connectivity).sort()).toEqual(['database', 'twitch', 'twitch_chat', 'twitch_rewards']);
    await h.app.close();
  });

  it('keeps the summary only when it is a coherent pair of non-negative safe integers, otherwise null', async () => {
    const cases = [
      [{ total: 3, needsReview: 1 }, { total: 3, needsReview: 1 }],
      [{ total: 1, needsReview: 2 }, null],
      [{ total: -1, needsReview: 0 }, null],
      [{ total: 1.5, needsReview: 0 }, null],
      [{ total: '3', needsReview: 1 }, null],
      [undefined, null],
    ];
    for (const [input, expected] of cases) {
      const h = await createHarness({ repositoryOverrides: { getFinancialOperationSummary: vi.fn(async () => input) } });
      const response = await h.app.inject({ method: 'GET', url: '/api/state', headers: h.sessionHeaders });
      expect(response.json().unresolved_operation_summary).toEqual(expected);
      await h.app.close();
    }
  });

  it('turns an unexpected repository failure into the generic body with a referenceId and never the private detail', async () => {
    const h = await createHarness({ repositoryOverrides: { listQueueProjection: vi.fn(async () => { throw new Error(PRIVATE); }) } });
    const response = await h.app.inject({ method: 'GET', url: '/api/state', headers: h.sessionHeaders });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(GENERIC_500);
    expect(response.headers['x-error-reference']).toBe(REFERENCE);
    expect(response.body).not.toMatch(/private-database-detail|token=abc|app\.mjs/);
    expect(h.reportDiagnostic).toHaveBeenCalledWith({ source: 'http.get.api_state', error: expect.objectContaining({ message: PRIVATE }) });
    await h.app.close();
  });
});

describe('SET-01 GET /api/setup', () => {
  it('returns the exact not-configured projection when the integration has no state', async () => {
    const h = await createHarness();
    const response = await h.app.inject({ method: 'GET', url: '/api/setup', headers: h.sessionHeaders });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      callbackUrl: 'https://localhost:3000/callback', clientId: null, secretConfigured: false, connected: false,
      broadcasterId: null, scopes: [], status: 'not_configured', chatStatus: 'unknown', rewardStatus: 'unknown', eligibility: null,
    });
    await h.app.close();
  });

  it('collapses unknown chat/reward/broadcaster values to enumerated ones and drops the secret and extra identity fields', async () => {
    const h = await createHarness({ integrations: { getSetupState: async () => ({
      connected: true, broadcasterId: '12345', clientId: 'client', secretConfigured: true, clientSecret: 'must-not-leak',
      scopes: ['chat:read'], status: 'connected', chatStatus: 'weird-internal-state', rewardStatus: 'available',
      eligibility: { eligible: true, broadcasterType: 'staff', channelPointsAvailable: 'yes', accessToken: 'must-not-leak' },
    }) } });
    const response = await h.app.inject({ method: 'GET', url: '/api/setup', headers: h.sessionHeaders });
    expect(response.json()).toEqual({
      callbackUrl: 'https://localhost:3000/callback', clientId: 'client', secretConfigured: true, connected: true,
      broadcasterId: '12345', scopes: ['chat:read'], status: 'connected', chatStatus: 'unknown', rewardStatus: 'available',
      eligibility: { eligible: true, broadcasterType: 'unknown', channelPointsAvailable: false },
    });
    expect(response.body).not.toContain('must-not-leak');
    await h.app.close();
  });

  it('does not project the broadcaster id or scopes while disconnected, even if the integration still reports them', async () => {
    const h = await createHarness({ integrations: { getSetupState: async () => ({ connected: false, broadcasterId: '999', scopes: ['chat:read'], clientId: 'c' }) } });
    const body = (await h.app.inject({ method: 'GET', url: '/api/setup', headers: h.sessionHeaders })).json();
    expect(body).toMatchObject({ connected: false, broadcasterId: null, scopes: [] });
    await h.app.close();
  });

  it('answers a failing integration with the generic body and referenceId', async () => {
    const h = await createHarness({ integrations: { getSetupState: async () => { throw new Error(PRIVATE); } } });
    const response = await h.app.inject({ method: 'GET', url: '/api/setup', headers: h.sessionHeaders });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(GENERIC_500);
    expect(response.body).not.toContain('private-database-detail');
    await h.app.close();
  });
});

describe('SET-02 POST /api/setup/application', () => {
  it('validates field presence and limits before calling the integration, with one safe 400 body', async () => {
    const validateAndSaveApplication = vi.fn();
    const h = await createHarness({ integrations: { validateAndSaveApplication } });
    const invalid = [
      {}, { clientId: 'id' }, { clientSecret: 'secret' }, { clientId: '   ', clientSecret: 'secret' },
      { clientId: 'x'.repeat(129), clientSecret: 'secret' }, { clientId: 'id', clientSecret: '' },
      { clientId: 'id', clientSecret: 's'.repeat(257) }, { clientId: 5, clientSecret: 'secret' }, { clientId: 'id', clientSecret: ['secret'] },
    ];
    for (const payload of invalid) {
      const response = await h.post('/api/setup/application', payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.json()).toEqual({ error: 'Informe Client ID e Secret válidos.' });
    }
    expect(validateAndSaveApplication).not.toHaveBeenCalled();
    await h.app.close();
  });

  it('accepts the boundary lengths, trims only the client id and returns exactly {status, clientId, secretConfigured}', async () => {
    const validateAndSaveApplication = vi.fn(async ({ clientId }) => ({ clientId, clientSecret: 'must-not-leak', token: 'must-not-leak' }));
    const h = await createHarness({ integrations: { validateAndSaveApplication } });
    const secret = ' s'.repeat(128);
    const response = await h.post('/api/setup/application', { clientId: ` ${'c'.repeat(126)} `, clientSecret: secret });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'validated', clientId: 'c'.repeat(126), secretConfigured: true });
    expect(validateAndSaveApplication).toHaveBeenCalledWith({ clientId: 'c'.repeat(126), clientSecret: secret });
    expect(response.body).not.toContain('must-not-leak');
    expect(response.body).not.toContain(secret);
    await h.app.close();
  });

  it('maps CHANNEL_BINDING_LOCKED to 409 and every other validation failure to 400, with fixed texts and no provider detail', async () => {
    const lockedIntegration = await createHarness({ integrations: { validateAndSaveApplication: async () => { throw coded(PRIVATE, 'CHANNEL_BINDING_LOCKED'); } } });
    const conflict = await lockedIntegration.post('/api/setup/application', { clientId: 'id', clientSecret: 'secret-value' });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ error: 'Esta instalação já está vinculada a outro canal ou aplicativo.' });
    const rejected = await createHarness({ integrations: { validateAndSaveApplication: async () => { throw coded(PRIVATE, 'INVALID_TWITCH_CLIENT_CREDENTIALS'); } } });
    const refusal = await rejected.post('/api/setup/application', { clientId: 'id', clientSecret: 'secret-value' });
    expect(refusal.statusCode).toBe(400);
    expect(refusal.json()).toEqual({ error: 'Não foi possível validar as credenciais da Twitch.' });
    for (const response of [conflict, refusal]) expect(response.body).not.toMatch(/private-database-detail|secret-value|token=abc/);
    await Promise.all([lockedIntegration.app.close(), rejected.app.close()]);
  });

  it('answers 503 with a fixed text when the integration is not available, and requires session, CSRF and an idempotency key', async () => {
    const h = await createHarness();
    const unavailable = await h.post('/api/setup/application', { clientId: 'id', clientSecret: 'secret-value' });
    expect(unavailable.statusCode).toBe(503);
    expect(Object.keys(unavailable.json())).toEqual(['error']);
    expect(unavailable.body).not.toContain('secret-value');
    const noKey = await h.app.inject({ method: 'POST', url: '/api/setup/application', headers: h.headers, payload: { clientId: 'id', clientSecret: 'secret-value' } });
    expect(noKey.statusCode).toBe(400);
    expect(noKey.json()).toEqual({ error: 'Esta ação precisa de uma chave de idempotência válida. Atualize o painel e tente novamente.' });
    const noCsrf = await h.post('/api/setup/application', { clientId: 'id', clientSecret: 'secret-value' }, h.sessionHeaders);
    expect(noCsrf.statusCode).toBe(403);
    const anonymous = await h.post('/api/setup/application', { clientId: 'id', clientSecret: 'secret-value' }, { host: 'localhost:3000' });
    expect(anonymous.statusCode).toBe(401);
    await h.app.close();
  });
});

describe('SET-03 POST /api/setup/connect', () => {
  it('returns exactly {authorizationUrl} and passes the local session id (not the CSRF token) to the integration', async () => {
    const beginAuthorization = vi.fn(async () => ({ url: 'https://id.twitch.tv/oauth2/authorize?state=opaque', internal: 'must-not-leak' }));
    const h = await createHarness({ integrations: { beginAuthorization } });
    const response = await h.post('/api/setup/connect', {});
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ authorizationUrl: 'https://id.twitch.tv/oauth2/authorize?state=opaque' });
    expect(response.body).not.toContain('must-not-leak');
    expect(beginAuthorization).toHaveBeenCalledWith(h.cookie.value);
    await h.app.close();
  });

  it('answers 503 with a fixed text when authorization cannot start, and the generic body when the integration throws', async () => {
    const h = await createHarness({ integrations: { beginAuthorization: async () => null } });
    const unavailable = await h.post('/api/setup/connect', {});
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toEqual({ error: 'Configure e valide o aplicativo Twitch antes de conectar.' });
    const failing = await createHarness({ integrations: { beginAuthorization: async () => { throw new Error(PRIVATE); } } });
    const response = await failing.post('/api/setup/connect', {});
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(GENERIC_500);
    expect(response.body).not.toContain('private-database-detail');
    await Promise.all([h.app.close(), failing.app.close()]);
  });
});

describe('SET-04 GET /callback', () => {
  const headersFor = (h) => h.sessionHeaders;

  it('always answers 303 with an empty body, no-store, no-referrer and a location from the closed set of three', async () => {
    const completeAuthorization = vi.fn(async () => ({ displayName: 'Channel' }));
    const h = await createHarness({ integrations: { completeAuthorization } });
    const cases = [
      ['/callback?code=c&state=s', '/connection/?oauth=success'],
      ['/callback?error=access_denied&error_description=secret-data', '/connection/?oauth=declined'],
      ['/callback?error=access_denied&code=c&state=s', '/connection/?oauth=declined'],
      ['/callback?code=c', '/connection/?oauth=error'],
      ['/callback?state=s', '/connection/?oauth=error'],
      ['/callback', '/connection/?oauth=error'],
      ['/callback?code[]=a&code[]=b&state=s', '/connection/?oauth=error'],
    ];
    for (const [url, location] of cases) {
      const response = await h.app.inject({ method: 'GET', url, headers: headersFor(h) });
      expect(response.statusCode, url).toBe(303);
      expect(response.headers.location, url).toBe(location);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.body).toBe('');
    }
    expect(completeAuthorization).toHaveBeenCalledTimes(1);
    await h.app.close();
  });

  it('does not require the CSRF header (the provider redirect cannot send it) but still needs the session cookie', async () => {
    const completeAuthorization = vi.fn(async () => ({}));
    const h = await createHarness({ integrations: { completeAuthorization } });
    const withoutCsrf = { ...h.headers };
    delete withoutCsrf['x-csrf-token'];
    const ok = await h.app.inject({ method: 'GET', url: '/callback?code=c&state=s', headers: withoutCsrf });
    expect(ok.headers.location).toBe('/connection/?oauth=success');
    const anonymous = await h.app.inject({ method: 'GET', url: '/callback?code=c&state=s', headers: { host: 'localhost:3000' } });
    expect(anonymous.headers.location).toBe('/connection/?oauth=error');
    expect(completeAuthorization).toHaveBeenCalledTimes(1);
    await h.app.close();
  });
});

describe('REC-01 POST /api/reconciliation', () => {
  it('returns the real reconciler result shape with the status, counters and only code-bearing issues', async () => {
    const reconciler = createTwitchReconciler({
      repository: { listManagedQueues: async () => [] }, twitch: {}, processor: {}, clock: () => new Date('2026-11-15T12:00:00.000Z'),
    });
    const h = await createHarness({ integrations: { reconcileNow: async () => reconciler.run() } });
    const response = await h.post('/api/reconciliation', {});
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Object.keys(body).sort()).toEqual(['externalTransitions', 'finishedAt', 'imported', 'issues', 'queues', 'startedAt', 'status', 'tombstonesScanned']);
    expect(body).toMatchObject({ status: 'complete', imported: 0, queues: 0, externalTransitions: 0, tombstonesScanned: 0, issues: [] });
    expect(body.startedAt).toBe('2026-11-15T12:00:00.000Z');
    await h.app.close();
  });

  it('passes a failed run through as 200 with only enumerated issue codes, never a message', async () => {
    const h = await createHarness({ integrations: { reconcileNow: async () => ({ status: 'failed', issues: [{ code: 'reconciliation_failed' }] }) } });
    const response = await h.post('/api/reconciliation', {});
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'failed', issues: [{ code: 'reconciliation_failed' }] });
    await h.app.close();
  });

  it('answers 503 with fixed texts when the integration is missing or returns nothing, and the generic body on a throw', async () => {
    const missing = await createHarness();
    const noIntegration = await missing.post('/api/reconciliation', {});
    expect(noIntegration.statusCode).toBe(503);
    expect(noIntegration.json()).toEqual({ error: 'A integração Twitch não está pronta para sincronização.' });
    const empty = await createHarness({ integrations: { reconcileNow: async () => null } });
    const nothing = await empty.post('/api/reconciliation', {});
    expect(nothing.statusCode).toBe(503);
    expect(nothing.json()).toEqual({ error: 'Não foi possível iniciar a sincronização. Verifique a conexão Twitch.' });
    const failing = await createHarness({ integrations: { reconcileNow: async () => { throw new Error(PRIVATE); } } });
    const thrown = await failing.post('/api/reconciliation', {});
    expect(thrown.statusCode).toBe(500);
    expect(thrown.json()).toEqual(GENERIC_500);
    expect(thrown.body).not.toContain('private-database-detail');
    await Promise.all([missing.app.close(), empty.app.close(), failing.app.close()]);
  });
});

describe('ACC-01 POST /api/account and ACC-02 POST /api/account/default', () => {
  it('ACC-01 returns what the repository returns on success and a fixed 400 text for INVALID_ACCOUNT_LABEL (no code field)', async () => {
    const setCurrentAccount = vi.fn(async (label) => ({ label: label.trim(), source: 'manual' }));
    const h = await createHarness({ repositoryOverrides: { setCurrentAccount } });
    const ok = await h.post('/api/account', { label: ' Asia ' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ label: 'Asia', source: 'manual' });
    setCurrentAccount.mockRejectedValueOnce(coded('Account label is invalid', 'INVALID_ACCOUNT_LABEL'));
    const invalid = await h.post('/api/account', { label: 'x'.repeat(61) });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: 'O nome deve ter até 60 caracteres e não pode conter quebras de linha.' });
    await h.app.close();
  });

  it('ACC-01 treats a missing or non-object body as an invalid label (the repository validates), and requires session + CSRF', async () => {
    const setCurrentAccount = vi.fn(async (label) => {
      if (typeof label !== 'string') throw coded('Account label is invalid', 'INVALID_ACCOUNT_LABEL');
      return { label, source: 'manual' };
    });
    const h = await createHarness({ repositoryOverrides: { setCurrentAccount } });
    for (const payload of [{}, { label: 7 }, { label: null }]) {
      const response = await h.post('/api/account', payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect((await h.post('/api/account', { label: 'A' }, h.sessionHeaders)).statusCode).toBe(403);
    expect((await h.post('/api/account', { label: 'A' }, { host: 'localhost:3000' })).statusCode).toBe(401);
    await h.app.close();
  });

  it('ACC-02 validates the label before the repository (empty, blank, 61 chars, control characters, non-string) with one fixed 400 text', async () => {
    const setDefaultAccountLabel = vi.fn(async (label) => ({ label, defaultLabel: label, source: 'default' }));
    const h = await createHarness({ repositoryOverrides: { setDefaultAccountLabel } });
    for (const label of ['', '   ', 'x'.repeat(61), 'line\nbreak', 'tab\there', 'del\u007f', 12, null, undefined]) {
      const response = await h.post('/api/account/default', { label });
      expect(response.statusCode, String(label)).toBe(400);
      expect(response.json()).toEqual({ error: 'Informe um nome com até 60 caracteres, sem quebras de linha ou controles.' });
    }
    expect(setDefaultAccountLabel).not.toHaveBeenCalled();
    const boundary = await h.post('/api/account/default', { label: 'x'.repeat(60) });
    expect(boundary.statusCode).toBe(200);
    expect(boundary.json()).toEqual({ label: 'x'.repeat(60), defaultLabel: 'x'.repeat(60), source: 'default' });
    await h.app.close();
  });

  it('ACC-02 answers 503 with a fixed text when the repository cannot set the default label', async () => {
    const h = await createHarness();
    const response = await h.post('/api/account/default', { label: 'World Level 9' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'A configuração do nome padrão não está disponível.' });
    await h.app.close();
  });

  it('ACC-01 an unexpected repository failure returns the generic body with a referenceId and reports a diagnostic', async () => {
    const h = await createHarness({ repositoryOverrides: { setCurrentAccount: async () => { throw coded(PRIVATE, 'DATABASE_FAILURE'); } } });
    const response = await h.post('/api/account', { label: 'Other' });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('private-database-detail');
    expect(response.json()).toEqual(GENERIC_500);
    expect(response.headers['x-error-reference']).toBe(REFERENCE);
    await h.app.close();
  });
});

describe('ACC-01/02/STA-01 account DTO projection', () => {
  const stored = { label: 'Spiral Abyss', source: 'manual', defaultLabel: 'Streamer', ownerEntryId: 'entry-secret', updatedBy: 'session-secret-id' };

  it('never returns updatedBy or ownerEntryId from POST /api/account, POST /api/account/default or GET /api/state', async () => {
    const h = await createHarness({ repositoryOverrides: {
      setCurrentAccount: async () => stored, setDefaultAccountLabel: async () => stored, getLocalState: async () => ({ account: stored }),
    } });
    for (const response of [await h.post('/api/account', { label: 'Spiral Abyss' }), await h.post('/api/account/default', { label: 'Streamer' })]) {
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ label: 'Spiral Abyss', source: 'manual', defaultLabel: 'Streamer' });
      expect(response.body).not.toMatch(/session-secret-id|entry-secret/);
    }
    const state = await h.app.inject({ method: 'GET', url: '/api/state', headers: h.sessionHeaders });
    expect(state.json().account).toEqual({ label: 'Spiral Abyss', source: 'manual', defaultLabel: 'Streamer' });
    expect(state.body).not.toMatch(/session-secret-id|entry-secret/);
    await h.app.close();
  });

  it('maps a repository INVALID_ACCOUNT_LABEL on the default route to 400 (not 500)', async () => {
    const h = await createHarness({ repositoryOverrides: { setDefaultAccountLabel: async () => { throw coded('bad', 'INVALID_ACCOUNT_LABEL'); } } });
    const response = await h.post('/api/account/default', { label: 'ok' });
    expect(response.statusCode).toBe(400);
    expect(h.reportDiagnostic).not.toHaveBeenCalled();
    await h.app.close();
  });
});

describe('ACC-02 failure mapping', () => {
  it('ACC-02 an unexpected repository failure is a 500 generic body with a referenceId (not a 400)', async () => {
    const h = await createHarness({ repositoryOverrides: { setDefaultAccountLabel: async () => { throw coded(PRIVATE, 'DATABASE_FAILURE'); } } });
    const response = await h.post('/api/account/default', { label: 'World Level 9' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(GENERIC_500);
    expect(response.headers['x-error-reference']).toBe(REFERENCE);
    await h.app.close();
  });
});

describe('WID-03 PATCH /api/overlay-widgets/:id and WID-06 DELETE /api/overlay-widgets/:id', () => {
  const widget = { id: 'widget-1', sourceType: 'fixed_text', queueId: null, fixedText: 'Hello', fallbackText: 'Off', style: { fontSize: 32 }, version: 4, capabilityVersion: 2, capabilityHash: 'hash-must-not-leak', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z' };
  const WIDGET_KEYS = ['capabilityActive', 'capabilityVersion', 'createdAt', 'deleted', 'fallbackText', 'fixedText', 'id', 'queueId', 'sourceType', 'style', 'updatedAt', 'version'];

  it('WID-03 returns the exact safe widget DTO (no hash) and forwards only id, expectedVersion and changes', async () => {
    const h = await createHarness({ overlay: true });
    h.overlayRepository.update.mockResolvedValue({ ...widget, version: 5 });
    const response = await h.send('PATCH', '/api/overlay-widgets/widget-1', { expectedVersion: 4, changes: { fixedText: 'Hello' } });
    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json()).sort()).toEqual(WIDGET_KEYS);
    expect(response.json()).toMatchObject({ id: 'widget-1', version: 5, capabilityActive: true, deleted: false });
    expect(response.body).not.toContain('hash-must-not-leak');
    expect(h.overlayRepository.update).toHaveBeenCalledWith({ id: 'widget-1', expectedVersion: 4, changes: { fixedText: 'Hello' } });
    await h.app.close();
  });

  it('WID-03 rejects malformed bodies with one fixed 400 text before touching the repository', async () => {
    const h = await createHarness({ overlay: true });
    const invalid = [{}, { expectedVersion: 4 }, { changes: {} }, { expectedVersion: '4', changes: {} }, { expectedVersion: 1.5, changes: {} },
      { expectedVersion: 4, changes: [] }, { expectedVersion: 4, changes: {}, extra: true }, { expectedVersion: 4, changes: 'x' }];
    for (const payload of invalid) {
      const response = await h.send('PATCH', '/api/overlay-widgets/widget-1', payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.json()).toEqual({ error: 'Revise os campos do widget e tente novamente.' });
    }
    expect(h.overlayRepository.update).not.toHaveBeenCalled();
    await h.app.close();
  });

  it('WID-03/06 map conflict, not-found, invalid and unknown failures to 409/404/400/503 with fixed texts and no private detail', async () => {
    const h = await createHarness({ overlay: true });
    const cases = [
      ['OVERLAY_WIDGET_VERSION_CONFLICT', 409, 'O widget mudou em outra tela. Atualize a lista e tente novamente.'],
      ['OVERLAY_WIDGET_NOT_FOUND', 404, 'Este widget não está disponível.'],
      ['INVALID_OVERLAY_STYLE', 400, 'Revise os campos do widget e tente novamente.'],
      ['DATABASE_FAILURE', 503, 'Não foi possível concluir a operação do widget agora.'],
    ];
    for (const [code, status, text] of cases) {
      h.overlayRepository.update.mockRejectedValueOnce(coded(PRIVATE, code));
      const patched = await h.send('PATCH', '/api/overlay-widgets/widget-1', { expectedVersion: 4, changes: { fixedText: 'x' } });
      h.overlayRepository.delete.mockRejectedValueOnce(coded(PRIVATE, code));
      const deleted = await h.send('DELETE', '/api/overlay-widgets/widget-1', { expectedVersion: 4 });
      for (const response of [patched, deleted]) {
        expect(response.statusCode, code).toBe(status);
        expect(response.json(), code).toEqual(status === 503 ? { error: text, referenceId: REFERENCE } : { error: text });
        expect(response.body).not.toMatch(/private-database-detail|token=abc/);
      }
    }
    await h.app.close();
  });

  it('WID-06 returns the exact safe DTO for a deleted widget, forwards id and expectedVersion, and rejects malformed bodies', async () => {
    const h = await createHarness({ overlay: true });
    h.overlayRepository.delete.mockResolvedValue({ ...widget, version: 5, deletedAt: new Date('2026-11-03T00:00:00.000Z') });
    const response = await h.send('DELETE', '/api/overlay-widgets/widget-1', { expectedVersion: 4 });
    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json()).sort()).toEqual(WIDGET_KEYS);
    expect(response.json()).toMatchObject({ id: 'widget-1', deleted: true, capabilityActive: false, version: 5 });
    expect(response.body).not.toContain('hash-must-not-leak');
    expect(h.overlayRepository.delete).toHaveBeenCalledWith({ id: 'widget-1', expectedVersion: 4 });
    for (const payload of [{}, { expectedVersion: '4' }, { expectedVersion: 4, force: true }, { expectedVersion: 0.5 }]) {
      const bad = await h.send('DELETE', '/api/overlay-widgets/widget-1', payload);
      expect(bad.statusCode, JSON.stringify(payload)).toBe(400);
      expect(bad.json()).toEqual({ error: 'Revise os campos do widget e tente novamente.' });
    }
    expect(h.overlayRepository.delete).toHaveBeenCalledTimes(1);
    await h.app.close();
  });

  it('WID-03/06 require session and CSRF before reaching the repository', async () => {
    const h = await createHarness({ overlay: true });
    for (const [method, payload] of [['PATCH', { expectedVersion: 4, changes: {} }], ['DELETE', { expectedVersion: 4 }]]) {
      expect((await h.send(method, '/api/overlay-widgets/widget-1', payload, h.sessionHeaders)).statusCode).toBe(403);
      expect((await h.send(method, '/api/overlay-widgets/widget-1', payload, { host: 'localhost:3000' })).statusCode).toBe(401);
    }
    expect(h.overlayRepository.update).not.toHaveBeenCalled();
    expect(h.overlayRepository.delete).not.toHaveBeenCalled();
    await h.app.close();
  });

  it('WID-03/06 an unexpected failure reports a safe diagnostic and returns a referenceId (503, no private detail)', async () => {
    const h = await createHarness({ overlay: true });
    h.overlayRepository.update.mockRejectedValueOnce(coded(PRIVATE, 'DATABASE_FAILURE'));
    const response = await h.send('PATCH', '/api/overlay-widgets/widget-1', { expectedVersion: 4, changes: { fixedText: 'x' } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Não foi possível concluir a operação do widget agora.', referenceId: REFERENCE });
    expect(response.headers['x-error-reference']).toBe(REFERENCE);
    expect(response.body).not.toMatch(/private-database-detail|token=abc/);
    expect(h.reportDiagnostic).toHaveBeenCalledWith({ source: 'http.patch.api_overlay-widgets_id', error: expect.any(Error) });
    await h.app.close();
  });
});
