import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const appOrigin = process.env.APP_ORIGIN ?? 'https://localhost:3000';
const origin = new URL(appOrigin);
assert.equal(origin.protocol, 'https:', 'queue creation recovery test requires HTTPS');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'APP_ORIGIN must be loopback');

const csrfToken = 'csrf-token-for-create-browser-test-0001';
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
  'panel.form.mode_manual': 'Local, with free manual entries',
  'panel.form.mode_manual_hint': 'The queue stays local. The streamer adds viewers from the queue page.',
  'panel.form.twitch_setup_required': 'Twitch is not connected. The manual queue works locally; connect Twitch to create a Channel Points reward.',
  'panel.form.twitch_setup_link': 'Set up Twitch connection',
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
  'panel.queue.creation_result.uncertain': 'The result could not be confirmed. Do not submit again yet; open queues and reload to check whether it was created.',
  'panel.queue.creation_result.open_queues': 'Open queues',
  'panel.queue.creation_result.open_queues': 'Open queues',
  'panel.error.reference': 'Reference: {id}',
  'panel.error.invalid_queue_settings': 'Check the queue settings.',
  'panel.error.generic': 'Could not complete the action. Try again.',
};

const calls = [];
let queueReadsAfterPost = 0;
let postCount = 0;
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
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ connected: false }) });
    }
    if (url.pathname === '/health') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'ok', dependencies: { database: 'connected', twitch_api: 'disconnected', twitch_chat: 'disconnected' },
      }) });
    }
    if (url.pathname === '/api/queues' && method === 'GET') {
      if (postCount > 0) {
        queueReadsAfterPost += 1;
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (url.pathname === '/api/queues' && method === 'POST') {
      postCount += 1;
      record.body = request.postDataJSON();
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        headers: { 'x-error-reference': 'queue-create-42' },
        body: JSON.stringify({ code: 'INTERNAL_ERROR', error: 'private create failure' }),
      });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'NOT_FOUND' }) });
  });

  await page.goto(`${origin.origin}/new-queue/`);
  const createButton = page.getByRole('button', { name: 'Create queue' });
  await createButton.waitFor({ timeout: 15_000 });
  assert.equal(await page.getByLabel('Queue type').inputValue(), 'manual_only', 'disconnected first-use defaults to the local/manual mode');
  await page.getByRole('note').getByRole('link', { name: 'Set up Twitch connection' }).waitFor();
  assert.equal(await page.locator('.queue-create-reward-fields').isVisible(), false, 'Twitch reward fields are hidden in manual mode');

  await page.getByRole('textbox', { name: 'Queue name' }).fill('Arena Queue');
  await page.locator('input[name="slug"]').fill('arena');
  await createButton.click();

  const uncertainText = 'The result could not be confirmed. Do not submit again yet; open queues and reload to check whether it was created.';
  const feedback = page.getByRole('status').filter({ hasText: uncertainText });
  await feedback.waitFor({ timeout: 10_000 });
  assert.equal(await feedback.getByText('Reference: queue-create-42').count(), 1);
  assert.doesNotMatch(await feedback.innerText(), /private create failure|Queue created successfully|Queue saved\.|Product text unavailable\./);
  assert.equal(await page.getByRole('textbox', { name: 'Queue name' }).inputValue(), 'Arena Queue', 'uncertain result preserves the operator draft');
  assert.equal(await page.locator('input[name="slug"]').inputValue(), 'arena');
  assert.equal(await createButton.isDisabled(), true, 'uncertain result blocks duplicate creation');
  assert.equal(postCount, 1, 'only one create request is sent');
  assert.equal(queueReadsAfterPost, 1, 'the existing queue list is checked once to reconcile the uncertain result');

  const post = calls.find((call) => call.path === '/api/queues' && call.method === 'POST');
  assert.ok(post, 'creation went only to the intercepted same-origin API');
  assert.deepEqual(post.body, {
    title: 'Arena Queue', slug: 'arena', aliases: [], queueMode: 'manual_only', callTimeoutMin: 10,
    uidMode: 'hidden', callMessage: '{user}, it’s your turn! Use “!arena present” to confirm your presence.',
  });
  assert.equal(post.headers['x-csrf-token'], csrfToken);
  assert.ok(post.headers['idempotency-key'], 'create keeps CSRF and idempotency protections');

  console.log('PASS queue creation browser-only: disconnected manual-first form, exact QRA-02 DTO, ambiguous 503 reconciliation, preserved draft, safe reference, and duplicate-submit lockout.');
  console.log('Boundary: all API responses were intercepted fixtures; no live API, database, Twitch, Docker, OBS, or CEF mutation was performed.');
}
finally {
  await context.close();
  await browser.close();
}
