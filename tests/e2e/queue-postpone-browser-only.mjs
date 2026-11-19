import assert from 'node:assert/strict';
import { boundary, catalogs, CSRF_TOKEN, json, openPanel } from './fixtures/panel-browser-harness.mjs';

// OPS-31 K72-01a ("Adiar"), Layer B variant: the postpone button on a called row in real Chrome with an INTERCEPTED API.
// Proves: no dialog; the POST body (called -> waiting, internal label, the version the operator saw) with CSRF and idempotency
// headers; the new place read from the reloaded list; focus on the person's "call" button; one request per double click and
// aria-busy; the stale / invalid-transition / unknown-outcome messages with "Refresh queue" and a safe reference; keyboard order;
// pt-BR texts; and no horizontal scroll, 44 px targets and no overlap at 320/390/768 px.
// It does NOT prove the real API, PostgreSQL, the chat notice, a screen reader, zoom or the es texts (those are unit-checked).
const en = catalogs.en;
const pt = catalogs['pt-BR'];
const IDEMPOTENCY = /^[A-Za-z0-9._:-]{8,128}$/;
const fill = (text, values) => Object.entries(values).reduce((out, [name, value]) => out.replaceAll(`{${name}}`, String(value)), text);

let entries;
let reloads;
function reset(list) {
  entries = list.map((entry) => ({ priorityClass: 'standard', priorityReason: null, userId: `uid-${entry.id}`, userLogin: entry.id, callNotifiedAt: null, callDeadlineAt: null, ...entry }));
  renumber();
}
function renumber() {
  let position = 1;
  for (const entry of entries) entry.position = entry.status === 'waiting' ? position++ : null;
}
// Mirrors the API rule: a returning person goes to the second place of their lane (first place when nobody waits).
function postponeInPlace(target) {
  const others = entries.filter((entry) => entry.id !== target.id);
  const firstWaiting = others.findIndex((entry) => entry.status === 'waiting');
  const returned = { ...target, status: 'waiting', version: target.version + 1 };
  entries = firstWaiting === -1 ? [returned, ...others] : [...others.slice(0, firstWaiting + 1), returned, ...others.slice(firstWaiting + 1)];
  renumber();
}
const queue = () => ({
  id: 'q1', slug: 'arena', title: 'Arena', isOpen: true, version: 2, lifecycleStatus: 'active', queueMode: 'manual_only', rewardOrigin: 'none',
  rewardId: null, remoteSyncStatus: 'local_only', modeTransitionStatus: 'none', isArchived: false, entries,
});

async function open(state = {}) {
  reloads = 0;
  const harness = await openPanel({ state });
  harness.setHandler('GET /api/queues', () => { reloads += 1; return json([queue()]); });
  return harness;
}
const postponeName = (name) => new RegExp(`^${en['panel.entry.action.postpone'].replace(/^./, (c) => c.toUpperCase())} ${name}:`);

// ---------- English: flow, errors, keyboard, layout
reset([
  { id: 'a', displayName: 'A', status: 'waiting', version: 1 },
  { id: 'b', displayName: 'B', status: 'waiting', version: 1 },
  { id: 'c', displayName: 'C', status: 'called', version: 4 },
]);
const harness = await open();
const { page } = harness;
let delayMs = 0;
let mode = 'ok';
harness.setHandler('POST /api/entries/c/transitions', async (call) => {
  if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  if (mode === 'invalid') return json({ code: 'INVALID_ENTRY_TRANSITION', error: 'private server copy' }, 409);
  if (mode === 'stale') return json({ code: 'ENTRY_VERSION_STALE', version: 9, error: 'private server copy' }, 409);
  if (mode === 'boom') return json({ error: 'private server copy', referenceId: 'ref-boom-01' }, 500);
  const target = entries.find((entry) => entry.id === 'c');
  if (call.body.expectedVersion !== target.version) return json({ code: 'ENTRY_VERSION_STALE', error: 'private server copy' }, 409);
  postponeInPlace(target);
  return json({ id: 'c', status: 'waiting', financialDecision: 'no_operation' });
});
const groupNames = (title) => page.locator('section.queue-entry-group').filter({ has: page.getByRole('heading', { name: new RegExp(`^${title}`) }) });
const feedback = () => page.locator('#queue-feedback-q1');
const activeId = () => page.evaluate(() => document.activeElement?.id ?? document.activeElement?.tagName);

