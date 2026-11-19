import assert from 'node:assert/strict';
import { boundary, catalogs, CSRF_TOKEN, json, openPanel } from './fixtures/panel-browser-harness.mjs';

// OPS-31 K72-01b ("Ausentes" + "Restaurar"), Layer B variant: the Absent group of the live list in real Chrome with an INTERCEPTED API.
// Proves: group last, collapsed, counter + screen-reader text; empty state and a missing `absent` field (no group); 20 of 25 with the
// limit note; the restore POST (exact body with the version of `absent.entries`, CSRF, idempotency, no dialog); the person leaves the
// group and returns to the second place of their lane; the notice is local (the card header does not repeat it); focus stays in the
// group; the two refusals, stale and unknown-outcome messages; keyboard (Enter/Space on the summary, tab order); archived queue
// without the group; history read-only; pt-BR texts; no horizontal scroll, 44 px targets and no overlap at 320/390/768 px.
// It does NOT prove the real API, PostgreSQL, the chat notice, a screen reader, zoom or the es texts (those are unit-checked).
const en = catalogs.en;
const pt = catalogs['pt-BR'];
const IDEMPOTENCY = /^[A-Za-z0-9._:-]{8,128}$/;
const fill = (text, values) => Object.entries(values).reduce((out, [name, value]) => out.replaceAll(`{${name}}`, String(value)), text);

let entries;
let absentAll;
let sendAbsent;
let archived;
let reloads;
const base = Date.parse('2030-03-01T10:00:00.000Z');
const person = (id, over = {}) => ({ id, userLogin: id, displayName: id.toUpperCase(), version: 5, finishedAt: new Date(base + (over.n ?? 0) * 60_000).toISOString(), ...over });
function reset({ live = [], absent = [], withAbsentField = true, isArchived = false } = {}) {
  entries = live.map((entry) => ({ priorityClass: 'standard', priorityReason: null, userId: `uid-${entry.id}`, userLogin: entry.id, callNotifiedAt: null, callDeadlineAt: null, ...entry }));
  absentAll = absent;
  sendAbsent = withAbsentField;
  archived = isArchived;
  renumber();
}
function renumber() {
  let position = 1;
  for (const entry of entries) entry.position = entry.status === 'waiting' ? position++ : null;
}
// Mirrors the API rule: a returning person goes to the second place of their lane (first place when nobody waits).
function restoreInPlace(id) {
  const target = absentAll.find((item) => item.id === id);
  absentAll = absentAll.filter((item) => item.id !== id);
  const returned = { priorityClass: 'standard', priorityReason: null, userId: `uid-${id}`, callNotifiedAt: null, callDeadlineAt: null, ...target, status: 'waiting', version: target.version + 1 };
  const firstWaiting = entries.findIndex((entry) => entry.status === 'waiting');
  entries = firstWaiting === -1 ? [returned, ...entries] : [...entries.slice(0, firstWaiting + 1), returned, ...entries.slice(firstWaiting + 1)];
  renumber();
}
const queue = () => ({
  id: 'q1', slug: 'arena', title: 'Arena', isOpen: true, version: 2, lifecycleStatus: 'active', queueMode: 'manual_only', rewardOrigin: 'none',
  rewardId: null, remoteSyncStatus: 'local_only', modeTransitionStatus: 'none', isArchived: archived, entries,
  ...(sendAbsent ? { absent: { total: absentAll.length, entries: [...absentAll].sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt)).slice(0, 20) } } : {}),
});

async function open(state = {}) {
  reloads = 0;
  const harness = await openPanel({ state });
  harness.setHandler('GET /api/queues', () => { reloads += 1; return json([queue()]); });
  harness.setHandler('GET /api/queues/q1/history', () => json([{ id: 'h1', userLogin: 'h1', displayName: 'H1', status: 'no_show', finishedAt: new Date(base).toISOString() }]));
  return harness;
}
const restoreName = (name) => new RegExp(`^${en['panel.entry.action.restore'].replace(/^./, (c) => c.toUpperCase())} ${name} `);

