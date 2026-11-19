// OPS-31 P6b (FT-90, SV-01): `liveSession` in `GET /api/state`, API before UI. The key is ABSENT while no live provider is wired (so the exact
// top-level contract of panel-route-dto-contract.test.js stays as it was) and present with a closed, allow-listed shape once it is. The
// route-integration proxy forwards the provider. No stream id, title, login or channel id can appear in the object.
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerLocalSession } from '../../apps/api/src/http/local-session.mjs';
import { registerQueueRoutes } from '../../apps/api/src/http/queue-routes.mjs';
import { registerSafeHttpErrorHandler } from '../../apps/api/src/http/safe-http-error-handler.mjs';
import { createTwitchRouteIntegrationProxy } from '../../apps/api/src/twitch/route-integration-proxy.mjs';

async function harness(integrations) {
  const app = Fastify();
  registerSafeHttpErrorHandler(app, { reportDiagnostic: vi.fn(() => 'ref') });
  registerLocalSession(app, { port: 3000 });
  registerQueueRoutes(app, {
    repository: { beginPanelOperation: vi.fn(), completePanelOperation: vi.fn(), listQueueProjection: vi.fn(async () => []), listFinancialOperations: vi.fn(async () => []) },
    integrations, publicBaseUrl: 'https://localhost:3000', productVersion: 'v1.2.3-beta',
  });
  const session = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000' } });
  const cookie = session.cookies[0];
  const headers = { host: 'localhost:3000', origin: 'https://localhost:3000', cookie: `${cookie.name}=${cookie.value}` };
  return { app, state: async () => (await app.inject({ method: 'GET', url: '/api/state', headers })).json() };
}

const description = {
  state: 'live', startedAt: '2030-01-01T10:00:00.000Z', endedAt: null, source: 'event', capWindow: 'session', fallbackReason: null,
};

describe('OPS-31 P6b GET /api/state liveSession', () => {
  it('is absent when no live provider is wired, or when it has nothing to say (null)', async () => {
    for (const integrations of [{}, { getLiveSession: vi.fn(async () => null) }]) {
      const h = await harness(integrations);
      expect('liveSession' in await h.state()).toBe(false);
      await h.app.close();
    }
  });

  it('returns the closed shape {state, startedAt, endedAt, source, capWindow, fallbackReason}', async () => {
    const h = await harness({ getLiveSession: vi.fn(async () => description) });
    expect((await h.state()).liveSession).toEqual(description);
    await h.app.close();
  });

  it('allow-lists the fields: an extra key (title, login, stream id) never reaches the response', async () => {
    const h = await harness({ getLiveSession: vi.fn(async () => ({ ...description, title: 'SECRET TITLE', streamId: '4242', login: 'secret_login', broadcasterId: '777' })) });
    const body = (await h.state()).liveSession;
    expect(Object.keys(body).sort()).toEqual(['capWindow', 'endedAt', 'fallbackReason', 'source', 'startedAt', 'state']);
    expect(JSON.stringify(body)).not.toMatch(/SECRET|4242|secret_login|777/);
    await h.app.close();
  });

  it('normalizes an out-of-list value to the safe default instead of echoing it', async () => {
    const h = await harness({ getLiveSession: vi.fn(async () => ({ state: 'banana', startedAt: 'not a date', endedAt: 5, source: 'x', capWindow: 'y', fallbackReason: 'free text' })) });
    expect((await h.state()).liveSession).toEqual({ state: 'unknown', startedAt: null, endedAt: null, source: null, capWindow: 'fallback', fallbackReason: 'none_known' });
    await h.app.close();
  });

  it('a failing provider never fails the state: the key is simply absent', async () => {
    const h = await harness({ getLiveSession: vi.fn(async () => { throw new Error('db down password=hunter2'); }) });
    const body = await h.state();
    expect('liveSession' in body).toBe(false);
    expect(JSON.stringify(body)).not.toContain('hunter2');
    await h.app.close();
  });

  it('the route-integration proxy forwards getLiveSession and the revocation flag, and is safe without an integration', async () => {
    let integration = null;
    const proxy = createTwitchRouteIntegrationProxy(() => integration);
    expect(await proxy.getLiveSession()).toBeNull();
    expect(proxy.liveEventsRevoked).toBe(false);
    integration = { getLiveSession: vi.fn(async () => description), liveEventsRevoked: true };
    expect(await proxy.getLiveSession()).toEqual(description);
    expect(proxy.liveEventsRevoked).toBe(true);
  });
});
