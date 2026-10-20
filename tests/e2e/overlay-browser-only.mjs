import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const appOrigin = process.env.APP_ORIGIN ?? 'https://localhost:3000';
const parsedOrigin = new URL(appOrigin);
assert.equal(parsedOrigin.protocol, 'https:', 'browser-only overlay test requires HTTPS');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(parsedOrigin.hostname), 'APP_ORIGIN must be loopback');

const refs = Array.from({ length: 8 }, (_, index) => `REF${String(index).padStart(19, '0')}`);
const tokens = Array.from({ length: 8 }, (_, index) => `${String(index + 1).repeat(43)}`);
const browser = await chromium.launch({
  channel: process.env.CHROME_CHANNEL ?? 'chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const contexts = [];

function widgetPayload(value) {
  return {
    sourceType: 'account_label', value, fallbackText: 'No value', productLocale: 'en',
    messages: { 'overlay.status.unavailable': 'Source unavailable' },
    style: { fontSize: 32, textColor: '#FFFFFF', backgroundColor: '#000000', backgroundOpacity: 0 },
  };
}

try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  contexts.push(context);
  const page = await context.newPage();
  const calls = [];
  let mode = 'ok';
  let activeValue = 'Account 1';
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === parsedOrigin.origin && url.pathname === '/overlay/api/widget') {
      calls.push({ method: request.method(), headers: request.headers() });
      if (mode === 'revoked') return route.fulfill({ status: 403, body: '{}' });
      if (mode === 'stale') return route.fulfill({ status: 503, body: '{}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(widgetPayload(activeValue)) });
    }
    return route.continue();
  });

  await page.goto(`${appOrigin}/overlay.html?ref=${refs[0]}#${tokens[0]}`);
  await page.getByText('Account 1').waitFor();
  assert.equal(new URL(page.url()).hash, '', 'capability fragment is removed from the visible URL');
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), `overlay-capability:${refs[0]}`), tokens[0]);
  const initialCall = calls.find((call) => call.headers.authorization === `Bearer ${tokens[0]}`);
  assert.ok(initialCall, 'widget read carries the fragment capability as a bearer token');
  assert.equal(initialCall.method, 'GET');
  assert.equal(initialCall.headers.cookie, undefined, 'overlay read does not send panel cookies');

  activeValue = 'Account 2';
  await page.getByText('Account 2').waitFor({ timeout: 2500 });
  mode = 'stale';
  await page.waitForFunction(() => document.querySelector('#overlay-widget')?.classList.contains('is-stale'));
  assert.equal(await page.locator('#overlay-value').textContent(), 'Account 2', 'temporary API failure retains last good value');
  mode = 'ok';
  activeValue = 'Account refreshed';
  await page.getByText('Account refreshed').waitFor({ timeout: 2500 });
  await page.waitForFunction(() => !document.querySelector('#overlay-widget')?.classList.contains('is-stale'));

  await page.reload();
  await page.getByText('Account refreshed').waitFor();
  assert.equal(new URL(page.url()).hash, '', 'reload recovers capability from per-reference session storage');
  mode = 'revoked';
  await page.waitForFunction(() => document.querySelector('#overlay-status')?.textContent === 'Source unavailable');
  await page.waitForFunction((key) => sessionStorage.getItem(key) === null, `overlay-capability:${refs[0]}`);
  assert.equal(await page.locator('#overlay-value').textContent(), '', 'revocation clears the rendered value');

  const isolatedPages = [];
  for (let index = 1; index < refs.length; index += 1) {
    const isolatedContext = await browser.newContext({ ignoreHTTPSErrors: true });
    contexts.push(isolatedContext);
    const isolatedPage = await isolatedContext.newPage();
    await isolatedPage.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === parsedOrigin.origin && url.pathname === '/overlay/api/widget') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(widgetPayload(`Account ${index + 1}`)) });
      }
      return route.continue();
    });
    await isolatedPage.goto(`${appOrigin}/overlay.html?ref=${refs[index]}#${tokens[index]}`);
    await isolatedPage.getByText(`Account ${index + 1}`).waitFor();
    isolatedPages.push(isolatedPage);
  }
  for (let index = 1; index < refs.length; index += 1) {
    const storage = await isolatedPages[index - 1].evaluate(() => Object.keys(sessionStorage));
    assert.deepEqual(storage, [`overlay-capability:${refs[index]}`], `source ${index + 1} stores only its own reference capability`);
  }

  console.log(`PASS overlay browser-only: exact Next alias, fragment cleanup, bearer without cookies, stale recovery, reload, revocation, and ${refs.length} isolated sources.`);
  console.log('Boundary: API responses are intercepted fixtures; no database, Twitch, Docker, OBS, or CEF interaction was performed.');
}
finally {
  await Promise.all(contexts.map((context) => context.close()));
  await browser.close();
}
