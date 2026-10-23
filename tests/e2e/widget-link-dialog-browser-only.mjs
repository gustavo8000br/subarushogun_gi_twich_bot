import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const appOrigin = process.env.APP_ORIGIN ?? 'https://localhost:3000';
const origin = new URL(appOrigin);
assert.equal(origin.protocol, 'https:', 'widget link dialog test requires HTTPS (secure context for the Clipboard API)');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'APP_ORIGIN must be loopback');

const csrfToken = 'csrf-token-for-widget-link-browser-test-00001';
// The shipped English panel catalog is the source of truth for the copy asserted below.
const catalog = Object.fromEntries(readFileSync(new URL('../../apps/web/localization/catalogs/panel/en.tsv', import.meta.url), 'utf8')
  .split('\n').filter((line) => line.includes('\t')).map((line) => {
    const index = line.indexOf('\t');
    return [line.slice(0, index), line.slice(index + 1)];
  }));
const text = (key) => {
  assert.ok(catalog[key], `missing en catalog key ${key}`);
  return catalog[key];
};

const style = {
  textColor: '#FFFFFF', backgroundColor: '#000000', backgroundOpacity: 0, fontFamily: 'system-ui', fontSize: 32,
  fontWeight: 700, alignment: 'center', effect: 'none', outlineWidth: 1, shadowBlur: 0, shadowOffsetX: 0,
  shadowOffsetY: 0, width: 640, height: 100, marginTop: 8, marginRight: 8, marginBottom: 8, marginLeft: 8, overflow: 'wrap',
};
const existing = {
  id: '11111111-1111-4111-8111-111111111111', sourceType: 'fixed_text', queueId: null, fixedText: 'Existing', fallbackText: 'Offline',
  style, version: 3, capabilityVersion: 1, capabilityActive: true, deleted: false,
};
const created = { ...existing, id: '22222222-2222-4222-8222-222222222222', sourceType: 'account_label', fixedText: null, version: 1 };

let secretCounter = 0;
const nextSecret = (ref) => `${origin.origin}/overlay.html?ref=${ref}#e2e-secret-${String(++secretCounter).padStart(4, '0')}-fixture`;

const browser = await chromium.launch({
  channel: process.env.CHROME_CHANNEL ?? 'chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const browserVersion = browser.version();
const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function openPage({ viewport = { width: 1280, height: 900 }, grantClipboard = true } = {}) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block', viewport });
  if (grantClipboard) await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: origin.origin });
  const page = await context.newPage();
  const consoleTexts = [];
  page.on('console', (message) => consoleTexts.push(message.text()));
  const state = { widgets: [existing], lastSecret: null };
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin.origin) return route.abort();
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/health') return route.continue();
    const method = request.method();
    if (url.pathname === '/api/session') return json(route, 200, { csrfToken });
    if (url.pathname === '/api/localization/catalogs') return json(route, 200, { locales: ['en'], modules: { panel: { catalogs: { en: catalog } } } });
    if (url.pathname === '/api/state') return json(route, 200, { product_version: '0.2.0-beta', account: { label: 'Streamer' }, pending_operations: [], product_locale: { locale: 'en', revision: 1 } });
    if (url.pathname === '/api/setup') return json(route, 200, {});
    if (url.pathname === '/health') return json(route, 200, { status: 'ok', dependencies: { database: 'connected', twitch_api: 'connected', twitch_chat: 'connected' } });
    if (url.pathname === '/api/queues' && method === 'GET') return json(route, 200, []);
    if (url.pathname === '/api/overlay-widgets' && method === 'GET') return json(route, 200, state.widgets);
    if (url.pathname === '/api/overlay-widgets' && method === 'POST') {
      state.widgets = [...state.widgets, created];
      state.lastSecret = nextSecret('created');
      return json(route, 201, { widget: created, capabilityUrl: state.lastSecret });
    }
    const regenerate = url.pathname.match(/^\/api\/overlay-widgets\/([^/]+)\/regenerate$/);
    if (regenerate && method === 'POST') {
      const widget = state.widgets.find((item) => item.id === regenerate[1]);
      state.lastSecret = nextSecret(widget.id.slice(0, 8));
      return json(route, 200, { widget: { ...widget, version: widget.version + 1 }, capabilityUrl: state.lastSecret });
    }
    return json(route, 404, { code: 'NOT_FOUND' });
  });
  await page.goto(`${origin.origin}/widgets/`, { timeout: 120_000 });
  await page.getByRole('article').first().waitFor({ timeout: 30_000 });
  return { context, page, state, consoleTexts };
}

