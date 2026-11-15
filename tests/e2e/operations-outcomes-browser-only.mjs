import assert from 'node:assert/strict';
import { boundary, CSRF_TOKEN, json, openPanel } from './fixtures/panel-browser-harness.mjs';

// E5 (flow-and-chat-review.md): /operations renders unknown and retry outcomes without ever saying "confirmed" for them,
// a manual resolution is never presented as remote confirmation, and a missing/invalid/failed response is never success.
let operations = [
  { id: 'op-unknown', type: 'redemption.cancel', status: 'unknown', attempts: 2, redemptionId: 'redemption-unknown-1' },
  { id: 'op-retry', type: 'reward.update', status: 'retry', attempts: 1, entityId: 'reward-retry-1' },
  { id: 'op-failed', type: 'redemption.fulfill', status: 'failed', attempts: 3, redemptionId: 'redemption-failed-1' },
];
let retryMode = 'invalid';
const harness = await openPanel({
  handlers: {
    'GET /api/operations': () => json(operations),
    'POST /api/operations/op-unknown/resolve-unknown': () => {
      operations = operations.map((op) => (op.id === 'op-unknown' ? { ...op, status: 'resolved_manual' } : op));
      return json({ status: 'resolved_manual', remoteConfirmed: false });
    },
    'POST /api/operations/op-failed/retry': () => (retryMode === 'invalid'
      ? json({ status: 'confirmed' })
      : json({ code: 'INTERNAL_ERROR', error: 'private server copy' }, 503, { 'x-error-reference': 'op-retry-77' })),
  },
});
const { page, catalog } = harness;
const card = (id) => page.locator(`article[aria-labelledby="operation-title-${id}"]`);
const confirmedText = catalog['panel.operation.status.confirmed'];

try {
  await harness.goto('/operations/');
  await card('op-unknown').waitFor({ timeout: 15_000 });
  assert.match(await card('op-unknown').textContent(), new RegExp(catalog['panel.operation.status.unknown'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(await card('op-retry').textContent(), new RegExp(catalog['panel.operation.status.retry']));
  for (const id of ['op-unknown', 'op-retry', 'op-failed']) {
    assert.ok(!(await card(id).textContent()).includes(confirmedText), `${id} never shows the confirmed wording`);
  }
  assert.equal(await card('op-retry').getByRole('button').count(), 0, 'a scheduled retry offers no action');

  // Invalid retry result ("confirmed") is a failure, not a success.
  await card('op-failed').getByRole('button', { name: catalog['panel.operation.action.retry'] }).click();
  const failed = page.getByRole('alert').filter({ hasText: catalog['panel.operations.action_failed'] });
  await failed.waitFor({ timeout: 15_000 });
  assert.ok(!(await card('op-failed').textContent()).includes(confirmedText), 'an invalid result does not flip the card to confirmed');

  // Server failure: generic text plus the safe reference only.
  retryMode = 'error';
  await card('op-failed').getByRole('button', { name: catalog['panel.operation.action.retry'] }).click();
  await page.getByText(catalog['panel.error.reference'].replace('{id}', 'op-retry-77')).waitFor({ timeout: 15_000 });
  assert.doesNotMatch(await page.locator('.operation-notice').textContent(), /private server copy/);
  assert.equal(harness.callsTo('POST /api/operations/op-failed/retry').length, 2);
  assert.equal(harness.callsTo('POST /api/operations/op-failed/retry')[0].headers['x-csrf-token'], CSRF_TOKEN);

  // Unknown -> manual resolution needs the confirmation dialog and is labeled as manual, never as Twitch-confirmed.
  await card('op-unknown').getByRole('button', { name: catalog['panel.operation.action.resolve'] }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.waitFor();
  assert.equal(harness.callsTo('POST /api/operations/op-unknown/resolve-unknown').length, 0, 'nothing is sent before the confirmation');
  await dialog.getByRole('button', { name: catalog['panel.operation.action.resolve'] }).click();
  await page.getByText(catalog['panel.operations.action_manual_resolution']).waitFor({ timeout: 15_000 });
  assert.match(await card('op-unknown').textContent(), new RegExp(catalog['panel.operation.status.resolved_manual']));
  assert.ok(!(await card('op-unknown').textContent()).includes(confirmedText), 'manual resolution is not shown as confirmed by Twitch');

  console.log('PASS E5 operations browser-only: unknown/retry never show the confirmed wording, invalid and failed action results are errors with only a safe reference, manual resolution needs confirmation and is not shown as Twitch-confirmed.');
  boundary('E5', 'No real Twitch refund/fulfillment state was observed.');
} finally {
  await harness.close();
}
