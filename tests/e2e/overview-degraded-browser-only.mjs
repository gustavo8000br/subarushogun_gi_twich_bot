import assert from 'node:assert/strict';
import { boundary, catalogs, json, openPanel } from './fixtures/panel-browser-harness.mjs';

// E7 (flow-and-chat-review.md): "/" with the API failing shows the generic localized message (no private text, no stack),
// the page recovers when the API is back, and a failed in-page refresh is announced and then recovers.
// OPS-15 E7 (ux-plan-e7-reference-id): a 5xx initial-load failure also shows the server-made referenceId inside the alert card, with a
// copy button; with no id from the server the card shows only the generic message. The read-timeout case is covered in jsdom only.
let stateMode = 'fail';
const harness = await openPanel({
  handlers: {
    'GET /api/state': () => (stateMode === 'fail'
      ? json({ code: 'INTERNAL_ERROR', error: 'private server copy', stack: 'at secretFrame (/srv/app.js:1:1)' }, 500, { 'x-error-reference': 'overview-ref-9' })
      : stateMode === 'noid'
        ? json({ code: 'INTERNAL_ERROR', error: 'private server copy', stack: 'at secretFrame (/srv/app.js:1:1)' }, 500)
        : json({ ...harness.runtime })),
  },
});
const { page, catalog, origin } = harness;
// Before the API catalogs load, the first-party pt-BR fallback catalog is what the panel can show.
const fallback = catalogs['pt-BR'];
const REF = 'overview-ref-9';
const referenceSentence = fallback['panel.error.reference'].replace('{id}', REF);

try {
  await harness.goto('/');
  const alert = page.getByRole('alert').filter({ hasText: fallback['panel.error.local_load'] });
  await alert.waitFor({ timeout: 15_000 });
  const text = await page.locator('body').innerText();
  assert.doesNotMatch(text, /private server copy|secretFrame|INTERNAL_ERROR/, 'no internal detail reaches the page');
  assert.equal(await page.getByRole('button', { name: catalog['panel.overview.refresh'] }).count(), 0, 'no refresh action while the first load failed');

  // E7: the id is shown inside the same alert card (pt-BR fallback text), in <code>, with a copy button.
  assert.ok((await alert.innerText()).includes(referenceSentence), `the alert shows "${referenceSentence}"`);
  assert.equal(await alert.locator('code').innerText(), REF);
  const copyButton = alert.getByRole('button', { name: fallback['panel.error.reference_copy'] });
  await copyButton.waitFor({ state: 'visible', timeout: 5_000 });
  assert.equal(await copyButton.getAttribute('type'), 'button');
  assert.ok((await copyButton.boundingBox()).height >= 44, 'the copy button is a 44 px target');
  assert.equal(await alert.locator('[role="status"]').innerText(), '', 'copy status is empty before the click');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: origin.origin });
  await copyButton.click();
  await alert.locator('[role="status"]').filter({ hasText: fallback['panel.error.reference_copied'] }).waitFor({ timeout: 5_000 });
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), REF, 'the clipboard holds exactly the id, not the sentence');
  assert.equal(await copyButton.evaluate((node) => node === document.activeElement), true, 'focus stays on the copy button');
  assert.doesNotMatch(await page.locator('body').innerText(), /private server copy|secretFrame|INTERNAL_ERROR/, 'no internal detail after the copy either');

  stateMode = 'ok';
  await page.reload();
  await page.getByRole('button', { name: catalog['panel.overview.refresh'] }).waitFor({ timeout: 15_000 });
  assert.equal(await page.getByRole('alert').filter({ hasText: fallback['panel.error.local_load'] }).count(), 0, 'the error is gone after recovery');
  assert.equal(await page.locator('code', { hasText: REF }).count(), 0, 'no reference id remains after recovery');
  assert.equal(await page.getByRole('button', { name: fallback['panel.error.reference_copy'] }).count()
    + await page.getByRole('button', { name: catalog['panel.error.reference_copy'] }).count(), 0, 'no copy button remains after recovery (either language)');
  assert.equal(await page.locator('.reference-line').count(), 0, 'no reference line remains after recovery');

  // E7: a 500 with neither a body id nor the header shows only the generic message (nothing invented).
  stateMode = 'noid';
  await page.reload();
  const bareAlert = page.getByRole('alert').filter({ hasText: fallback['panel.error.local_load'] });
  await bareAlert.waitFor({ timeout: 15_000 });
  assert.equal(await bareAlert.locator('code').count(), 0, 'no reference line without a server id');
  assert.equal(await bareAlert.getByRole('button').count(), 0, 'no copy button without a server id');
  assert.doesNotMatch(await bareAlert.innerText(), /Referência|Reference/, 'no reference label without a server id');
  stateMode = 'ok';
  await page.reload();
  await page.getByRole('button', { name: catalog['panel.overview.refresh'] }).waitFor({ timeout: 15_000 });

  // Ready panel, API degrades: the refresh fails visibly, the next one recovers.
  stateMode = 'fail';
  await page.getByRole('button', { name: catalog['panel.overview.refresh'] }).click();
  await page.getByRole('alert').filter({ hasText: catalog['panel.overview.refresh_failed'] }).waitFor({ timeout: 15_000 });
  stateMode = 'ok';
  await page.getByRole('button', { name: catalog['panel.overview.refresh'] }).click();
  await page.getByText(catalog['panel.overview.refreshed']).waitFor({ timeout: 15_000 });
  assert.equal(await page.getByRole('alert').filter({ hasText: catalog['panel.overview.refresh_failed'] }).count(), 0);

  console.log('PASS E7 overview browser-only: API 500 shows the generic localized message plus the server referenceId with a working copy button (no private copy or stack), a 500 without an id shows no reference, reload recovers, a failed refresh is announced and the next refresh recovers.');
  boundary('E7', 'The read-timeout case (no id) is covered in jsdom only; contrast, 320 px wrapping and screen-reader reading stay with @qa (AC-E7.9).');
} finally {
  await harness.close();
}
