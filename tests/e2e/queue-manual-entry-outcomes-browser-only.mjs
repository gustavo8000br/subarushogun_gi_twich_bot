import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { qraQueueDto } from './fixtures/qra-api-fixtures.mjs';

const appOrigin = process.env.APP_ORIGIN ?? 'https://localhost:3000';
const origin = new URL(appOrigin);
assert.equal(origin.protocol, 'https:', 'manual entry outcomes test requires HTTPS');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'APP_ORIGIN must be loopback');

const csrfToken = 'csrf-token-for-manual-entry-outcomes-browser-test-0001';
const baseQueue = { ...qraQueueDto, entries: [], queueMode: 'manual_only', rewardOrigin: 'none', rewardId: null, remoteSyncStatus: 'local_only', isOpen: true };
const acceptedViewer = { id: 'entry-accepted', userLogin: 'newviewer', displayName: 'newviewer', status: 'waiting', position: 1, priorityClass: 'standard', priorityReason: null, uid: null };

// The shipped English panel catalog is the source of truth for the copy asserted below.
const catalog = Object.fromEntries(readFileSync(new URL('../../apps/web/localization/catalogs/panel/en.tsv', import.meta.url), 'utf8')
  .split('\n').filter((line) => line.includes('\t')).map((line) => {
    const index = line.indexOf('\t');
    return [line.slice(0, index), line.slice(index + 1)];
  }));