const linkDialog = (page) => page.getByRole('dialog', { name: text('panel.widget.link.title') });
const confirmDialog = (page) => page.getByRole('dialog', { name: text('panel.widget.link.confirm_close.title') });
const card = (page, id) => page.locator(`[data-widget-id="${id}"]`);
const focusedText = (page) => page.evaluate(() => document.activeElement?.textContent ?? '');
const focusedIs = (page, locator) => locator.evaluate((element) => element === document.activeElement);
const domHas = async (page, secret) => (await page.content()).includes(secret);

async function regenerate(page, id = existing.id) {
  await card(page, id).getByRole('button', { name: text('panel.widget.action.regenerate') }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: text('panel.dialog.confirm') }).click();
  await linkDialog(page).waitFor();
  assert.equal(await page.getByRole('alertdialog').count(), 0, 'regenerate confirmation closes before the link dialog opens');
}

const results = [];
try {
  // Desktop: guards, reveal/mask, explicit close, regenerate, copy success, focus return.
  {
    const { context, page, state, consoleTexts } = await openPage();
    await regenerate(page);
    const firstSecret = state.lastSecret;
    assert.equal(await focusedText(page), text('panel.widget.copy_link'), 'initial focus is Copy link');
    assert.equal(await domHas(page, firstSecret), false, 'masked link is not in the DOM');
    assert.equal(await page.locator('dialog.widget-link-dialog').getAttribute('closedby'), 'none');

    await page.mouse.click(4, 4);
    await page.mouse.click(4, 840);
    assert.equal(await linkDialog(page).isVisible(), true, 'backdrop clicks do not dismiss');

    await page.keyboard.press('Escape');
    await confirmDialog(page).waitFor();
    assert.equal(await focusedText(page), text('panel.widget.link.confirm_close.back'), 'confirm view focuses Back to the link');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal(await confirmDialog(page).isVisible(), true, 'repeated Escape without activation keeps the dialog open');
    await page.getByRole('button', { name: text('panel.widget.link.confirm_close.back') }).click();
    await linkDialog(page).waitFor();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('dialog.widget-link-dialog[open]').count(), 1, 'double Escape from the link view keeps the modal open');
    await page.getByRole('button', { name: text('panel.widget.link.confirm_close.back') }).click();
    results.push('backdrop click and Escape x2 (both views) keep the dialog open');

    await linkDialog(page).getByRole('button', { name: text('panel.widget.link.show') }).click();
    const field = linkDialog(page).locator('input.widget-link-value');
    assert.equal(await field.inputValue(), firstSecret, 'revealed field shows the exact link');
    assert.equal(await field.getAttribute('type'), 'text');
    await linkDialog(page).getByRole('button', { name: text('panel.widget.link.hide') }).click();
    assert.equal(await domHas(page, firstSecret), false, 'hiding removes the link from the DOM');
    results.push('reveal shows the exact URL; hide removes it from the DOM');

    await linkDialog(page).getByRole('button', { name: text('panel.widget.link.done') }).click();
    await confirmDialog(page).waitFor();
    await page.getByRole('button', { name: text('panel.widget.link.confirm_close.confirm') }).click();
    await page.locator('dialog.widget-link-dialog').waitFor({ state: 'detached' });
    await page.getByText(text('panel.widget.notice.link_closed_uncopied')).waitFor();
    const regenerateButton = card(page, existing.id).getByRole('button', { name: text('panel.widget.action.regenerate') });
    await page.waitForFunction(() => document.activeElement?.dataset?.widgetAction === 'regenerate');
    assert.equal(await focusedIs(page, regenerateButton), true, 'Close anyway returns focus to the card regenerate button');
    assert.equal(await domHas(page, firstSecret), false);
    results.push('explicit Done -> Close anyway closes, shows the regenerate notice, focus returns to the card');

    await regenerate(page);
    const secondSecret = state.lastSecret;
    assert.notEqual(secondSecret, firstSecret);
    await linkDialog(page).getByRole('button', { name: text('panel.widget.copy_link') }).click();
    await linkDialog(page).getByRole('status').filter({ hasText: text('panel.widget.link.copied') }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), secondSecret, 'clipboard holds the exact link');
    assert.equal(await linkDialog(page).getByRole('alert').innerText(), '');
    assert.equal(await domHas(page, secondSecret), false, 'copying while masked keeps the link out of the DOM');
    await page.keyboard.press('Escape');
    await page.locator('dialog.widget-link-dialog').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.dataset?.widgetAction === 'regenerate');
    results.push('regenerate -> copy success (clipboard readText matches) -> Escape closes after copy, focus on card');

    await page.getByRole('button', { name: text('panel.widgets.create') }).first().click();
    await page.getByRole('button', { name: text('panel.widget.save') }).click();
    await linkDialog(page).waitFor();
    await linkDialog(page).getByRole('button', { name: text('panel.widget.copy_link') }).click();
    await linkDialog(page).getByRole('status').filter({ hasText: text('panel.widget.link.copied') }).waitFor();
    await linkDialog(page).getByRole('button', { name: text('panel.widget.link.done') }).click();
    await page.locator('dialog.widget-link-dialog').waitFor({ state: 'detached' });
    await page.waitForFunction((id) => document.activeElement?.dataset?.widgetAction === 'edit'
      && document.activeElement.closest('[data-widget-id]')?.dataset.widgetId === id, created.id);
    results.push('create -> copy -> Done returns focus to the new card Edit button');

    for (const entry of consoleTexts) assert.ok(!entry.includes('e2e-secret-'), 'no console output contains the secret');
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + location.href);
    assert.ok(!storage.includes('e2e-secret-'), 'no storage/URL contains the secret');

    // beforeunload guard while uncopied.
    await regenerate(page);
    await linkDialog(page).getByRole('button', { name: text('panel.widget.link.show') }).click();
    const unloadPrompt = new Promise((resolve) => page.once('dialog', (dialog) => { resolve(dialog.type()); void dialog.accept(); }));
    await page.close({ runBeforeUnload: true });
    assert.equal(await Promise.race([unloadPrompt, new Promise((resolve) => setTimeout(() => resolve('none'), 5000))]), 'beforeunload');
    results.push('uncopied link fires the beforeunload prompt');
    await context.close();
  }

  // Copy failure: clipboard-write permission denied through the browser permission API.
  {
    const { context, page } = await openPage({ grantClipboard: false });
    const cdp = await context.newCDPSession(page);
    let mode = 'permission denied (CDP Browser.setPermission)';
    try {
      for (const name of ['clipboard-write', 'clipboard-sanitized-write']) {
        await cdp.send('Browser.setPermission', { permission: { name }, setting: 'denied', origin: origin.origin }).catch(() => {});
      }
    } catch { /* fall through to override */ }
    const permissionState = await page.evaluate(() => navigator.permissions.query({ name: 'clipboard-write' }).then((status) => status.state, () => 'unknown'));
    if (permissionState !== 'denied') {
      mode = `writeText rejected via page override (permission state after CDP denial: ${permissionState})`;
      await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); });
    }
    await regenerate(page);
    await linkDialog(page).getByRole('button', { name: text('panel.widget.copy_link') }).click();
    await linkDialog(page).getByRole('alert').filter({ hasText: text('panel.widget.link.copy_fallback') }).waitFor({ timeout: 5000 });
    assert.equal(await linkDialog(page).getByRole('status').innerText(), '');
    await linkDialog(page).getByRole('button', { name: text('panel.widget.link.done') }).click();
    await confirmDialog(page).waitFor();
    results.push(`copy failure shows the fallback alert and Done still asks for confirmation [${mode}]`);
    await context.close();
  }

  // Mobile 390x844: no horizontal scroll, every action visible and >= 44 px tall.
  {
    const { context, page } = await openPage({ viewport: { width: 390, height: 844 } });
    await regenerate(page);
    await linkDialog(page).getByRole('button', { name: text('panel.widget.link.show') }).click();
    for (const view of ['link', 'confirm']) {
      const scope = view === 'link' ? linkDialog(page) : confirmDialog(page);
      const metrics = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      assert.ok(metrics.scroll <= metrics.client, `${view}: no horizontal page scroll (${metrics.scroll} > ${metrics.client})`);
      const dialogBox = await page.locator('dialog.widget-link-dialog').boundingBox();
      assert.ok(dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= 390, `${view}: dialog fits the viewport`);
      for (const button of await scope.getByRole('button').all()) {
        await button.scrollIntoViewIfNeeded();
        const box = await button.boundingBox();
        assert.ok(box && box.height >= 44, `${view}: button at least 44 px tall`);
        assert.ok(box.x >= 0 && box.x + box.width <= 390, `${view}: button within the viewport width`);
      }
      if (view === 'link') await linkDialog(page).getByRole('button', { name: text('panel.widget.link.done') }).click();
    }
    results.push('390x844: dialog and every action fit horizontally, buttons >= 44 px, link and confirm views');
    await context.close();
  }

  for (const line of results) console.log(`PASS ${line}`);
  console.log(`PASS widget one-time link dialog browser-only (Chromium ${browserVersion}).`);
  console.log('Boundary: all API responses were intercepted fixtures; no live API, PostgreSQL, Twitch, Docker, OBS, CEF or assistive technology was used.');
}
finally {
  await browser.close();
}
