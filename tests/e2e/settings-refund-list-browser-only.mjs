import assert from 'node:assert/strict';
import { boundary, catalogs, CSRF_TOKEN, json, openPanel } from './fixtures/panel-browser-harness.mjs';

// OPS-31 P5 (K74-03, E74-02), Layer B variant: the own refund list on /settings in real Chrome with an INTERCEPTED API.
// Proves: add with the label prefilled from the login, the stable error texts, remove with focus handling, the clear-all
// dialog (Escape keeps the list), CSRF and idempotency headers, and no horizontal scroll with 44 px targets at 320/390/768 px.
// It does NOT prove persistence, the Twitch login lookup, PostgreSQL, the 500 limit under concurrency or a 200% zoom pass.
const en = catalogs.en;
const IDEMPOTENCY = /^[A-Za-z0-9._:-]{8,128}$/;
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let members = [];
let next = 1;
const harness = await openPanel();
const { page } = harness;
const view = () => ({ items: members, count: members.length, max: 500 });
harness.setHandler('GET /api/refund-list', () => json(view()));
harness.setHandler('POST /api/refund-list', (call) => {
  if (call.body.login === 'ghost') return json({ code: 'TWITCH_USER_NOT_FOUND', error: 'private server copy' }, 404);
  if (call.body.login === 'dup') return json({ code: 'REFUND_LIST_DUPLICATE', error: 'private server copy' }, 409);
  if (call.body.login === 'full') return json({ code: 'REFUND_LIST_FULL', max: 500, error: 'private server copy' }, 409);
  const member = { id: id(next++), label: call.body.label ?? null, createdAt: '2030-01-02T12:00:00.000Z' };
  members.push(member);
  return json({ member, count: members.length, max: 500 }, 201);
});
harness.setHandler('POST /api/refund-list/clear', () => { const removed = members.length; members = []; return json({ removed, count: 0, max: 500 }); });
for (let n = 1; n <= 20; n += 1) {
  harness.setHandler(`POST /api/refund-list/${id(n)}/remove`, () => { members = members.filter((member) => member.id !== id(n)); return json({ count: members.length, max: 500 }); });
}

const title = page.getByRole('heading', { name: en['panel.refund_list.title'] });
const login = page.getByRole('textbox', { name: en['panel.entry.twitch_login'] });
const label = page.getByRole('textbox', { name: en['panel.refund_list.label'] });
const add = page.getByRole('button', { name: en['panel.refund_list.add'], exact: true });
const alertText = async () => (await page.getByRole('alert').first().textContent()).trim();
const activeLabel = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.id ?? null);

