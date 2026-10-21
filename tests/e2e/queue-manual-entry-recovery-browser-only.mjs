import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { qraQueueDto } from './fixtures/qra-api-fixtures.mjs';

const appOrigin = process.env.APP_ORIGIN ?? 'https://localhost:3000';
const origin = new URL(appOrigin);
assert.equal(origin.protocol, 'https:', 'manual entry recovery test requires HTTPS');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'APP_ORIGIN must be loopback');

const csrfToken = 'csrf-token-for-manual-entry-browser-test-0001';
const queue = { ...qraQueueDto, entries: qraQueueDto.entries.map((entry) => ({ ...entry })) };
const acceptedEntry = { id: 'entry-manual-accepted', status: 'waiting', position: 2 };
const reconciledQueue = {
  ...queue,
  entries: [...queue.entries, {
    ...acceptedEntry,
    userLogin: 'newviewer',
    displayName: 'newviewer',
    priorityClass: 'standard',
    priorityReason: null,
    uid: null,
  }],
};
const catalog = {
  'panel.navigation.overview': 'Overview',
  'panel.navigation.queues': 'Queues',
  'panel.navigation.operations': 'Operations',
  'panel.navigation.connection': 'Twitch connection',
  'panel.navigation.settings': 'Settings',
  'panel.navigation.widgets': 'OBS widgets',
  'panel.navigation.commands': 'Chat commands',
  'panel.queues.title': 'Queues and service',
  'panel.queue.action.add': 'Add',
  'panel.entry.twitch_login': 'Twitch login',
  'panel.entry.uid_optional': 'UID (optional)',
  'panel.entry.uid_placeholder': 'Nine digits',
  'panel.entry.login_placeholder': 'viewer_name',
  'panel.entry.add': 'Add to queue',
  'panel.entry.error.invalid': 'Enter a valid Twitch login.',
  'panel.entry.error.unavailable': 'This queue is not available for manual admission.',
  'panel.entry.error.failed': 'Could not add this viewer.',
  'panel.entry.add.refresh_failed': 'The API accepted {user} at position {position}, but the queue list could not refresh. Refresh before retrying.',
  'panel.entry.added': 'Viewer added to the queue.',
  'panel.reward.refresh_queue': 'Refresh queue',
  'panel.reward.refreshing_queue': 'Refreshing queue…',
  'panel.queue.action_result.saving': 'Saving…',
  'panel.queue.group.waiting': 'Waiting',
  'panel.queue.group.called': 'Called',
  'panel.queue.group.in_service': 'In service',
  'panel.queue.status.open': 'Open',
  'panel.error.reference': 'Reference: {id}',
};

const calls = [];
let postObserved = false;
let queueReadsAfterPost = 0;
const browser = await chromium.launch({
  channel: process.env.CHROME_CHANNEL ?? 'chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' });
const page = await context.newPage();

try {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin.origin) return route.abort();
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/health') return route.continue();

    const method = request.method();
    const headers = await request.allHeaders();
    const record = { path: url.pathname, method, headers };
    calls.push(record);

    if (url.pathname === '/api/session') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ csrfToken }) });
    }
    if (url.pathname === '/api/localization/catalogs') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        locales: ['en'], modules: { panel: { catalogs: { en: catalog } },
      } }) });
    }
    if (url.pathname === '/api/state') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        product_version: '0.2.0-beta', account: { label: 'Streamer' }, pending_operations: [],
        product_locale: { locale: 'en', revision: 1 },
      }) });
    }
    if (url.pathname === '/api/setup') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (url.pathname === '/health') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'ok', dependencies: { database: 'connected', twitch_api: 'connected', twitch_chat: 'connected' },
      }) });
    }
    if (url.pathname === '/api/queues' && method === 'GET') {
      if (postObserved) {
        queueReadsAfterPost += 1;
        if (queueReadsAfterPost === 1) {
          return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
            code: 'INTERNAL_ERROR', error: 'private projection failure',
          }) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([reconciledQueue]) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([queue]) });
    }
    if (url.pathname === `/api/queues/${queue.id}/manual-entries` && method === 'POST') {
      postObserved = true;
      record.body = request.postDataJSON();
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(acceptedEntry) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'NOT_FOUND' }) });
  });

  await page.goto(`${origin.origin}/queues/`);
  await page.getByText('Add', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Twitch login' }).fill('newviewer');
  await page.getByRole('button', { name: 'Add to queue' }).click();

  const warningText = 'The API accepted newviewer at position 2, but the queue list could not refresh. Refresh before retrying.';
  const warning = page.getByRole('status').filter({ hasText: warningText });
  await warning.waitFor({ timeout: 10_000 });
  assert.equal(await page.getByText('newviewer', { exact: true }).count(), 1, 'the accepted entry is retained in the visible operator projection');
  assert.equal(await page.getByRole('button', { name: 'Refresh queue' }).count(), 1, 'the failed projection can be retried without submitting the add action');
  assert.equal(await page.getByRole('button', { name: 'Add to queue' }).count(), 1);
  assert.doesNotMatch(await warning.innerText(), /private projection failure|added to the queue successfully/i);

  const post = calls.find((call) => call.path === `/api/queues/${queue.id}/manual-entries` && call.method === 'POST');
  assert.ok(post, 'manual admission reached only the intercepted same-origin API');
  assert.deepEqual(post.body, { login: 'newviewer', priority: false });
  assert.equal(post.headers['x-csrf-token'], csrfToken);
  assert.ok(post.headers['idempotency-key']);
  assert.equal(queueReadsAfterPost, 1, 'the first list read failed after the accepted 201');

  await page.getByRole('button', { name: 'Refresh queue' }).click();
  await page.getByRole('status').filter({ hasText: 'Viewer added to the queue.' }).waitFor();
  assert.equal(await page.getByText('newviewer', { exact: true }).count(), 1);
  assert.equal(await page.getByText('2', { exact: true }).count(), 1, 'the reconciled list shows the accepted position');
  assert.equal(queueReadsAfterPost, 2, 'recovery performs one read-only queue GET');
  assert.equal(calls.filter((call) => call.path === `/api/queues/${queue.id}/manual-entries` && call.method === 'POST').length, 1);

  console.log('PASS QRA-10 manual admission browser-only recovery: accepted 201 remains visible after failed projection, accessible GET-only retry reconciles it, and no duplicate POST is sent.');
  console.log('Boundary: all API responses were intercepted fixtures; no live API, PostgreSQL, Twitch, Docker, OBS, or CEF mutation was performed.');
}
finally {
  await context.close();
  await browser.close();
}
