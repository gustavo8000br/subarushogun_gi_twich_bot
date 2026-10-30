import { randomUUID } from 'node:crypto';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { cleanupIsolatedComposeProject } from '../helpers/isolated-compose-cleanup.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const acceptanceId = `${process.pid}-${randomUUID().slice(0, 8)}`;
const projectName = `queuebot-accept-${acceptanceId}`;
const imageTag = `ops15-accept-${acceptanceId}`;
const composeFile = `${root}/compose.yaml`;
const buildComposeFile = `${root}/compose.build.yaml`;
let hostPort;
let composeStarted = false;
let localCertDirectory;
let communityCatalogDirectory;
const chromeBinary = process.env.CHROME_BINARY ?? 'google-chrome';
const chromeAvailable = spawnSync(chromeBinary, ['--version'], { encoding: 'utf8' }).status === 0;
const composeBrowserTest = chromeAvailable ? it : it.skip;

function dockerCompose(args, options = {}) {
  const result = spawnSync('docker', [
      'compose', '--project-name', projectName, '--file', composeFile, '--file', buildComposeFile, ...args,
  ], {
    cwd: root,
    encoding: 'utf8',
    timeout: options.timeout ?? 180_000,
    env: {
      ...process.env,
      APP_PORT: String(hostPort),
      IMAGE_TAG: imageTag,
      LOCAL_CERT_DIRECTORY: localCertDirectory,
      LOCAL_COMMUNITY_CATALOG_DIRECTORY: communityCatalogDirectory,
    },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `docker compose ${args.join(' ')} failed`);
  }
  return result.stdout.trim();
}

async function getFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const pending = https.request(`https://127.0.0.1:${hostPort}${path}`, {
      method: options.method ?? 'GET',
      headers: options.headers,
      rejectUnauthorized: false,
      timeout: options.timeout ?? 2000,
    }, (response) => {
      const peerCertificate = response.socket.getPeerCertificate(true);
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({
        ok: response.statusCode === 200,
        status: response.statusCode,
        headers: response.headers,
        body,
        json: () => JSON.parse(body),
        peerCertificate,
      }));
    });
    pending.on('error', reject);
    pending.on('timeout', () => pending.destroy(new Error(`HTTPS ${path} request timed out`)));
    if (options.body !== undefined) pending.write(JSON.stringify(options.body));
    pending.end();
  });
}

function health() {
  return request('/health');
}

