import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

// Shared harness for the Layer B browser-only scripts (real Chrome + the Next panel, API responses INTERCEPTED).
// Nothing run through this harness proves persistence, Fastify, PostgreSQL, Twitch, OBS or CEF behavior.
const parseTsv = (locale) => Object.fromEntries(readFileSync(new URL(`../../../apps/shared/localization/catalogs/panel/${locale}.tsv`, import.meta.url), 'utf8')
  .trim().split('\n').map((line) => { const i = line.indexOf('\t'); return [line.slice(0, i), line.slice(i + 1)]; }));

export const catalogs = Object.freeze({ en: parseTsv('en'), 'pt-BR': parseTsv('pt-BR') });
export const CSRF_TOKEN = 'csrf-token-for-browser-only-harness-0001';
export const json = (body, status = 200, headers = undefined) => ({ status, body, headers });

export function resolveAppOrigin() {
  const appOrigin = process.env.APP_ORIGIN ?? 'https://localhost:3000';
  const origin = new URL(appOrigin);
  assert.equal(origin.protocol, 'https:', 'browser-only test requires HTTPS');
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'APP_ORIGIN must be loopback');
  return origin;
}

/**
 * Open the panel in Chrome with an intercepted same-origin API.
 * `handlers` maps `"METHOD /path"` to `(call) => ({ status, body, headers })`; replace entries at any time with `setHandler`.
 * Cross-origin requests are aborted and recorded in `external` (so OAuth redirects are asserted, never followed).
 */
export async function openPanel({ state = {}, setup = {}, queues = [], health, handlers = {} } = {}) {
  const origin = resolveAppOrigin();
  const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const calls = [];
  const external = [];
  const table = new Map();
  const runtime = {
    product_version: '0.4.0-beta', account: { label: 'Streamer', defaultLabel: 'Streamer' }, pending_operations: [],
    product_locale: { locale: 'en', revision: 1 }, ...state,
  };
  const set = (key, handler) => table.set(key, typeof handler === 'function' ? handler : () => handler);
  set('GET /api/session', json({ csrfToken: CSRF_TOKEN }));
  set('GET /api/localization/catalogs', json({ locales: ['en', 'pt-BR'], modules: { panel: { catalogs } } }));
  set('GET /api/state', () => json(runtime));
  set('GET /api/setup', json(setup));
  set('GET /api/queues', () => json(queues));
  set('GET /health', json(health ?? { status: 'ok', dependencies: { database: 'connected', twitch_api: 'connected', twitch_chat: 'connected' } }));
  for (const [key, handler] of Object.entries(handlers)) set(key, handler);

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin.origin) {
      external.push({ url: url.href, method: request.method() });
      return route.abort();
    }
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/health') return route.continue();
    const body = (() => { try { return request.postDataJSON(); } catch { return null; } })();
    const call = { key: `${request.method()} ${url.pathname}`, method: request.method(), path: url.pathname, headers: await request.allHeaders(), body };
    calls.push(call);
    const handler = table.get(call.key);
    const response = handler ? await handler(call) : json({ code: 'NOT_FOUND' }, 404);
    return route.fulfill({ status: response.status, contentType: 'application/json', headers: response.headers, body: JSON.stringify(response.body) });
  });

  return {
    page, origin, calls, external, runtime, catalog: catalogs.en,
    setHandler: set,
    callsTo: (key) => calls.filter((call) => call.key === key),
    goto: (path) => page.goto(`${origin.origin}${path}`),
    close: async () => { await context.close(); await browser.close(); },
  };
}

/** Assert that none of the secret strings is present in the URL, the visible text, element attributes or any input value (framework script payloads such as the Next flight data are excluded). */
export async function assertNoSecrets(page, secrets, label) {
  const surface = await page.evaluate(() => ({
    url: location.href,
    html: [document.body.innerText, ...[...document.body.querySelectorAll('*:not(script):not(style)')].flatMap((el) => [...el.attributes].map((attr) => attr.value))].join('\n'),
    values: [...document.querySelectorAll('input,textarea')].map((el) => el.value),
  }));
  for (const secret of secrets) {
    assert.ok(!surface.url.includes(secret), `${label}: URL must not carry ${secret.slice(0, 6)}...`);
    assert.ok(!surface.html.includes(secret), `${label}: visible DOM must not carry ${secret.slice(0, 6)}...`);
    assert.ok(!surface.values.some((value) => value.includes(secret)), `${label}: inputs must not hold ${secret.slice(0, 6)}...`);
  }
}

export function boundary(name, extra = '') {
  console.log(`Boundary (${name}): API responses were intercepted fixtures; no Fastify, PostgreSQL, Twitch, Docker, OBS or CEF behavior was proved.${extra ? ` ${extra}` : ''}`);
}
