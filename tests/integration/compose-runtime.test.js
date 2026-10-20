import { randomUUID } from 'node:crypto';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { cleanupIsolatedComposeProject } from '../helpers/isolated-compose-cleanup.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const projectName = `queuebot-accept-${process.pid}-${randomUUID().slice(0, 8)}`;
const composeFile = `${root}/compose.yaml`;
const buildComposeFile = `${root}/compose.build.yaml`;
let hostPort;
let composeStarted = false;
let localCertDirectory;
let communityCatalogDirectory;

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
      IMAGE_TAG: 'dev',
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
    dockerCompose(['build', 'bot']);
    dockerCompose(['up', '--detach', 'bot']);
    composeStarted = true;
  }, 240_000);

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
      spawnSync('docker', ['image', 'rm', 'ghcr.io/gustavo8000br/subarushogun_gi_twich_bot:dev'], {
        cwd: root,
        encoding: 'utf8',
        timeout: 60_000,
      });
    }
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

  it('serves the overlay document from Next and proxies the live capability API to Fastify on the same origin', async () => {
    const document = await request('/overlay.html');
    expect(document.status).toBe(200);
    expect(document.headers['content-type']).toContain('text/html');
    expect(document.body).toContain('id="overlay-widget"');

    const projection = await request('/overlay/api/widget');
    expect(projection.status).toBe(401);
    expect(projection.headers['cache-control']).toContain('no-store');
    expect(projection.json()).toEqual({ error: 'Widget indisponível.' });

    const panel = await request('/');
    expect(panel.status).toBe(200);
    expect(panel.headers['content-type']).toContain('text/html');
    expect(panel.body).toContain('class="app-shell"');
    expect(panel.body).toContain('href="/styles.css"');

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
      const source = join(root, 'apps', 'web', 'localization', 'catalogs', moduleName, 'en.tsv');
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
});