try {
  await harness.goto('/queues/');
  const button = page.getByRole('button', { name: postponeName('C') });
  await button.waitFor({ timeout: 15_000 });
  assert.equal((await button.textContent()).trim(), en['panel.entry.action.postpone']);

  // A1: one click -> one POST with the exact body, no dialog, new place from the reloaded list, focus on "call"
  await button.click();
  await page.getByRole('status').filter({ hasText: fill(en['panel.queue.entry_action_result.postponed'], { user: 'C', position: 2 }) }).waitFor({ timeout: 10_000 });
  const posted = harness.callsTo('POST /api/entries/c/transitions');
  assert.equal(posted.length, 1);
  assert.deepEqual(posted[0].body, { to: 'waiting', reason: 'operator_skip', expectedVersion: 4 });
  assert.equal(posted[0].headers['x-csrf-token'], CSRF_TOKEN);
  assert.match(posted[0].headers['idempotency-key'], IDEMPOTENCY);
  assert.equal(await page.locator('dialog[open]').count(), 0, 'no confirmation dialog');
  assert.equal(await groupNames('Called').getByRole('listitem').count(), 0, 'the called group is empty');
  assert.deepEqual(await groupNames('Waiting').locator('li > span:first-child').allTextContents(), ['A', 'C', 'B'], 'C is second in the waiting list');
  assert.ok(reloads >= 2, 'the list was reloaded after the success');
  assert.equal(await activeId(), 'queue-entry-call-c', 'focus follows the person to their "call" button');
  assert.doesNotMatch(await feedback().innerText(), /chat|private server copy/i, 'the success text does not promise a chat notice');

  // A5: double click -> one request, neighbours disabled, the clicked button busy with its text unchanged
  reset([{ id: 'a', displayName: 'A', status: 'waiting', version: 1 }, { id: 'c', displayName: 'C', status: 'called', version: 4 }]);
  await page.reload();
  const again = page.getByRole('button', { name: postponeName('C') });
  await again.waitFor();
  delayMs = 600;
  harness.calls.length = 0;
  await again.dblclick();
  await page.waitForFunction(() => document.getElementById('queue-entry-postpone-c')?.getAttribute('aria-busy') === 'true');
  assert.equal((await again.textContent()).trim(), en['panel.entry.action.postpone'], 'the label does not change while saving');
  assert.equal(await page.locator('.queue-entry-actions button:not([disabled])').count(), 0, 'every row button is disabled while saving');
  await page.getByRole('status').filter({ hasText: fill(en['panel.queue.entry_action_result.postponed'], { user: 'C', position: 2 }) }).waitFor();
  assert.equal(harness.callsTo('POST /api/entries/c/transitions').length, 1, 'a double click sends one request');
  delayMs = 0;

  // A6: another tab changed the person -> conflict text, Refresh queue, focus back on the control, refresh clears the message
  for (const [kind, code] of [['stale', 'ENTRY_VERSION_STALE'], ['invalid', 'INVALID_ENTRY_TRANSITION']]) {
    reset([{ id: 'a', displayName: 'A', status: 'waiting', version: 1 }, { id: 'c', displayName: 'C', status: 'called', version: 4 }]);
    await page.reload();
    await page.getByRole('button', { name: postponeName('C') }).waitFor();
    mode = kind;
    await page.getByRole('button', { name: postponeName('C') }).click();
    const alert = page.getByRole('alert').filter({ hasText: en['panel.error.entry_version_stale'] });
    await alert.waitFor({ timeout: 10_000 });
    assert.doesNotMatch(await alert.innerText(), /private server copy/, `${code}: the server copy is never shown`);
    assert.equal(await activeId(), 'queue-entry-postpone-c', `${code}: focus returns to the control`);
    const before = reloads;
    await alert.getByRole('button', { name: en['panel.reward.refresh_queue'], exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('queue-feedback-q1'));
    assert.ok(reloads > before, `${code}: Refresh queue reloads the list`);
  }

  // A7: unknown outcome (500 with a reference, then a dropped connection) -> "may have been recorded" + Refresh queue
  reset([{ id: 'c', displayName: 'C', status: 'called', version: 4 }]);
  await page.reload();
  await page.getByRole('button', { name: postponeName('C') }).waitFor();
  mode = 'boom';
  await page.getByRole('button', { name: postponeName('C') }).click();
  const uncertain = page.getByRole('alert').filter({ hasText: en['panel.queue.entry_action_result.uncertain'] });
  await uncertain.waitFor({ timeout: 10_000 });
  assert.match(await uncertain.innerText(), /ref-boom-01/);
  assert.doesNotMatch(await uncertain.innerText(), /private server copy/);
  await uncertain.getByRole('button', { name: en['panel.reward.refresh_queue'], exact: true }).waitFor();
  await uncertain.getByRole('button', { name: en['panel.reward.refresh_queue'], exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('queue-feedback-q1'));
  mode = 'ok';
  // a dropped connection: the harness route is bypassed by a later route that aborts only this request
  const dropTransition = (route) => route.abort('connectionreset');
  await page.route('**/api/entries/c/transitions', dropTransition);
  await page.getByRole('button', { name: postponeName('C') }).click();
  const dropped = page.getByRole('alert').filter({ hasText: en['panel.queue.entry_action_result.uncertain'] });
  await dropped.waitFor({ timeout: 10_000 });
  await dropped.getByRole('button', { name: en['panel.reward.refresh_queue'], exact: true }).waitFor();
  await page.unroute('**/api/entries/c/transitions', dropTransition);

  // A9: keyboard only. Tab order of the called row, then Enter (and Space) on the postpone button
  reset([{ id: 'c', displayName: 'C', status: 'called', version: 4 }]);
  await page.reload();
  await page.getByRole('button', { name: postponeName('C') }).waitFor();
  await page.locator('#queue-entry-c button').first().focus();
  const order = [await page.evaluate(() => document.activeElement.textContent.trim())];
  for (let n = 0; n < 4; n += 1) { await page.keyboard.press('Tab'); order.push(await page.evaluate(() => document.activeElement.textContent.trim())); }
  assert.deepEqual(order, ['start service', 'complete', 'Resend call', 'postpone', 'remove'].map((text) => (text === 'start service' ? en['panel.entry.action.attend'] : text === 'complete' ? en['panel.entry.action.complete'] : text === 'Resend call' ? en['panel.entry.action.resend'] : text)));
  await page.locator('#queue-entry-postpone-c').focus();
  harness.calls.length = 0;
  await page.keyboard.press('Enter');
  await page.getByRole('status').filter({ hasText: fill(en['panel.queue.entry_action_result.postponed'], { user: 'C', position: 1 }) }).waitFor();
  assert.equal(harness.callsTo('POST /api/entries/c/transitions').length, 1);
  assert.equal(await activeId(), 'queue-entry-call-c');

  // A10: three widths, a 25-character name
  reset([{ id: 'c', displayName: 'Abcdefghijklmnopqrstuvwxy', status: 'called', version: 4 }]);
  await page.reload();
  await page.getByRole('button', { name: /^Postpone Abcdefghijklmnopqrstuvwxy:/ }).waitFor();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const metrics = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('#queue-entry-c .queue-entry-actions button')].map((node) => { const r = node.getBoundingClientRect(); return { id: node.id || node.textContent.trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; });
      const overlap = boxes.flatMap((a, i) => boxes.slice(i + 1).filter((b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5).map((b) => `${a.id}/${b.id}`));
      return { overflow: document.documentElement.scrollWidth - window.innerWidth, count: boxes.length, small: boxes.filter((b) => b.width < 43.5 || b.height < 43.5).map((b) => b.id), overlap };
    });
    assert.equal(metrics.count, 5);
    assert.ok(metrics.overflow <= 0, `no horizontal scroll at ${width} px (overflow ${metrics.overflow})`);
    assert.deepEqual(metrics.small, [], `targets of at least 44 x 44 px at ${width} px`);
    assert.deepEqual(metrics.overlap, [], `row buttons do not overlap at ${width} px`);
  }

  // A11 (en): the queue area never shows the words the owner removed
  assert.doesNotMatch(await page.locator('.queue-list').innerText(), /\b(skip|skipped)\b|pular|saltar/i);
  assert.deepEqual(harness.external, [], 'no external request');
} finally {
  await harness.close();
}

