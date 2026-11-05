import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

// TS-10 (AC-TS10-7): the two layout contracts of the removed vanilla panel that only a real browser can prove on the Next panel:
// a visible keyboard focus ring on panel navigation controls, and command-policy cards stacked to one column at narrow widths.
const appOrigin = process.env.APP_ORIGIN ?? 'https://localhost:3000';
const origin = new URL(appOrigin);
assert.equal(origin.protocol, 'https:', 'panel layout test requires HTTPS');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'APP_ORIGIN must be loopback');

const csrfToken = 'csrf-token-for-panel-layout-browser-test-0001';
const catalog = Object.fromEntries(readFileSync(new URL('../../apps/shared/localization/catalogs/panel/en.tsv', import.meta.url), 'utf8')
  .trim().split('\n').map((line) => { const i = line.indexOf('\t'); return [line.slice(0, i), line.slice(i + 1)]; }));
const policy = (minimumRole, kind = 'fixed') => ({ kind, minimumRole });
const command = (key, access) => ({ key, scope: key.startsWith('global') ? 'global' : 'queue', syntax: `!${key}`, description: key, access, policy: access, configurable: access.kind === 'configurable' });
const commandCatalog = {
  schemaVersion: 3, version: 1, followerScopeReady: true,
  configurableRoles: ['everyone', 'follower', 'subscriber', 'vip', 'moderator'],
  commands: [
    command('queue:lista', policy('follower', 'configurable')), command('queue:entrar', policy('everyone', 'configurable')),
    command('queue:atender', policy('moderator')), command('global:conta:reset', policy('streamer')), command('queue:presente', policy('everyone')),
  ],
};

const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

try {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin.origin) return route.abort();
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/health') return route.continue();
    if (url.pathname === '/api/session') return route.fulfill(json({ csrfToken }));
    if (url.pathname === '/api/localization/catalogs') return route.fulfill(json({ locales: ['en'], modules: { panel: { catalogs: { en: catalog } } } }));
    if (url.pathname === '/api/state') return route.fulfill(json({ product_version: '0.2.0-beta', account: { label: 'Streamer' }, pending_operations: [], product_locale: { locale: 'en', revision: 1 } }));
    if (url.pathname === '/api/setup') return route.fulfill(json({}));
    if (url.pathname === '/api/queues') return route.fulfill(json([]));
    if (url.pathname === '/health') return route.fulfill(json({ status: 'ok', dependencies: { database: 'connected', twitch_api: 'connected' } }));
    if (url.pathname === '/api/command-catalog') return route.fulfill(json(commandCatalog));
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'NOT_FOUND' }) });
  });

  // Focus ring on panel navigation controls (keyboard focus only).
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${origin.origin}/`);
  await page.getByRole('navigation', { name: catalog['panel.navigation.label'] }).waitFor({ timeout: 15_000 });
  let ring = null;
  for (let step = 0; step < 12 && !ring; step += 1) {
    await page.keyboard.press('Tab');
    ring = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || !el.closest('nav') || !el.matches(':focus-visible')) return null;
      const style = getComputedStyle(el);
      const probe = (color) => { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = color; c.fillRect(0, 0, 1, 1); return [...c.getImageData(0, 0, 1, 1).data]; };
      let surface = el; let background = [0, 0, 0, 0];
      while (surface && background[3] === 0) { background = probe(getComputedStyle(surface).backgroundColor); surface = surface.parentElement; }
      return { tag: el.tagName, width: Number.parseFloat(style.outlineWidth), style: style.outlineStyle, color: probe(style.outlineColor), background };
    });
  }
  assert.ok(ring, 'keyboard Tab reaches a navigation control with :focus-visible');
  assert.ok(ring.width >= 2 && ring.style !== 'none', `navigation focus ring is at least 2px and drawn (${ring.width}px ${ring.style})`);
  const luminance = ([r, g, b]) => [r, g, b].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const [light, dark] = [luminance(ring.color), luminance(ring.background)].sort((a, b) => b - a);
  const contrast = (light + 0.05) / (dark + 0.05);
  assert.ok(contrast >= 3, `navigation focus ring contrast against its surface is at least 3:1 (${contrast.toFixed(2)})`);

  // Command-policy cards stack to one column at 390 px and keep two columns on desktop; the page never scrolls sideways.
  await page.goto(`${origin.origin}/commands/`);
  await page.locator('.command-policy-card').first().waitFor({ timeout: 15_000 });
  const columns = () => page.evaluate(() => ({
    grids: [...document.querySelectorAll('.command-policy-grid')].map((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  const wide = await columns();
  assert.ok(wide.grids.length >= 1 && wide.grids.some((count) => count === 2), `desktop keeps two columns (${wide.grids})`);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const narrow = await columns();
    assert.ok(narrow.grids.length >= 1 && narrow.grids.every((count) => count === 1), `command-policy cards stack to one column at ${width}px (${narrow.grids})`);
    assert.ok(narrow.overflow <= 0, `no horizontal page overflow at ${width}px (${narrow.overflow}px)`);
  }

  console.log('PASS TS-10 panel layout browser-only: navigation focus ring visible with 3:1 contrast, command-policy cards stacked to one column at 390 and 320 px, no horizontal overflow.');
  console.log('Boundary: all API responses were intercepted fixtures; axe-core is not a project dependency, so no automated axe scan ran.');
} finally {
  await context.close();
  await browser.close();
}
