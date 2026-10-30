import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const appOrigin = process.env.APP_ORIGIN ?? 'https://localhost:3000';
const origin = new URL(appOrigin);
assert.equal(origin.protocol, 'https:', 'queue creation acceptance test requires HTTPS');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'APP_ORIGIN must be loopback');

const csrfToken = 'csrf-token-for-accepted-create-browser-test-0001';
const catalog = {
  'panel.new_queue.eyebrow': 'Set up your stream',
  'panel.new_queue.title': 'New queue',
  'panel.new_queue.description': 'Choose how viewers join.',
  'panel.form.section_identity': 'Queue identity',
  'panel.form.queue_name': 'Queue name',
  'panel.form.queue_name_placeholder': 'e.g. Spiral Abyss',
  'panel.form.command': 'Command',
  'panel.form.command_placeholder': 'abyss',
  'panel.form.command_hint': 'The chat command uses this name after !.',
  'panel.form.aliases': 'Aliases',
  'panel.form.aliases_placeholder': 'abyss, spiral',
  'panel.form.aliases_hint': 'Optional alternate command names.',
  'panel.form.section_entry': 'How viewers join',
  'panel.form.queue_mode': 'Queue type',
  'panel.form.mode_channel_points': 'Channel Points with a bot-owned reward',
  'panel.form.mode_channel_points_hint': 'Create a Twitch reward that viewers can redeem to join.',
  'panel.form.mode_manual': 'Local, with free manual entries',
  'panel.form.mode_manual_hint': 'The queue stays local. The streamer adds viewers from the queue page.',
  'panel.form.section_handling': 'Privacy and attendance',
  'panel.form.uid_mode': 'UID mode',
  'panel.form.uid_hidden': 'Hidden',
  'panel.form.uid_visible': 'Visible',
  'panel.form.call_timeout': 'Call timeout (min)',
  'panel.form.section_call_message': 'Viewer call message',
  'panel.form.call_message': 'Message sent in Twitch chat when a viewer is called',
  'panel.queue_settings.call_message_default': '{user}, it’s your turn! Use {command} to confirm your presence.',
  'panel.command.syntax.queue_presente': '!<queue> present',
  'panel.queue_settings.call_placeholders': 'Accepted fields: {user}, {queue}, {position}, {uid}, {account}.',
  'panel.form.call_preview_user': 'Alex',
  'panel.form.call_preview_queue': 'Cozy queue',
  'panel.form.call_preview_account': 'Streamer',
  'panel.form.call_preview_label': 'Preview (example only)',
  'panel.form.call_preview_uid_note': 'UID is sent only when separately allowed.',
  'panel.form.section_reward': 'Channel Points reward',
  'panel.form.cost': 'Cost (points)',
  'panel.form.reward_description': 'Reward description',
  'panel.form.reward_prompt_placeholder': 'Redeem to join the queue',
  'panel.form.twitch_limits_hint': 'Twitch applies these limits.',
  'panel.form.max_per_stream': 'Maximum per stream',
  'panel.form.max_per_viewer': 'Maximum per viewer',
  'panel.form.cooldown': 'Global cooldown (seconds)',
  'panel.form.no_limit': 'No limit',
  'panel.form.no_cooldown': 'No cooldown',
  'panel.form.create_queue': 'Create queue',
  'panel.form.cancel': 'Cancel',
  'panel.queue.action_result.saving': 'Saving…',
  'panel.queue.creation_result.pending': 'Queue saved. Twitch reward creation is awaiting confirmation; check its status before retrying.',
  'panel.queue.creation_result.open_queues': 'Open queues',
  'panel.error.invalid_queue_settings': 'Check the queue settings.',
  'panel.error.generic': 'Could not complete the action. Try again.',
};

