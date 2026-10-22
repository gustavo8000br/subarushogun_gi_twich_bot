import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { composeEnvironmentForOrigin } from '../helpers/compose-origin-environment.mjs';
import { createObsWebSocketAuthentication } from '../helpers/obs-websocket-auth.mjs';
import { decodeRgbaPng } from '../helpers/png-alpha.mjs';
import { withTimeout } from '../helpers/with-timeout.mjs';

const appOrigin = process.env.APP_ORIGIN ?? 'https://localhost:3437';
const obsWebSocketUrl = process.env.OBS_WS_URL ?? 'ws://127.0.0.1:4455';
const cdpOrigin = process.env.OBS_CDP_URL ?? 'http://127.0.0.1:9222';
const widgetCount = 8;
const rounds = 10;
const updateLimitMs = 2_000;
const composeProject = process.env.OBS_COMPOSE_PROJECT;
const runId = randomUUID().slice(0, 8);
const created = [];

class ObsWebSocket {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.pending = new Map();
    this.sequence = 0;
    this.ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('OBS WebSocket handshake timed out')), 8_000);
      this.socket.addEventListener('error', () => reject(new Error('OBS WebSocket could not connect')), { once: true });
      this.socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.op === 0) {
          const identify = { rpcVersion: message.d.rpcVersion };
          if (message.d.authentication) {
            const password = process.env.OBS_WS_PASSWORD;
            if (!password) {
              clearTimeout(timeout);
              reject(new Error('OBS WebSocket password is required when authentication is enabled'));
              this.socket.close();
              return;
            }
            identify.authentication = createObsWebSocketAuthentication(
              password,
              message.d.authentication.salt,
              message.d.authentication.challenge,
            );
          }
          this.socket.send(JSON.stringify({ op: 1, d: identify }));
        }
        else if (message.op === 2) { clearTimeout(timeout); resolve(); }
        else if (message.op === 7) {
          const pending = this.pending.get(message.d.requestId);
          if (!pending) return;
          this.pending.delete(message.d.requestId);
          if (message.d.requestStatus.result) pending.resolve(message.d.responseData ?? {});
          else pending.reject(new Error(`OBS rejected ${message.d.requestType} (${message.d.requestStatus.code})`));
        }
      });
    });
  }

  async request(requestType, requestData = {}) {
    await this.ready;
    const requestId = `fnd7-${++this.sequence}`;
    const result = new Promise((resolve, reject) => this.pending.set(requestId, { resolve, reject }));
    this.socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
    return withTimeout(result, 8_000, `OBS ${requestType} request timed out`).finally(() => this.pending.delete(requestId));
  }

  close() { this.socket.close(); }
}

class CdpPage {
  constructor(target) {
    this.socket = new WebSocket(target.webSocketDebuggerUrl);
    this.pending = new Map();
    this.sequence = 0;
    this.ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('CEF DevTools handshake timed out')), 8_000);
      this.socket.addEventListener('error', () => reject(new Error('CEF DevTools could not connect')), { once: true });
      this.socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); });
      this.socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (!message.id) return;
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      });
    });
  }

  async evaluate(expression) {
    await this.ready;
    const id = ++this.sequence;
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    return (await withTimeout(result, 5_000, 'CEF DevTools evaluation timed out')).result.value;
  }

  close() { this.socket.close(); }
}

async function apiSession() {
  const response = await fetch(`${appOrigin}/api/session`, { headers: { origin: appOrigin } });
  assert.equal(response.status, 200, 'local session must be available');
  const cookie = response.headers.getSetCookie()[0]?.split(';')[0];
  const { csrfToken } = await response.json();
  assert.ok(cookie && csrfToken, 'local session must provide cookie and CSRF token');
  return { cookie, csrfToken };
}

function style() {
  return {
    textColor: '#FFFFFF', backgroundColor: '#000000', backgroundOpacity: 0,
    fontFamily: 'system-ui', fontSize: 38, fontWeight: 700, alignment: 'center', effect: 'none',
    outlineWidth: 1, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
    width: 640, height: 100, marginTop: 8, marginRight: 8, marginBottom: 8, marginLeft: 8, overflow: 'wrap',
  };
}

