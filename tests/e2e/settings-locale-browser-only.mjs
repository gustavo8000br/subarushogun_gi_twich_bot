import assert from 'node:assert/strict';
import { boundary, catalogs, CSRF_TOKEN, json, openPanel } from './fixtures/panel-browser-harness.mjs';

// E3 (flow-and-chat-review.md), Layer B variant: the language picker on /settings changes panel copy, sends the
// revision-checked PATCH, survives a reload ONLY because the intercepted fake keeps the state; a 409 shows the localized conflict.
// Real persistence, the chat catalog projection and the overlay copy are NOT proved here (that is Layer C).
const en = catalogs.en;
const pt = catalogs['pt-BR'];
const harness = await openPanel({ state: { product_locale: { locale: 'en', revision: 1 } } });
const { page } = harness;
let mode = 'ok';
harness.setHandler('PATCH /api/localization/locale', (call) => {
  if (mode === 'conflict') return json({ code: 'PRODUCT_LOCALE_VERSION_CONFLICT', error: 'private server copy' }, 409);
  harness.runtime.product_locale = { locale: call.body.locale, revision: call.body.expectedRevision + 1 };
  return json(harness.runtime.product_locale);
});

try {
  await harness.goto('/settings/');
  const heading = page.locator('main h1');
  await page.getByRole('heading', { name: en['panel.settings.title'] }).waitFor({ timeout: 15_000 });
  const picker = page.getByLabel(en['panel.locale.label']);
  assert.equal(await picker.inputValue(), 'en');

  await picker.selectOption('pt-BR');
  await page.getByRole('heading', { name: pt['panel.settings.title'] }).waitFor({ timeout: 15_000 });
  assert.equal(await heading.textContent(), pt['panel.settings.title']);
  const patches = harness.callsTo('PATCH /api/localization/locale');
  assert.equal(patches.length, 1);
  assert.deepEqual(patches[0].body, { locale: 'pt-BR', expectedRevision: 1 }, 'the revision-checked body is sent');
  assert.equal(patches[0].headers['x-csrf-token'], CSRF_TOKEN);

  await page.reload();
  await page.getByRole('heading', { name: pt['panel.settings.title'] }).waitFor({ timeout: 15_000 });
  assert.equal(await page.getByLabel(pt['panel.locale.label']).inputValue(), 'pt-BR', 'the chosen locale is rendered again after a reload (fake state)');
  assert.equal(await page.locator('nav').first().textContent().then((text) => text.includes(pt['panel.navigation.queues'])), true, 'navigation copy is localized too');

  mode = 'conflict';
  await page.getByLabel(pt['panel.locale.label']).selectOption('en');
  const conflict = page.getByRole('alert').filter({ hasText: pt['panel.error.locale_conflict'] });
  await conflict.waitFor({ timeout: 15_000 });
  assert.doesNotMatch(await conflict.textContent(), /private server copy/);
  assert.equal(await page.locator('main h1').textContent(), pt['panel.settings.title'], 'a refused change keeps the previous language');

  console.log('PASS E3 settings locale browser-only: switch en -> pt-BR re-renders panel copy, PATCH carries expectedRevision and CSRF, reload keeps the (faked) choice, 409 shows the localized conflict and keeps the language.');
  boundary('E3', 'Persistence across a real API restart, the chat catalog projection and overlay copy remain unproved (Layer C).');
} finally {
  await harness.close();
}