const calls = [];
const payload = {
  title: 'Arena Queue',
  slug: 'arena-queue',
  aliases: ['arena-alt'],
  queueMode: 'channel_points',
  callTimeoutMin: 10,
  uidMode: 'hidden',
  callMessage: '{user}, it’s your turn! Use “!arena-queue present” to confirm your presence.',
  cost: 350,
  rewardPrompt: 'Redeem to join Arena Queue.',
};
const acceptedQueue = {
  id: 'browser-qra02-channel-points-queue-0001',
  slug: payload.slug,
  aliases: payload.aliases,
  title: payload.title,
  rewardPrompt: payload.rewardPrompt,
  cost: payload.cost,
  uidMode: payload.uidMode,
  queueMode: 'channel_points',
  rewardOrigin: 'bot_created',
  modeTransitionStatus: 'none',
  rewardId: null,
  maxRedemptionsPerStream: null,
  maxRedemptionsPerUserPerStream: null,
  globalCooldownSeconds: null,
  callMessage: payload.callMessage,
  callTimeoutMin: payload.callTimeoutMin,
  showUidInList: false,
  showUidInOverlay: false,
  showUidOnCall: false,
  autoSwitchAccount: false,
  refundIfRemovedWhileCalled: false,
  refundOnNoShow: false,
  refundIfViewerLeavesCalled: false,
  isOpen: false,
  isArchived: false,
  lifecycleStatus: 'active',
  version: 1,
  remoteSyncStatus: 'pending_create',
  entries: [],
};
let postCount = 0;
let postBody;
let postHeaders;
let postAccepted = false;
let queueReadsAtPost = 0;

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
    calls.push({ path: url.pathname, method, headers });
    if (url.pathname === '/api/session') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ csrfToken }) });
    }
    if (url.pathname === '/api/localization/catalogs') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        locales: ['en'], modules: { panel: { catalogs: { en: catalog } } },
      }) });
    }
    if (url.pathname === '/api/state') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        product_version: '0.2.0-beta', account: { label: 'Streamer' }, pending_operations: [],
        product_locale: { locale: 'en', revision: 1 },
      }) });
    }
    if (url.pathname === '/api/setup') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ connected: true }) });
    }
    if (url.pathname === '/health') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'ok', dependencies: { database: 'connected', twitch_api: 'connected', twitch_chat: 'connected' },
      }) });
    }
    if (url.pathname === '/api/queues' && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(postAccepted ? [acceptedQueue] : []) });
    }
    if (url.pathname === '/api/queues' && method === 'POST') {
      postCount += 1;
      queueReadsAtPost = calls.filter(({ path, method: recordedMethod }) => path === '/api/queues' && recordedMethod === 'GET').length;
      postBody = request.postDataJSON();
      postHeaders = headers;
      postAccepted = true;
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(acceptedQueue) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'NOT_FOUND' }) });
  });

  await page.goto(`${origin.origin}/new-queue/`);
  const createButton = page.getByRole('button', { name: 'Create queue' });
  await createButton.waitFor({ timeout: 15_000 });
  assert.equal(await page.getByLabel('Queue type').inputValue(), 'channel_points', 'connected setup defaults to the Channel Points queue flow');
  await page.getByRole('textbox', { name: 'Queue name' }).fill(payload.title);
  await page.getByRole('textbox', { name: 'Aliases' }).fill(payload.aliases.join(', '));
  await page.getByRole('spinbutton', { name: 'Cost (points)' }).fill(String(payload.cost));
  await page.getByRole('textbox', { name: 'Reward description' }).fill(payload.rewardPrompt);
  await createButton.click();

  const pendingText = 'Queue saved. Twitch reward creation is awaiting confirmation; check its status before retrying.';
  const feedback = page.getByRole('status').filter({ hasText: pendingText });
  await feedback.waitFor({ timeout: 10_000 });
  assert.equal(await feedback.getByRole('link', { name: 'Open queues' }).count(), 1);
  assert.doesNotMatch(await feedback.innerText(), /Reward created successfully|Twitch confirmed|Product text unavailable\./);
  assert.equal(postCount, 1, 'accepted creation sends one POST');
  assert.deepEqual(postBody, payload, 'the form sends the exact normalized Channel Points DTO');
  assert.equal(postHeaders['x-csrf-token'], csrfToken);
  assert.ok(postHeaders['idempotency-key'], 'creation carries an idempotency key');
  assert.ok(queueReadsAtPost >= 1, 'the operator queue projection was loaded before creation');
  assert.ok(calls.filter(({ path, method }) => path === '/api/queues' && method === 'GET').length > queueReadsAtPost, 'the accepted mutation is followed by at least one projection refresh');
  assert.equal(calls.filter(({ path, method }) => path === '/api/queues' && method === 'POST').length, 1);

  console.log('PASS QRA-02 accepted Channel Points creation browser-only: exact request, pending reward status, accessible next step, and one list refresh.');
  console.log('Boundary: all API responses were intercepted fixtures; no live API, database, Twitch, Docker, OBS, or CEF mutation was performed.');
}
finally {
  await context.close();
  await browser.close();
}