async function mutate(session, widget, method, path, payload) {
  const response = await fetch(`${appOrigin}${path}`, {
    method,
    headers: { origin: appOrigin, cookie: session.cookie, 'x-csrf-token': session.csrfToken, 'idempotency-key': randomUUID(), 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.ok(response.ok, `widget API ${method} must succeed (received ${response.status})`);
  const result = await response.json();
  if (widget && result.version) widget.version = result.version;
  return result;
}

async function findPagesByValue(expectedValues, excludedIds) {
  const targets = await (await fetch(`${cdpOrigin}/json/list`)).json();
  const candidates = targets.filter((target) => target.type === 'page' && target.url.startsWith(`${appOrigin}/overlay.html`) && !excludedIds.has(target.id));
  const pages = candidates.map((target) => ({ target, page: new CdpPage(target) }));
  const assigned = new Map();
  for (const { target, page } of pages) {
    try {
      const text = await page.evaluate("document.querySelector('#overlay-value')?.textContent ?? ''");
      const index = expectedValues.indexOf(text);
      if (index !== -1 && !assigned.has(index)) assigned.set(index, { target, page });
      else page.close();
    } catch { page.close(); }
  }
  return assigned;
}

async function waitForAllPages(expectedValues, excludedIds, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let assigned = new Map();
  while (Date.now() < deadline) {
    assigned = await findPagesByValue(expectedValues, excludedIds);
    if (assigned.size === widgetCount) return assigned;
    for (const { page } of assigned.values()) page.close();
    await delay(150);
  }
  assert.equal(assigned.size, widgetCount, 'all OBS Browser Sources must render their current widget value');
  return assigned;
}

async function waitForValue(page, expected, deadline) {
  while (Date.now() < deadline) {
    const result = JSON.parse(await page.evaluate("JSON.stringify({value:document.querySelector('#overlay-value')?.textContent ?? '',hashLength:location.hash.length,background:getComputedStyle(document.body).backgroundColor,fontSize:getComputedStyle(document.querySelector('#overlay-widget')).fontSize})"));
    if (result.value === expected) return result;
    await delay(60);
  }
  return null;
}

async function overlayState(page) {
  return JSON.parse(await page.evaluate("JSON.stringify({value:document.querySelector('#overlay-value')?.textContent ?? '',status:document.querySelector('#overlay-status')?.textContent ?? '',stale:document.querySelector('#overlay-widget')?.classList.contains('is-stale') ?? false,hashLength:location.hash.length})"));
}

async function waitForOverlayState(page, predicate, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  let state;
  while (Date.now() < deadline) {
    try {
      state = await overlayState(page);
      if (predicate(state)) return state;
    } catch { /* A reload temporarily destroys the page execution context. */ }
    await delay(100);
  }
  assert.fail(`${message}: ${JSON.stringify(state)}`);
}

function compose(args) {
  assert.match(composeProject ?? '', /^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/, 'OBS_COMPOSE_PROJECT must explicitly name the isolated test project');
  execFileSync('docker', ['compose', '-p', composeProject, ...args], { stdio: 'ignore', env: composeEnvironmentForOrigin(appOrigin, process.env) });
}

async function waitForBotHealth(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${appOrigin}/health`);
      const health = await response.json();
      if (response.ok && health.status === 'ok' && health.dependencies?.database === 'connected') return;
    } catch { /* Retry until Compose brings the API back. */ }
    await delay(300);
  }
  assert.fail('Bot did not become healthy after Compose restart');
}

async function verifyRecoveryAndRotation(obs, widget, assigned, inputNames, session, baselineIds) {
  if (!composeProject) return false;
  const source = assigned.get(0).page;
  const beforeStop = await overlayState(source);
  assert.equal(beforeStop.value, widget.expected, 'native OBS source must show current value before stopping the bot');
  assert.equal(beforeStop.hashLength, 0, 'native OBS must remove the capability fragment after loading');
  let botStopped = false;
  try {
    compose(['stop', 'bot']);
    botStopped = true;
    await waitForOverlayState(source, (state) => state.value === widget.expected && state.status === 'Atualização atrasada' && state.stale, 15_000, 'OBS must retain the current value and mark it stale while the bot is stopped');

    compose(['up', '-d', 'bot']);
    await waitForBotHealth();
    botStopped = false;
    Object.assign(session, await apiSession());
    await waitForOverlayState(source, (state) => state.value === widget.expected && state.status === '' && !state.stale, 15_000, 'OBS must recover and clear the stale marker when the bot returns');

    await assigned.get(0).page.evaluate('location.reload()');
    await waitForOverlayState(assigned.get(0).page, (state) => state.value === widget.expected && state.status === '' && state.hashLength === 0 && !state.stale, 10_000, 'reloaded OBS Browser Source must recover its capability and fetch current data again');

    const rotated = await mutate(session, widget, 'POST', `/api/overlay-widgets/${widget.id}/regenerate`, { expectedVersion: widget.version });
    widget.version = rotated.widget.version;
    widget.capabilityUrl = rotated.capabilityUrl;
    await waitForOverlayState(assigned.get(0).page, (state) => state.value === '' && state.status === 'Fonte indisponível', 10_000, 'the old OBS capability must clear after rotation');

    for (const { page } of assigned.values()) page.close();
    await obs.request('RemoveInput', { inputName: inputNames[0] });
    inputNames[0] = `FND7 ${runId} 0 rotated`;
    await obs.request('CreateInput', { sceneName: 'Scene', inputName: inputNames[0], inputKind: 'browser_source', inputSettings: { url: widget.capabilityUrl, width: 640, height: 100, shutdown: false, webpage_control_level: 0 }, sceneItemEnabled: true });
    const rotatedPages = await waitForAllPages(widget.expectedValues, baselineIds, 10_000);
    assigned.clear();
    for (const [index, page] of rotatedPages) assigned.set(index, page);
    await waitForOverlayState(assigned.get(0).page, (state) => state.value === widget.expected && state.status === '' && state.hashLength === 0 && !state.stale, 10_000, 'the regenerated capability must render current data in OBS');
    return true;
  } finally {
    if (botStopped) {
      compose(['up', '-d', 'bot']);
      await waitForBotHealth();
    }
  }
}

async function sourceImage(obs, inputName) {
  const { imageData } = await obs.request('GetSourceScreenshot', { sourceName: inputName, imageFormat: 'png' });
  return decodeRgbaPng(Buffer.from(imageData.slice(imageData.indexOf(',') + 1), 'base64'));
}

async function verifyTransparencyAndResize(obs, inputName, page) {
  const image = await sourceImage(obs, inputName);
  assert.deepEqual([image.width, image.height], [640, 100], 'OBS must render the Browser Source at its configured size');
  for (const [x, y] of [[1, 1], [638, 1], [1, 98], [638, 98]]) assert.equal(image.alphaAt(x, y), 0, `corner ${x},${y} must stay fully transparent in the OBS compositor`);
  let opaque = 0;
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) if (image.alphaAt(x, y) > 0) opaque += 1;
  assert.ok(opaque > 40, 'the widget text must produce visible pixels');
  assert.ok(opaque < image.width * image.height * 0.5, 'the widget must not paint an opaque background');

  const settings = (await obs.request('GetInputSettings', { inputName })).inputSettings;
  await obs.request('SetInputSettings', { inputName, inputSettings: { ...settings, width: 320, height: 60 }, overlay: true });
  const deadline = Date.now() + 10_000;
  let viewport;
  while (Date.now() < deadline) {
    viewport = await page.evaluate('innerWidth + "x" + innerHeight').catch(() => undefined);
    if (viewport === '320x60') break;
    await delay(150);
  }
  assert.equal(viewport, '320x60', 'CEF viewport must follow the OBS Browser Source resize');
  const resized = await sourceImage(obs, inputName);
  assert.deepEqual([resized.width, resized.height], [320, 60], 'OBS output must follow the resize');
  assert.equal(resized.alphaAt(1, 1), 0, 'transparency must survive the resize');
  await obs.request('SetInputSettings', { inputName, inputSettings: { ...settings, width: 640, height: 100 }, overlay: true });
  return true;
}

async function main() {
  const session = await apiSession();
  const obs = new ObsWebSocket(obsWebSocketUrl);
  const baselineTargets = await (await fetch(`${cdpOrigin}/json/list`)).json();
  const baselineIds = new Set(baselineTargets.map((target) => target.id));
  const inputNames = [];
  try {
    for (let index = 0; index < widgetCount; index += 1) {
      const widget = { version: 1, expected: `FND7-${runId}-${index}-0` };
      const result = await mutate(session, null, 'POST', '/api/overlay-widgets', { sourceType: 'fixed_text', fixedText: widget.expected, fallbackText: 'Aguardando atualização', style: style() });
      widget.id = result.widget.id;
      widget.version = result.widget.version;
      widget.capabilityUrl = result.capabilityUrl;
      widget.name = `FND7 ${runId} ${index}`;
      created.push(widget);
      await obs.request('CreateInput', { sceneName: 'Scene', inputName: widget.name, inputKind: 'browser_source', inputSettings: { url: result.capabilityUrl, width: 640, height: 100, shutdown: false, webpage_control_level: 0 }, sceneItemEnabled: true });
      inputNames.push(widget.name);
      assert.equal(widget.version, 1, 'new widgets begin at version 1');
    }

    let assigned = await waitForAllPages(created.map((widget) => widget.expected), baselineIds);
    for (let index = 0; index < widgetCount; index += 1) {
      const sourceSettings = await obs.request('GetInputSettings', { inputName: inputNames[index] });
      assert.equal(sourceSettings.inputSettings.webpage_control_level, 0, 'Page Permissions must be None');
    }
    for (const { page } of assigned.values()) {
      const proof = JSON.parse(await page.evaluate("JSON.stringify({hashLength:location.hash.length,background:getComputedStyle(document.body).backgroundColor,fontSize:getComputedStyle(document.querySelector('#overlay-widget')).fontSize})"));
      assert.deepEqual(proof, { hashLength: 0, background: 'rgba(0, 0, 0, 0)', fontSize: '38px' }, 'CEF must hide the secret, preserve transparency, and apply the selected style');
    }

    await verifyTransparencyAndResize(obs, inputNames[0], assigned.get(0).page);

    const measurements = [];
    for (let round = 1; round <= rounds; round += 1) {
      const commits = [];
      for (let index = 0; index < widgetCount; index += 1) {
        const widget = created[index];
        widget.expected = `FND7-${runId}-${index}-${round}`;
        const result = await mutate(session, widget, 'PATCH', `/api/overlay-widgets/${widget.id}`, { expectedVersion: widget.version, changes: { fixedText: widget.expected } });
        commits.push({ index, updatedAt: Date.parse(result.updatedAt), expected: widget.expected });
      }
      for (const commit of commits) {
        const current = assigned.get(commit.index);
        const rendered = await waitForValue(current.page, commit.expected, Date.now() + updateLimitMs);
        assert.ok(rendered, `widget ${commit.index + 1}, round ${round} must render within ${updateLimitMs} ms`);
        const elapsedMs = Date.now() - commit.updatedAt;
        measurements.push(elapsedMs);
        assert.ok(elapsedMs <= updateLimitMs, `widget ${commit.index + 1}, round ${round} rendered in ${elapsedMs} ms`);
      }
    }
    for (const widget of created) widget.expectedValues = created.map((candidate) => candidate.expected);
    const recoveryVerified = await verifyRecoveryAndRotation(obs, created[0], assigned, inputNames, session, baselineIds);
    console.log(`OBS Browser Source E2E passed: OBS ${process.env.OBS_VERSION ?? 'version not supplied'}, CEF ${process.env.CEF_VERSION ?? 'version not supplied'}, ${widgetCount} active widgets, ${measurements.length} database-commit-to-DOM updates, max ${Math.max(...measurements)} ms, all <= ${updateLimitMs} ms; TLS secure, Page Permissions=None, token fragment removed, OBS compositor transparency and Browser Source resize verified${recoveryVerified ? ', bot stop/restart, Browser Source unload/reload, and capability rotation recovered' : ''}.`);
  } finally {
    for (const { page } of (await waitForAllPages(created.map((widget) => widget.expected), baselineIds, 1_000).catch(() => new Map())).values()) page.close();
    for (const inputName of inputNames) await obs.request('RemoveInput', { inputName }).catch(() => undefined);
    for (const widget of created) await mutate(session, widget, 'DELETE', `/api/overlay-widgets/${widget.id}`, { expectedVersion: widget.version }).catch(() => undefined);
    obs.close();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
