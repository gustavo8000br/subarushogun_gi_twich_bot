import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const appOrigin = process.env.APP_ORIGIN ?? 'https://localhost:3000';
const origin = new URL(appOrigin);
assert.equal(origin.protocol, 'https:', 'queue call resend test requires HTTPS');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'APP_ORIGIN must be loopback');

const csrfToken = 'csrf-token-for-call-resend-browser-test-0001';
const entryId = 'entry-called-browser-test';
const calledQueue = {
  id: 'queue-call-resend', slug: 'arena', title: 'Arena', isOpen: true, version: 4,
  lifecycleStatus: 'active', queueMode: 'manual_only', rewardOrigin: 'none', rewardId: null,
  remoteSyncStatus: 'local_only', modeTransitionStatus: 'none', isArchived: false,
  entries: [{
    id: entryId, userId: 'viewer-id', userLogin: 'calledviewer', displayName: 'Called Viewer',
    status: 'called', priorityClass: 'standard', priorityReason: null, position: null,
    version: 2, calledAt: '2026-10-20T18:00:00.000Z', callNotifiedAt: null,
    callDeadlineAt: '2026-10-20T18:10:00.000Z',
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
  'panel.queues.eyebrow': 'Operations',
  'panel.queues.title': 'Queues and service',
  'panel.queues.description': 'Manage queues and service.',
  'panel.queue.status.open': 'OPEN',
  'panel.queue.status.closed': 'CLOSED',
  'panel.queue.sync.local': 'local queue',
  'panel.queue.action.pause': 'Pause queue',
  'panel.queue.action.activate': 'Activate queue',
  'panel.queue.action.next': 'Next',
  'panel.queue.action.clear': 'Clear queue',
  'panel.queue.action.delete': 'Delete queue',
  'panel.queue.action.manual_mode': 'Switch to manual queue',
  'panel.queue.group.waiting': 'Waiting',
  'panel.queue.group.called': 'Called',
  'panel.queue.group.in_service': 'In service',
  'panel.queue.empty_group': 'Nobody here.',
  'panel.entry.action.attend': 'Attend',
  'panel.entry.action.attend_aria': 'Attend {user}',
  'panel.entry.action.complete': 'Complete',
  'panel.entry.action.complete_aria': 'Complete service for {user}',
  'panel.entry.action.resend': 'Resend call',
  'panel.entry.action.resend_aria': 'Resend call to {user}',
  'panel.entry.action.remove': 'Remove',
  'panel.entry.action.remove_aria': 'Remove {user}',
  'panel.notice.call_resent': 'Call resend queued. The no-show deadline was preserved.',
  'panel.notice.call_already_queued': 'The call is already queued for sending.',
  'panel.queue.action_result.saving': 'Saving…',
  'panel.queue.action_result.failed': 'The action failed.',
  'panel.error.generic': 'Could not complete the action. Try again.',
  'panel.queue.confirm.delete': 'Delete queue {title}? {count} people.',
  'panel.confirmation.title': 'Confirm action',
  'panel.dialog.cancel': 'Cancel',
  'panel.dialog.confirm': 'Confirm',
};

const calls = [];
let resendCount = 0;
let resendResponseStatus = 'queued';
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
    const call = { path: url.pathname, method, headers };
    calls.push(call);

    if (url.pathname === '/api/session') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ csrfToken }) });
    }
    if (url.pathname === '/api/localization/catalogs') {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ locales: ['en'], modules: { panel: { catalogs: { en: catalog } } } }),
      });
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
        status: 'ok', dependencies: { database: 'connected', twitch_api: 'disconnected', twitch_chat: 'disconnected' },
      }) });
    }
    if (url.pathname === '/api/queues' && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([calledQueue]) });
    }
    if (url.pathname === `/api/entries/${entryId}/call-notification/resend` && method === 'POST') {
      resendCount += 1;
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ status: resendResponseStatus, entryId }),
      });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'NOT_FOUND' }) });
  });

  await page.goto(`${origin.origin}/queues/`);
  const resendButton = page.getByRole('button', { name: 'Resend call to Called Viewer', exact: true });
  await resendButton.waitFor({ timeout: 15_000 });
  const deadlineBefore = calledQueue.entries[0].callDeadlineAt;
  await resendButton.click();

  const confirmation = page.getByRole('status').filter({ hasText: 'Call resend queued. The no-show deadline was preserved.' });
  await confirmation.waitFor({ timeout: 10_000 });
  assert.equal(await confirmation.textContent(), 'Call resend queued. The no-show deadline was preserved.');
  assert.equal(calledQueue.entries[0].callDeadlineAt, deadlineBefore, 'resend does not alter the no-show deadline projection');
  assert.equal(resendCount, 1, 'one click creates exactly one resend request');
  assert.doesNotMatch(await page.locator('body').innerText(), /private server copy|message delivered|successfully sent/i);

  const resend = calls.find((call) => call.path === `/api/entries/${entryId}/call-notification/resend`);
  assert.ok(resend, 'the action reached only the intercepted same-origin API');
  assert.equal(resend.method, 'POST');
  assert.equal(resend.headers['x-csrf-token'], csrfToken);
  assert.ok(resend.headers['idempotency-key'], 'the existing mutation idempotency boundary is retained');
  assert.equal(calls.filter(({ path }) => path === `/api/entries/${entryId}/call-notification/resend`).length, 1);

  resendResponseStatus = 'already_queued';
  await page.getByRole('button', { name: 'Resend call to Called Viewer', exact: true }).click();
  const alreadyQueuedNotice = page.getByRole('status').filter({ hasText: 'The call is already queued for sending.' });
  await alreadyQueuedNotice.waitFor({ timeout: 10_000 });
  assert.equal(await alreadyQueuedNotice.textContent(), 'The call is already queued for sending.');
  assert.equal(resendCount, 2, 'the second click is acknowledged by the idempotent already-queued response');
  assert.equal(calls.filter(({ path }) => path === `/api/entries/${entryId}/call-notification/resend`).length, 2);
  for (const request of calls.filter(({ path }) => path === `/api/entries/${entryId}/call-notification/resend`)) {
    assert.equal(request.method, 'POST');
    assert.equal(request.headers['x-csrf-token'], csrfToken);
    assert.ok(request.headers['idempotency-key'], 'each resend request retains an idempotency key');
  }
  assert.doesNotMatch(await page.locator('body').innerText(), /private server copy|message delivered|successfully sent/i);

  console.log('PASS QRA-12 browser-only: queued and already-queued responses, accessible non-delivery claims, unchanged deadline projection, CSRF and idempotency headers.');
  console.log('Boundary: every API response was an intercepted fixture; no product API, database, chat worker, Twitch, Docker, OBS, or CEF mutation was performed.');
}
finally {
  await context.close();
  await browser.close();
}
