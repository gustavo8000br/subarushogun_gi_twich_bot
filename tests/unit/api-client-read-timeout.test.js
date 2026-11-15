import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, READ_TIMEOUT_MS } from '../../apps/frontend/lib/api/client.mjs';

// LA-19 (FT-44): reads are bounded by a timeout and an AbortSignal; mutations are never aborted by it.
function response(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, headers: new globalThis.Headers(), json: vi.fn(async () => body) };
}

/** A fetch that never answers but honors the abort signal like the real one. */
function hungFetch() {
  return vi.fn((_path, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })));
  }));
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('panel read timeout (LA-19)', () => {
  it('documents a 10 s bound: twice the 5 s Twitch probe budget of GET /health', () => {
    expect(READ_TIMEOUT_MS).toBe(10_000);
  });

  it('passes an AbortSignal to every read and none to mutations', async () => {
    const fetchImpl = vi.fn(async (path) => response(path === '/api/session' ? { csrfToken: 'a'.repeat(32) } : { ok: true }));
    const api = createApiClient({ fetchImpl });
    await api.request('/api/queues');
    expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    await api.request('/api/queues', { method: 'POST', body: '{}' });
    const mutation = fetchImpl.mock.calls.find(([, init]) => init.method === 'POST')[1];
    expect(mutation.method).toBe('POST');
    expect('signal' in mutation).toBe(false);
  });

  it('fails a hung read with a safe, localizable timeout error after the bound, not before', async () => {
    const fetchImpl = hungFetch();
    const api = createApiClient({ fetchImpl });
    const outcome = api.request('/api/state').then(() => 'resolved', (error) => error);
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1);
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const error = await outcome;
    expect(error).toBeInstanceOf(Error);
    expect({ code: error.code, status: error.status, timedOut: error.timedOut }).toEqual({ code: 'REQUEST_TIMEOUT', status: 0, timedOut: true });
    expect(error.message).toBe('The request could not be completed.');
    expect(JSON.stringify(error)).not.toMatch(/stack|abort/i);
    expect(error.cause).toBeUndefined();
  });

  it('also bounds a response whose body never finishes', async () => {
    const fetchImpl = vi.fn((_path, init) => Promise.resolve({
      ok: true, status: 200, headers: new globalThis.Headers(),
      json: () => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
    }));
    const api = createApiClient({ fetchImpl });
    const outcome = api.request('/api/queues').then(() => 'resolved', (error) => error);
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
    expect((await outcome).code).toBe('REQUEST_TIMEOUT');
  });

  it('keeps an ordinary network failure distinct from a timeout', async () => {
    const api = createApiClient({ fetchImpl: vi.fn().mockRejectedValue(new TypeError('network down')) });
    const error = await api.request('/api/state').catch((caught) => caught);
    expect({ code: error.code, timedOut: error.timedOut }).toEqual({ code: 'REQUEST_FAILED', timedOut: undefined });
  });

  it('does not time out a read that answers in time and clears its timer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ queues: [] }));
    const api = createApiClient({ fetchImpl });
    await expect(api.request('/api/queues')).resolves.toEqual({ queues: [] });
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS * 2);
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(false);
  });

  it('honors a caller AbortSignal on reads in addition to the timeout', async () => {
    const fetchImpl = hungFetch();
    const api = createApiClient({ fetchImpl });
    const controller = new AbortController();
    const outcome = api.request('/api/state', { signal: controller.signal }).then(() => 'resolved', (error) => error);
    controller.abort();
    const error = await outcome;
    expect(error.code).toBe('REQUEST_FAILED');
    expect(error.timedOut).toBeUndefined();
  });

  it('bounds the session request too, keeping the session error code and flagging the timeout', async () => {
    const api = createApiClient({ fetchImpl: hungFetch() });
    const outcome = api.initializeSession().then(() => 'resolved', (error) => error);
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
    const error = await outcome;
    expect({ code: error.code, status: error.status, timedOut: error.timedOut }).toEqual({ code: 'SESSION_INITIALIZATION_FAILED', status: 0, timedOut: true });
  });

  it('never aborts a mutation by time: a slow accepted change still resolves', async () => {
    const session = response({ csrfToken: 'b'.repeat(32) });
    const slow = new Promise((resolve) => { setTimeout(() => resolve(response({ saved: true })), READ_TIMEOUT_MS * 3); });
    const fetchImpl = vi.fn().mockResolvedValueOnce(session).mockReturnValueOnce(slow);
    const api = createApiClient({ fetchImpl });
    const outcome = api.request('/api/queues/q1', { method: 'PATCH', body: '{}' });
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS * 3);
    await expect(outcome).resolves.toEqual({ saved: true });
  });
});
