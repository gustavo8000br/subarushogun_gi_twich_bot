import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { qraQueueDto } from './fixtures/qra-api-fixtures.mjs';

const appOrigin = process.env.APP_ORIGIN ?? 'https://localhost:3000';
const origin = new URL(appOrigin);
assert.equal(origin.protocol, 'https:', 'reward settings recovery test requires HTTPS');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'APP_ORIGIN must be loopback');

const csrfToken = 'csrf-token-for-reward-settings-browser-test-0001';
const initialQueue = { ...qraQueueDto, entries: [], version: 1, title: 'Arena', cost: 100 };
const acceptedQueue = {
  ...initialQueue,
  version: 2,
  title: 'Arena Plus',
  cost: 250,
  remoteSyncStatus: 'pending_update',
  operationStatus: 'pending',
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
  'panel.queue.action.edit_reward': 'Edit reward',
  'panel.queue.sync.pending': 'Twitch update pending',
  'panel.reward_settings.eyebrow': 'QUEUE CUSTOM REWARD',
  'panel.reward_settings.title': 'Edit reward',
  'panel.reward_settings.reward_name': 'Reward name',
  'panel.reward_settings.cost': 'Points cost',
  'panel.reward_settings.description': 'Description',
  'panel.reward_settings.uid_field': 'UID field',
  'panel.reward_settings.no_uid': 'Do not request UID',
  'panel.reward_settings.stream_limit': 'Per-stream limit',
  'panel.reward_settings.viewer_limit': 'Per-person limit',
  'panel.reward_settings.cooldown': 'Global cooldown',
  'panel.reward_settings.group.reward': 'Reward details',
  'panel.reward_settings.group.viewer': 'Viewer privacy',
  'panel.reward_settings.group.limits': 'Twitch limits',
  'panel.reward_settings.twitch_limits_hint': 'Twitch must confirm changes.',
  'panel.reward_settings.submit': 'Request Twitch update',
  'panel.dialog.cancel': 'Cancel',
  'panel.dialog.close': 'Close',
  'panel.queue.action_result.saving': 'Saving…',
  'panel.notice.reward_update_pending': 'Change requested. Twitch has not confirmed it yet.',
  'panel.reward.settings_refresh_failed': 'The reward update was accepted, but the queue could not refresh. Accepted settings are shown; refresh to verify its Twitch status.',
  'panel.reward.refresh_queue': 'Refresh queue',
  'panel.reward.refreshing_queue': 'Refreshing queue…',
  'panel.error.generic': 'Could not complete the action. Try again.',
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
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([acceptedQueue]) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([initialQueue]) });
    }
    if (url.pathname === `/api/queues/${initialQueue.id}/reward-settings` && method === 'PATCH') {
      postObserved = true;
      record.body = request.postDataJSON();
      return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify(acceptedQueue) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'NOT_FOUND' }) });
  });

  await page.goto(`${origin.origin}/queues/`);
  const editButton = page.getByRole('button', { name: 'Edit reward' });
  await editButton.waitFor({ timeout: 15_000 });
  await editButton.click();
  await page.getByRole('textbox', { name: 'Reward name' }).fill('Arena Plus');
  await page.getByRole('spinbutton', { name: 'Points cost' }).fill('250');
  await page.getByRole('button', { name: 'Request Twitch update' }).click();

  const warningText = 'The reward update was accepted, but the queue could not refresh. Accepted settings are shown; refresh to verify its Twitch status.';
  const warning = page.getByRole('status').filter({ hasText: warningText });
  await warning.waitFor({ timeout: 10_000 });
  assert.equal(await page.getByRole('heading', { name: 'Arena Plus' }).count(), 1, 'the accepted queue DTO replaces the stale queue projection');
  assert.equal(await page.getByText('Twitch update pending', { exact: true }).count(), 1, 'the accepted DTO keeps the remote state explicitly pending');
  assert.equal(await page.getByRole('button', { name: 'Edit reward' }).count(), 0, 'a pending reward cannot be edited and submitted again');
  assert.equal(await page.getByRole('button', { name: 'Refresh queue' }).count(), 1, 'the operator can explicitly retry the failed projection read');
  assert.doesNotMatch(await warning.innerText(), /private projection failure|confirmed|success/i);

  const patch = calls.find((call) => call.path === `/api/queues/${initialQueue.id}/reward-settings` && call.method === 'PATCH');
  assert.ok(patch, 'the mutation reached only the intercepted same-origin API');
  assert.deepEqual(patch.body, {
    expectedVersion: 1,
    title: 'Arena Plus',
    cost: 250,
    rewardPrompt: 'Enter the queue',
    uidMode: 'hidden',
    maxRedemptionsPerStream: null,
    maxRedemptionsPerUserPerStream: null,
    globalCooldownSeconds: null,
  });
  assert.equal(patch.headers['x-csrf-token'], csrfToken);
  assert.ok(patch.headers['idempotency-key']);
  assert.equal(queueReadsAfterPost, 1, 'the first reconciliation read failed after the accepted PATCH');

  await page.getByRole('button', { name: 'Refresh queue' }).click();
  await page.getByRole('status').filter({ hasText: 'Change requested. Twitch has not confirmed it yet.' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Arena Plus' }).count(), 1);
  assert.equal(await page.getByText('Twitch update pending', { exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Edit reward' }).count(), 0);
  assert.equal(queueReadsAfterPost, 2, 'explicit retry reads the existing protected projection once');
  assert.equal(calls.filter((call) => call.path === `/api/queues/${initialQueue.id}/reward-settings` && call.method === 'PATCH').length, 1);

  console.log('PASS QRA-04 reward-settings browser-only recovery: accepted DTO retained, pending Twitch status visible, duplicate editing blocked, failed projection can be retried without another mutation.');
  console.log('Boundary: all API responses were intercepted fixtures; no live API, PostgreSQL, Twitch, Docker, OBS, or CEF mutation was performed.');
}
finally {
  await context.close();
  await browser.close();
}
