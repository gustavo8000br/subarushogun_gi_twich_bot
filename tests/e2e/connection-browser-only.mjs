import assert from 'node:assert/strict';
import { assertNoSecrets, boundary, CSRF_TOKEN, json, openPanel } from './fixtures/panel-browser-harness.mjs';

// E1 (flow-and-chat-review.md): /connection OAuth start, localized ?oauth=error recovery, rejected foreign destination,
// credential save that never echoes the secret. The panel has no disconnect control, so none is asserted.
const SECRET = 'client-secret-fixture-9f3a7c1d';
const STATE_TOKEN = 'opaque-oauth-state-4d2b';
const authorizationUrl = `https://id.twitch.tv/oauth2/authorize?client_id=client-id-fixture&state=${STATE_TOKEN}&response_type=code`;
const harness = await openPanel({ setup: { connected: false, secretConfigured: true, clientId: 'client-id-fixture', callbackUrl: 'https://localhost:3000/api/setup/callback' } });
const { page, catalog } = harness;

try {
  // 1) Starting OAuth: POST /api/setup/connect with CSRF, then navigation to the Twitch authorize endpoint only.
  harness.setHandler('POST /api/setup/connect', json({ authorizationUrl }));
  await harness.goto('/connection/');
  const connect = page.getByRole('button', { name: catalog['panel.connection.connect'] });
  await connect.waitFor({ timeout: 15_000 });
  await connect.click();
  await page.waitForFunction(() => true);
  for (let attempt = 0; attempt < 50 && harness.external.length === 0; attempt += 1) await page.waitForTimeout(100);
  const connectCalls = harness.callsTo('POST /api/setup/connect');
  assert.equal(connectCalls.length, 1, 'one OAuth start request');
  assert.equal(connectCalls[0].headers['x-csrf-token'], CSRF_TOKEN, 'OAuth start carries the CSRF token');
  assert.equal(harness.external.length, 1, 'exactly one navigation left the panel origin');
  const target = new URL(harness.external[0].url);
  assert.equal(`${target.origin}${target.pathname}`, 'https://id.twitch.tv/oauth2/authorize', 'redirect target is the Twitch authorize endpoint');
  assert.equal(target.searchParams.get('state'), STATE_TOKEN);

  // 2) A foreign authorization destination is refused with the generic alert and never navigated to.
  await harness.goto('/connection/');
  harness.external.length = 0;
  harness.setHandler('POST /api/setup/connect', json({ authorizationUrl: 'https://evil.example/oauth2/authorize?state=x' }));
  await page.getByRole('button', { name: catalog['panel.connection.connect'] }).click();
  const refusal = page.getByRole('alert').filter({ hasText: catalog['panel.error.generic'] });
  await refusal.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(300);
  assert.equal(harness.external.length, 0, 'no navigation to a foreign destination');
  assert.ok(page.url().startsWith(harness.origin.origin), 'page stays on the panel origin');
  assert.equal(await page.getByRole('button', { name: catalog['panel.connection.connect'] }).isEnabled(), true, 'the connect action recovers for another attempt');

  // 3) ?oauth=error: localized recovery message, no token in the URL, cleaned URL, gone after reload.
  await harness.goto('/connection/?oauth=error&code=leak-code-123');
  const oauthAlert = page.getByRole('alert').filter({ hasText: catalog['panel.connection.oauth_error'] });
  await oauthAlert.waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => location.search === '');
  assert.equal(new URL(page.url()).pathname, '/connection/');
  await assertNoSecrets(page, ['leak-code-123'], 'oauth=error arrival');
  await page.reload();
  await page.getByRole('heading', { name: catalog['panel.connection.title'] }).waitFor({ timeout: 15_000 });
  assert.equal(await page.getByText(catalog['panel.connection.oauth_error']).count(), 0, 'a reload never replays the error');

  // 4) Credentials: the secret travels once in the POST body and is never left in the DOM, inputs or URL; 400 is localized.
  harness.setHandler('POST /api/setup/application', json({ clientId: 'client-id-fixture' }));
  await harness.goto('/connection/');
  await page.getByLabel(catalog['panel.credentials.client_secret']).fill(SECRET);
  await page.getByRole('button', { name: catalog['panel.credentials.validate_save'] }).click();
  await page.getByText(catalog['panel.credentials.saved']).waitFor({ timeout: 15_000 });
  const saves = harness.callsTo('POST /api/setup/application');
  assert.equal(saves.length, 1);
  assert.equal(saves[0].body.clientSecret, SECRET, 'the secret is sent to the API');
  assert.equal(saves[0].headers['x-csrf-token'], CSRF_TOKEN);
  await assertNoSecrets(page, [SECRET], 'after credential save');

  harness.setHandler('POST /api/setup/application', json({ code: 'INVALID_CREDENTIALS', error: 'private server copy' }, 400));
  await page.getByLabel(catalog['panel.credentials.client_secret']).fill(SECRET);
  await page.getByRole('button', { name: catalog['panel.credentials.validate_save'] }).click();
  const credentialAlert = page.getByRole('alert').filter({ hasText: catalog['panel.error.twitch_credentials'] });
  await credentialAlert.waitFor({ timeout: 15_000 });
  assert.doesNotMatch(await credentialAlert.textContent(), /private server copy/);

  console.log('PASS E1 connection browser-only: OAuth start asserts the id.twitch.tv authorize target with CSRF, a foreign destination is refused, ?oauth=error is localized and not replayed, the client secret never stays in DOM/URL, 400 is localized.');
  boundary('E1', 'The Twitch consent screen and the callback were not exercised; no real account exists.');
} finally {
  await harness.close();
}
