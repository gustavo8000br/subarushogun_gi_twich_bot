import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../../apps/frontend/lib/api/client.mjs';

function response(body, { status = 200, headers = {} } = {}) {
  return { ok: status >= 200 && status < 300, status, headers: new globalThis.Headers(headers), json: vi.fn(async () => body) };
}

describe('Next same-origin API client', () => {
  it('initializes a local session and adds CSRF and idempotency headers to mutations', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ csrfToken: 'a'.repeat(64) }))
      .mockResolvedValueOnce(response({ locale: 'en', revision: 4 }));
    const api = createApiClient({ fetchImpl, createIdempotencyKey: () => 'locale-save-001' });

    await api.request('/api/localization/locale', {
      method: 'PATCH', body: JSON.stringify({ locale: 'en', expectedRevision: 3 }),
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(1, '/api/session', expect.objectContaining({ credentials: 'same-origin' }));
    const [, init] = fetchImpl.mock.calls[1];
    expect(init.credentials).toBe('same-origin');
    expect(init.headers.get('x-csrf-token')).toBe('a'.repeat(64));
    expect(init.headers.get('idempotency-key')).toBe('locale-save-001');
    expect(init.headers.get('content-type')).toBe('application/json');
    expect(init.body).toContain('"expectedRevision":3');
  });

  it('does not send mutation credentials or idempotency headers on reads', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ locales: ['pt-BR'] }));
    const api = createApiClient({ fetchImpl });
    await api.request('/api/localization/catalogs');
    const [, init] = fetchImpl.mock.calls[0];
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(init.credentials).toBe('same-origin');
    expect(new globalThis.Headers(init.headers).has('x-csrf-token')).toBe(false);
    expect(new globalThis.Headers(init.headers).has('idempotency-key')).toBe(false);
  });

  it('rejects cross-origin paths and exposes only safe API error metadata', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ csrfToken: 'b'.repeat(64) }))
      .mockResolvedValueOnce(response({ error: 'secret=provider-token', code: 'PRODUCT_LOCALE_VERSION_CONFLICT', referenceId: 'safe-ref' }, { status: 409 }));
    const api = createApiClient({ fetchImpl });
    await expect(api.request('https://example.com/api/queues')).rejects.toThrow('same-origin');
    let failure;
    try { await api.request('/api/localization/locale', { method: 'PATCH', body: '{}' }); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ code: 'PRODUCT_LOCALE_VERSION_CONFLICT', referenceId: 'safe-ref', status: 409 });
    expect(failure.message).not.toContain('provider-token');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('allows only the same-origin health endpoint outside the API namespace', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ status: 'ok' }));
    const api = createApiClient({ fetchImpl });

    await expect(api.request('/health')).resolves.toEqual({ status: 'ok' });
    expect(fetchImpl).toHaveBeenCalledWith('/health', expect.objectContaining({ credentials: 'same-origin' }));
    await expect(api.request('/other')).rejects.toThrow('same-origin');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('returns null for no-content responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(null, { status: 204 }));
    expect(await createApiClient({ fetchImpl }).request('/api/health')).toBeNull();
  });
});
