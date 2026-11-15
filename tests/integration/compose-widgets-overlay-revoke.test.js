/* global document, sessionStorage */
import { randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import https from 'node:https';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright-core';
import { cleanupIsolatedComposeProject } from '../helpers/isolated-compose-cleanup.mjs';

// E2 (flow-and-chat-review.md), Layer C: /widgets create capability -> open the overlay URL -> revoke in the panel UI ->
// the overlay stops rendering within the poll window. Real Next + Fastify + PostgreSQL in a throwaway Compose project
// (queuebot-accept-<pid>-<hex>, so the existing cleanup guard applies) and real Chromium. NOT OBS/CEF (E8), not Twitch.
const root = fileURLToPath(new URL('../../', import.meta.url));
const runId = `${process.pid}-${randomUUID().slice(0, 8)}`;
const projectName = `queuebot-accept-${runId}`;
const imageTag = `ops15-e2-${runId}`;
const composeFile = `${root}/compose.yaml`;
const buildComposeFile = `${root}/compose.build.yaml`;
const scratchRoot = join(root, '.local', 'ops15-e2e');
let hostPort;
let started = false;
let localCertDirectory;
let communityCatalogDirectory;
const chromeAvailable = spawnSync(process.env.CHROME_BINARY ?? 'google-chrome', ['--version'], { encoding: 'utf8' }).status === 0;
const browserTest = chromeAvailable ? it : it.skip;

function dockerCompose(args, options = {}) {
  const result = spawnSync('docker', ['compose', '--project-name', projectName, '--file', composeFile, '--file', buildComposeFile, ...args], {
    cwd: root, encoding: 'utf8', timeout: options.timeout ?? 180_000,
    env: { ...process.env, APP_PORT: String(hostPort), IMAGE_TAG: imageTag, LOCAL_CERT_DIRECTORY: localCertDirectory, LOCAL_COMMUNITY_CATALOG_DIRECTORY: communityCatalogDirectory },
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `docker compose ${args.join(' ')} failed`);
  return result.stdout.trim();
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const pending = https.request(`https://127.0.0.1:${hostPort}${path}`, { headers, rejectUnauthorized: false, timeout: 3000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    pending.on('error', reject);
    pending.on('timeout', () => pending.destroy(new Error(`HTTPS ${path} timed out`)));
    pending.end();
  });
}

async function waitForHealthy() {
  let last;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try { const response = await get('/health'); if (response.status === 200) return; last = new Error(`health ${response.status}`); } catch (error) { last = error; }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw last ?? new Error('bot never became healthy');
}

describe('E2 widgets capability create -> overlay -> revoke (isolated Compose, real Chromium)', () => {
  beforeAll(async () => {
    mkdirSync(scratchRoot, { recursive: true });
    localCertDirectory = mkdtempSync(join(scratchRoot, 'tls-'));
    communityCatalogDirectory = mkdtempSync(join(scratchRoot, 'catalogs-'));
    chmodSync(communityCatalogDirectory, 0o755);
    for (const moduleName of ['chat', 'lifecycle', 'overlay', 'panel', 'setup']) mkdirSync(join(communityCatalogDirectory, moduleName), { mode: 0o755 });
    hostPort = await freePort();
    dockerCompose(['build', 'bot'], { timeout: 480_000 });
    started = true;
    dockerCompose(['up', '--detach', 'bot']);
  }, 540_000);

  afterAll(() => {
    if (started) {
      cleanupIsolatedComposeProject({
        projectName, composeFile,
        runDocker: (args) => spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 60_000 }),
      });
    }
    spawnSync('docker', ['image', 'rm', `ghcr.io/gustavo8000br/subarushogun_gi_twich_bot:${imageTag}`], { cwd: root, encoding: 'utf8', timeout: 60_000 });
    for (const directory of [localCertDirectory, communityCatalogDirectory]) if (directory) rmSync(directory, { recursive: true, force: true });
  });

  browserTest('a created widget capability renders in the overlay and stops rendering after the panel revokes it', async () => {
    await waitForHealthy();
    const origin = `https://127.0.0.1:${hostPort}`;
    const probeText = `E2 revoke probe ${randomUUID().slice(0, 6)}`;
    const browser = await chromium.launch({ ...(process.env.CHROME_BINARY ? { executablePath: process.env.CHROME_BINARY } : { channel: 'chrome' }), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    try {
      const panelContext = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' });
      const panel = await panelContext.newPage();
      // Cold start: the first Next.js compile of /widgets/ plus the first catalog fetch can exceed 90 s on a cold Docker/CPU cache
      // (observed once, 2026-11-14). Warm the route explicitly with a generous bound, then assert the catalogs response with the
      // same strict check; a real failure (non-2xx or never arriving) still fails the test.
      const catalogsReady = panel.waitForResponse((response) => new URL(response.url()).pathname === '/api/localization/catalogs', { timeout: 180_000 });
      await panel.goto(`${origin}/widgets/`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
      const catalogsResponse = await catalogsReady;
      expect(catalogsResponse.ok(), `localization catalogs responded ${catalogsResponse.status()}`).toBe(true);

      // Create a fixed-text widget through the real UI; read the one-time link from the link dialog.
      await panel.getByRole('button', { name: 'Criar widget' }).first().click();
      await panel.locator('select[name="sourceType"]').selectOption('fixed_text');
      await panel.locator('textarea[name="fixedText"]').fill(probeText);
      const created = panel.waitForResponse((response) => new URL(response.url()).pathname === '/api/overlay-widgets' && response.request().method() === 'POST', { timeout: 30_000 });
      await panel.getByRole('button', { name: 'Salvar widget' }).click();
      expect((await created).status()).toBe(201);
      const dialog = panel.getByRole('dialog', { name: 'Copie este link para o OBS' });
      await dialog.waitFor({ timeout: 30_000 });
      await dialog.getByRole('button', { name: 'Mostrar link' }).click();
      const capabilityUrl = await dialog.locator('input.widget-link-value').inputValue();
      const overlayUrl = new URL(capabilityUrl);
      overlayUrl.protocol = 'https:';
      overlayUrl.host = new URL(origin).host;
      expect(overlayUrl.pathname).toMatch(/overlay/);
      await dialog.getByRole('button', { name: 'Pronto, copiei o link' }).click();
      const confirmClose = panel.getByRole('button', { name: 'Fechar mesmo assim' });
      if (await confirmClose.isVisible({ timeout: 1500 }).catch(() => false)) await confirmClose.click();
      await panel.locator('dialog.widget-link-dialog').waitFor({ state: 'detached', timeout: 15_000 });

      // The capability renders in the overlay (separate browser context: no panel session, only the bearer capability).
      const overlayContext = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' });
      const overlay = await overlayContext.newPage();
      await overlay.goto(overlayUrl.href, { waitUntil: 'domcontentloaded' });
      await overlay.waitForFunction((text) => document.getElementById('overlay-value')?.textContent === text, probeText, { timeout: 30_000 });

      // Revoke in the panel UI; the overlay must clear within the 1 s poll window (+ margin), and the API must refuse the old bearer.
      await panel.locator('[data-widget-id]').first().getByRole('button', { name: /^Revogar:/ }).click();
      await panel.getByRole('alertdialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
      await panel.getByText('Link do widget revogado.').waitFor({ timeout: 30_000 });
      const revokedAt = Date.now();
      await overlay.waitForFunction(() => document.getElementById('overlay-value')?.textContent === ''
        && document.getElementById('overlay-status')?.textContent === 'Fonte indisponível', undefined, { timeout: 15_000 });
      const clearedAfterMs = Date.now() - revokedAt;
      expect(clearedAfterMs).toBeLessThan(10_000);
      expect(await overlay.locator('body').innerText()).not.toContain(probeText);

      const oldBearer = new URL(capabilityUrl).hash.slice(1) || (await overlay.evaluate(() => Object.values(sessionStorage)[0] ?? ''));
      if (oldBearer) expect((await get('/overlay/api/widget', { authorization: `Bearer ${oldBearer}` })).status).toBe(404);
      await overlayContext.close();
      await panelContext.close();
    } finally {
      await browser.close();
    }
  }, 360_000);
});
