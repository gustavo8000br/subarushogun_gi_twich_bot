// OPS-31 P6b (FT-90, TW40-01): the Get Streams reconciliation read. Fake Twurple client: live, null, 401, 403, 429, 5xx, timeout,
// malformed answer. Only a clean live/null is an answer; everything else is `unknown` and never closes a session. Per the Helix
// research note (2026-11-18) Twurple hides a plain 429 behind its limiter and retries 5xx, so the TIMEOUT is the one limit signal.
import { describe, expect, it, vi } from 'vitest';
import { createTwitchApiAdapter } from '../../apps/api/src/twitch/helix-adapter.mjs';
import { createCurrentStreamReader, CURRENT_STREAM_TIMEOUT_MS } from '../../apps/api/src/twitch/current-stream.mjs';

const stream = (overrides = {}) => ({ id: '4200', type: 'live', startDate: new Date('2030-01-01T10:00:00.000Z'), userId: '1', title: 'SECRET TITLE', gameName: 'SECRET GAME', ...overrides });
const apiWith = (impl) => ({ streams: { getStreamByUserId: vi.fn(impl) } });

describe('OPS-31 P6b getCurrentStream (TW40-01)', () => {
  it('live: returns id, type and the UTC start only (no title, game or login)', async () => {
    const api = apiWith(async () => stream());
    const adapter = createTwitchApiAdapter({ api, broadcasterId: '1' });
    const result = await adapter.getCurrentStream();
    expect(result).toEqual({ state: 'live', id: '4200', type: 'live', startedAt: new Date('2030-01-01T10:00:00.000Z') });
    expect(JSON.stringify(result)).not.toMatch(/SECRET/);
    expect(api.streams.getStreamByUserId).toHaveBeenCalledWith('1');
  });

  it('null: offline', async () => {
    expect(await createTwitchApiAdapter({ api: apiWith(async () => null), broadcasterId: '1' }).getCurrentStream()).toEqual({ state: 'offline' });
  });

  it.each([
    [401, 'unauthorized'], [403, 'forbidden'], [429, 'rate_limited'], [500, 'twitch_unavailable'], [503, 'twitch_unavailable'], [400, 'bad_request'], [null, 'lookup_error'],
  ])('error %s is unknown (%s), never offline', async (status, reason) => {
    const api = apiWith(async () => { throw Object.assign(new Error('boom'), status === null ? {} : { statusCode: status }); });
    expect(await createTwitchApiAdapter({ api, broadcasterId: '1' }).getCurrentStream()).toEqual({ state: 'unknown', reason });
  });

  it('a dead refresh token (CachedRefreshFailureError) is unauthorized', async () => {
    const api = apiWith(async () => { throw Object.assign(new Error('dead'), { name: 'CachedRefreshFailureError' }); });
    expect(await createTwitchApiAdapter({ api, broadcasterId: '1' }).getCurrentStream()).toEqual({ state: 'unknown', reason: 'unauthorized' });
  });

  it('timeout is unknown with reason timeout (the only rate-limit signal) and a late answer is discarded', async () => {
    vi.useFakeTimers();
    try {
      let release;
      const api = apiWith(() => new Promise((resolve) => { release = () => resolve(stream()); }));
      const reader = createCurrentStreamReader({ api, broadcasterId: '1' });
      const pending = reader();
      await vi.advanceTimersByTimeAsync(CURRENT_STREAM_TIMEOUT_MS + 1);
      expect(await pending).toEqual({ state: 'unknown', reason: 'timeout' });
      release();
    } finally { vi.useRealTimers(); }
    expect(CURRENT_STREAM_TIMEOUT_MS).toBe(5_000);
  });

  it.each([
    ['a missing id', stream({ id: '' })],
    ['a non-string id', stream({ id: 4200 })],
    ['an id longer than 64', stream({ id: 'x'.repeat(65) })],
    ['an invalid start', stream({ startDate: new Date('nope') })],
    ['no start', stream({ startDate: undefined })],
    ['an array', [stream()]],
    ['a string', 'live'],
  ])('malformed answer (%s) is unknown, never live and never offline', async (_label, value) => {
    expect(await createTwitchApiAdapter({ api: apiWith(async () => value), broadcasterId: '1' }).getCurrentStream()).toEqual({ state: 'unknown', reason: 'malformed_response' });
  });

  it('a non-live type is reported as live-shaped with its type so the service can ignore it (Q-4)', async () => {
    const result = await createTwitchApiAdapter({ api: apiWith(async () => stream({ type: 'rerun' })), broadcasterId: '1' }).getCurrentStream();
    expect(result).toMatchObject({ state: 'live', type: 'rerun' });
  });

  it('a client without the streams API is unknown (not configured), never offline', async () => {
    expect(await createTwitchApiAdapter({ api: {}, broadcasterId: '1' }).getCurrentStream()).toEqual({ state: 'unknown', reason: 'lookup_error' });
  });
});
