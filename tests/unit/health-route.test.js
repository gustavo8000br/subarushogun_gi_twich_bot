import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

const healthModuleUrl = new URL('../../apps/api/src/health-route.mjs', import.meta.url);
let healthModule;
try {
  healthModule = await import(healthModuleUrl.href);
} catch {
  healthModule = {};
}

describe('local health response contract', () => {
  it('reports runtime product version and explicit database and Twitch API states', async () => {
    expect(healthModule.registerHealthRoute, 'health route contract is not implemented').toBeTypeOf('function');
    const app = Fastify();
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) };
    healthModule.registerHealthRoute(app, { pool, productVersion: 'v0.1.0-0000000-alpha' });

    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      product_version: 'v0.1.0-0000000-alpha',
      dependencies: { database: 'connected', twitch_api: 'not_configured', twitch_api_ping_ms: null },
    });
    expect(pool.query).toHaveBeenCalledWith('SELECT 1');
    await app.close();
  });

  it('marks only the database unavailable when its health query fails', async () => {
    const app = Fastify();
    const pool = { query: vi.fn().mockRejectedValue(new Error('private database details')) };
    healthModule.registerHealthRoute(app, { pool, productVersion: 'v0.1.0-0000000-alpha' });

    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'unavailable',
      product_version: 'v0.1.0-0000000-alpha',
      dependencies: { database: 'unavailable', twitch_api: 'not_configured', twitch_api_ping_ms: null },
    });
    expect(response.body).not.toContain('private database details');
    await app.close();
  });

  it('reports the live Twitch integration state instead of assuming it is unconfigured', async () => {
    const app = Fastify();
    healthModule.registerHealthRoute(app, {
      pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
      productVersion: 'v0.1.0-0000000-alpha',
      getTwitchStatus: () => 'connected',
      probeTwitchApi: vi.fn(async () => true),
    });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.json().dependencies).toMatchObject({ twitch_api: 'connected', twitch_api_ping_ms: expect.any(Number) });
    await app.close();
  });

  it('keeps channel ineligibility distinct while measuring a reachable Twitch API', async () => {
    const app = Fastify();
    const probeTwitchApi = vi.fn(async () => true);
    healthModule.registerHealthRoute(app, {
      pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
      productVersion: 'v0.3.0-0000000-alpha',
      getTwitchStatus: () => 'ineligible',
      probeTwitchApi,
    });

    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.json().dependencies).toMatchObject({
      twitch_api: 'ineligible', twitch_api_ping_ms: expect.any(Number),
    });
    expect(probeTwitchApi).toHaveBeenCalledOnce();
    await app.close();
  });

  it('caches the lightweight Twitch API ping across frequent health requests', async () => {
    const app = Fastify();
    let now = 1000;
    const probeTwitchApi = vi.fn(async () => true);
    healthModule.registerHealthRoute(app, {
      pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
      productVersion: 'v0.2.0-0000000-alpha', getTwitchStatus: () => 'connected',
      probeTwitchApi, now: () => now, probeCacheMs: 60_000,
    });

    const first = await app.inject({ method: 'GET', url: '/health' });
    now += 30_000;
    const second = await app.inject({ method: 'GET', url: '/health' });
    now += 30_001;
    const third = await app.inject({ method: 'GET', url: '/health' });

    expect(first.json().dependencies.twitch_api_ping_ms).toBe(0);
    expect(second.json().dependencies.twitch_api_ping_ms).toBe(0);
    expect(third.json().dependencies.twitch_api_ping_ms).toBe(0);
    expect(probeTwitchApi).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it('reports Twitch health as degraded when the integration probe rejects instead of claiming connected', async () => {
    const app = Fastify();
    healthModule.registerHealthRoute(app, {
      pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
      productVersion: 'v0.1.0-0000000-alpha',
      getTwitchStatus: () => { throw new Error('private token details'); },
    });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.json().dependencies.twitch_api).toBe('unknown');
    expect(response.json().dependencies.twitch_api_ping_ms).toBeNull();
    expect(response.body).not.toContain('private token details');
    await app.close();
  });
});
