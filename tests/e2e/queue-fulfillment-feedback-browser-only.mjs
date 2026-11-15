import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const appOrigin = process.env.APP_ORIGIN ?? 'https://localhost:3000';
const origin = new URL(appOrigin);
assert.equal(origin.protocol, 'https:', 'queue fulfillment feedback test requires HTTPS');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'APP_ORIGIN must be loopback');

const csrfToken = 'csrf-token-for-fulfillment-feedback-browser-0001';
const entryId = 'entry-called-browser-test';
const calledQueue = {
  id: 'queue-fulfillment', slug: 'arena', title: 'Arena', isOpen: true, version: 4,
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
  'panel.queue.entry_action_result.fulfillment_pending': 'Service started. The Twitch reward is being confirmed; this panel will show its confirmed or unresolved status.',
  'panel.queue.entry_action_result.fulfillment_refresh_failed': 'Service started and Twitch confirmation was queued, but the queue could not refresh. Reload the panel to check the latest status.',
  'panel.queue.action_result.saving': 'Saving…',
  'panel.queue.action_result.failed': 'The action failed.',
  'panel.error.generic': 'Could not complete the action. Try again.',
  'panel.queue.confirm.delete': 'Delete queue {title}? {count} people.',
  'panel.confirmation.title': 'Confirm action',
  'panel.dialog.cancel': 'Cancel',
  'panel.dialog.confirm': 'Confirm',
};

const pendingText = catalog['panel.queue.entry_action_result.fulfillment_pending'];
const refreshFailedText = catalog['panel.queue.entry_action_result.fulfillment_refresh_failed'];
const calls = [];
let transitionCount = 0;
let failQueueRefresh = false;
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
    calls.push({ path: url.pathname, method, headers, body: request.postData() });

    const json = (status, payload) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    if (url.pathname === '/api/session') return json(200, { csrfToken });
    if (url.pathname === '/api/localization/catalogs') {
      return json(200, { locales: ['en'], modules: { panel: { catalogs: { en: catalog } } } });
    }
    if (url.pathname === '/api/state') {
      return json(200, {
        product_version: '0.2.0-beta', account: { label: 'Streamer' }, pending_operations: [],
        product_locale: { locale: 'en', revision: 1 },
      });
    }
    if (url.pathname === '/api/setup') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (url.pathname === '/health') {
      return json(200, { status: 'ok', dependencies: { database: 'connected', twitch_api: 'disconnected', twitch_chat: 'disconnected' } });
    }
    if (url.pathname === '/api/queues' && method === 'GET') {
      if (failQueueRefresh) return json(500, { code: 'INTERNAL_ERROR' });
      return json(200, [calledQueue]);
    }
    if (url.pathname === `/api/entries/${entryId}/transitions` && method === 'POST') {
      transitionCount += 1;
      return json(200, { status: 'in_progress', id: entryId, financialDecision: 'request_fulfill' });
    }
    return json(404, { code: 'NOT_FOUND' });
  });

  await page.goto(`${origin.origin}/queues/`);
  const attendButton = page.getByRole('button', { name: 'Attend Called Viewer', exact: true });
  await attendButton.waitFor({ timeout: 15_000 });
  await attendButton.click();

  const pending = page.getByRole('status').filter({ hasText: pendingText });
  await pending.waitFor({ timeout: 10_000 });
  assert.equal((await pending.textContent())?.trim(), pendingText);
  assert.equal(transitionCount, 1, 'one click creates exactly one transition request');
  const transition = calls.find((call) => call.path === `/api/entries/${entryId}/transitions`);
  assert.deepEqual(JSON.parse(transition.body), { to: 'in_progress', reason: 'service_started' });
  assert.equal(transition.headers['x-csrf-token'], csrfToken);
  assert.ok(transition.headers['idempotency-key'], 'the existing mutation idempotency boundary is retained');
  assert.doesNotMatch(await page.locator('body').innerText(), /confirmed by twitch|reward confirmed|points confirmed/i);

  // Variant 2: the transition is accepted but the follow-up queue refresh fails.
  failQueueRefresh = true;
  await page.reload();
  failQueueRefresh = false;
  await attendButton.waitFor({ timeout: 15_000 });
  failQueueRefresh = true;
  await attendButton.click();
  const refreshFailed = page.getByRole('status').filter({ hasText: refreshFailedText });
  await refreshFailed.waitFor({ timeout: 10_000 });
  assert.equal((await refreshFailed.textContent())?.trim(), refreshFailedText);
  assert.equal(transitionCount, 2);
  assert.doesNotMatch(await page.locator('body').innerText(), /confirmed by twitch|reward confirmed|points confirmed/i);

  console.log('PASS OPS-19 browser-only: attend with request_fulfill shows localized pending status (role=status), and the refresh-failed variant shows the refresh-failed status; neither claims Twitch confirmation.');
  console.log('Boundary: every API response was an intercepted fixture; no product API, database, chat worker, Twitch, Docker, OBS, or CEF mutation was performed.');
}
finally {
  await context.close();
  await browser.close();
}
