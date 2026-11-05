// OPS-26 slice A / D-8 (pre-bump): one shared, monotonic, single-flight Twitch API probe read by /health and by `!fila ping`.
import Fastify from 'fastify';
import { ApiClient } from '@twurple/api';
import { StaticAuthProvider } from '@twurple/auth';
import { createTwitchApiAdapter } from '../../apps/api/src/twitch/helix-adapter.mjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSharedApiProbe, SHARED_API_PROBE_DEFAULTS } from '../../apps/api/src/twitch/shared-api-probe.mjs';
import { registerHealthRoute } from '../../apps/api/src/health-route.mjs';

function fixture({ status = 'connected', latencyMs = 219, ...overrides } = {}) {
  const state = { t: 1_000, status, latencyMs, outcome: 'ok' };
  const probe = vi.fn(async () => {
    state.t += state.latencyMs;
    if (state.outcome === 'throw') throw Object.assign(new Error('secret helix body Bearer abc'), { statusCode: 500 });
    return state.outcome === 'false' ? false : true;
  });
  const shared = createSharedApiProbe({ probe, getIntegrationStatus: () => state.status, nowMs: () => state.t, ...overrides });
  return { state, probe, shared };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('shared Twitch API probe (D-8)', () => {
  it('uses the architect constants by default: 30 s success, 5 s failure, 5 s limit', () => {
    expect(SHARED_API_PROBE_DEFAULTS).toEqual({ ttlMs: 30_000, failureTtlMs: 5_000, timeoutMs: 5_000 });
  });

  it('AC-D8-2 present: a fresh measurement is reused without another Helix call', async () => {
    const h = fixture();
    expect(await h.shared.read()).toEqual({ state: 'ok', ms: 219 });
    h.state.t += 29_000;
    expect(await h.shared.read()).toEqual({ state: 'ok', ms: 219 });
    expect(h.probe).toHaveBeenCalledTimes(1);
  });

  it('AC-D8-2 absent: with no measurement and the integration connected, exactly one probe is taken', async () => {
    const h = fixture({ status: 'degraded' });
    expect(await h.shared.read()).toEqual({ state: 'ok', ms: 219 });
    expect(h.probe).toHaveBeenCalledTimes(1);
  });

  it('AC-D8-2 Twitch failing: a throw or a non-true result is TWITCH_PROBE_FAILED with no error text', async () => {
    for (const outcome of ['throw', 'false']) {
      const h = fixture();
      h.state.outcome = outcome;
      const result = await h.shared.read();
      expect(result, outcome).toEqual({ state: 'failed', code: 'TWITCH_PROBE_FAILED' });
      expect(JSON.stringify(result)).not.toMatch(/secret|Bearer/);
    }
  });

  it('AC-D8-2 not connected: zero Helix calls and TWITCH_NOT_CONNECTED for every non-connected status', async () => {
    for (const status of ['reconnect_required', 'not_configured', 'connecting', 'retrying', 'stopped', 'unknown']) {
      const h = fixture({ status });
      expect(await h.shared.read(), status).toEqual({ state: 'not_connected', code: 'TWITCH_NOT_CONNECTED' });
      expect(h.probe, status).not.toHaveBeenCalled();
    }
  });

  it('AC-D8-3: 50 concurrent pings share one probe per window (single-flight) and one more after the window', async () => {
    const h = fixture();
    const results = await Promise.all(Array.from({ length: 50 }, () => h.shared.read()));
    expect(new Set(results.map((r) => r.ms))).toEqual(new Set([219]));
    expect(h.probe).toHaveBeenCalledTimes(1);
    h.state.t += 30_000;
    await h.shared.read();
    expect(h.probe).toHaveBeenCalledTimes(2);
  });

  it('a failure is cached for 5 s only (negative cache), then retried; a throw never leaves the pending probe set', async () => {
    const h = fixture();
    h.state.outcome = 'throw';
    await h.shared.read();
    h.state.t += 4_000;
    await h.shared.read();
    expect(h.probe).toHaveBeenCalledTimes(1);
    h.state.outcome = 'ok';
    h.state.t += 1_001;
    expect(await h.shared.read()).toMatchObject({ state: 'ok' });
    expect(h.probe).toHaveBeenCalledTimes(2);
  });

  it('measures with a monotonic delta: integer ms, rounded, never negative', async () => {
    const rounded = fixture({ latencyMs: 218.6 });
    expect(await rounded.shared.read()).toEqual({ state: 'ok', ms: 219 });
    let calls = 0;
    const clock = [5_000, 4_000];
    const backwards = createSharedApiProbe({ probe: async () => true, getIntegrationStatus: () => 'connected', nowMs: () => clock[Math.min(calls++, 1)] });
    expect(await backwards.read()).toEqual({ state: 'ok', ms: 0 });
  });

  it('bounds the probe at 5 s: a stalled Helix is TWITCH_PROBE_FAILED and the chat never hangs', async () => {
    vi.useFakeTimers();
    const probe = vi.fn(() => new Promise(() => {}));
    const shared = createSharedApiProbe({ probe, getIntegrationStatus: () => 'connected' });
    const pending = shared.read();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toEqual({ state: 'failed', code: 'TWITCH_PROBE_FAILED' });
  });

  it('does not leak the timeout timer after a successful or failed probe', async () => {
    vi.useFakeTimers();
    const ok = createSharedApiProbe({ probe: async () => true, getIntegrationStatus: () => 'connected' });
    await ok.read();
    expect(vi.getTimerCount()).toBe(0);
    const bad = createSharedApiProbe({ probe: async () => { throw new Error('x'); }, getIntegrationStatus: () => 'connected' });
    await bad.read();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('constants are injectable (ttlMs, failureTtlMs, timeoutMs)', async () => {
    const h = fixture({ ttlMs: 100 });
    await h.shared.read();
    h.state.t += 101;
    await h.shared.read();
    expect(h.probe).toHaveBeenCalledTimes(2);
  });

  it('invalidation: leaving connected drops the cache, so a stale value never survives a reconnect', async () => {
    const h = fixture();
    await h.shared.read();
    h.state.status = 'reconnect_required';
    expect(await h.shared.read()).toEqual({ state: 'not_connected', code: 'TWITCH_NOT_CONNECTED' });
    h.state.status = 'connected';
    h.state.latencyMs = 40;
    expect(await h.shared.read()).toEqual({ state: 'ok', ms: 40 });
    expect(h.probe).toHaveBeenCalledTimes(2);
  });

  it('invalidation: a rebuilt Twurple session (new epoch) forces a new call even inside the TTL', async () => {
    let epoch = 1;
    const h = fixture({ getEpoch: () => epoch });
    await h.shared.read();
    epoch = 2;
    await h.shared.read();
    expect(h.probe).toHaveBeenCalledTimes(2);
  });

  it('AC-D8-5: /health twitch_api_ping_ms equals the value `ping` reads, from one probe call', async () => {
    const h = fixture();
    const app = Fastify();
    registerHealthRoute(app, { pool: { query: vi.fn().mockResolvedValue({ rows: [] }) }, productVersion: 'v0.3.0-0000000-beta', getTwitchStatus: () => h.state.status, sharedProbe: h.shared });
    const health = await app.inject({ method: 'GET', url: '/health' });
    const ping = await h.shared.read();
    expect(health.json().dependencies).toMatchObject({ twitch_api: 'connected', twitch_api_ping_ms: 219 });
    expect(ping.ms).toBe(health.json().dependencies.twitch_api_ping_ms);
    expect(h.probe).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('/health maps failed to degraded with a null ping and not_connected to the status mapping, with the public fields unchanged', async () => {
    const h = fixture();
    h.state.outcome = 'throw';
    const app = Fastify();
    registerHealthRoute(app, { pool: { query: vi.fn().mockResolvedValue({ rows: [] }) }, productVersion: 'v0.3.0-0000000-beta', getTwitchStatus: () => h.state.status, sharedProbe: h.shared });
    expect((await app.inject({ method: 'GET', url: '/health' })).json().dependencies).toMatchObject({ twitch_api: 'degraded', twitch_api_ping_ms: null });
    h.state.status = 'reconnect_required';
    expect((await app.inject({ method: 'GET', url: '/health' })).json().dependencies).toMatchObject({ twitch_api: 'reconnect_required', twitch_api_ping_ms: null });
    await app.close();
  });

  it('AC-D8-6: a real Twurple ApiClient with a fake fetch makes exactly one helix/users?id=<broadcaster> request and measures at least the fake delay', async () => {
    const fetchMock = vi.fn(async (target) => {
      if (new URL(String(target)).pathname === '/oauth2/validate') {
        return new globalThis.Response(JSON.stringify({ client_id: 'fixture-client', login: 'fixture', scopes: [], user_id: 'broadcaster-1', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
      return new globalThis.Response(JSON.stringify({ data: [{ id: 'broadcaster-1', login: 'fixture', display_name: 'Fixture', type: '', broadcaster_type: '', description: '', profile_image_url: '', offline_image_url: '', view_count: 0, created_at: '2020-01-01T00:00:00Z' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const api = new ApiClient({ authProvider: new StaticAuthProvider('fixture-client', 'fixture-token') });
    const adapter = createTwitchApiAdapter({ api, broadcasterId: 'broadcaster-1' });
    const shared = createSharedApiProbe({ probe: () => adapter.ping(), getIntegrationStatus: () => 'connected' });
    const result = await shared.read();
    await shared.read();
    const helixCalls = fetchMock.mock.calls.filter(([target]) => new URL(String(target)).pathname.startsWith('/helix/'));
    expect(helixCalls).toHaveLength(1);
    const url = new URL(String(helixCalls[0][0]));
    expect(url.pathname).toBe('/helix/users');
    expect(url.searchParams.get('id')).toBe('broadcaster-1');
    expect(result.state).toBe('ok');
    expect(result.ms).toBeGreaterThanOrEqual(29);
  });
});