const outcomes = {
  already: { status: 409, body: { code: 'DUPLICATE_ACTIVE_ENTRY', error: 'Essa pessoa já está ativa nesta fila.' } },
  missing: { status: 404, body: { code: 'TWITCH_USER_NOT_FOUND', error: 'Esse usuário da Twitch não foi encontrado.' } },
  unavailable: { status: 409, body: { code: 'QUEUE_NOT_AVAILABLE', error: 'Essa fila não aceita novas entradas.' } },
  legacy: { status: 409, body: { error: 'Essa pessoa já está ativa nesta fila.' } },
};
let next = 'already';
let accepted = false;
const posts = [];
const browser = await chromium.launch({
  channel: process.env.CHROME_CHANNEL ?? 'chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

try {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin.origin) return route.abort();
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/health') return route.continue();
    const method = request.method();
    if (url.pathname === '/api/session') return json(route, 200, { csrfToken });
    if (url.pathname === '/api/localization/catalogs') return json(route, 200, { locales: ['en'], modules: { panel: { catalogs: { en: catalog } } } });
    if (url.pathname === '/api/state') return json(route, 200, { product_version: '0.2.0-beta', account: { label: 'Streamer' }, pending_operations: [], product_locale: { locale: 'en', revision: 1 } });
    if (url.pathname === '/api/setup') return json(route, 200, {});
    if (url.pathname === '/health') return json(route, 200, { status: 'ok', dependencies: { database: 'connected', twitch_api: 'connected', twitch_chat: 'connected' } });
    if (url.pathname === '/api/queues' && method === 'GET') return json(route, 200, [{ ...baseQueue, entries: accepted ? [acceptedViewer] : [] }]);
    if (url.pathname === `/api/queues/${baseQueue.id}/manual-entries` && method === 'POST') {
      posts.push({ body: request.postDataJSON(), headers: await request.allHeaders() });
      if (next === 'created') {
        accepted = true;
        return json(route, 201, { id: acceptedViewer.id, status: 'waiting', position: 1 });
      }
      return json(route, outcomes[next].status, outcomes[next].body);
    }
    return json(route, 404, { code: 'NOT_FOUND' });
  });

  await page.goto(`${origin.origin}/queues/`);
  await page.getByText('Add', { exact: true }).click();
  const login = page.getByRole('textbox', { name: 'Twitch login' });
  const submit = page.getByRole('button', { name: 'Add to queue' });
  // Next's empty route announcer also has role=alert; only alerts with text are user-facing.
  const visibleAlerts = () => page.getByRole('alert').filter({ hasText: /\S/ }).count();
  const overflow = () => page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.window.innerWidth);

  // Duplicate (409 DUPLICATE_ACTIVE_ENTRY): a polite status, the draft is kept, nothing leaks.
  await login.fill('viewer_name');
  await submit.click();
  const duplicate = page.getByRole('status').filter({ hasText: '@viewer_name is already in this queue. Nothing was changed.' });
  await duplicate.waitFor({ timeout: 10_000 });
  assert.equal(await visibleAlerts(), 0, 'a duplicate is not announced as an error alert');
  assert.equal(await login.inputValue(), 'viewer_name', 'the typed login is preserved');
  assert.doesNotMatch(await duplicate.innerText(), /Essa pessoa|DUPLICATE_ACTIVE_ENTRY/);

  // Unknown Twitch login (404 TWITCH_USER_NOT_FOUND): inline field error, focus returns to the field.
  next = 'missing';
  await login.fill('viewer_nme');
  await submit.click();
  const fieldError = page.locator('.form-error').filter({ hasText: "We couldn't find @viewer_nme on Twitch." });
  await fieldError.waitFor();
  assert.equal(await login.getAttribute('aria-invalid'), 'true');
  assert.ok((await login.getAttribute('aria-describedby'))?.startsWith('login-error-'));
  assert.equal(await page.evaluate(() => globalThis.document.activeElement?.getAttribute('name')), 'login', 'focus moves to the login field');
  assert.equal(await visibleAlerts(), 0, 'the field error is not repeated as a card alert');
  assert.equal(await login.inputValue(), 'viewer_nme');
  await login.fill('viewer_name2');
  assert.equal(await login.getAttribute('aria-invalid'), null, 'editing clears the invalid state');

  // Queue unavailable (409 QUEUE_NOT_AVAILABLE): specific alert that really is fixed by refreshing.
  next = 'unavailable';
  await submit.click();
  const unavailable = page.getByRole('alert').filter({ hasText: "This queue isn't accepting entries right now." });
  await unavailable.waitFor();

  // A code-less 409 (older API or proxy) keeps the reviewed neutral fallback.
  next = 'legacy';
  await login.fill('viewer_name3');
  await submit.click();
  await page.getByRole('alert').filter({ hasText: "The viewer could not be added. Check the login and whether they're already in the queue" }).waitFor();

  // Success (201 + successful list read): confirmation, visible entry, cleared form, focus back on the login field.
  next = 'created';
  await login.fill('newviewer');
  await submit.click();
  await page.getByRole('status').filter({ hasText: 'Viewer added to the queue.' }).waitFor();
  assert.equal(await page.getByText('newviewer', { exact: true }).count(), 1);
  assert.equal(await login.inputValue(), '', 'the form is cleared after success');
  assert.equal(await page.evaluate(() => globalThis.document.activeElement?.getAttribute('name')), 'login', 'focus returns to the login field for the next viewer');
  assert.equal(await overflow(), true, 'no horizontal overflow at 390px');

  assert.equal(posts.length, 5, 'one POST per submitted outcome, no automatic retry');
  assert.deepEqual(posts[0].body, { login: 'viewer_name', priority: false });
  for (const post of posts) {
    assert.equal(post.headers['x-csrf-token'], csrfToken);
    assert.ok(post.headers['idempotency-key']);
  }
  assert.equal(new Set(posts.map((post) => post.headers['idempotency-key'])).size, 5, 'each submission uses its own idempotency key');

  console.log('PASS QRA-10 manual admission outcomes browser-only: duplicate status, field-level unknown-login error with focus, specific unavailable alert, neutral code-less fallback and success with cleared form at 390px.');
  console.log('Boundary: all API responses were intercepted fixtures; no live API, PostgreSQL, Twitch, Docker, OBS, or CEF mutation was performed.');
}
finally {
  await context.close();
  await browser.close();
}
