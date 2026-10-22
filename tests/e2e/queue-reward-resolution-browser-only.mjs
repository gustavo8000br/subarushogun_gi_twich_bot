import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { qraQueueDto } from './fixtures/qra-api-fixtures.mjs';

const appOrigin = process.env.APP_ORIGIN ?? 'https://localhost:3000';
const origin = new URL(appOrigin);
assert.equal(origin.protocol, 'https:', 'reward resolution test requires HTTPS');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'APP_ORIGIN must be loopback');

const csrfToken = 'csrf-token-for-reward-resolution-browser-test-0001';
const unknownQueue = { ...qraQueueDto, entries: [], rewardId: null, remoteSyncStatus: 'create_unknown', isOpen: false, version: 3 };
const linkedQueue = { ...unknownQueue, rewardId: 'reward-candidate-fixture', remoteSyncStatus: 'synced', version: 4 };
const candidate = { id: 'reward-candidate-fixture', title: 'Arena', cost: 100, prompt: 'Enter the queue' };

// The shipped English panel catalog is the source of truth for the copy asserted below.
const catalog = Object.fromEntries(readFileSync(new URL('../../apps/web/localization/catalogs/panel/en.tsv', import.meta.url), 'utf8')
  .split('\n').filter((line) => line.includes('\t')).map((line) => {
    const index = line.indexOf('\t');
    return [line.slice(0, index), line.slice(index + 1)];
  }));

const calls = [];
let candidateReads = 0;
let resolved = false;
const browser = await chromium.launch({
  channel: process.env.CHROME_CHANNEL ?? 'chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' });
const page = await context.newPage();
const json = (route, status, body, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });

