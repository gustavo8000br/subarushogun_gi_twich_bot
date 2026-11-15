import assert from 'node:assert/strict';
import { boundary, CSRF_TOKEN, json, openPanel } from './fixtures/panel-browser-harness.mjs';

// FT-06 (ledger #17), evidence class FX (real Chrome + the Next panel, API responses INTERCEPTED fixtures; not PG, not TW):
// the panel actions behind CMD-02 (follower re-authorization), ACC-01/ACC-02 (account labels) and WID-03/WID-06
// (widget edit and delete). It proves the exact request each action sends (method, path, body, CSRF, idempotency key)
// and how the panel renders each response branch. It never proves the API, persistence or Twitch behavior.
const IDEMPOTENCY = /^[A-Za-z0-9._:-]{8,128}$/;
const style = {
  textColor: '#FFFFFF', backgroundColor: '#000000', backgroundOpacity: 0, fontFamily: 'system-ui', fontSize: 32,
  fontWeight: 700, alignment: 'center', effect: 'none', outlineWidth: 1, shadowBlur: 0, shadowOffsetX: 0,
  shadowOffsetY: 0, width: 640, height: 100, marginTop: 8, marginRight: 8, marginBottom: 8, marginLeft: 8, overflow: 'wrap',
};
const widget = {
  id: '11111111-1111-4111-8111-111111111111', sourceType: 'fixed_text', queueId: null, fixedText: 'Existing', fallbackText: 'Offline',
  style, version: 3, capabilityVersion: 1, capabilityActive: true, deleted: false,
};
const authorizationUrl = 'https://id.twitch.tv/oauth2/authorize?client_id=fixture&state=opaque-follower-state&response_type=code';
const policy = (minimumRole, kind = 'fixed') => ({ kind, minimumRole });
const command = (key, access) => ({ key, scope: 'queue', syntax: `!${key}`, description: key, access, policy: access, configurable: access.kind === 'configurable' });
const followerCatalog = {
  schemaVersion: 3, version: 7, followerScopeReady: false,
  configurableRoles: ['everyone', 'follower', 'subscriber', 'vip', 'moderator'],
  commands: [command('queue:lista', policy('everyone', 'configurable')), command('queue:atender', policy('moderator'))],
};

const harness = await openPanel({ state: { account: { label: 'Streamer', defaultLabel: 'Streamer', source: 'default' } } });
const { page, catalog } = harness;
const results = [];