try {
  await harness.goto('/settings/');
  await title.waitFor({ timeout: 15_000 });
  await login.waitFor();
  await page.getByText(en['panel.refund_list.empty']).waitFor();

  // label follows the login until edited; one add sends login + label with CSRF and an idempotency key
  await login.fill('@Friend_One');
  assert.equal(await label.inputValue(), 'Friend_One');
  await add.click();
  await page.getByText('Friend_One', { exact: true }).waitFor();
  const posted = harness.callsTo('POST /api/refund-list');
  assert.equal(posted.length, 1);
  assert.deepEqual(posted[0].body, { login: 'Friend_One', label: 'Friend_One' });
  assert.equal(posted[0].headers['x-csrf-token'], CSRF_TOKEN);
  assert.match(posted[0].headers['idempotency-key'], IDEMPOTENCY);
  assert.equal(await login.inputValue(), '');
  assert.equal(await page.getByText('1 of 500').count(), 1);
  // OPS-31 X2: the count is plain text (not a live region); only the notice announces, so there is no double announcement
  assert.equal(await page.getByRole('status').filter({ hasText: '1 of 500' }).count(), 0, 'the count line is not a live region');

  // stable error texts, never the server copy
  for (const [typed, text] of [
    ['dup', en['panel.refund_list.error.duplicate']],
    ['full', en['panel.refund_list.error.limit'].replace('{max}', '500')],
    ['ghost', en['panel.entry.error.twitch_user_not_found'].replace('{user}', 'ghost')],
  ]) {
    await login.fill(typed);
    await add.click();
    await page.getByRole('alert').filter({ hasText: text }).waitFor({ timeout: 15_000 });
    assert.doesNotMatch(await alertText(), /private server copy/);
  }
  await login.fill('bad login!');
  await add.click();
  await page.getByRole('alert').filter({ hasText: en['panel.refund_list.error.invalid'] }).waitFor();
  // OPS-31 X2: the error is tied to the field it describes
  assert.equal(await login.getAttribute('aria-invalid'), 'true');
  assert.equal(await login.getAttribute('aria-describedby'), 'refund-list-notice');
  assert.equal(await page.locator('#refund-list-notice').getAttribute('role'), 'alert');
  assert.equal(harness.callsTo('POST /api/refund-list').length, 4, 'an invalid login never reaches the API');

  // remove by keyboard: the status says who was removed, focus moves to the next row, then to the heading
  await login.fill('Second'); await add.click(); await page.getByText('Second', { exact: true }).waitFor();
  const removeFirst = page.getByRole('button', { name: en['panel.refund_list.remove_aria'].replace('{label}', 'Friend_One') });
  await removeFirst.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('status').filter({ hasText: en['panel.refund_list.removed'].replace('{label}', 'Friend_One') }).waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label')?.includes('Second'));
  await page.keyboard.press('Enter');
  await page.getByText(en['panel.refund_list.empty']).waitFor();
  assert.equal(await activeLabel(), 'refund-list-title', 'focus lands on the heading when the list becomes empty');

  // clear all: the dialog states the count, Escape keeps the list, confirming empties it
  for (const name of ['One', 'Two']) { await login.fill(name); await add.click(); await page.getByText(name, { exact: true }).waitFor(); }
  const clear = page.getByRole('button', { name: en['panel.refund_list.clear'], exact: true });
  await clear.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  assert.match(await dialog.textContent(), new RegExp(en['panel.refund_list.clear_confirm.other'].replace('{count}', '2').replace('?', '\\?')));
  // OPS-31 X2: the consequence paragraph is the dialog's accessible description
  assert.equal(await dialog.getAttribute('aria-describedby'), 'refund-list-clear-description');
  assert.match(await page.locator('#refund-list-clear-description').textContent(), /cannot be undone/);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(members.length, 2, 'Escape keeps the list');
  await clear.click();
  await dialog.getByRole('button', { name: en['panel.refund_list.clear'], exact: true }).click();
  await page.getByText(en['panel.refund_list.empty']).waitFor();
  await page.getByRole('status').filter({ hasText: en['panel.refund_list.clear_done'] }).waitFor();
  assert.equal(harness.callsTo('POST /api/refund-list/clear').length, 1);

  // layout at three widths: no horizontal scroll, every control at least 44 px high
  await login.fill('Layout'); await add.click(); await page.getByText('Layout', { exact: true }).waitFor();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const metrics = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      small: [...document.querySelectorAll('.refund-list button, .refund-list input')].filter((node) => !node.closest('dialog')).filter((node) => node.getBoundingClientRect().height < 44 - 0.5).map((node) => node.id || node.textContent.trim()),
    }));
    assert.ok(metrics.overflow <= 0, `no horizontal scroll at ${width} px (overflow ${metrics.overflow})`);
    assert.deepEqual(metrics.small, [], `targets of at least 44 px at ${width} px`);
    // the open confirmation dialog fits the viewport and its buttons are 44 px high too
    await page.getByRole('button', { name: en['panel.refund_list.clear'], exact: true }).click();
    const box = await page.getByRole('dialog').evaluate((node) => ({ width: node.getBoundingClientRect().width, left: node.getBoundingClientRect().left, buttons: [...node.querySelectorAll('button')].map((button) => button.getBoundingClientRect().height) }));
    assert.ok(box.left >= 0 && box.width <= width, `the dialog fits ${width} px`);
    assert.ok(box.buttons.every((height) => height >= 44 - 0.5), `dialog buttons of at least 44 px at ${width} px`);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  }
  assert.deepEqual(harness.external, [], 'no external request');

  console.log('PASS settings refund list browser-only: add with the label prefilled, stable error texts without the server copy, remove with focus handling, clear-all dialog (Escape keeps), CSRF and idempotency headers, no overflow and 44 px targets at 320/390/768.');
  boundary('K74-03/E74-02', 'Persistence, the real Twitch login lookup, the 500 limit under concurrency, screen reader output and a 200% zoom pass remain unproved.');
} finally {
  await harness.close();
}