// ---------- English
reset({
  live: [{ id: 'w1', displayName: 'W1', status: 'waiting', version: 1 }, { id: 'w2', displayName: 'W2', status: 'waiting', version: 1 }, { id: 'c', displayName: 'C', status: 'called', version: 2 }],
  absent: [person('a', { n: 1 }), person('b', { n: 3 }), person('c2', { n: 2, displayName: 'C2' })],
});
const harness = await open();
const { page } = harness;
let mode = 'ok';
harness.setHandler('POST /api/entries/b/transitions', (call) => {
  if (mode === 'intent') return json({ code: 'ENTRY_RESTORE_NOT_ALLOWED', reason: 'intent_recorded', error: 'private server copy' }, 409);
  if (mode === 'other') return json({ code: 'ENTRY_RESTORE_NOT_ALLOWED', reason: 'other_active_entry', error: 'private server copy' }, 409);
  if (mode === 'stale') return json({ code: 'ENTRY_VERSION_STALE', error: 'private server copy' }, 409);
  if (mode === 'boom') return json({ error: 'private server copy', referenceId: 'ref-boom-02' }, 500);
  const target = absentAll.find((item) => item.id === 'b');
  if (!target || call.body.expectedVersion !== target.version) return json({ code: 'ENTRY_VERSION_STALE', error: 'private server copy' }, 409);
  restoreInPlace('b');
  return json({ id: 'b', status: 'waiting', financialDecision: 'no_operation' });
});
harness.setHandler('POST /api/entries/c2/transitions', () => { restoreInPlace('c2'); return json({ id: 'c2', status: 'waiting', financialDecision: 'no_operation' }); });
harness.setHandler('POST /api/entries/a/transitions', () => { restoreInPlace('a'); return json({ id: 'a', status: 'waiting', financialDecision: 'no_operation' }); });
const group = () => page.locator('section.queue-absent-group');
const activeId = () => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
const waitingNames = () => page.locator('section.queue-entry-group').filter({ has: page.getByRole('heading', { name: /^Waiting/ }) }).locator('li > span:first-child').allTextContents();
const openGroup = async () => { await group().waitFor({ timeout: 15_000 }); if (!(await group().locator('details').evaluate((node) => node.open))) await group().locator('summary').click(); };

