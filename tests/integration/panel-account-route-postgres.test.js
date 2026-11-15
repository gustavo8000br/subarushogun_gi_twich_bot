// OPS-15 FT-06 (ledger #17), ACC-01/ACC-02/STA-01: the account routes and the state projection driven through real
// Fastify routes over the REAL repository on an ISOLATED PostgreSQL with the real migrations (never SQLite, never
// Prisma mocks). Evidence class: A (API + PostgreSQL); no Twitch, no browser.
//
// The former "DEFECT" `it.fails` test (session id leak in the account DTO) was fixed on 2026-11-15 and is a normal test.
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ISOLATED_POSTGRES_AFTER_ALL_TIMEOUT_MS, ISOLATED_POSTGRES_CLEANUP_CALL_TIMEOUT_MS, cleanupIsolatedPostgres,
} from '../helpers/isolated-postgres-cleanup.mjs';
import {
  ISOLATED_POSTGRES_BEFORE_ALL_TIMEOUT_MS, ISOLATED_POSTGRES_IMAGE, ISOLATED_POSTGRES_LABEL, ensurePostgresImage, runDockerCommand,
} from '../helpers/isolated-postgres-image.mjs';
import { createQueueRepository } from '../../apps/api/src/persistence/queue-repository.mjs';
import { registerLocalSession } from '../../apps/api/src/http/local-session.mjs';
import { registerQueueRoutes } from '../../apps/api/src/http/queue-routes.mjs';
import { registerSafeHttpErrorHandler } from '../../apps/api/src/http/safe-http-error-handler.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const containerName = `queuebot-panel-account-${process.pid}-${randomUUID().slice(0, 8)}`;
let prisma;
let app;
let headers;
let sessionHeaders;
let sessionId;

function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `docker ${args[0]} failed`);
  return result.stdout.trim();
}

const post = (url, payload) => app.inject({ method: 'POST', url, payload, headers: { ...headers, 'idempotency-key': randomUUID() } });

