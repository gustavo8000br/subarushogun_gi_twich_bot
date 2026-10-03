import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const projectName = `queuebot-accept-${process.pid}-${randomUUID().slice(0, 8)}`;
const composeFile = `${root}/compose.yaml`;
let hostPort;
let composeStarted = false;

function dockerCompose(args, options = {}) {
  const result = spawnSync('docker', [
    'compose', '--project-name', projectName, '--file', composeFile, ...args,
  ], {
    cwd: root,
    encoding: 'utf8',
    timeout: options.timeout ?? 180_000,
    env: { ...process.env, APP_PORT: String(hostPort) },
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

function health() {
  return fetch(`http://127.0.0.1:${hostPort}/health`, { signal: AbortSignal.timeout(2000) });
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
    hostPort = await getFreePort();
    dockerCompose(['up', '--build', '--detach', 'bot']);
    composeStarted = true;
  }, 240_000);

  afterAll(() => {
    if (!composeStarted) return;
    const result = spawnSync('docker', [
      'compose', '--project-name', projectName, '--file', composeFile, 'down', '--volumes', '--remove-orphans',
    ], { cwd: root, encoding: 'utf8', timeout: 60_000 });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'isolated Compose cleanup failed');
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