try {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin.origin) return route.abort();
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/health') return route.continue();
    const method = request.method();
    const record = { path: url.pathname, method, headers: await request.allHeaders() };
    calls.push(record);

    if (url.pathname === '/api/session') return json(route, 200, { csrfToken });
    if (url.pathname === '/api/localization/catalogs') return json(route, 200, { locales: ['en'], modules: { panel: { catalogs: { en: catalog } } } });
    if (url.pathname === '/api/state') return json(route, 200, { product_version: '0.2.0-beta', account: { label: 'Streamer' }, pending_operations: [], product_locale: { locale: 'en', revision: 1 } });
    if (url.pathname === '/api/setup') return json(route, 200, {});
    if (url.pathname === '/health') return json(route, 200, { status: 'ok', dependencies: { database: 'connected', twitch_api: 'connected', twitch_chat: 'connected' } });
    if (url.pathname === '/api/queues' && method === 'GET') return json(route, 200, [resolved ? linkedQueue : unknownQueue]);
    if (url.pathname === `/api/queues/${unknownQueue.id}/reward-candidates` && method === 'GET') {
      candidateReads += 1;
      if (candidateReads === 1) {
        return json(route, 503, { error: 'private twitch lookup failure', referenceId: 'REF-LOOKUP-0001' }, { 'x-error-reference': 'REF-LOOKUP-0001' });
      }
      if (candidateReads === 2) {
        return json(route, 200, { candidates: [], diagnostics: { managedRewardCount: 3, mismatchCounts: { title_mismatch: 1, cost_mismatch: 2, not_allowed_reason: 9 } } });
      }
      return json(route, 200, { candidates: [candidate], diagnostics: { managedRewardCount: 3, mismatchCounts: { title_mismatch: 2 } } });
    }
    if (url.pathname === `/api/queues/${unknownQueue.id}/resolve-reward` && method === 'POST') {
      record.body = request.postDataJSON();
      resolved = true;
      return json(route, 200, { status: 'resolved', queue: linkedQueue, remoteConfirmed: false });
    }
    return json(route, 404, { code: 'NOT_FOUND' });
  });

  await page.goto(`${origin.origin}/queues/`);
  const dialog = page.getByRole('dialog');

  // QRA-08 failure: the Twitch lookup fails; only a localized message and a safe reference are shown.
  await page.getByRole('button', { name: 'Link reward', exact: true }).click();
  const lookupAlert = dialog.getByRole('alert');
  await lookupAlert.waitFor({ timeout: 10_000 });
  const alertText = await lookupAlert.innerText();
  assert.match(alertText, /Could not read Twitch rewards/);
  assert.match(alertText, /REF-LOOKUP-0001/);
  assert.doesNotMatch(alertText, /private twitch lookup failure/);
  assert.equal(await dialog.getByRole('button', { name: 'Link selected reward' }).isDisabled(), true, 'no reward can be linked after a failed lookup');

  // QRA-08 empty result: counts and only allow-listed mismatch reasons are explained.
  await dialog.getByRole('button', { name: 'Refresh Twitch list' }).click();
  const empty = dialog.getByRole('status').filter({ hasText: 'No reward matches this queue' });
  await empty.waitFor();
  const emptyText = await empty.innerText();
  assert.match(emptyText, /0 compatible out of 3 manageable rewards checked\./);
  assert.match(emptyText, /Different title \(1\)/);
  assert.match(emptyText, /Different points cost \(2\)/);
  assert.doesNotMatch(emptyText, /not_allowed_reason/);
  assert.equal(await dialog.getByRole('button', { name: 'Link selected reward' }).isDisabled(), true);

  // QRA-08 success then QRA-09: select the compatible reward and link it without claiming remote confirmation.
  await dialog.getByRole('button', { name: 'Refresh Twitch list' }).click();
  await dialog.getByRole('combobox', { name: 'Matching rewards' }).waitFor();
  assert.match(await dialog.getByRole('status').filter({ hasText: 'Lookup complete' }).innerText(), /1 compatible out of 3 manageable rewards checked\./);
  assert.equal(await dialog.getByRole('combobox', { name: 'Matching rewards' }).inputValue(), candidate.id);
  const resolvePromise = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/queues/${unknownQueue.id}/resolve-reward`
    && response.request().method() === 'POST').then(async (response) => ({ status: response.status(), body: await response.json() }));
  await dialog.getByRole('button', { name: 'Link selected reward' }).click();
  const resolution = await resolvePromise;
  assert.equal(resolution.status, 200);
  assert.equal(resolution.body.remoteConfirmed, false);

  await page.getByRole('status').filter({ hasText: 'Reward linked and association recorded.' }).waitFor();
  assert.equal(await dialog.count() > 0 && await dialog.isVisible().catch(() => false), false, 'the dialog closes after the link is recorded');
  assert.equal(await page.getByRole('button', { name: 'Link reward', exact: true }).count(), 0, 'a synced queue no longer offers reward recovery');
  assert.doesNotMatch(await page.getByRole('status').filter({ hasText: 'Reward linked' }).innerText(), /confirmed by Twitch|created on Twitch/i);

  const resolveCall = calls.find((call) => call.path === `/api/queues/${unknownQueue.id}/resolve-reward` && call.method === 'POST');
  assert.deepEqual(resolveCall.body, { rewardId: candidate.id });
  assert.equal(resolveCall.headers['x-csrf-token'], csrfToken);
  assert.ok(resolveCall.headers['idempotency-key']);
  assert.equal(calls.filter((call) => call.path.endsWith('/resolve-reward')).length, 1, 'exactly one association request was sent');
  assert.equal(candidateReads, 3, 'each lookup was a user-initiated read-only GET');

  console.log('PASS QRA-08/09 reward recovery browser-only: failed lookup shows a localized alert with a safe reference, empty lookup explains allow-listed mismatches, and linking sends one exact request without claiming Twitch confirmation.');
  console.log('Boundary: all API responses were intercepted fixtures; no live API, PostgreSQL, Twitch, Docker, OBS, or CEF mutation was performed.');
}
finally {
  await context.close();
  await browser.close();
}