async function waitForHealthyBot() {
  let lastError;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await health();
      if (response.ok) return response.json();
      lastError = new Error(`health returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw lastError ?? new Error('Compose bot did not become healthy');
}

describe('isolated Compose first-run and restart acceptance', () => {
  beforeAll(async () => {
    localCertDirectory = mkdtempSync(join(tmpdir(), 'queuebot local tls '));
    communityCatalogDirectory = mkdtempSync(join(tmpdir(), 'queuebot community catalogs '));
    chmodSync(communityCatalogDirectory, 0o755);
    for (const moduleName of ['chat', 'lifecycle', 'overlay', 'panel', 'setup']) {
      mkdirSync(join(communityCatalogDirectory, moduleName), { mode: 0o755 });
    }
    hostPort = await getFreePort();
    dockerCompose(['build', 'bot'], { timeout: 480_000 });
    composeStarted = true;
    dockerCompose(['up', '--detach', 'bot']);
  }, 540_000);

  afterAll(() => {
    if (composeStarted) {
      cleanupIsolatedComposeProject({
        projectName,
        composeFile,
        runDocker: (args) => spawnSync('docker', args, {
          cwd: root,
          encoding: 'utf8',
          timeout: 60_000,
        }),
      });
    }
    spawnSync('docker', ['image', 'rm', `ghcr.io/gustavo8000br/subarushogun_gi_twich_bot:${imageTag}`], {
      cwd: root,
      encoding: 'utf8',
      timeout: 60_000,
    });
    if (localCertDirectory) rmSync(localCertDirectory, { recursive: true, force: true });
    if (communityCatalogDirectory) rmSync(communityCatalogDirectory, { recursive: true, force: true });
  });

  it('initializes database and migrations before serving the versioned local health response', async () => {
    const body = await waitForHealthyBot();
    expect(body).toMatchObject({
      status: 'ok',
      product_version: expect.stringMatching(/^v\d+\.\d+\.\d+-(?:[a-f0-9]{7}-(?:alpha|beta|rc|stable)|0000000-(?:alpha|beta|rc|stable))$/),
      dependencies: { database: 'connected', twitch_api: 'not_configured' },
    });
    const migrationCount = dockerCompose([
      'exec', '--no-TTY', 'db', 'psql', '-U', 'queuebot', '-d', 'queuebot', '-Atc',
      'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    ]);
    expect(Number(migrationCount)).toBeGreaterThan(0);
  }, 120_000);

  it('creates a manual queue and verifies versioned local settings against persisted operator DTOs', async () => {
    await waitForHealthyBot();
    const sessionResponse = await request('/api/session');
    expect(sessionResponse.status).toBe(200);
    const session = sessionResponse.json();
    const cookie = sessionResponse.headers['set-cookie']?.[0]?.split(';', 1)[0];
    expect(cookie).toBeTruthy();
    const headers = {
      cookie,
      origin: `https://127.0.0.1:${hostPort}`,
      'x-csrf-token': session.csrfToken,
      'idempotency-key': randomUUID(),
      'content-type': 'application/json',
    };
    const slug = `ops15-manual-${randomUUID().slice(0, 8)}`;
    const callMessage = '{user}, sua vez chegou!';
    const created = await request('/api/queues', {
      method: 'POST',
      headers,
      body: { slug, title: 'OPS-15 disposable manual queue', queueMode: 'manual_only', callMessage, callTimeoutMin: 12, uidMode: 'visible' },
    });
    expect(created.status).toBe(201);
    const dto = created.json();
    expect(dto).toMatchObject({
      slug,
      aliases: [],
      title: 'OPS-15 disposable manual queue',
      rewardPrompt: '',
      cost: null,
      uidMode: 'visible',
      queueMode: 'manual_only',
      rewardOrigin: 'none',
      modeTransitionStatus: 'none',
      rewardId: null,
      maxRedemptionsPerStream: null,
      maxRedemptionsPerUserPerStream: null,
      globalCooldownSeconds: null,
      callMessage,
      callTimeoutMin: 12,
      showUidInList: false,
      showUidInOverlay: false,
      showUidOnCall: false,
      autoSwitchAccount: false,
      refundIfRemovedWhileCalled: true,
      refundOnNoShow: false,
      refundIfViewerLeavesCalled: false,
      isOpen: false,
      isArchived: false,
      lifecycleStatus: 'active',
      version: 1,
      remoteSyncStatus: 'local_only',
      entries: [],
    });
    expect(dto.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(Object.keys(dto).sort()).toEqual([
      'id', 'slug', 'aliases', 'title', 'rewardPrompt', 'cost', 'uidMode', 'queueMode', 'rewardOrigin',
      'modeTransitionStatus', 'rewardId', 'maxRedemptionsPerStream', 'maxRedemptionsPerUserPerStream',
      'globalCooldownSeconds', 'callMessage', 'callTimeoutMin', 'showUidInList', 'showUidInOverlay',
      'showUidOnCall', 'autoSwitchAccount', 'refundIfRemovedWhileCalled', 'refundOnNoShow',
      'refundIfViewerLeavesCalled', 'isOpen', 'isArchived', 'lifecycleStatus', 'version', 'remoteSyncStatus', 'entries',
    ].sort());

    const listed = await request('/api/queues', { headers: { cookie, origin: headers.origin } });
    expect(listed.status).toBe(200);
    const persisted = listed.json().filter((queue) => queue.id === dto.id);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toEqual(dto);
    expect(dto.remoteSyncStatus).toBe('local_only');

    const updatedCallMessage = '{user}, a fila foi atualizada!';
    const settings = await request(`/api/queues/${dto.id}/settings`, {
      method: 'PATCH',
      headers: { ...headers, 'idempotency-key': randomUUID() },
      body: { expectedVersion: 1, callTimeoutMin: 18, callMessage: updatedCallMessage, showUidInList: true },
    });
    expect(settings.status).toBe(200);
    const updatedDto = settings.json();
    expect(updatedDto).toMatchObject({
      id: dto.id,
      slug,
      version: 2,
      callTimeoutMin: 18,
      callMessage: updatedCallMessage,
      showUidInList: true,
      queueMode: 'manual_only',
      remoteSyncStatus: 'local_only',
    });
    expect(Object.keys(updatedDto).sort()).toEqual(Object.keys(dto).sort());

    const staleSettings = await request(`/api/queues/${dto.id}/settings`, {
      method: 'PATCH',
      headers: { ...headers, 'idempotency-key': randomUUID() },
      body: { expectedVersion: 1, callTimeoutMin: 24 },
    });
    expect(staleSettings.status).toBe(409);
    expect(staleSettings.json()).toEqual({
      code: 'STALE_QUEUE_VERSION',
      error: 'A fila mudou em outra operação. Atualize o painel e tente novamente.',
    });

    const reread = await request('/api/queues', { headers: { cookie, origin: headers.origin } });
    expect(reread.status).toBe(200);
    const persistedAfterUpdate = reread.json().filter((queue) => queue.id === dto.id);
    expect(persistedAfterUpdate).toHaveLength(1);
    expect(persistedAfterUpdate[0]).toEqual(updatedDto);

    const history = await request(`/api/queues/${dto.id}/history`, {
      headers: { cookie, origin: headers.origin },
    });
    expect(history.status).toBe(200);
    expect(history.json()).toEqual([]);

    const terminalEntryId = randomUUID();
    const finishedAt = '2026-10-20T18:00:00.000Z';
    dockerCompose([
      'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-c',
      `INSERT INTO entries (id, queue_id, twitch_user_id, user_login, display_name, source, status, finished_at, terminal_reason) VALUES ('${terminalEntryId}', '${dto.id}', 'ops15-synthetic-user', 'ops15viewer', 'OPS15Viewer', 'manual', 'completed', TIMESTAMPTZ '${finishedAt}', 'manual_test')`,
    ]);
    const populatedHistory = await request(`/api/queues/${dto.id}/history`, {
      headers: { cookie, origin: headers.origin },
    });
    expect(populatedHistory.status).toBe(200);
    expect(populatedHistory.json()).toEqual([{
      id: terminalEntryId,
      userLogin: 'ops15viewer',
      displayName: 'OPS15Viewer',
      status: 'completed',
      finishedAt,
      terminalReason: 'manual_test',
    }]);

    const firstWaitingEntryId = randomUUID();
    const movedWaitingEntryId = randomUUID();
    dockerCompose([
      'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-c',
      `INSERT INTO entries (id, queue_id, twitch_user_id, user_login, display_name, source, status, position) VALUES ('${firstWaitingEntryId}', '${dto.id}', 'ops15-first-user', 'ops15first', 'OPS15First', 'manual', 'waiting', 1), ('${movedWaitingEntryId}', '${dto.id}', 'ops15-second-user', 'ops15second', 'OPS15Second', 'manual', 'waiting', 2)`,
    ]);
    const move = await request(`/api/queues/${dto.id}/move`, {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': randomUUID() },
      body: { entryId: movedWaitingEntryId, position: 1 },
    });
    expect(move.status).toBe(200);
    expect(move.json()).toEqual({ status: 'moved', entryId: movedWaitingEntryId, position: 1 });

    const afterMove = await request('/api/queues', { headers: { cookie, origin: headers.origin } });
    expect(afterMove.status).toBe(200);
    const movedQueue = afterMove.json().find((queue) => queue.id === dto.id);
    expect(movedQueue.entries.filter((entry) => entry.status === 'waiting').map(({ id, position }) => ({ id, position }))).toEqual([
      { id: movedWaitingEntryId, position: 1 },
      { id: firstWaitingEntryId, position: 2 },
    ]);

    const priority = await request(`/api/entries/${firstWaitingEntryId}/priority`, {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': randomUUID() },
      body: { priority: true, reason: 'bits' },
    });
    expect(priority.status).toBe(200);
    const priorityResult = priority.json();
    expect(priorityResult.status).toBe('updated');
    expect(priorityResult.priorityClass).toBe('priority');
    expect(priorityResult.position).toBe(1);
    expect(priorityResult.entry).toMatchObject({
      id: firstWaitingEntryId,
      queueId: dto.id,
      status: 'waiting',
      priorityClass: 'priority',
      priorityReason: 'bits',
      position: 1,
      version: 3,
    });
    const auditCount = dockerCompose([
      'exec', '--no-TTY', 'db', 'psql', '-U', 'queuebot', '-d', 'queuebot', '-Atc',
      `SELECT count(*) FROM audit_logs WHERE entry_id = '${firstWaitingEntryId}' AND event = 'entry.priority_changed' AND reason = 'bits' AND origin = 'panel'`,
    ]);
    expect(Number(auditCount)).toBe(1);

    const priorityRemoved = await request(`/api/entries/${firstWaitingEntryId}/priority`, {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': randomUUID() },
      body: { priority: false, reason: 'bits' },
    });
    expect(priorityRemoved.status).toBe(200);
    expect(priorityRemoved.json()).toMatchObject({
      status: 'updated',
      priorityClass: 'standard',
      position: 2,
      entry: {
        id: firstWaitingEntryId,
        priorityClass: 'standard',
        priorityReason: null,
        position: 2,
        version: 4,
      },
    });
    const removalAuditCount = dockerCompose([
      'exec', '--no-TTY', 'db', 'psql', '-U', 'queuebot', '-d', 'queuebot', '-Atc',
      `SELECT count(*) FROM audit_logs WHERE entry_id = '${firstWaitingEntryId}' AND event = 'entry.priority_changed' AND reason = 'priority_removed' AND origin = 'panel'`,
    ]);
    expect(Number(removalAuditCount)).toBe(1);

    dockerCompose([
      'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-c',
      `UPDATE queues SET remote_sync_status = 'create_unknown' WHERE id = '${dto.id}'`,
    ]);
    const unavailableCandidates = await request(`/api/queues/${dto.id}/reward-candidates`, {
      headers: { cookie, origin: headers.origin },
    });
    expect(unavailableCandidates.status).toBe(503);
    expect(unavailableCandidates.json()).toEqual({
      error: 'A conexão Twitch está indisponível para consultar recompensas. Aguarde a reconexão e tente novamente.',
      referenceId: unavailableCandidates.headers['x-error-reference'],
    });
    expect(unavailableCandidates.headers['x-error-reference']).toMatch(/^[a-zA-Z0-9_-]{8,}$/);
  }, 30_000);

  it('documents production-like route ownership: Next owns the root and migrated pages, overlay, and Fastify APIs', async () => {
    await waitForHealthyBot();
    // OPS-15 cutover wave 3: the widget link points at the Next route; the /overlay.html alias
    // and the vanilla overlay files are gone and answered by Next as a 404, never as a redirect.
    for (const path of [`/overlay.html?ref=${'a'.repeat(22)}`, '/overlay.html', '/overlay.js', '/overlay.css']) {
      const retired = await request(path);
      expect(retired.status, `${path} is retired`).toBe(404);
      expect(retired.headers['x-powered-by'], `${path} is answered by Next`).toBe('Next.js');
      expect(retired.headers.location, `${path} is not redirected`).toBeUndefined();
      expect(retired.body).not.toContain('data-next-overlay-entry');
      expect(retired.headers['content-type'] ?? '').not.toMatch(/javascript|text\/css/);
    }

    const document = await request(`/overlay?ref=${'a'.repeat(22)}`);
    expect(document.status).toBe(200);
    expect(document.headers.location).toBeUndefined();
    expect(document.headers['content-type']).toContain('text/html');
    expect(document.headers['x-powered-by']).toBe('Next.js');
    expect(document.body).toContain('id="overlay-widget"');
    expect(document.body).toContain('data-next-overlay-entry="true"');
    expect(document.body).toContain('/_next/static/');

    const projection = await request('/overlay/api/widget');
    expect(projection.status).toBe(401);
    expect(projection.headers['cache-control']).toContain('no-store');
    expect(projection.json()).toEqual({ error: 'Widget indisponível.' });

    // OPS-15 cutover wave 1: the Next overview is the production home page.
    const panel = await request('/');
    expect(panel.status).toBe(200);
    expect(panel.headers['content-type']).toContain('text/html');
    expect(panel.headers['x-powered-by']).toBe('Next.js');
    expect(panel.body).toContain('class="panel-shell"');
    expect(panel.body).toContain('data-next-panel-entry');
    expect(panel.body).not.toContain('class="app-shell"');
    expect(panel.body).not.toContain('href="/styles.css"');

    for (const path of ['/app.js', '/styles.css', '/index.html', '/shared/panel/panel-navigation.mjs']) {
      const vanillaAsset = await request(path);
      expect(vanillaAsset.status, `${path} is no longer served by Fastify`).toBe(404);
      expect(vanillaAsset.headers['x-powered-by'], `${path} is answered by Next`).toBe('Next.js');
      expect(vanillaAsset.headers['content-type'] ?? '').not.toMatch(/javascript|text\/css/);
    }

    const migratedPanelRoutes = ['/queues/', '/new-queue/', '/operations/', '/commands/', '/widgets/', '/settings/'];
    for (const path of migratedPanelRoutes) {
      const redirectChain = [];
      let route = await request(path);
      for (let redirects = 0; [301, 302, 303, 307, 308].includes(route.status) && redirects < 3; redirects += 1) {
        const location = route.headers.location;
        expect(location, `${path} redirect must have a local destination`).toBeTruthy();
        const target = new URL(location, `https://127.0.0.1:${hostPort}`);
        expect(target.origin).toBe(`https://127.0.0.1:${hostPort}`);
        redirectChain.push({ status: route.status, location: `${target.pathname}${target.search}` });
        route = await request(`${target.pathname}${target.search}`);
      }
      expect([301, 302, 303, 307, 308].includes(route.status), `${path} redirect chain terminates`).toBe(false);
      expect(route.status, `${path} is served by its migrated Next page; chain: ${JSON.stringify(redirectChain)}`).toBe(200);
      expect(route.headers['content-type']).toContain('text/html');
      expect(route.headers['x-powered-by']).toBe('Next.js');
      expect(route.body).toContain('class="panel-shell"');
      expect(route.body).not.toContain('class="app-shell"');
    }

    const nextConnection = await request('/connection');
    expect(nextConnection.status).toBe(200);
    expect(nextConnection.headers['content-type']).toContain('text/html');
    expect(nextConnection.headers['x-powered-by']).toBe('Next.js');
    expect(nextConnection.body).toContain('class="panel-shell"');
    expect(nextConnection.body).not.toContain('class="app-shell"');

    const callback = await request('/callback');
    expect(callback.status).toBe(303);
    expect(callback.headers.location).toBe('/connection/?oauth=error');
    expect(callback.headers['cache-control']).toContain('no-store');
    const callbackPage = await request(callback.headers.location);
    expect(callbackPage.status).toBe(308);
    const canonicalCallbackUrl = new URL(callbackPage.headers.location, `https://127.0.0.1:${hostPort}`);
    const canonicalCallbackPath = canonicalCallbackUrl.pathname + canonicalCallbackUrl.search;
    expect(canonicalCallbackPath).toBe('/connection?oauth=error');
    const styledCallbackPage = await request(canonicalCallbackPath);
    expect(styledCallbackPage.status).toBe(200);
    expect(styledCallbackPage.headers['content-type']).toContain('text/html');
    expect(styledCallbackPage.body).toMatch(/href="\/_next\/static\/chunks\/[^" ]+\.css"/);
    expect(styledCallbackPage.body).toContain('class="panel-shell"');

    const unknownApi = await request('/api/ops-15-unknown-route');
    expect(unknownApi.status).toBe(401);
    expect(unknownApi.headers['content-type']).toContain('application/json');
    expect(unknownApi.body).not.toContain('<html');
  }, 30_000);

  it('discovers complete community catalogs after image build without restarting the API', async () => {
    await waitForHealthyBot();
    const before = await request('/api/session');
    expect(before.status).toBe(200);
    const session = before.json();
    const cookie = before.headers['set-cookie']?.[0]?.split(';', 1)[0];
    expect(cookie).toBeTruthy();
    const catalogUrl = `https://127.0.0.1:${hostPort}/api/localization/catalogs`;
    const headers = { cookie, origin: `https://127.0.0.1:${hostPort}` };
    const initial = await request('/api/localization/catalogs');
    expect(initial.status).toBe(401);
    const readCatalogs = () => new Promise((resolve, reject) => {
      const pending = https.get(catalogUrl, { rejectUnauthorized: false, headers, timeout: 3000 }, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode, json: () => JSON.parse(body) }));
      });
      pending.on('error', reject);
    });
    const authorizedInitial = await readCatalogs();
    expect(authorizedInitial.status).toBe(200);
    expect(authorizedInitial.json().locales).not.toContain('de');

    const widgetStyle = {
      textColor: '#FFFFFF', backgroundColor: '#000000', backgroundOpacity: 0,
      fontFamily: 'system-ui', fontSize: 32, fontWeight: 700, alignment: 'center', effect: 'none',
      outlineWidth: 1, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
      width: 640, height: 100, marginTop: 8, marginRight: 8, marginBottom: 8, marginLeft: 8, overflow: 'wrap',
    };
    const widget = await request('/api/overlay-widgets', {
      method: 'POST',
      headers: { ...headers, 'x-csrf-token': session.csrfToken, 'idempotency-key': randomUUID(), 'content-type': 'application/json' },
      body: { sourceType: 'fixed_text', fixedText: 'Community overlay cache probe', fallbackText: 'No value', style: widgetStyle },
    });
    expect(widget.status).toBe(201);
    const capability = new URL(widget.json().capabilityUrl, `https://localhost:${hostPort}`).hash.slice(1);
    expect(capability).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const overlayUrl = '/overlay/api/widget';
    const readOverlay = () => request(overlayUrl, { headers: { authorization: `Bearer ${capability}` } });
    const initialProjection = await readOverlay();
    expect(initialProjection.status).toBe(200);
    expect(initialProjection.json().productLocale).toBe('pt-BR');

    const moduleNames = ['chat', 'lifecycle', 'overlay', 'panel', 'setup'];
    for (const moduleName of moduleNames) {
      const source = join(root, 'apps', 'shared', 'localization', 'catalogs', moduleName, 'en.tsv');
      const contents = readFileSync(source, 'utf8').replace(/\r\n/g, '\n');
      writeFileSync(join(communityCatalogDirectory, moduleName, 'de.tsv'), contents);
    }
    const panelCatalog = join(communityCatalogDirectory, 'panel', 'de.tsv');
    writeFileSync(panelCatalog, readFileSync(panelCatalog, 'utf8').replace('panel.navigation.overview\tOverview', 'panel.navigation.overview\tCommunity runtime catalog'));
    const overlayCatalog = join(communityCatalogDirectory, 'overlay', 'de.tsv');
    writeFileSync(overlayCatalog, readFileSync(overlayCatalog, 'utf8').replace('overlay.status.unavailable\tSource unavailable', 'overlay.status.unavailable\tCommunity source unavailable'));

    const mountedCatalogFiles = dockerCompose(['exec', '--no-TTY', 'bot', 'find', '/app/.local/community-catalogs', '-name', 'de.tsv', '-type', 'f']);
    expect(mountedCatalogFiles.split('\n')).toHaveLength(moduleNames.length);

    let discovered;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      discovered = await readCatalogs();
      if (discovered.status === 200 && discovered.json().locales.includes('de')) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    expect(discovered.status).toBe(200);
    expect(discovered.json().locales).toContain('de');
    expect(discovered.json().modules.panel.catalogs.de['panel.navigation.overview']).toBe('Community runtime catalog');
    expect(discovered.json().modules.panel.catalogs.en['panel.navigation.overview']).toBe('Overview');
    expect(discovered.json().modules.setup.catalogs.de['setup.callback.success_title']).toBe('Twitch connected');
    expect(discovered.json().modules.chat.catalogs.de['chat.account.current']).toContain('{label}');
    expect(discovered.json().modules.chat.catalogs.de['chat.queue.more.one']).toBe(' and {count} more');
    expect(discovered.json().modules.overlay.catalogs.de['overlay.status.unavailable']).toBe('Community source unavailable');

    const localState = await request('/api/state', { headers });
    expect(localState.status).toBe(200);
    const localeChange = await request('/api/localization/locale', {
      method: 'PATCH',
      headers: { ...headers, 'x-csrf-token': session.csrfToken, 'idempotency-key': randomUUID(), 'content-type': 'application/json' },
      body: { locale: 'de', expectedRevision: localState.json().product_locale.revision },
    });
    expect(localeChange.status).toBe(200);
    expect(localeChange.json()).toMatchObject({ locale: 'de' });

    const overlayDeadline = Date.now() + 5_000;
    let refreshedProjection;
    do {
      refreshedProjection = await readOverlay();
      if (refreshedProjection.status === 200
        && refreshedProjection.json().messages['overlay.status.unavailable'] === 'Community source unavailable') break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    } while (Date.now() < overlayDeadline);
    expect(refreshedProjection.status).toBe(200);
    expect(refreshedProjection.json()).toMatchObject({
      productLocale: 'de',
      messages: { 'overlay.status.unavailable': 'Community source unavailable' },
    });
    expect(Date.now()).toBeLessThanOrEqual(overlayDeadline);

    const invalidPanelCatalog = readFileSync(panelCatalog, 'utf8').replace('panel.navigation.overview', 'panel.navigation.removed');
    writeFileSync(panelCatalog, invalidPanelCatalog);
    const afterInvalid = await readCatalogs();
    expect(afterInvalid.status).toBe(200);
    expect(afterInvalid.json().locales).not.toContain('de');
    expect(afterInvalid.json().modules.panel.catalogs.en['panel.navigation.overview']).toBeTruthy();
  }, 30_000);

  it('serves HTTPS on localhost with a generated certificate trusted by the exported local CA', async () => {
    const response = await health();
    expect(response.status).toBe(200);
    expect(existsSync(join(localCertDirectory, 'localhost-ca.crt'))).toBe(true);
    const leafPath = join(localCertDirectory, 'localhost.crt');
    dockerCompose(['cp', 'bot:/run/secrets/localhost.crt', leafPath]);
    const caPath = join(localCertDirectory, 'localhost-ca.crt');
    const verification = spawnSync('openssl', ['verify', '-verify_hostname', 'localhost', '-CAfile', caPath, leafPath], { encoding: 'utf8' });
    expect(verification.status, verification.stderr).toBe(0);
    const liveHandshake = spawnSync('openssl', [
      's_client', '-connect', `127.0.0.1:${hostPort}`, '-servername', 'localhost',
      '-CAfile', caPath, '-verify_hostname', 'localhost', '-verify_return_error',
    ], { input: '', encoding: 'utf8', timeout: 10_000 });
    expect(liveHandshake.status, liveHandshake.stderr || liveHandshake.stdout).toBe(0);
  }, 30_000);

  it('retains the database marker and generated password across a graceful bot stop/start', async () => {
    dockerCompose([
      'exec', '--no-TTY', 'db', 'psql', '-U', 'queuebot', '-d', 'queuebot', '-v', 'ON_ERROR_STOP=1', '-c',
      "INSERT INTO settings (key, value) VALUES ('compose_acceptance_marker', '\"persisted\"'::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    ]);
    const migrationCountBefore = dockerCompose([
      'exec', '--no-TTY', 'db', 'psql', '-U', 'queuebot', '-d', 'queuebot', '-Atc',
      'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    ]);
    const passwordHashBefore = dockerCompose([
      'exec', '--no-TTY', 'db', 'sha256sum', '/run/secrets/db_password',
    ]).split(/\s+/)[0];

    dockerCompose(['stop', '--timeout', '30', 'bot']);
    dockerCompose(['start', 'bot']);

    const body = await waitForHealthyBot();
    expect(body.status).toBe('ok');
    const marker = dockerCompose([
      'exec', '--no-TTY', 'db', 'psql', '-U', 'queuebot', '-d', 'queuebot', '-Atc',
      "SELECT value #>> '{}' FROM settings WHERE key = 'compose_acceptance_marker'",
    ]);
    const migrationCountAfter = dockerCompose([
      'exec', '--no-TTY', 'db', 'psql', '-U', 'queuebot', '-d', 'queuebot', '-Atc',
      'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    ]);
    const passwordHashAfter = dockerCompose([
      'exec', '--no-TTY', 'db', 'sha256sum', '/run/secrets/db_password',
    ]).split(/\s+/)[0];

    expect(marker).toBe('persisted');
    expect(migrationCountAfter).toBe(migrationCountBefore);
    expect(passwordHashAfter).toBe(passwordHashBefore);
  }, 120_000);

  composeBrowserTest('creates, configures, activates, reads history, reorders, prioritizes and completes a local queue in Chromium through Next, Fastify and disposable PostgreSQL', async () => {
    await waitForHealthyBot();
    const origin = `https://127.0.0.1:${hostPort}`;
    const browser = await chromium.launch({
      ...(process.env.CHROME_BINARY ? { executablePath: process.env.CHROME_BINARY } : { channel: 'chrome' }),
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    try {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' });
      const page = await context.newPage();
      await page.goto(`${origin}/new-queue/`, { waitUntil: 'domcontentloaded' });
      const createButton = page.getByRole('button', { name: 'Criar fila' });
      await createButton.waitFor({ timeout: 20_000 });
      expect(await page.getByLabel('Tipo de fila').inputValue()).toBe('manual_only');
      expect(await page.getByRole('note').getByRole('link', { name: 'Configurar conexão com a Twitch' }).count()).toBe(1);
      expect(await page.locator('.queue-create-reward-fields').isVisible()).toBe(false);

      const title = `OPS-15 browser queue ${randomUUID().slice(0, 6)}`;
      const alias = `ops15-alt-${randomUUID().slice(0, 6)}`;
      await page.getByRole('textbox', { name: 'Nome da fila', exact: true }).fill(title);
      await page.getByRole('textbox', { name: 'Apelidos' }).fill(alias);
      const slug = await page.locator('input[name="slug"]').inputValue();
      const createResponsePromise = page.waitForResponse((response) => {
        const requestUrl = new URL(response.url());
        return requestUrl.origin === origin && requestUrl.pathname === '/api/queues'
          && response.request().method() === 'POST';
      });
      await createButton.click();

      const created = await createResponsePromise;
      expect(created.status()).toBe(201);
      const dto = await created.json();
      expect(dto).toMatchObject({
        slug,
        aliases: [alias],
        title,
        queueMode: 'manual_only',
        rewardOrigin: 'none',
        rewardId: null,
        cost: null,
        remoteSyncStatus: 'local_only',
        isOpen: false,
      });
      expect(Object.keys(dto).sort()).toEqual([
        'id', 'slug', 'aliases', 'title', 'rewardPrompt', 'cost', 'uidMode', 'queueMode', 'rewardOrigin',
        'modeTransitionStatus', 'rewardId', 'maxRedemptionsPerStream', 'maxRedemptionsPerUserPerStream',
        'globalCooldownSeconds', 'callMessage', 'callTimeoutMin', 'showUidInList', 'showUidInOverlay',
        'showUidOnCall', 'autoSwitchAccount', 'refundIfRemovedWhileCalled', 'refundOnNoShow',
        'refundIfViewerLeavesCalled', 'isOpen', 'isArchived', 'lifecycleStatus', 'version', 'remoteSyncStatus', 'entries',
      ].sort());

      const feedback = page.getByRole('status').filter({ hasText: 'Fila local criada. Ela está pausada até você ativá-la.' });
      await feedback.waitFor({ timeout: 10_000 });
      expect(await feedback.getByRole('link', { name: 'Abrir filas' }).count()).toBe(1);
      expect(await createButton.isEnabled()).toBe(true);
      const cookies = await context.cookies(origin);
      const sessionCookie = cookies.find(({ name }) => name === 'queuebot_session');
      expect(sessionCookie).toBeTruthy();
      const list = await request('/api/queues', {
        headers: { cookie: `queuebot_session=${sessionCookie.value}`, origin },
      });
      expect(list.status).toBe(200);
      expect(list.json().find(({ id }) => id === dto.id)).toEqual(dto);

      await page.setViewportSize({ width: 390, height: 844 });
      await feedback.getByRole('link', { name: 'Abrir filas' }).click();
      await page.waitForURL('**/queues');
      const queueCard = page.locator('.queue-list-card').filter({
        has: page.getByRole('heading', { name: title, exact: true }),
      });
      await queueCard.getByText('Configurar', { exact: true }).click();
      const settingsForm = queueCard.getByRole('form', { name: `Opções da fila: ${title}` });
      const updatedCallMessage = '{user}, sua configuração local foi salva!';
      await settingsForm.locator('input[name="callTimeoutMin"]').fill('18');
      await settingsForm.locator('textarea[name="callMessage"]').fill(updatedCallMessage);
      expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.window.innerWidth)).toBe(true);

      const settingsResponsePromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === `/api/queues/${dto.id}/settings`
          && response.request().method() === 'PATCH';
      });
      const settingsProjectionPromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === '/api/queues'
          && response.request().method() === 'GET';
      }).catch((error) => error);
      await settingsForm.getByRole('button', { name: 'Salvar configurações', exact: true }).click();

      const settingsResponse = await settingsResponsePromise;
      expect(settingsResponse.status()).toBe(200);
      expect(settingsResponse.request().postDataJSON()).toEqual({
        expectedVersion: 1,
        callTimeoutMin: 18,
        callMessage: updatedCallMessage,
        showUidInList: false,
        showUidInOverlay: false,
        showUidOnCall: false,
        refundIfRemovedWhileCalled: true,
        refundOnNoShow: false,
        refundIfViewerLeavesCalled: false,
      });
      const updatedDto = await settingsResponse.json();
      expect(updatedDto).toMatchObject({
        id: dto.id,
        slug,
        aliases: [alias],
        version: 2,
        callTimeoutMin: 18,
        callMessage: updatedCallMessage,
        queueMode: 'manual_only',
        remoteSyncStatus: 'local_only',
      });
      expect(Object.keys(updatedDto).sort()).toEqual(Object.keys(dto).sort());

      const settingsProjection = await settingsProjectionPromise;
      expect(settingsProjection).not.toBeInstanceOf(Error);
      expect(settingsProjection.status()).toBe(200);
      const updatedQueues = await settingsProjection.json();
      expect(updatedQueues.find(({ id }) => id === dto.id)).toEqual(updatedDto);
      // Closed, activatable queue: post-save onboarding guidance (panel.queue.onboarding.activate_next), never auto-activation.
      await settingsForm.getByRole('status').filter({ hasText: 'Configurações salvas. Confira a fila abaixo; ela continuará fechada até você ativá-la.' }).waitFor();
      expect(await settingsForm.locator('input[name="callTimeoutMin"]').inputValue()).toBe('18');
      expect(await settingsForm.locator('textarea[name="callMessage"]').inputValue()).toBe(updatedCallMessage);

      const openStateResponsePromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === `/api/queues/${dto.id}/open-state`
          && response.request().method() === 'POST';
      });
      const openStateProjectionPromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === '/api/queues'
          && response.request().method() === 'GET';
      }).catch((error) => error);
      await queueCard.getByRole('button', { name: 'Ativar fila', exact: true }).click();
      const openStateResponse = await openStateResponsePromise;
      expect(openStateResponse.status()).toBe(200);
      expect(openStateResponse.request().postDataJSON()).toEqual({ isOpen: true });
      expect(await openStateResponse.json()).toEqual({
        status: 'confirmed', isOpen: true, remoteSyncStatus: 'local_only',
      });
      const openStateProjection = await openStateProjectionPromise;
      expect(openStateProjection).not.toBeInstanceOf(Error);
      expect(openStateProjection.status()).toBe(200);
      const openedQueue = (await openStateProjection.json()).find(({ id }) => id === dto.id);
      expect(openedQueue).toMatchObject({
        id: dto.id,
        aliases: [alias],
        version: 3,
        callTimeoutMin: 18,
        callMessage: updatedCallMessage,
        isOpen: true,
        remoteSyncStatus: 'local_only',
      });
      await page.getByRole('status').filter({ hasText: 'Estado da fila atualizado.' }).waitFor();

      const terminalEntryId = randomUUID();
      const finishedAt = '2026-10-20T18:00:00.000Z';
      dockerCompose([
        'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-c',
        `INSERT INTO entries (id, queue_id, twitch_user_id, user_login, display_name, source, status, finished_at, terminal_reason) VALUES ('${terminalEntryId}', '${dto.id}', 'ops15-history-user', 'ops15history', 'OPS15HistoryViewer', 'manual', 'completed', TIMESTAMPTZ '${finishedAt}', 'manual_test')`,
      ]);
      const historyResponsePromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === `/api/queues/${dto.id}/history`
          && response.request().method() === 'GET';
      });
      await queueCard.locator('details.queue-history > summary').click();
      const historyResponse = await historyResponsePromise;
      expect(historyResponse.status()).toBe(200);
      expect(await historyResponse.json()).toEqual([{
        id: terminalEntryId,
        userLogin: 'ops15history',
        displayName: 'OPS15HistoryViewer',
        status: 'completed',
        finishedAt,
        terminalReason: 'manual_test',
      }]);
      const historyRow = queueCard.locator('.history-entry').filter({ hasText: 'OPS15HistoryViewer' });
      await historyRow.waitFor();
      expect(await historyRow.textContent()).toContain('OPS15HistoryViewer · Concluído ·');
      expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.window.innerWidth)).toBe(true);

      const firstWaitingEntryId = randomUUID();
      const secondWaitingEntryId = randomUUID();
      dockerCompose([
        'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-c',
        `INSERT INTO entries (id, queue_id, twitch_user_id, user_login, display_name, source, status, position) VALUES ('${firstWaitingEntryId}', '${dto.id}', 'ops15-first-user', 'ops15first', 'OPS15FirstWaiter', 'manual', 'waiting', 1), ('${secondWaitingEntryId}', '${dto.id}', 'ops15-second-user', 'ops15second', 'OPS15SecondWaiter', 'manual', 'waiting', 2)`,
      ]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await queueCard.getByText('OPS15FirstWaiter', { exact: true }).waitFor();
      await queueCard.getByText('OPS15SecondWaiter', { exact: true }).waitFor();
      const moveResponsePromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === `/api/queues/${dto.id}/move`
          && response.request().method() === 'POST';
      });
      const moveProjectionPromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === '/api/queues'
          && response.request().method() === 'GET';
      }).catch((error) => error);
      const secondWaitingRow = queueCard.locator('.queue-entry-row').filter({ hasText: 'OPS15SecondWaiter' });
      await secondWaitingRow.getByRole('button', { name: 'Mover ↑', exact: true }).click();
      const moveResponse = await moveResponsePromise;
      expect(moveResponse.status()).toBe(200);
      expect(moveResponse.request().postDataJSON()).toEqual({ entryId: secondWaitingEntryId, position: 1 });
      expect(await moveResponse.json()).toEqual({ status: 'moved', entryId: secondWaitingEntryId, position: 1 });
      const moveProjection = await moveProjectionPromise;
      expect(moveProjection).not.toBeInstanceOf(Error);
      expect(moveProjection.status()).toBe(200);
      const movedQueue = (await moveProjection.json()).find(({ id }) => id === dto.id);
      expect(movedQueue.entries.find(({ id }) => id === secondWaitingEntryId)).toMatchObject({ position: 1 });
      expect(movedQueue.entries.find(({ id }) => id === firstWaitingEntryId)).toMatchObject({ position: 2 });

      const priorityResponsePromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === `/api/entries/${secondWaitingEntryId}/priority`
          && response.request().method() === 'POST';
      }).catch((error) => error);
      const priorityProjectionPromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === '/api/queues'
          && response.request().method() === 'GET';
      }).catch((error) => error);
      const priorityEntryRow = queueCard.locator('.queue-entry-row').filter({ hasText: 'OPS15SecondWaiter' });
      await priorityEntryRow.getByRole('button', { name: 'Marcar prioritária', exact: true }).click();
      const priorityDialog = page.getByRole('dialog');
      await priorityDialog.waitFor();
      await priorityDialog.getByRole('combobox', { name: 'Benefício conferido', exact: true }).selectOption('bits');
      await priorityDialog.getByRole('button', { name: 'Marcar prioritária', exact: true }).click();
      const priorityResponse = await priorityResponsePromise;
      expect(priorityResponse).not.toBeInstanceOf(Error);
      expect(priorityResponse.status()).toBe(200);
      expect(priorityResponse.request().postDataJSON()).toEqual({ priority: true, reason: 'bits' });
      expect(await priorityResponse.json()).toMatchObject({
        status: 'updated',
        priorityClass: 'priority',
        position: 1,
        entry: { id: secondWaitingEntryId, priorityClass: 'priority', priorityReason: 'bits', status: 'waiting' },
      });
      const priorityProjection = await priorityProjectionPromise;
      expect(priorityProjection).not.toBeInstanceOf(Error);
      expect(priorityProjection.status()).toBe(200);
      const prioritizedQueue = (await priorityProjection.json()).find(({ id }) => id === dto.id);
      expect(prioritizedQueue.entries.find(({ id }) => id === secondWaitingEntryId))
        .toMatchObject({ priorityClass: 'priority', priorityReason: 'bits', position: 1 });
      expect(prioritizedQueue.entries.find(({ id }) => id === firstWaitingEntryId))
        .toMatchObject({ priorityClass: 'standard', priorityReason: null, position: 2 });
      const priorityBadge = queueCard.locator('.priority-badge').filter({ hasText: 'Bits' });
      await priorityBadge.waitFor();
      const removePriorityResponsePromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === `/api/entries/${secondWaitingEntryId}/priority`
          && response.request().method() === 'POST';
      }).catch((error) => error);
      const removePriorityProjectionPromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === '/api/queues'
          && response.request().method() === 'GET';
      }).catch((error) => error);
      await priorityEntryRow.getByRole('button', { name: 'Remover prioridade', exact: true }).click();
      const removePriorityResponse = await removePriorityResponsePromise;
      expect(removePriorityResponse).not.toBeInstanceOf(Error);
      expect(removePriorityResponse.status()).toBe(200);
      expect(removePriorityResponse.request().postDataJSON()).toEqual({ priority: false, reason: 'bits' });
      expect(await removePriorityResponse.json()).toMatchObject({
        status: 'updated',
        priorityClass: 'standard',
        entry: { id: secondWaitingEntryId, priorityClass: 'standard', priorityReason: null, status: 'waiting' },
      });
      const removePriorityProjection = await removePriorityProjectionPromise;
      expect(removePriorityProjection).not.toBeInstanceOf(Error);
      expect(removePriorityProjection.status()).toBe(200);
      const standardQueue = (await removePriorityProjection.json()).find(({ id }) => id === dto.id);
      expect(standardQueue.entries.find(({ id }) => id === secondWaitingEntryId))
        .toMatchObject({ priorityClass: 'standard', priorityReason: null });
      expect(await priorityBadge.count()).toBe(0);

      dockerCompose([
        'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-c',
        `UPDATE entries SET status = 'called', position = null, called_at = NOW(), call_deadline_at = NOW() + INTERVAL '3 minutes' WHERE id = '${firstWaitingEntryId}'`,
      ]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      const calledEntryRow = queueCard.locator('.queue-entry-row').filter({ hasText: 'OPS15FirstWaiter' });
      const attendResponsePromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === `/api/entries/${firstWaitingEntryId}/transitions`
          && response.request().method() === 'POST' && response.request().postDataJSON()?.to === 'in_progress';
      });
      await calledEntryRow.getByRole('button', { name: 'Atender OPS15FirstWaiter', exact: true }).click();
      const attendResponse = await attendResponsePromise;
      expect(attendResponse.status()).toBe(200);
      expect(attendResponse.request().postDataJSON()).toEqual({ to: 'in_progress', reason: 'service_started' });
      expect(await attendResponse.json()).toEqual({
        id: firstWaitingEntryId, status: 'in_progress', financialDecision: 'no_operation',
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      const attendProjection = await page.evaluate(async () => {
        const response = await fetch('/api/queues');
        return { status: response.status, queues: await response.json() };
      });
      expect(attendProjection.status).toBe(200);
      expect(attendProjection.queues.find(({ id }) => id === dto.id).entries.find(({ id }) => id === firstWaitingEntryId))
        .toMatchObject({ id: firstWaitingEntryId, status: 'in_progress', position: null });

      const completeResponsePromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === `/api/entries/${firstWaitingEntryId}/transitions`
          && response.request().method() === 'POST' && response.request().postDataJSON()?.to === 'completed';
      });
      await queueCard.getByRole('button', { name: 'Concluir atendimento de OPS15FirstWaiter', exact: true }).click();
      const completeResponse = await completeResponsePromise;
      expect(completeResponse.status()).toBe(200);
      expect(completeResponse.request().postDataJSON()).toEqual({ to: 'completed', reason: 'service_completed' });
      expect(await completeResponse.json()).toEqual({
        id: firstWaitingEntryId, status: 'completed', financialDecision: 'no_operation',
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      const completeProjection = await page.evaluate(async () => {
        const response = await fetch('/api/queues');
        return { status: response.status, queues: await response.json() };
      });
      expect(completeProjection.status).toBe(200);
      expect(completeProjection.queues.find(({ id }) => id === dto.id).entries.some(({ id }) => id === firstWaitingEntryId)).toBe(false);
      const persistedCompletion = dockerCompose([
        'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-At', '-c',
        `SELECT json_build_object('status', status, 'terminalReason', terminal_reason, 'hasFinishedAt', finished_at IS NOT NULL)::text FROM entries WHERE id = '${firstWaitingEntryId}'`,
      ]);
      expect(JSON.parse(persistedCompletion)).toEqual({ status: 'completed', terminalReason: 'service_completed', hasFinishedAt: true });

      // QRA-13 call and QRA-14/15 clear through the real UI; the chat notice stays a pending outbox row (no worker/Twitch).
      const callRow = queueCard.locator('.queue-entry-row').filter({ hasText: 'OPS15SecondWaiter' });
      const callResponsePromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === `/api/queues/${dto.id}/call`
          && response.request().method() === 'POST';
      });
      await callRow.getByRole('button', { name: 'Chamar OPS15SecondWaiter', exact: true }).click();
      const callResponse = await callResponsePromise;
      expect(callResponse.status()).toBe(200);
      expect(callResponse.request().postDataJSON()).toEqual({ count: 1, entryId: secondWaitingEntryId });
      expect(await callResponse.json()).toEqual({ status: 'called', id: secondWaitingEntryId });
      const persistedCall = dockerCompose([
        'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-At', '-c',
        `SELECT json_build_object('status', e.status, 'hasPosition', e.position IS NOT NULL, 'notices', (SELECT count(*) FROM outbox o WHERE o.idempotency_key = 'chat.call:${secondWaitingEntryId}' AND o.operation_type = 'chat.call' AND o.status = 'pending'))::text FROM entries e WHERE e.id = '${secondWaitingEntryId}'`,
      ]);
      expect(JSON.parse(persistedCall)).toEqual({ status: 'called', hasPosition: false, notices: 1 });

      const clearPreviewPromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === `/api/queues/${dto.id}/clear-preview`
          && response.request().method() === 'POST';
      });
      await queueCard.getByRole('button', { name: 'Limpar fila', exact: true }).click();
      const clearPreview = await clearPreviewPromise;
      expect(clearPreview.status()).toBe(200);
      expect(await clearPreview.json()).toEqual({
        status: 'confirmation_required', count: 1, refundsRequested: 0, expiresInSeconds: 15,
      });
      const clearDialog = page.getByRole('dialog');
      await clearDialog.getByText('1 pessoas serão removidas', { exact: false }).waitFor();
      const clearConfirmPromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === `/api/queues/${dto.id}/clear-confirm`
          && response.request().method() === 'POST';
      });
      await clearDialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
      const clearConfirm = await clearConfirmPromise;
      expect(clearConfirm.status()).toBe(200);
      expect(await clearConfirm.json()).toEqual({ status: 'cleared', count: 1, refundsRequested: 0 });
      await page.getByRole('status').filter({ hasText: '1 pessoas removidas; 0 reembolsos solicitados.' }).waitFor();
      const persistedClear = dockerCompose([
        'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-At', '-c',
        `SELECT json_build_object('status', status, 'terminalReason', terminal_reason)::text FROM entries WHERE id = '${secondWaitingEntryId}'`,
      ]);
      expect(JSON.parse(persistedClear)).toEqual({ status: 'removed', terminalReason: 'queue_cleared' });

      dockerCompose([
        'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-c',
        `UPDATE queues SET is_archived = true, is_open = false, version = version + 1 WHERE id = '${dto.id}'`,
      ]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await queueCard.getByRole('button', { name: 'Mostrar esta fila para viewers', exact: true }).waitFor();
      const unarchiveResponsePromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === `/api/queues/${dto.id}/unarchive`
          && response.request().method() === 'POST';
      });
      const unarchiveProjectionPromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === '/api/queues'
          && response.request().method() === 'GET';
      }).catch((error) => error);
      await queueCard.getByRole('button', { name: 'Mostrar esta fila para viewers', exact: true }).click();
      const unarchiveDialog = page.getByRole('dialog');
      await unarchiveDialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
      const unarchiveResponse = await unarchiveResponsePromise;
      expect(unarchiveResponse.status()).toBe(200);
      expect(unarchiveResponse.request().postDataJSON()).toEqual({});
      const unarchivedDto = await unarchiveResponse.json();
      expect(unarchivedDto).toMatchObject({
        status: 'unarchived',
        queue: { id: dto.id, isArchived: false, isOpen: false, remoteSyncStatus: 'local_only', version: 5 },
      });
      const unarchiveProjection = await unarchiveProjectionPromise;
      expect(unarchiveProjection).not.toBeInstanceOf(Error);
      expect(unarchiveProjection.status()).toBe(200);
      expect((await unarchiveProjection.json()).find(({ id }) => id === dto.id))
        .toMatchObject({ id: dto.id, isArchived: false, isOpen: false, version: 5 });
      await queueCard.getByRole('status').filter({ hasText: 'Fila mostrada para viewers e continua pausada até você ativá-la.' }).waitFor();

      // QRA-14/15 with a refund: a redemption-backed entry plus a stale snapshot; only a local cancel intent is persisted.
      const refundRedemptionId = `ops15-refund-redemption-${randomUUID()}`;
      const refundEntryId = randomUUID();
      const plainEntryId = randomUUID();
      dockerCompose([
        'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-c',
        `INSERT INTO redemptions (redemption_id, broadcaster_id, reward_id, user_id, queue_id, redeemed_at, remote_status, sync_status, created_at, updated_at) VALUES ('${refundRedemptionId}', 'ops15-broadcaster', 'ops15-synthetic-refund-reward', 'ops15-refund-user', '${dto.id}', NOW(), 'UNFULFILLED', 'observed', NOW(), NOW()); INSERT INTO entries (id, queue_id, twitch_user_id, user_login, display_name, source, redemption_id, status, position) VALUES ('${refundEntryId}', '${dto.id}', 'ops15-refund-user', 'ops15refund', 'OPS15RefundViewer', 'redemption', '${refundRedemptionId}', 'waiting', 1), ('${plainEntryId}', '${dto.id}', 'ops15-plain-user', 'ops15plain', 'OPS15PlainViewer', 'manual', NULL, 'waiting', 2)`,
      ]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await queueCard.getByText('OPS15RefundViewer', { exact: true }).waitFor();
      const refundPreviewPromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === `/api/queues/${dto.id}/clear-preview`
          && response.request().method() === 'POST';
      }).then(async (response) => ({ status: response.status(), body: await response.json() }));
      await queueCard.getByRole('button', { name: 'Limpar fila', exact: true }).click();
      const refundPreview = await refundPreviewPromise;
      expect(refundPreview.status).toBe(200);
      expect(refundPreview.body).toEqual({ status: 'confirmation_required', count: 2, refundsRequested: 1, expiresInSeconds: 15 });
      const refundDialog = page.getByRole('dialog');
      await refundDialog.getByText('2 pessoas serão removidas e 1 reembolsos serão solicitados', { exact: false }).waitFor();
      dockerCompose([
        'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-c',
        `UPDATE entries SET version = version + 1 WHERE id = '${plainEntryId}'`,
      ]);
      const staleConfirmPromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === `/api/queues/${dto.id}/clear-confirm`
          && response.request().method() === 'POST';
      }).then(async (response) => ({ status: response.status(), body: await response.json() }));
      await refundDialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
      const staleConfirm = await staleConfirmPromise;
      expect(staleConfirm.status).toBe(200);
      expect(staleConfirm.body).toEqual({ status: 'confirmation_required', count: 2, refundsRequested: 1, expiresInSeconds: 15 });
      await refundDialog.getByText('A fila mudou. Revise a nova confirmação para 2 pessoas.', { exact: false }).waitFor();
      expect(JSON.parse(dockerCompose([
        'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-At', '-c',
        `SELECT json_build_object('waiting', count(*))::text FROM entries WHERE queue_id = '${dto.id}' AND status = 'waiting'`,
      ]))).toEqual({ waiting: 2 });
      const refundConfirmPromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === `/api/queues/${dto.id}/clear-confirm`
          && response.request().method() === 'POST';
      }).then(async (response) => ({ status: response.status(), body: await response.json() }));
      await refundDialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
      const refundConfirm = await refundConfirmPromise;
      expect(refundConfirm.status).toBe(200);
      expect(refundConfirm.body).toEqual({ status: 'cleared', count: 2, refundsRequested: 1 });
      await page.getByRole('status').filter({ hasText: '2 pessoas removidas; 1 reembolsos solicitados.' }).waitFor();
      const persistedRefund = JSON.parse(dockerCompose([
        'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-At', '-c',
        `SELECT json_build_object('removed', (SELECT count(*) FROM entries WHERE queue_id = '${dto.id}' AND status = 'removed' AND terminal_reason = 'queue_cleared' AND id IN ('${refundEntryId}', '${plainEntryId}')), 'expectedStatus', r.expected_status, 'syncStatus', r.sync_status, 'remoteStatus', r.remote_status, 'cancelIntents', (SELECT count(*) FROM outbox o WHERE o.redemption_id = r.redemption_id AND o.operation_type = 'redemption.cancel' AND o.status = 'pending'))::text FROM redemptions r WHERE r.redemption_id = '${refundRedemptionId}'`,
      ]));
      expect(persistedRefund).toEqual({ removed: 2, expectedStatus: 'CANCELED', syncStatus: 'pending', remoteStatus: 'UNFULFILLED', cancelIntents: 1 });
      // Clean the synthetic redemption evidence so later steps see only the journey queue.
      dockerCompose([
        'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-c',
        `DELETE FROM outbox WHERE redemption_id = '${refundRedemptionId}'; DELETE FROM audit_logs WHERE redemption_id = '${refundRedemptionId}'`,
      ]);

      // QRA-17: request local-only conversion of a synthetic synchronized queue; only the local intent is persisted.
      dockerCompose([
        'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-c',
        `UPDATE queues SET queue_mode = 'channel_points', reward_origin = 'bot_created', reward_id = 'ops15-synthetic-manual-mode-reward', cost = 1, mode_transition_status = 'none', remote_sync_status = 'synced', is_open = true WHERE id = '${dto.id}'`,
      ]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      const manualModeResponsePromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === `/api/queues/${dto.id}/manual-mode`
          && response.request().method() === 'POST';
      }).then(async (response) => ({ status: response.status(), request: response.request().postDataJSON(), body: await response.json() }));
      await queueCard.getByRole('button', { name: 'Usar fila local', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
      const manualModeResponse = await manualModeResponsePromise;
      expect(manualModeResponse.status).toBe(202);
      expect(manualModeResponse.request).toEqual({});
      expect(manualModeResponse.body).toMatchObject({
        status: 'pending',
        queue: { id: dto.id, queueMode: 'channel_points', isOpen: false, remoteSyncStatus: 'pending_close', modeTransitionStatus: 'pending_pause', version: 6 },
      });
      const persistedManualMode = dockerCompose([
        'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-At', '-c',
        `SELECT json_build_object('operationType', operation_type, 'status', status, 'convert', payload->'convertToManualAfterConfirm')::text FROM outbox WHERE idempotency_key = 'queue:${dto.id}:mode.manual:6'`,
      ]);
      expect(JSON.parse(persistedManualMode)).toEqual({ operationType: 'reward.set_open', status: 'pending', convert: true });
      // Restore the disposable queue to the state the following local-archive journey expects (version 5).
      dockerCompose([
        'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-c',
        `DELETE FROM outbox WHERE entity_id = '${dto.id}'; UPDATE queues SET queue_mode = 'manual_only', reward_origin = 'none', reward_id = NULL, cost = NULL, mode_transition_status = 'none', remote_sync_status = 'local_only', is_open = false, version = 5 WHERE id = '${dto.id}'`,
      ]);

      // QRA-22: request deletion of a synthetic synchronized queue; only the local intent is persisted (no worker/Twitch).
      dockerCompose([
        'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-c',
        `UPDATE queues SET queue_mode = 'channel_points', reward_origin = 'bot_created', reward_id = 'ops15-synthetic-delete-reward', cost = 1, mode_transition_status = 'none', remote_sync_status = 'synced', is_open = false WHERE id = '${dto.id}'`,
      ]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      const deleteResponsePromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === `/api/queues/${dto.id}/delete`
          && response.request().method() === 'POST';
      }).then(async (response) => ({ status: response.status(), request: response.request().postDataJSON(), body: await response.json() }));
      await queueCard.getByRole('button', { name: 'Excluir fila', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
      const deleteResponse = await deleteResponsePromise;
      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.request).toEqual({ confirm: true });
      expect(deleteResponse.body).toMatchObject({
        status: 'pending', activeRemoved: 0, refundsRequested: 0,
        queue: { id: dto.id, lifecycleStatus: 'deleting', isArchived: true, isOpen: false, remoteSyncStatus: 'delete_pending', version: 6 },
      });
      const persistedDeletion = dockerCompose([
        'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-At', '-c',
        `SELECT json_build_object('operationType', operation_type, 'status', status, 'mayHaveReachedTwitch', payload->'requestMayHaveReachedTwitch', 'safeToDelete', payload->'safeToDelete')::text FROM outbox WHERE idempotency_key = 'queue:${dto.id}:reward.delete'`,
      ]);
      expect(JSON.parse(persistedDeletion)).toEqual({ operationType: 'reward.delete', status: 'pending', mayHaveReachedTwitch: false, safeToDelete: false });
      // Restore the disposable queue for the local-archive steps that follow.
      dockerCompose([
        'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-c',
        `DELETE FROM outbox WHERE entity_id = '${dto.id}'; UPDATE queues SET lifecycle_status = 'active', is_archived = false, queue_mode = 'manual_only', reward_origin = 'none', reward_id = NULL, cost = NULL, mode_transition_status = 'none', remote_sync_status = 'local_only', is_open = false, version = 5 WHERE id = '${dto.id}'`,
      ]);

      dockerCompose([
        'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-c',
        `UPDATE queues SET queue_mode = 'channel_points', reward_origin = 'bot_created', reward_id = 'ops15-synthetic-uncertain-reward', cost = 1, mode_transition_status = 'none', remote_sync_status = 'unknown', version = version + 1 WHERE id = '${dto.id}'`,
      ]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      const uncertainProjection = await page.evaluate(async () => {
        const response = await fetch('/api/queues');
        return { status: response.status, body: await response.json() };
      });
      expect(uncertainProjection.status).toBe(200);
      expect(uncertainProjection.body.find(({ id }) => id === dto.id)).toMatchObject({
        queueMode: 'channel_points', rewardOrigin: 'bot_created', rewardId: 'ops15-synthetic-uncertain-reward',
        remoteSyncStatus: 'unknown', modeTransitionStatus: 'none', lifecycleStatus: 'active', isArchived: false,
      });
      const uncertainQueueCard = page.locator('.queue-list-card').filter({
        has: page.getByRole('heading', { name: title, exact: true }),
      });
      await uncertainQueueCard.getByRole('button', { name: 'Continuar para a confirmação final da exclusão', exact: true }).waitFor();
      const challengeResponsePromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === `/api/queues/${dto.id}/archive-local/challenge`
          && response.request().method() === 'POST';
      });
      await uncertainQueueCard.getByRole('button', { name: 'Continuar para a confirmação final da exclusão', exact: true }).click();
      const firstArchiveDialog = page.getByRole('dialog');
      await firstArchiveDialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
      const challengeResponse = await challengeResponsePromise;
      expect(challengeResponse.status()).toBe(200);
      expect(challengeResponse.request().postDataJSON()).toEqual({ expectedVersion: 6 });
      const challengeDto = await challengeResponse.json();
      expect(challengeDto).toMatchObject({
        status: 'challenge_issued', expectedVersion: 6, remoteSyncStatus: 'unknown',
      });
      expect(challengeDto.challengeId).toMatch(/^[0-9a-f-]{36}$/i);

      const confirmArchiveResponsePromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === origin && responseUrl.pathname === `/api/queues/${dto.id}/archive-local/confirm`
          && response.request().method() === 'POST';
      });
      const finalArchiveDialog = page.getByRole('dialog');
      await finalArchiveDialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
      const confirmArchiveResponse = await confirmArchiveResponsePromise;
      expect(confirmArchiveResponse.status()).toBe(200);
      expect(confirmArchiveResponse.request().postDataJSON()).toEqual({
        challengeId: challengeDto.challengeId,
        expectedVersion: 6,
        remoteSyncStatus: 'unknown',
      });
      const archivedDto = await confirmArchiveResponse.json();
      expect(archivedDto).toMatchObject({
        status: 'archived',
        queue: {
          id: dto.id, lifecycleStatus: 'deleted', isArchived: true, isOpen: false,
          remoteSyncStatus: 'unknown', version: 7,
        },
      });
      await page.getByRole('status').filter({ hasText: 'Fila removida do painel. O status da recompensa Twitch e o histórico foram preservados.' }).waitFor();
      // Bind to the projection requested by the reloaded document and read its body inside the response handler:
      // Chromium discards the body once a navigation replaces the page, and a polling GET issued by the old
      // document before the reload must never be the one asserted (it is ignored, even when its body is lost).
      let reloadStarted = false;
      const reloadProjectionRequests = new Set();
      let resolveArchivedProjection;
      const archivedProjectionPromise = new Promise((resolve) => { resolveArchivedProjection = resolve; });
      const isProjectionRequest = (request) => {
        const requestUrl = new URL(request.url());
        return requestUrl.origin === origin && requestUrl.pathname === '/api/queues' && request.method() === 'GET';
      };
      const onProjectionRequest = (request) => {
        if (reloadStarted && isProjectionRequest(request)) reloadProjectionRequests.add(request);
      };
      const onProjectionResponse = async (response) => {
        if (!reloadProjectionRequests.has(response.request())) return;
        try {
          resolveArchivedProjection({ status: response.status(), body: await response.json() });
        } catch {
          // Body lost to a navigation: this was an old-document request; wait for the reloaded document's one.
        }
      };
      page.on('request', onProjectionRequest);
      page.on('response', onProjectionResponse);
      reloadStarted = true;
      await page.reload({ waitUntil: 'domcontentloaded' });
      const archivedProjection = await archivedProjectionPromise;
      page.off('request', onProjectionRequest);
      page.off('response', onProjectionResponse);
      expect(archivedProjection.status).toBe(200);
      expect(archivedProjection.body.some(({ id }) => id === dto.id)).toBe(false);
      expect(await page.getByRole('heading', { name: title, exact: true }).count()).toBe(0);
      const persistedArchive = dockerCompose([
        'exec', '--no-TTY', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'queuebot', '-d', 'queuebot', '-At', '-c',
        `SELECT json_build_object('lifecycleStatus', lifecycle_status, 'isArchived', is_archived, 'isOpen', is_open, 'remoteSyncStatus', remote_sync_status, 'version', version, 'hasDeletedAt', deleted_at IS NOT NULL)::text FROM queues WHERE id = '${dto.id}'`,
      ]);
      expect(JSON.parse(persistedArchive)).toEqual({
        lifecycleStatus: 'deleted', isArchived: true, isOpen: false, remoteSyncStatus: 'unknown', version: 7, hasDeletedAt: true,
      });
      expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.window.innerWidth)).toBe(true);
      await context.close();
    } finally {
      await browser.close();
    }
  }, 300_000);
});