try {
  await harness.goto('/queues/');
  await group().waitFor({ timeout: 15_000 });

  // B1: last group, full width, collapsed, chip 3 aria-hidden, plural text for screen readers, newest first when opened
  const labels = await page.locator('.queue-entry-groups > section').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));
  assert.deepEqual(labels, ['Waiting', 'Called', 'In service', en['panel.queue.group.absent']]);
  assert.equal(await group().locator('details').evaluate((node) => node.open), false, 'collapsed by default');
  assert.equal((await group().locator('.queue-absent-count').textContent()).trim(), '3');
  assert.equal(await group().locator('.queue-absent-count').getAttribute('aria-hidden'), 'true');
  assert.equal((await group().locator('.queue-absent-sr').textContent()).trim(), fill(en['panel.queue.absent.count.other'], { count: 3 }));
  const widths = await page.evaluate(() => ({ group: document.querySelector('.queue-absent-group').getBoundingClientRect().width, container: document.querySelector('.queue-entry-groups').getBoundingClientRect().width }));
  assert.ok(Math.abs(widths.group - widths.container) < 1, 'the group spans the full row');
  await group().locator('summary').click();
  assert.deepEqual(await group().locator('li .queue-absent-name').evaluateAll((nodes) => nodes.map((node) => node.textContent.split(' · ')[0])), ['B', 'C2', 'A'].map((name) => name), 'API order kept (newest first)');
  assert.equal(await group().locator('li time[datetime]').count(), 3);
  assert.equal(await page.locator('#queue-feedback-q1').count(), 0);

  // B11: keyboard. Space and Enter toggle the summary; Tab goes summary -> restore buttons in list order
  await group().locator('summary').focus();
  await page.keyboard.press('Space');
  assert.equal(await group().locator('details').evaluate((node) => node.open), false);
  await page.keyboard.press('Enter');
  assert.equal(await group().locator('details').evaluate((node) => node.open), true);
  const order = [];
  for (let n = 0; n < 3; n += 1) { await page.keyboard.press('Tab'); order.push(await activeId()); }
  assert.deepEqual(order, ['queue-absent-restore-b', 'queue-absent-restore-c2', 'queue-absent-restore-a']);

  // B7: stale (another tab restored the person) -> local alert + Refresh queue; the header region is not used
  mode = 'stale';
  await page.getByRole('button', { name: restoreName('B') }).click();
  const stale = group().getByRole('alert').filter({ hasText: en['panel.error.entry_version_stale'] });
  await stale.waitFor({ timeout: 10_000 });
  assert.doesNotMatch(await stale.innerText(), /private server copy/);
  assert.equal(await activeId(), 'queue-absent-restore-b', 'focus returns to the row button');
  assert.equal(await page.locator('#queue-feedback-q1').count(), 0, 'the header region is not used');
  const before = reloads;
  await stale.getByRole('button', { name: en['panel.reward.refresh_queue'], exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.queue-absent-group [role="alert"]')?.textContent);
  assert.ok(reloads > before);
  assert.equal(await group().locator('details').evaluate((node) => node.open), true, 'open state survives the reload');

  // B5 / B6: refusals -> the row swaps the button for the note; nothing else changes
  for (const [kind, key] of [['intent', 'panel.error.entry_restore_intent_recorded'], ['other', 'panel.error.entry_restore_other_active']]) {
    mode = kind;
    harness.calls.length = 0;
    await openGroup();
    await page.getByRole('button', { name: restoreName('B') }).click();
    const alert = group().getByRole('alert').filter({ hasText: fill(en[key], { user: 'B' }) });
    await alert.waitFor({ timeout: 10_000 });
    assert.doesNotMatch(await alert.innerText(), /private server copy/);
    assert.equal(await page.getByRole('button', { name: restoreName('B') }).count(), 0, `${kind}: no restore button on the refused row`);
    assert.equal(await activeId(), 'queue-absent-entry-b', `${kind}: focus stays on the row`);
    assert.equal(harness.callsTo('POST /api/entries/b/transitions').length, 1);
    assert.equal((await group().locator('.queue-absent-count').textContent()).trim(), '3', `${kind}: the group is unchanged`);
    await page.reload();
  }

  // unknown outcome: 500 with a reference -> "may have been recorded" + Refresh queue, the button stays
  mode = 'boom';
  await openGroup();
  await page.getByRole('button', { name: restoreName('B') }).click();
  const uncertain = group().getByRole('alert').filter({ hasText: en['panel.queue.entry_action_result.uncertain'] });
  await uncertain.waitFor({ timeout: 10_000 });
  assert.match(await uncertain.innerText(), /ref-boom-02/);
  assert.doesNotMatch(await uncertain.innerText(), /private server copy/);
  await uncertain.getByRole('button', { name: en['panel.reward.refresh_queue'], exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: restoreName('B') }).count(), 1);

  // B4: restore B -> exact POST, no dialog, leaves the group, second place of the lane, local notice, focus stays in the group
  mode = 'ok';
  await page.reload();
  await openGroup();
  harness.calls.length = 0;
  await page.getByRole('button', { name: restoreName('B') }).click();
  await group().getByRole('status').filter({ hasText: fill(en['panel.queue.entry_action_result.restored'], { user: 'B', position: 2 }) }).waitFor({ timeout: 10_000 });
  const posted = harness.callsTo('POST /api/entries/b/transitions');
  assert.equal(posted.length, 1);
  assert.deepEqual(posted[0].body, { to: 'waiting', reason: 'operator_restore', expectedVersion: 5 });
  assert.equal(posted[0].headers['x-csrf-token'], CSRF_TOKEN);
  assert.match(posted[0].headers['idempotency-key'], IDEMPOTENCY);
  assert.equal(await page.locator('dialog[open]').count(), 0, 'no confirmation dialog');
  assert.deepEqual(await waitingNames(), ['W1', 'B', 'W2'], 'second place of the lane');
  assert.equal((await group().locator('.queue-absent-count').textContent()).trim(), '2');
  assert.equal(await group().getByRole('button', { name: restoreName('B') }).count(), 0);
  assert.equal(await page.locator('#queue-feedback-q1').count(), 0, 'the card header does not repeat the notice');
  assert.equal(await page.getByText(/is no longer marked absent/).count(), 1, 'announced once');
  assert.equal(await activeId(), 'queue-absent-restore-c2', 'focus stays in the group, on the next restore button');
  assert.equal(await group().locator('details').evaluate((node) => node.open), true);

  // restoring the rest leaves the empty state and moves focus to the summary
  await page.getByRole('button', { name: restoreName('C2') }).click();
  await group().getByRole('status').filter({ hasText: fill(en['panel.queue.entry_action_result.restored'], { user: 'C2', position: 2 }) }).waitFor();
  await page.getByRole('button', { name: restoreName('A') }).click();
  await group().getByRole('status').filter({ hasText: /^A is no longer marked absent/ }).waitFor();
  assert.equal(await activeId(), 'queue-absent-summary-q1');
  assert.equal((await group().locator('details > p').textContent()).trim(), en['panel.queue.absent.empty']);
  assert.equal((await group().locator('.queue-absent-count').textContent()).trim(), '0');

  // B9: the recent history still lists the no_show, read-only
  await page.locator('details.queue-history summary').click();
  await page.locator('.history-entry').filter({ hasText: /H1/ }).waitFor();
  assert.equal(await page.locator('.history-entry button').count(), 0);

  // B2: missing field = no group; archived queue = no group
  reset({ live: [], absent: [], withAbsentField: false });
  await page.reload();
  await page.locator('.queue-list-card').waitFor();
  assert.equal(await page.locator('.queue-absent-group').count(), 0, 'unknown is not rendered as zero');
  reset({ live: [], absent: [person('a')], isArchived: true });
  await page.reload();
  await page.locator('.queue-list-card').waitFor();
  assert.equal(await page.locator('.queue-absent-group').count(), 0, 'archived queue: no group');

  // B3 + B12: 25 absent people -> 20 rows and the limit note; three widths with a 25-character name; no inner scroll
  reset({ live: [], absent: Array.from({ length: 25 }, (_, n) => person(`p${n}`, { n, displayName: n === 24 ? 'Abcdefghijklmnopqrstuvwxy' : `P${n}` })) });
  await page.reload();
  await openGroup();
  assert.equal(await group().locator('li').count(), 20);
  assert.equal((await group().locator('.queue-absent-limit').textContent()).trim(), fill(en['panel.queue.absent.limited'], { shown: 20, total: 25 }));
  assert.equal(await group().evaluate((node) => getComputedStyle(node).overflowY), 'visible', 'no inner scroll container');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const metrics = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.queue-absent-group button[data-restore], .queue-absent-group summary')].map((node) => { const r = node.getBoundingClientRect(); return { id: node.id, width: r.width, height: r.height }; });
      const rows = [...document.querySelectorAll('.queue-absent-row')].map((node) => node.getBoundingClientRect());
      const overlap = rows.flatMap((a, i) => rows.slice(i + 1).filter((b) => a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5).map(() => 'row'));
      const note = document.querySelector('.queue-absent-limit').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth - window.innerWidth, count: boxes.length, small: boxes.filter((b) => b.width < 43.5 || b.height < 43.5).map((b) => b.id), overlap, noteVisible: note.width > 0 && note.right <= window.innerWidth + 0.5 };
    });
    assert.equal(metrics.count, 21);
    assert.ok(metrics.overflow <= 0, `no horizontal scroll at ${width} px (overflow ${metrics.overflow})`);
    assert.deepEqual(metrics.small, [], `targets of at least 44 x 44 px at ${width} px`);
    assert.deepEqual(metrics.overlap, [], `rows do not overlap at ${width} px`);
    assert.ok(metrics.noteVisible, `limit note visible at ${width} px`);
  }
  assert.doesNotMatch(await page.locator('.queue-list').innerText(), /\b(skip|skipped)\b|pular|saltar/i);
  assert.deepEqual(harness.external, [], 'no external request');
} finally {
  await harness.close();
}