try {
  // CMD-02: choosing the follower level without the follower scope sends the version-bound authorization request,
  // then navigates ONLY to the Twitch authorize endpoint; a foreign destination or a 503 is refused and recovers.
  harness.setHandler('GET /api/command-catalog', json(followerCatalog));
  harness.setHandler('POST /api/command-policies/follower-authorization', json({ authorizationUrl }));
  await harness.goto('/commands/');
  const select = page.locator('#threshold-queue-lista');
  await select.waitFor({ timeout: 15_000 });
  await select.selectOption('follower');
  await page.getByRole('button', { name: catalog['panel.commands.save'] }).click();
  for (let attempt = 0; attempt < 50 && harness.external.length === 0; attempt += 1) await page.waitForTimeout(100);
  const authCalls = harness.callsTo('POST /api/command-policies/follower-authorization');
  assert.equal(authCalls.length, 1, 'CMD-02: one authorization request');
  assert.deepEqual(authCalls[0].body, { expectedVersion: 7, policies: { 'queue:lista': { minimumRole: 'follower' } } }, 'CMD-02: version-bound body with only the changed policy');
  assert.equal(authCalls[0].headers['x-csrf-token'], CSRF_TOKEN);
  assert.match(authCalls[0].headers['idempotency-key'], IDEMPOTENCY);
  assert.equal(harness.callsTo('PATCH /api/command-policies').length, 0, 'CMD-02: policies are not saved before the OAuth callback');
  assert.equal(harness.external.length, 1);
  const target = new URL(harness.external[0].url);
  assert.equal(`${target.origin}${target.pathname}`, 'https://id.twitch.tv/oauth2/authorize');
  assert.equal(target.searchParams.get('state'), 'opaque-follower-state');

  harness.external.length = 0;
  harness.setHandler('POST /api/command-policies/follower-authorization', json({ authorizationUrl: 'https://evil.example/oauth2/authorize?state=x' }));
  await harness.goto('/commands/');
  await page.locator('#threshold-queue-lista').selectOption('follower');
  await page.getByRole('button', { name: catalog['panel.commands.save'] }).click();
  await page.getByRole('alert').filter({ hasText: catalog['panel.error.generic'] }).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(300);
  assert.equal(harness.external.length, 0, 'CMD-02: no navigation to a foreign destination');

  harness.setHandler('POST /api/command-policies/follower-authorization', json({ error: 'private server copy' }, 503));
  await page.locator('#threshold-queue-lista').selectOption('follower');
  await page.getByRole('button', { name: catalog['panel.commands.save'] }).click();
  const unavailable = page.getByRole('alert').filter({ hasText: catalog['panel.error.generic'] });
  await unavailable.waitFor({ timeout: 15_000 });
  assert.doesNotMatch(await unavailable.textContent(), /private server copy/);
  assert.equal(harness.external.length, 0);
  results.push('CMD-02: follower authorization request body/CSRF/idempotency, navigation only to id.twitch.tv, foreign destination and 503 refused with the generic alert');

  // ACC-01 / ACC-02: both account label forms on /settings.
  const accountCalls = { current: 0, default: 0 };
  harness.setHandler('POST /api/account', (call) => {
    accountCalls.current += 1;
    if (call.body.label === 'bad') return json({ error: 'private server copy' }, 400);
    if (call.body.label === 'boom') return json({ error: 'private server copy' }, 500);
    harness.runtime.account = { ...harness.runtime.account, label: call.body.label, source: 'manual' };
    return json(harness.runtime.account);
  });
  harness.setHandler('POST /api/account/default', (call) => {
    accountCalls.default += 1;
    harness.runtime.account = { ...harness.runtime.account, defaultLabel: call.body.label };
    return json(harness.runtime.account);
  });
  await harness.goto('/settings/');
  const current = page.locator('#current-account-label');
  const defaults = page.locator('#default-account-label');
  await current.waitFor({ timeout: 15_000 });
  const submit = (field) => page.locator(`#${field}-account-label`).locator('xpath=ancestor::form').getByRole('button', { name: catalog['panel.settings.save'] });

  await current.fill('  Spiral Abyss  ');
  await submit('current').click();
  await page.getByText(catalog['panel.settings.saved']).first().waitFor({ timeout: 15_000 });
  let calls = harness.callsTo('POST /api/account');
  assert.deepEqual(calls[0].body, { label: 'Spiral Abyss' }, 'ACC-01: trimmed label only');
  assert.equal(calls[0].headers['x-csrf-token'], CSRF_TOKEN);
  assert.match(calls[0].headers['idempotency-key'], IDEMPOTENCY);
  assert.equal(await current.inputValue(), 'Spiral Abyss');

  await current.fill('bad');
  await submit('current').click();
  const invalid = page.getByRole('alert').filter({ hasText: catalog['panel.settings.invalid'] });
  await invalid.waitFor({ timeout: 15_000 });
  assert.doesNotMatch(await invalid.textContent(), /private server copy/, 'ACC-01: 400 shows the localized text only');
  assert.equal(await current.inputValue(), 'bad', 'ACC-01: the draft survives a refusal');

  await current.fill('boom');
  await submit('current').click();
  const failure = page.getByRole('alert').filter({ hasText: catalog['panel.error.generic'] });
  await failure.waitFor({ timeout: 15_000 });
  assert.doesNotMatch(await failure.textContent(), /private server copy/, 'ACC-01: 500 shows the generic text only');

  await current.fill('x'.repeat(60) + 'y');
  assert.equal((await current.inputValue()).length, 60, 'ACC-01: the input caps the label at 60 characters');
  await page.getByRole('button', { name: catalog['panel.form.cancel'] }).first().click();
  assert.equal(await current.inputValue(), 'Spiral Abyss', 'ACC-01: cancel restores the saved label');

  await defaults.fill('World Level 9');
  await submit('default').click();
  await page.waitForFunction(() => document.querySelectorAll('.account-settings-notice').length > 0 && [...document.querySelectorAll('.account-settings-notice')].some((n) => n.closest('form')?.querySelector('#default-account-label')));
  calls = harness.callsTo('POST /api/account/default');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { label: 'World Level 9' }, 'ACC-02: the default label body');
  assert.equal(calls[0].headers['x-csrf-token'], CSRF_TOKEN);
  assert.match(calls[0].headers['idempotency-key'], IDEMPOTENCY);
  assert.equal(accountCalls.current, 3, 'ACC-01: exactly the three submitted labels reached the API');
  await page.reload();
  await page.locator('#default-account-label').waitFor({ timeout: 15_000 });
  assert.equal(await page.locator('#default-account-label').inputValue(), 'World Level 9', 'ACC-02: the saved default is rendered after a reload (fixture state)');
  assert.equal(await page.locator('#current-account-label').inputValue(), 'Spiral Abyss');
  results.push('ACC-01/ACC-02: /settings forms send {label} with CSRF and idempotency key; 400 and 500 render localized text without the server copy; the draft survives; cancel and reload behave');

  // WID-03 / WID-06: edit (PATCH) and delete (DELETE) with the version binding and the conflict branch.
  let widgets = [widget];
  harness.setHandler('GET /api/overlay-widgets', () => json(widgets));
  const patchKey = `PATCH /api/overlay-widgets/${widget.id}`;
  const deleteKey = `DELETE /api/overlay-widgets/${widget.id}`;
  let patchMode = 'ok';
  harness.setHandler(patchKey, (call) => {
    if (patchMode === 'conflict') return json({ code: 'OVERLAY_WIDGET_VERSION_CONFLICT', error: 'private server copy' }, 409);
    widgets = [{ ...widget, fixedText: call.body.changes.fixedText, version: call.body.expectedVersion + 1 }];
    return json(widgets[0]);
  });
  let deleteMode = 'conflict';
  harness.setHandler(deleteKey, (call) => {
    if (deleteMode === 'conflict') return json({ code: 'OVERLAY_WIDGET_VERSION_CONFLICT', error: 'private server copy' }, 409);
    widgets = [];
    return json({ ...widget, deleted: true, capabilityActive: false, version: call.body.expectedVersion + 1 });
  });
  await harness.goto('/widgets/');
  const card = page.locator(`[data-widget-id="${widget.id}"]`);
  await card.waitFor({ timeout: 30_000 });
  await card.getByRole('button', { name: catalog['panel.widget.action.edit'] }).click();
  const fixedText = page.locator('.widget-editor-form [name="fixedText"]');
  await fixedText.fill('Updated text');
  await page.locator('.widget-editor-form').getByRole('button', { name: catalog['panel.widget.save'] }).click();
  await page.getByText(catalog['panel.widget.notice.saved']).waitFor({ timeout: 15_000 });
  const patches = harness.callsTo(patchKey);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].body.expectedVersion, 3, 'WID-03: bound to the loaded version');
  assert.equal(patches[0].body.changes.fixedText, 'Updated text');
  assert.deepEqual(Object.keys(patches[0].body).sort(), ['changes', 'expectedVersion'], 'WID-03: only expectedVersion and changes');
  assert.equal(patches[0].headers['x-csrf-token'], CSRF_TOKEN);
  assert.match(patches[0].headers['idempotency-key'], IDEMPOTENCY);

  patchMode = 'conflict';
  await card.getByRole('button', { name: catalog['panel.widget.action.edit'] }).click();
  await fixedText.fill('Stale edit');
  await page.locator('.widget-editor-form').getByRole('button', { name: catalog['panel.widget.save'] }).click();
  const conflict = page.getByRole('alert').filter({ hasText: catalog['panel.widget.notice.conflict'] });
  await conflict.first().waitFor({ timeout: 15_000 });
  assert.doesNotMatch(await page.locator('body').innerText(), /private server copy/, 'WID-03: 409 shows the localized conflict only');
  assert.equal(await fixedText.inputValue(), 'Stale edit', 'WID-03: the draft is kept on conflict');
  await page.getByRole('button', { name: catalog['panel.widget.cancel'] }).click();
  const discard = page.getByRole('alertdialog');
  if (await discard.count()) await discard.getByRole('button').last().click();

  // WID-06: a stale delete shows the conflict and keeps the card; the retry succeeds and removes it.
  await page.locator(`[data-widget-id="${widget.id}"]`).getByRole('button', { name: catalog['panel.widget.action.delete'] }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: catalog['panel.dialog.confirm'] }).click();
  await page.getByRole('alert').filter({ hasText: catalog['panel.widget.notice.conflict'] }).first().waitFor({ timeout: 15_000 });
  assert.equal(await page.locator(`[data-widget-id="${widget.id}"]`).count(), 1, 'WID-06: a refused delete keeps the card');
  deleteMode = 'ok';
  await page.locator(`[data-widget-id="${widget.id}"]`).getByRole('button', { name: catalog['panel.widget.action.delete'] }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: catalog['panel.dialog.confirm'] }).click();
  await page.getByText(catalog['panel.widget.notice.deleted']).waitFor({ timeout: 15_000 });
  const deletes = harness.callsTo(deleteKey);
  assert.equal(deletes.length, 2);
  assert.deepEqual(deletes[1].body, { expectedVersion: 4 }, 'WID-06: only expectedVersion, bound to the version loaded after the edit');
  assert.equal(deletes[1].headers['x-csrf-token'], CSRF_TOKEN);
  assert.match(deletes[1].headers['idempotency-key'], IDEMPOTENCY);
  assert.equal(await page.locator(`[data-widget-id="${widget.id}"]`).count(), 0, 'WID-06: the card is gone after a confirmed delete');
  results.push('WID-03/WID-06: PATCH {expectedVersion, changes} and DELETE {expectedVersion} with CSRF and idempotency key; 409 keeps the draft/card with the localized conflict; confirmed delete removes the card');

  for (const line of results) console.log(`PASS ${line}`);
  boundary('FT-06 route parity', 'Class FX: the API answers above are fixtures. PostgreSQL, Fastify, Twitch and OBS behavior behind CMD-02, ACC-01/02 and WID-03/06 are proved elsewhere (unit/integration) or not at all.');
} finally {
  await harness.close();
}
