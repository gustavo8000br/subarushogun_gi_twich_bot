import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const appOrigin = process.env.APP_ORIGIN ?? 'https://localhost:3000';
const origin = new URL(appOrigin);
assert.equal(origin.protocol, 'https:', 'overlay browser-only test requires HTTPS');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'APP_ORIGIN must be loopback');

const sourceTypes = [
  'account_label',
  'called_viewer_display_name',
  'called_viewer_position',
  'queue_name',
  'queue_state',
  'queue_waiting_count',
  'fixed_text',
];
const sources = Array.from({ length: 8 }, (_, index) => {
  const sourceType = sourceTypes[index % sourceTypes.length];
  const ref = `OVERLAY${String(index).padStart(15, '0')}`;
  const token = `${String(index + 1).repeat(43)}`;
  const value = sourceType === 'queue_state' ? 'open' : `${sourceType}:${index}:initial`;
  return { index, sourceType, ref, token, value, nextValue: `${sourceType}:${index}:updated` };
});

const payloads = new Map(sources.map((source) => [source.token, {
  sourceType: source.sourceType,
  value: source.value,
  fallbackText: `fallback:${source.index}`,
  productLocale: 'en',
  messages: { 'overlay.state.open': 'Queue open' },
  style: { fontSize: 24, textColor: '#FFFFFF', backgroundColor: '#000000', backgroundOpacity: 0 },
}]));

const browser = await chromium.launch({
  channel: process.env.CHROME_CHANNEL ?? 'chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const initialOverlayScripts = new Set();
const overlayPages = [];
const allRequests = [];

try {
  await context.route('**/*', async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    if (requestUrl.origin === origin.origin && requestUrl.pathname === '/overlay/api/widget') {
      allRequests.push({
        url: requestUrl.pathname,
        method: request.method(),
        headers: request.headers(),
      });
      const token = (request.headers().authorization ?? '').replace(/^Bearer\s+/i, '');
      const payload = payloads.get(token);
      if (!payload) return route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    }
    return route.continue();
  });

  await Promise.all(sources.map(async (source) => {
    const page = await context.newPage();
    overlayPages[source.index] = page;
    page.on('request', (request) => {
      const requestUrl = new URL(request.url());
      if (requestUrl.origin === origin.origin && request.resourceType() === 'script') initialOverlayScripts.add(requestUrl.pathname);
    });
    await page.goto(`${origin.origin}/overlay?ref=${source.ref}#${source.token}`);
    const expectedInitial = source.sourceType === 'queue_state' ? 'Queue open' : source.value;
    await page.getByText(expectedInitial, { exact: true }).waitFor({ timeout: 15_000 });
    assert.equal(new URL(page.url()).hash, '', `source ${source.index + 1} removes its capability fragment`);
    assert.equal(
      await page.evaluate((key) => sessionStorage.getItem(key), `overlay-capability:${source.ref}`),
      source.token,
      `source ${source.index + 1} stores its own capability under its own reference`,
    );
    assert.equal(await page.locator('#overlay-value').textContent(), expectedInitial);
  }));

  assert.deepEqual(
    new Set(sources.map(({ sourceType }) => sourceType)),
    new Set(sourceTypes),
    'the eight simultaneous overlays include all seven supported source types',
  );
  assert.equal(overlayPages.length, 8);

  for (const request of allRequests) {
    assert.equal(request.method, 'GET');
    assert.ok(request.headers.authorization?.startsWith('Bearer '));
    assert.equal(request.headers.cookie, undefined, 'overlay API requests do not carry panel cookies');
  }

  const updateRounds = 10;
  const startedAt = performance.now();
  for (let round = 1; round <= updateRounds; round += 1) {
    for (const source of sources) {
      const payload = payloads.get(source.token);
      if (source.sourceType === 'queue_state') {
        payload.value = round % 2 === 0 ? 'closed' : 'open';
        payload.messages['overlay.state.open'] = 'Queue open';
        payload.messages['overlay.state.closed'] = 'Queue closed';
      } else {
        payload.value = `${source.nextValue}:${round}`;
      }
    }
  }
  await Promise.all(sources.map(async (source) => {
    const expected = source.sourceType === 'queue_state' ? 'Queue closed' : `${source.nextValue}:${updateRounds}`;
    await overlayPages[source.index].getByText(expected, { exact: true }).waitFor({ timeout: 2_000 });
  }));
  const elapsedMs = performance.now() - startedAt;
  assert.ok(elapsedMs <= 2_000, `all eight overlays rendered the latest of ${updateRounds} rapid fixture revisions within 2,000 ms (observed ${Math.round(elapsedMs)} ms)`);

  const panelPage = await context.newPage();
  const panelScripts = new Set();
  panelPage.on('request', (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.origin === origin.origin && request.resourceType() === 'script') panelScripts.add(requestUrl.pathname);
  });
  await panelPage.goto(`${origin.origin}/queues/`);
  await panelPage.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  assert.ok(panelScripts.size > 0, 'panel route loaded its JavaScript bundle');
  const overlayOnlyPage = overlayPages[0];
  const overlayScripts = new Set();
  overlayOnlyPage.on('request', (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.origin === origin.origin && request.resourceType() === 'script') overlayScripts.add(requestUrl.pathname);
  });
  await overlayOnlyPage.reload();
  await overlayOnlyPage.getByText(`${sources[0].nextValue}:${updateRounds}`, { exact: true }).waitFor({ timeout: 5_000 });
  const panelExclusiveScripts = [...panelScripts].filter((script) => !initialOverlayScripts.has(script));
  assert.ok(panelExclusiveScripts.length > 0, 'panel route exposes route-specific scripts distinct from the overlay');
  for (const script of panelExclusiveScripts) {
    assert.ok(!overlayScripts.has(script), `overlay must not load panel-only bundle ${script}`);
  }

  console.log(`PASS overlay browser-only parity: seven source types, eight simultaneous sources, ${updateRounds} rapid fixture revisions, latest update in ${Math.round(elapsedMs)} ms, and route-bundle isolation.`);
  console.log('Boundary: intermediate rapid revisions are not asserted as individually rendered; API reads were intercepted fixtures, so no PostgreSQL, Twitch, Docker, OBS, or CEF behavior is established.');
}
finally {
  await context.close();
  await browser.close();
}
