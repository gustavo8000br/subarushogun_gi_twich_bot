// OPS-15 D-1: REAL PostgreSQL (disposable container) stopped and started while a pg.Pool holds idle clients.
// Without the 'error' listener Node throws `Unhandled 'error' event` (the API crash seen in the QA run).
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupIsolatedPostgres, ISOLATED_POSTGRES_AFTER_ALL_TIMEOUT_MS, ISOLATED_POSTGRES_CLEANUP_CALL_TIMEOUT_MS } from '../helpers/isolated-postgres-cleanup.mjs';
import {
  ISOLATED_POSTGRES_BEFORE_ALL_TIMEOUT_MS, ISOLATED_POSTGRES_IMAGE, ISOLATED_POSTGRES_LABEL, ensurePostgresImage, runDockerCommand,
} from '../helpers/isolated-postgres-image.mjs';
import { attachPoolErrorHandler } from '../../apps/api/src/persistence/pool-error-handler.mjs';
import { createStructuredLogger } from '../../apps/api/src/observability/structured-logger.mjs';

const containerName = `queuebot-test-${process.pid}-${randomUUID().slice(0, 8)}`;
const volumeName = `${containerName}-data`;
const lines = [];
let pool;
let port;

const docker = (args) => {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 60_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `docker ${args[0]} failed`);
  return result.stdout.trim();
};
const ready = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync('docker', ['exec', containerName, 'pg_isready', '-U', 'queuebot', '-d', 'queuebot'], { encoding: 'utf8', timeout: 3000 });
    if (probe.status === 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
};

describe('pg.Pool survives a PostgreSQL stop and start', () => {
  beforeAll(async () => {
    ensurePostgresImage();
    // A named volume (tmpfs is dropped on stop) and a fixed host port (an ephemeral one changes on restart).
    port = await new Promise((resolve) => { const probe = net.createServer(); probe.listen(0, '127.0.0.1', () => { const { port: free } = probe.address(); probe.close(() => resolve(free)); }); });
    docker(['run', '--detach', '--pull', 'never', '--label', ISOLATED_POSTGRES_LABEL, '--name', containerName,
      '--env', 'POSTGRES_USER=queuebot', '--env', 'POSTGRES_PASSWORD=isolated-test-password', '--env', 'POSTGRES_DB=queuebot',
      '--publish', `127.0.0.1:${port}:5432`, '--volume', `${volumeName}:/var/lib/postgresql`, ISOLATED_POSTGRES_IMAGE]);
    expect(await ready()).toBe(true);
    pool = new pg.Pool({ connectionString: `postgresql://queuebot:isolated-test-password@127.0.0.1:${port}/queuebot` });
    // pg_isready also answers during the image's temporary init server; wait for a real query to succeed.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const probe = new pg.Client({ connectionString: pool.options.connectionString });
      probe.on('error', () => undefined);
      const ok = await probe.connect().then(() => probe.query('SELECT 1')).then(() => true, () => false);
      await probe.end().catch(() => undefined);
      if (ok) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    attachPoolErrorHandler(pool, { logEvent: createStructuredLogger({ level: 'info', write: (line) => lines.push(line) }) });
  }, ISOLATED_POSTGRES_BEFORE_ALL_TIMEOUT_MS);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await cleanupIsolatedPostgres({ containerName, volumeName, runDocker: (args) => runDockerCommand(args, { timeout: ISOLATED_POSTGRES_CLEANUP_CALL_TIMEOUT_MS }) });
  }, ISOLATED_POSTGRES_AFTER_ALL_TIMEOUT_MS);

  it('logs a safe event, does not crash, and queries work again after the database returns', async () => {
    // Hold several idle clients so the stop produces idle-client errors.
    const clients = await Promise.all([pool.connect(), pool.connect(), pool.connect()]);
    clients.forEach((client) => client.release());
    docker(['stop', '--time', '2', containerName]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(lines.length).toBeGreaterThan(0);
    expect(JSON.parse(lines[0])).toMatchObject({ event: 'database_pool_error', level: 'error' });
    expect(lines.join('')).not.toMatch(/isolated-test-password|postgresql:/);
    docker(['start', containerName]);
    expect(await ready()).toBe(true);
    let result;
    for (let attempt = 0; attempt < 20 && !result; attempt += 1) {
      result = await pool.query('SELECT 1 AS ok').catch(async () => { await new Promise((resolve) => setTimeout(resolve, 500)); return null; });
    }
    expect(result?.rows[0].ok).toBe(1);
  }, 90_000);
});
