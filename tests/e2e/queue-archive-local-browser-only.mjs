import assert from 'node:assert/strict';
import { boundary, CSRF_TOKEN, json, openPanel } from './fixtures/panel-browser-harness.mjs';
import { qraQueueDto } from './fixtures/qra-api-fixtures.mjs';

// Kills QA mutation M2 at browser level: the local-archive challenge request must carry the queue version the operator
// is looking at (expectedVersion === queue.version), and the confirm must echo the version the server issued.
// (The mutated line, queue-lifecycle.mjs:140, is the archive-local challenge; the clear preview sends `{}` with no version, asserted in the clear script.)
const queue = { ...qraQueueDto, id: 'queue-archive', version: 7, remoteSyncStatus: 'diverged', entries: [] };
const challengeId = 'f3a8b3c1-c8b4-42bc-94a5-bf845849bda1';
const harness = await openPanel({
  handlers: {
    'GET /api/queues': () => json([queue]),
    'POST /api/queues/queue-archive/archive-local/challenge': (call) => json({
      status: 'challenge_issued', challengeId, expectedVersion: call.body.expectedVersion, remoteSyncStatus: 'diverged', expiresAt: new Date(Date.now() + 120_000).toISOString(),
    }),
    'POST /api/queues/queue-archive/archive-local/confirm': () => json({ status: 'archived', queue: { ...queue, isArchived: true, lifecycleStatus: 'deleted' } }),
  },
});
const { page, catalog } = harness;

try {
  await harness.goto('/queues/');
  await page.getByRole('button', { name: catalog['panel.queue.action.archive_local_review'] }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.waitFor();
  await dialog.getByRole('button', { name: catalog['panel.dialog.confirm'], exact: true }).click();
  await page.waitForFunction(() => document.querySelector('dialog[open]')?.textContent.includes('Final confirmation'));
  const challenges = harness.callsTo('POST /api/queues/queue-archive/archive-local/challenge');
  assert.equal(challenges.length, 1);
  assert.deepEqual(challenges[0].body, { expectedVersion: 7 }, 'the challenge is bound to the displayed queue version');
  assert.equal(challenges[0].headers['x-csrf-token'], CSRF_TOKEN);

  await page.locator('dialog[open]').getByRole('button', { name: catalog['panel.dialog.confirm'], exact: true }).click();
  await page.getByText(catalog['panel.queue.archive_local.done']).first().waitFor({ timeout: 15_000 });
  const confirms = harness.callsTo('POST /api/queues/queue-archive/archive-local/confirm');
  assert.equal(confirms.length, 1);
  assert.deepEqual(confirms[0].body, { challengeId, expectedVersion: 7, remoteSyncStatus: 'diverged' }, 'the confirmation echoes the issued challenge and version');

  console.log('PASS queue archive-local browser-only: challenge sends expectedVersion equal to the displayed queue version, confirmation echoes challenge id, version and sync status.');
  boundary('M2');
} finally {
  await harness.close();
}
