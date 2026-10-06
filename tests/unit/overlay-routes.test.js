import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerLocalSession } from '../../apps/api/src/http/local-session.mjs';
import { registerOverlayRoutes } from '../../apps/api/src/http/overlay-routes.mjs';

async function makeHarness() {
  const app = Fastify();
  registerLocalSession(app, { port: 3000 });
  const repository = {
    list: vi.fn(async () => [{ id: 'widget-1', sourceType: 'account_label', style: {}, version: 1 }]),
    update: vi.fn(async () => ({ id: 'widget-1', sourceType: 'account_label', style: {}, version: 2 })),
    delete: vi.fn(async () => ({ id: 'widget-1', deletedAt: new Date(), version: 2 })),
  };
  const widgetService = {
    create: vi.fn(async () => ({ widget: { id: 'widget-1', sourceType: 'account_label', version: 1 }, capabilityUrl: 'https://localhost:3000/overlay.html#one-time-secret' })),
    regenerate: vi.fn(async () => ({ widget: { id: 'widget-1', version: 2 }, capabilityUrl: 'https://localhost:3000/overlay.html#new-one-time-secret' })),
    revoke: vi.fn(async () => ({ id: 'widget-1', version: 2 })),
  };
  const validCapability = 'v'.repeat(43);
  const projectionService = { readWithCapability: vi.fn(async (token) => token === validCapability
    ? { sourceType: 'account_label', value: 'Asia', fallbackText: '', style: { fontSize: 32 } } : null) };
  registerOverlayRoutes(app, { repository, widgetService, projectionService });
  const session = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000' } });
  const cookie = session.cookies[0];
  const sessionHeaders = { host: 'localhost:3000', origin: 'https://localhost:3000', cookie: `${cookie.name}=${cookie.value}` };
  const adminHeaders = { ...sessionHeaders, 'x-csrf-token': session.json().csrfToken };
  return { app, repository, widgetService, projectionService, sessionHeaders, adminHeaders, validCapability };
}

describe('local OBS widget routes', () => {
  it('serves one minimal read-only projection with the token in Authorization, never in URL or cache', async () => {
    const h = await makeHarness();
    const denied = await h.app.inject({ method: 'GET', url: '/overlay/api/widget', headers: { host: 'localhost:3000' } });
    expect(denied.statusCode).toBe(401);
    const response = await h.app.inject({ method: 'GET', url: '/overlay/api/widget', headers: { host: 'localhost:3000', authorization: `Bearer ${h.validCapability}` } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sourceType: 'account_label', value: 'Asia', fallbackText: '', style: { fontSize: 32 } });
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(h.projectionService.readWithCapability).toHaveBeenCalledWith(h.validCapability);
    expect(response.body).not.toContain(h.validCapability);
    const invalidCapability = 'i'.repeat(43);
    const invalid = await h.app.inject({ method: 'GET', url: '/overlay/api/widget', headers: { host: 'localhost:3000', authorization: `Bearer ${invalidCapability}` } });
    expect(invalid.statusCode).toBe(404);
    expect(invalid.body).not.toContain(invalidCapability);
    await h.app.close();
  });

  it('requires panel session and CSRF on management mutations, and does not expose stored hashes', async () => {
    const h = await makeHarness();
    const anonymous = await h.app.inject({ method: 'GET', url: '/api/overlay-widgets', headers: { host: 'localhost:3000' } });
    expect(anonymous.statusCode).toBe(401);
    const list = await h.app.inject({ method: 'GET', url: '/api/overlay-widgets', headers: h.sessionHeaders });
    expect(list.statusCode).toBe(200);
    expect(list.body).not.toContain('capabilityHash');
    const noCsrf = await h.app.inject({ method: 'POST', url: '/api/overlay-widgets', headers: h.sessionHeaders, payload: { sourceType: 'account_label' } });
    expect(noCsrf.statusCode).toBe(403);
    await h.app.close();
  });

  it('returns a newly created or regenerated capability URL once, while revoke has no replacement URL', async () => {
    const h = await makeHarness();
    const headers = { ...h.adminHeaders, 'idempotency-key': 'overlay-create-0001' };
    const created = await h.app.inject({ method: 'POST', url: '/api/overlay-widgets', headers, payload: { sourceType: 'account_label' } });
    expect(created.statusCode).toBe(201);
    expect(created.json().capabilityUrl).toContain('#one-time-secret');
    expect(created.body).not.toContain('capabilityHash');
    const regenerated = await h.app.inject({ method: 'POST', url: '/api/overlay-widgets/widget-1/regenerate', headers: { ...h.adminHeaders, 'idempotency-key': 'overlay-regenerate-01' }, payload: { expectedVersion: 1 } });
    expect(regenerated.statusCode).toBe(200);
    expect(regenerated.json().capabilityUrl).toContain('#new-one-time-secret');
    const revoked = await h.app.inject({ method: 'POST', url: '/api/overlay-widgets/widget-1/revoke', headers: { ...h.adminHeaders, 'idempotency-key': 'overlay-revoke-0001' }, payload: { expectedVersion: 2 } });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.body).not.toContain('capabilityUrl');
    await h.app.close();
  });
});
