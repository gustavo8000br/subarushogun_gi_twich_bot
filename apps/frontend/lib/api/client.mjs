const SAFE_ERROR = Object.freeze({ code: 'REQUEST_FAILED', status: 0 });

/**
 * Build a same-origin API client that preserves the local session, CSRF,
 * idempotency, and optimistic revision contracts used by the current panel.
 * Error bodies are never exposed to UI callers.
 * @param {{fetchImpl?: typeof fetch, createIdempotencyKey?: () => string}} [options]
 */
export function createApiClient({ fetchImpl = globalThis.fetch, createIdempotencyKey = () => globalThis.crypto.randomUUID() } = {}) {
  let csrfToken = null;

  async function request(path, options = {}) {
    if (typeof path !== 'string' || !path.startsWith('/api/')) throw new TypeError('API paths must be same-origin /api routes');
    const method = (options.method ?? 'GET').toUpperCase();
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    const headers = new globalThis.Headers(options.headers ?? {});
    if (options.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
    if (mutating) {
      if (!csrfToken) await initializeSession();
      headers.set('x-csrf-token', csrfToken);
      headers.set('idempotency-key', options.idempotencyKey ?? createIdempotencyKey());
    }
    const response = await fetchImpl(path, {
      ...options,
      method,
      body: options.body,
      headers,
      credentials: 'same-origin',
    });
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error('The request could not be completed.'), {
        code: typeof payload?.code === 'string' ? payload.code : SAFE_ERROR.code,
        referenceId: typeof payload?.referenceId === 'string' ? payload.referenceId : response.headers.get('x-error-reference'),
        status: response.status,
      });
    }
    return payload;
  }

  async function initializeSession() {
    const response = await fetchImpl('/api/session', { credentials: 'same-origin', headers: { accept: 'application/json' } });
    const payload = response.ok ? await response.json().catch(() => ({})) : {};
    if (typeof payload?.csrfToken !== 'string' || payload.csrfToken.length < 16) {
      throw Object.assign(new Error('The local session could not be initialized.'), { ...SAFE_ERROR, status: response.status });
    }
    csrfToken = payload.csrfToken;
    return payload;
  }

  return Object.freeze({ request, initializeSession });
}

export const apiClient = createApiClient();