// ---------- pt-BR: label, aria-label, success text
reset([{ id: 'a', displayName: 'A', status: 'waiting', version: 1 }, { id: 'c', displayName: 'C', status: 'called', version: 4 }]);
const ptHarness = await open({ product_locale: { locale: 'pt-BR', revision: 1 } });
ptHarness.setHandler('POST /api/entries/c/transitions', () => {
  postponeInPlace(entries.find((entry) => entry.id === 'c'));
  return json({ id: 'c', status: 'waiting', financialDecision: 'no_operation' });
});
try {
  await ptHarness.goto('/queues/');
  const ptButton = ptHarness.page.getByRole('button', { name: fill(pt['panel.entry.action.postpone_aria'], { user: 'C' }), exact: true });
  await ptButton.waitFor({ timeout: 15_000 });
  assert.equal((await ptButton.textContent()).trim(), 'adiar');
  await ptButton.click();
  await ptHarness.page.getByRole('status').filter({ hasText: fill(pt['panel.queue.entry_action_result.postponed'], { user: 'C', position: 2 }) }).waitFor({ timeout: 10_000 });
  assert.doesNotMatch(await ptHarness.page.locator('.queue-list').innerText(), /pular|skip|saltar/i);
  console.log('PASS queue postpone ("Adiar") browser-only: exact POST body with version, CSRF and idempotency, no dialog, place from the reloaded list, focus on "call", double click = one request with aria-busy, conflict/unknown-outcome messages with Refresh queue and safe reference, keyboard order, pt-BR texts, no overflow and 44 px targets at 320/390/768.');
  boundary('K72-01a', 'The real API, PostgreSQL, the chat notice, a screen reader, a 200% zoom pass and the es texts remain unproved here.');
} finally {
  await ptHarness.close();
}