describe('FT-06 account routes and state projection on isolated PostgreSQL', () => {
  beforeAll(async () => {
    ensurePostgresImage();
    docker(['run', '--detach', '--rm', '--pull', 'never', '--label', ISOLATED_POSTGRES_LABEL, '--name', containerName,
      '--env', 'POSTGRES_USER=queuebot', '--env', 'POSTGRES_PASSWORD=isolated-test-password', '--env', 'POSTGRES_DB=queuebot',
      '--publish', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql:rw,noexec,nosuid,size=512m',
      ISOLATED_POSTGRES_IMAGE]);
    const published = docker(['port', containerName, '5432/tcp']).split(':').at(-1);
    const connectionString = `postgresql://queuebot:isolated-test-password@127.0.0.1:${published}/queuebot?schema=public`;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const probe = spawnSync('docker', ['exec', containerName, 'pg_isready', '-U', 'queuebot', '-d', 'queuebot'], { cwd: root, encoding: 'utf8', timeout: 3000 });
      if (probe.status === 0) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    expect(ready, 'isolated PostgreSQL did not become healthy').toBe(true);
    const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
      cwd: root, encoding: 'utf8', timeout: 60_000, env: { ...process.env, DATABASE_URL: connectionString },
    });
    expect(migration.status, migration.stderr || migration.stdout).toBe(0);
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const repository = createQueueRepository(prisma);
    app = Fastify();
    const reportDiagnostic = vi.fn(() => '55555555-5555-4555-8555-555555555555');
    registerSafeHttpErrorHandler(app, { reportDiagnostic });
    registerLocalSession(app, { port: 3000 });
    registerQueueRoutes(app, { repository, integrations: {}, reportDiagnostic, publicBaseUrl: 'https://localhost:3000', productVersion: 'v1.2.3-beta' });
    const session = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000' } });
    const cookie = session.cookies[0];
    sessionId = cookie.value;
    sessionHeaders = { host: 'localhost:3000', origin: 'https://localhost:3000', cookie: `${cookie.name}=${cookie.value}` };
    headers = { ...sessionHeaders, 'x-csrf-token': session.json().csrfToken };
  }, ISOLATED_POSTGRES_BEFORE_ALL_TIMEOUT_MS);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await cleanupIsolatedPostgres({
      containerName,
      runDocker: (args) => runDockerCommand(args, { timeout: ISOLATED_POSTGRES_CLEANUP_CALL_TIMEOUT_MS }),
    });
  }, ISOLATED_POSTGRES_AFTER_ALL_TIMEOUT_MS);

  it('STA-01 on an empty database projects the default account and the default locale', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/state', headers: sessionHeaders });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ account: { label: 'Streamer', source: 'default' }, queues: [], pending_operations: [] });
  });

  it('ACC-01 persists the trimmed label (audited) and 400 leaves the stored account untouched', async () => {
    const ok = await post('/api/account', { label: '  Spiral Abyss  ' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ label: 'Spiral Abyss', source: 'manual' });
    const stored = await prisma.setting.findUnique({ where: { key: 'account_state' } });
    expect(stored.value).toMatchObject({ label: 'Spiral Abyss', source: 'manual', updatedBy: sessionId });
    const audit = await prisma.auditLog.findFirst({ where: { event: 'account.changed' }, orderBy: { createdAt: 'desc' } });
    expect(audit).toMatchObject({ nextState: 'Spiral Abyss', origin: 'panel', actorId: sessionId });
    for (const label of ['', '   ', 'x'.repeat(61), 'two\nlines', 7]) {
      const refused = await post('/api/account', { label });
      expect(refused.statusCode, String(label)).toBe(400);
      expect(refused.json()).toEqual({ error: 'O nome deve ter até 60 caracteres e não pode conter quebras de linha.' });
    }
    expect((await prisma.setting.findUnique({ where: { key: 'account_state' } })).value.label).toBe('Spiral Abyss');
    const state = await app.inject({ method: 'GET', url: '/api/state', headers: sessionHeaders });
    expect(state.json().account).toMatchObject({ label: 'Spiral Abyss', source: 'manual' });
  });

  it('ACC-02 persists the default label, keeps a manual current label, and the state projection reflects it', async () => {
    // Seed a different previous actor: setDefaultAccountLabel spreads the previous state, so without this the
    // `updatedBy = sessionId` assertion below would pass even if the repository stopped writing `updatedBy` (mutation M14).
    const seeded = (await prisma.setting.findUnique({ where: { key: 'account_state' } })).value;
    const previousState = { ...seeded, updatedBy: 'previous-actor' };
    await prisma.setting.update({ where: { key: 'account_state' }, data: { value: previousState } });
    expect((await prisma.setting.findUnique({ where: { key: 'account_state' } })).value.updatedBy).toBe('previous-actor');
    const ok = await post('/api/account/default', { label: 'World Level 9' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ defaultLabel: 'World Level 9', label: 'Spiral Abyss', source: 'manual' });
    const state = await app.inject({ method: 'GET', url: '/api/state', headers: sessionHeaders });
    expect(state.json().account).toMatchObject({ label: 'Spiral Abyss', defaultLabel: 'World Level 9' });
    const refused = await post('/api/account/default', { label: 'bad\nlabel' });
    expect(refused.statusCode).toBe(400);
    const stored = (await prisma.setting.findUnique({ where: { key: 'account_state' } })).value;
    expect(stored).toMatchObject({ defaultLabel: 'World Level 9', updatedBy: sessionId });
    const audit = await prisma.auditLog.findFirst({ where: { event: 'account.default_label_changed' }, orderBy: { createdAt: 'desc' } });
    expect(audit).toMatchObject({ nextState: 'World Level 9', origin: 'panel', actorId: sessionId });
  });

  it('ACC-01/02/STA-01 the account DTO does not carry the HttpOnly local session id (`updatedBy`) or internal ids', async () => {
    const accountResponse = await post('/api/account', { label: 'Leak check' });
    const defaultResponse = await post('/api/account/default', { label: 'Leak check default' });
    const state = await app.inject({ method: 'GET', url: '/api/state', headers: sessionHeaders });
    for (const response of [accountResponse, defaultResponse, state]) {
      expect(response.body).not.toContain(sessionId);
    }
    expect(Object.keys(state.json().account).sort()).toEqual(['defaultLabel', 'label', 'source']);
  });
});