// ---------- pt-BR: group label, counter text, button, success text
reset({ live: [{ id: 'w1', displayName: 'W1', status: 'waiting', version: 1 }], absent: [person('b', { n: 2 }), person('a', { n: 1 })] });
const ptHarness = await open({ product_locale: { locale: 'pt-BR', revision: 1 } });
ptHarness.setHandler('POST /api/entries/b/transitions', () => { restoreInPlace('b'); return json({ id: 'b', status: 'waiting', financialDecision: 'no_operation' }); });
try {
  await ptHarness.goto('/queues/');
  const ptGroup = ptHarness.page.locator('section.queue-absent-group');
  await ptGroup.waitFor({ timeout: 15_000 });
  assert.equal(await ptGroup.getAttribute('aria-label'), pt['panel.queue.group.absent']);
  assert.equal((await ptGroup.locator('.queue-absent-sr').textContent()).trim(), fill(pt['panel.queue.absent.count.other'], { count: 2 }));
  await ptGroup.locator('summary').click();
  const ptButton = ptGroup.getByRole('button', { name: fill(pt['panel.entry.action.restore_aria'], { user: 'B' }), exact: true });
  assert.equal((await ptButton.textContent()).trim(), 'restaurar');
  await ptButton.click();
  await ptGroup.getByRole('status').filter({ hasText: fill(pt['panel.queue.entry_action_result.restored'], { user: 'B', position: 2 }) }).waitFor({ timeout: 10_000 });
  assert.doesNotMatch(await ptHarness.page.locator('.queue-list').innerText(), /pular|skip|saltar/i);
  console.log('PASS queue absent group ("Ausentes" + "Restaurar") browser-only: group last/collapsed/counter, 20 of 25 with note, exact restore POST with version, CSRF and idempotency, second place of the lane, local notice (header silent), focus in the group, refusals/stale/unknown-outcome messages, keyboard, history read-only, no group when unknown or archived, pt-BR texts, no overflow and 44 px targets at 320/390/768.');
  boundary('K72-01b', 'The real API, PostgreSQL, the chat notice, a screen reader, a 200% zoom pass and the es texts remain unproved here.');
} finally {
  await ptHarness.close();
}
