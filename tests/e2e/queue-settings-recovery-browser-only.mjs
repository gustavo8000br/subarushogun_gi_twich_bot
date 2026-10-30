import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const appOrigin = process.env.APP_ORIGIN ?? 'https://localhost:3000';
const origin = new URL(appOrigin);
assert.equal(origin.protocol, 'https:', 'queue settings recovery test requires HTTPS');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'APP_ORIGIN must be loopback');

const csrfToken = 'csrf-token-for-settings-browser-test-0001';
const initialQueue = {
  id: 'queue-settings-1', slug: 'arena', title: 'Arena', isOpen: true, version: 3,
  lifecycleStatus: 'active', queueMode: 'manual_only', rewardOrigin: 'manual', rewardId: null,
  remoteSyncStatus: 'local_only', modeTransitionStatus: 'none', isArchived: false,
  callTimeoutMin: 10, callMessage: 'Old {user} message', showUidInList: false,
  showUidInOverlay: false, showUidOnCall: false, refundIfRemovedWhileCalled: false,
  refundOnNoShow: false, refundIfViewerLeavesCalled: false, entries: [],
};
const acceptedQueue = {
  ...initialQueue, version: 4, callTimeoutMin: 15, callMessage: 'New {user} message',
};
const catalog = {
  'panel.navigation.overview': 'Overview',
  'panel.navigation.queues': 'Queues',
  'panel.navigation.operations': 'Operations',
  'panel.navigation.connection': 'Twitch connection',
  'panel.navigation.settings': 'Settings',
  'panel.navigation.widgets': 'OBS widgets',
  'panel.navigation.commands': 'Chat commands',
  'panel.queue.action.configure': 'Configure',
  'panel.queues.title': 'Queues and service',
  'panel.queue_settings.title': 'Queue options',
  'panel.queue_settings.section_attendance': 'Call and attendance',
  'panel.queue_settings.call_deadline': 'Time to start service (minutes; blank disables)',
  'panel.queue_settings.call_message': 'Call message',
  'panel.queue_settings.call_placeholders': 'Accepted fields: {user}, {queue}, {position}, {uid}, {account}.',
  'panel.queue_settings.section_privacy': 'Viewer UID privacy',
  'panel.queue_settings.show_uid_list': 'Show UID in chat list',
  'panel.queue_settings.show_uid_overlay': 'Allow UID in overlay projection',
  'panel.queue_settings.show_uid_call': 'Show UID in call message',
  'panel.queue_settings.uid_policy_hint': 'Edit the UID policy and reward under Edit reward.',
  'panel.queue_settings.section_points': 'Account and points policies',
  'panel.queue_settings.refund_removed': 'Request a refund when removing a called person',
  'panel.queue_settings.refund_no_show': 'Request a refund after a no-show',
  'panel.queue_settings.refund_viewer_leave': 'Request a refund if a called viewer leaves',
  'panel.queue_settings.unsaved': 'Unsaved changes',
  'panel.queue_settings.no_changes': 'All settings are saved.',
  'panel.queue_settings.save': 'Save settings',
  'panel.queue.settings_result.refresh_failed': 'Settings were saved, but the queue list could not refresh. Reload the page to verify the current values.',
  'panel.notice.queue_settings_saved': 'Queue settings saved.',
  'panel.queue.action_result.saving': 'Saving…',
  'panel.form.cancel': 'Cancel',
  'panel.error.generic': 'Could not complete the action. Try again.',
};

const calls = [];
let queueReadsAfterPatch = 0;
let patchObserved = false;
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
        status: 'ok', dependencies: { database: 'connected', twitch_api: 'connected', twitch_chat: 'connected' },
      }) });
    }
    if (url.pathname === '/api/queues' && method === 'GET') {
      if (patchObserved) {
        queueReadsAfterPatch += 1;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
          code: 'INTERNAL_ERROR', error: 'private projection failure',
        }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([initialQueue]) });
    }
    if (url.pathname === '/api/queues/queue-settings-1/settings' && method === 'PATCH') {
      patchObserved = true;
      record.body = request.postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(acceptedQueue) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'NOT_FOUND' }) });
  });

  await page.goto(`${origin.origin}/queues/`);
  const settingsDisclosure = page.locator('.queue-settings-editor summary');
  await settingsDisclosure.waitFor({ timeout: 15_000 });
  await settingsDisclosure.click();
  await page.getByRole('spinbutton', { name: /Time to start service/ }).fill('15');
  await page.getByRole('textbox', { name: 'Call message' }).fill('New {user} message');
  await page.getByRole('button', { name: 'Save settings' }).click();

  const warningText = 'Settings were saved, but the queue list could not refresh. Reload the page to verify the current values.';
  const warning = page.getByRole('status').filter({ hasText: warningText });
  await warning.waitFor({ timeout: 10_000 });
  assert.equal(await warning.textContent(), warningText, 'the accepted-save/failed-refresh warning is announced accessibly');
  assert.equal(await page.getByRole('spinbutton', { name: /Time to start service/ }).inputValue(), '15');
  assert.equal(await page.getByRole('textbox', { name: 'Call message' }).inputValue(), 'New {user} message');
  assert.equal(await page.getByText('Queue settings saved.', { exact: true }).count(), 0, 'the warning is not replaced by a success claim');
  assert.doesNotMatch(await page.locator('body').innerText(), /private projection failure/);

  const patch = calls.find((call) => call.path === '/api/queues/queue-settings-1/settings' && call.method === 'PATCH');
  assert.ok(patch, 'the settings mutation reached only the intercepted same-origin API');
  assert.deepEqual(patch.body, {
    expectedVersion: 3,
    callTimeoutMin: 15,
    callMessage: 'New {user} message',
    showUidInList: false,
    showUidInOverlay: false,
    showUidOnCall: false,
    refundIfRemovedWhileCalled: false,
    refundOnNoShow: false,
    refundIfViewerLeavesCalled: false,
  });
  assert.equal(patch.headers['x-csrf-token'], csrfToken);
  assert.ok(patch.headers['idempotency-key'], 'PATCH preserves the existing idempotency boundary');
  assert.equal(queueReadsAfterPatch, 1, 'the follow-up projection read failed once after the accepted PATCH');

  console.log('PASS queue settings browser-only: accepted versioned QRA-03 PATCH, failed follow-up projection, retained accepted values, accessible localized warning, no false success or private error leakage.');
  console.log('Boundary: API reads/writes were intercepted fixtures; no live product API, database, Twitch, Docker, OBS, or CEF mutation was performed.');
}
finally {
  await context.close();
  await browser.close();
}
