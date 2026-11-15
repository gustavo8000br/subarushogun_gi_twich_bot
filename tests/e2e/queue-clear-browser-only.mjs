import assert from 'node:assert/strict';
import { boundary, CSRF_TOKEN, json, openPanel } from './fixtures/panel-browser-harness.mjs';
import { qraQueueDto } from './fixtures/qra-api-fixtures.mjs';

// E6 (flow-and-chat-review.md): /queues clear as a dedicated browser scenario: preview -> confirm -> feedback, the cancel
// path (nothing destructive is sent), preview failure, and an uncertain confirm that is never reported as success.
let queue = { ...qraQueueDto };
let previewMode = 'ok';
let confirmMode = 'ok';
const harness = await openPanel({
  handlers: {
    'GET /api/queues': () => json([queue]),
    'POST /api/queues/queue-qra-fixture/clear-preview': () => (previewMode === 'ok'
      ? json({ status: 'confirmation_required', count: 1, refundsRequested: 0, expiresInSeconds: 15 })
      : json({ code: 'INTERNAL_ERROR', error: 'private server copy' }, 503, { 'x-error-reference': 'clear-prev-5' })),
    'POST /api/queues/queue-qra-fixture/clear-confirm': () => {
      if (confirmMode === 'uncertain') return json({ code: 'INTERNAL_ERROR', error: 'private server copy' }, 503, { 'x-error-reference': 'clear-conf-6' });
      queue = { ...queue, entries: [] };
      return json({ status: 'cleared', count: 1, refundsRequested: 0 });
    },
  },
});
const { page, catalog } = harness;
const fill = (template, values) => Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);
const clearButton = () => page.getByRole('button', { name: catalog['panel.queue.action.clear'], exact: true });
const dialog = () => page.locator('dialog[open]');

try {
  await harness.goto('/queues/');
  await clearButton().waitFor({ timeout: 15_000 });

  // Cancel path: the preview is requested, the dialog states the consequence, Cancel sends nothing destructive.
  await clearButton().click();
  await dialog().waitFor();
  assert.equal(await dialog().locator('p[id^="clear-copy-"]').textContent(), fill(catalog['panel.queue.clear.confirm'], { title: 'Arena', count: 1, refunds: 0 }));
  const preview = harness.callsTo('POST /api/queues/queue-qra-fixture/clear-preview');
  assert.equal(preview.length, 1);
  assert.equal(preview[0].headers['x-csrf-token'], CSRF_TOKEN);
  assert.deepEqual(preview[0].body, {}, 'the clear preview sends an empty body (no version, no queue data)');
  await dialog().getByRole('button', { name: catalog['panel.dialog.cancel'] }).click();
  await page.waitForFunction(() => document.querySelectorAll('dialog[open]').length === 0);
  assert.equal(harness.callsTo('POST /api/queues/queue-qra-fixture/clear-confirm').length, 0, 'cancel never sends the confirmation');

  // Preview unavailable: generic failure with the safe reference, no dialog, no confirm.
  previewMode = 'error';
  await clearButton().click();
  const failed = page.getByRole('alert').filter({ hasText: catalog['panel.queue.clear.failed'] });
  await failed.first().waitFor({ timeout: 15_000 });
  assert.match(await failed.first().textContent(), /clear-prev-5/);
  assert.doesNotMatch(await page.locator('body').innerText(), /private server copy/);
  assert.equal(await dialog().count(), 0);

  // Uncertain confirm: "may have been applied", never the success text.
  previewMode = 'ok';
  confirmMode = 'uncertain';
  await clearButton().click();
  await dialog().waitFor();
  await dialog().getByRole('button', { name: catalog['panel.dialog.confirm'], exact: true }).click();
  const uncertain = page.getByRole('alert').filter({ hasText: catalog['panel.queue.clear.uncertain'] });
  await uncertain.first().waitFor({ timeout: 15_000 });
  assert.equal(await page.getByText(fill(catalog['panel.queue.clear.done'], { count: 1, refunds: 0 })).count(), 0, 'no success text after an uncertain result');
  assert.equal(await page.getByText(/clear-conf-6/).count() > 0, true, 'safe reference shown');

  // Recovery: the operator refreshes the queue, then a real confirm succeeds and reports the counts.
  await page.reload();
  await clearButton().waitFor({ timeout: 15_000 });
  confirmMode = 'ok';
  await clearButton().click();
  await dialog().waitFor();
  await dialog().getByRole('button', { name: catalog['panel.dialog.confirm'], exact: true }).click();
  await page.getByText(fill(catalog['panel.queue.clear.done'], { count: 1, refunds: 0 })).waitFor({ timeout: 15_000 });
  assert.equal(harness.callsTo('POST /api/queues/queue-qra-fixture/clear-confirm').length, 2);

  console.log('PASS E6 queue clear browser-only: preview states the consequence, Cancel sends no confirm, preview failure and uncertain confirm are alerts with a safe reference and no success text, an accepted confirm reports the counts.');
  boundary('E6', 'Entries were not actually removed and no refund reached Twitch; the clear semantics are proved by unit/PostgreSQL tests.');
} finally {
  await harness.close();
}
