import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOverlayWidgetRepository } from '../../apps/api/src/persistence/overlay-widget-repository.mjs';
import { createQueueRepository } from '../../apps/api/src/persistence/queue-repository.mjs';
import { cleanupIsolatedPostgres } from '../helpers/isolated-postgres-cleanup.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const containerName = `queuebot-overlay-${process.pid}-${randomUUID().slice(0, 8)}`;
const volumeName = `queuebot-overlay-data-${process.pid}-${randomUUID().slice(0, 8)}`;
let prisma;
let repository;
let containerStarted = false;
let connectionString;

function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `docker ${args[0]} failed`);
  return result.stdout.trim();
}

async function waitForPostgres() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync('docker', ['exec', containerName, 'pg_isready', '-U', 'queuebot', '-d', 'queuebot'], {
      cwd: root, encoding: 'utf8', timeout: 3000,
    });
    if (probe.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('isolated PostgreSQL did not become healthy');
}

describe('PostgreSQL OBS widget persistence contract', () => {
  beforeAll(async () => {
    docker(['run', '--detach', '--rm', '--name', containerName,
      '--env', 'POSTGRES_USER=queuebot', '--env', 'POSTGRES_PASSWORD=isolated-test-password', '--env', 'POSTGRES_DB=queuebot',
      '--publish', '127.0.0.1::5432', '--volume', `${volumeName}:/var/lib/postgresql`,
      'postgres:18.6-bookworm']);
    containerStarted = true;
    const published = docker(['port', containerName, '5432/tcp']).split(':').at(-1);
    connectionString = `postgresql://queuebot:isolated-test-password@127.0.0.1:${published}/queuebot?schema=public`;
    await waitForPostgres();
    const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
      cwd: root, encoding: 'utf8', timeout: 60_000,
      env: { ...process.env, DATABASE_URL: connectionString },
    });
    expect(migration.status, migration.stderr || migration.stdout).toBe(0);
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    repository = createOverlayWidgetRepository(prisma);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (containerStarted) {
      cleanupIsolatedPostgres({
        containerName,
        volumeName,
        runDocker: (args) => spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 30_000 }),
      });
      containerStarted = false;
    }
  });

  it('creates the durable widget table and required capability/source columns through real migrations', async () => {
    const table = await prisma.$queryRaw`SELECT to_regclass('public.overlay_widgets')::text AS table_name`;
    expect(table[0]?.table_name).toBe('overlay_widgets');

    const columns = await prisma.$queryRaw`
      SELECT column_name::text AS column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'overlay_widgets'
      ORDER BY column_name
    `;
    expect(columns.map(({ column_name }) => column_name)).toEqual(expect.arrayContaining([
      'id', 'source_type', 'queue_id', 'fixed_text', 'fallback_text', 'style',
      'capability_hash', 'capability_version', 'revoked_at', 'deleted_at', 'version', 'created_at', 'updated_at',
    ]));
  });

  it('stores only a capability hash and persists widget configuration after reconnecting', async () => {
    const table = await prisma.$queryRaw`SELECT to_regclass('public.overlay_widgets')::text AS table_name`;
    expect(table[0]?.table_name).toBe('overlay_widgets');

    const id = randomUUID();
    const capabilityHash = 'a'.repeat(64);
    await prisma.$executeRaw`
      INSERT INTO overlay_widgets (id, source_type, fixed_text, fallback_text, style, capability_hash, updated_at)
      VALUES (${id}::uuid, 'fixed_text', 'Live ready', '', '{}'::jsonb, ${capabilityHash}, now())
    `;
    await prisma.$disconnect();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const rows = await prisma.$queryRaw`SELECT id::text, source_type, fixed_text, capability_hash FROM overlay_widgets WHERE id = ${id}::uuid`;
    expect(rows).toEqual([{ id, source_type: 'fixed_text', fixed_text: 'Live ready', capability_hash: capabilityHash }]);
    expect(JSON.stringify(rows)).not.toContain('raw-capability-token');
  });

  it('enforces unique capability hashes in PostgreSQL rather than relying on a read-before-write check', async () => {
    const capabilityHash = 'b'.repeat(64);
    const firstId = randomUUID();
    const secondId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO overlay_widgets (id, source_type, fixed_text, capability_hash, updated_at)
      VALUES (${firstId}::uuid, 'fixed_text', 'First', ${capabilityHash}, now())
    `;
    await expect(prisma.$executeRaw`
      INSERT INTO overlay_widgets (id, source_type, fixed_text, capability_hash, updated_at)
      VALUES (${secondId}::uuid, 'fixed_text', 'Second', ${capabilityHash}, now())
    `).rejects.toThrow();
  });

  it('rejects a persisted capability value that is not a lowercase SHA-256 digest', async () => {
    await expect(prisma.$executeRaw`
      INSERT INTO overlay_widgets (id, source_type, fixed_text, capability_hash, updated_at)
      VALUES (${randomUUID()}::uuid, 'fixed_text', 'Widget', 'raw-capability-token', now())
    `).rejects.toThrow();
  });

  it('enforces atomic source and queue scope constraints in PostgreSQL', async () => {
    await expect(prisma.$executeRaw`
      INSERT INTO overlay_widgets (id, source_type, queue_id, fixed_text, updated_at)
      VALUES (${randomUUID()}::uuid, 'queue_name', NULL, NULL, now())
    `).rejects.toThrow();
    await expect(prisma.$executeRaw`
      INSERT INTO overlay_widgets (id, source_type, queue_id, fixed_text, updated_at)
      VALUES (${randomUUID()}::uuid, 'fixed_text', NULL, NULL, now())
    `).rejects.toThrow();
    await expect(prisma.$executeRaw`
      INSERT INTO overlay_widgets (id, source_type, queue_id, fixed_text, updated_at)
      VALUES (${randomUUID()}::uuid, 'unsupported_source', NULL, NULL, now())
    `).rejects.toThrow();
  });

  it('creates and edits a queue-scoped widget with safe configuration in PostgreSQL', async () => {
    const queue = await prisma.queue.create({ data: { slug: `overlay-${randomUUID().slice(0, 8)}`, title: 'Overlay queue', cost: 10 } });
    const widget = await repository.create({
      sourceType: 'queue_name', queueId: queue.id, fallbackText: 'Fila sem nome',
      style: { textColor: '#FFFFFF' }, capabilityHash: 'c'.repeat(64),
    });
    expect(widget).toMatchObject({ sourceType: 'queue_name', queueId: queue.id, fixedText: null, capabilityVersion: 1, version: 1 });

    const updated = await repository.update({ id: widget.id, expectedVersion: 1, changes: { fallbackText: 'Sem fila', style: { textColor: '#EEEEEE' } } });
    expect(updated).toMatchObject({ id: widget.id, fallbackText: 'Sem fila', style: { textColor: '#EEEEEE' }, version: 2 });
    await expect(repository.update({ id: widget.id, expectedVersion: 1, changes: { fallbackText: 'stale edit' } }))
      .rejects.toMatchObject({ code: 'OVERLAY_WIDGET_VERSION_CONFLICT' });
  });

  it('rejects invalid scope and unsafe style/text before persisting a widget', async () => {
    const countBefore = await prisma.overlayWidget.count();
    await expect(repository.create({ sourceType: 'queue_name' })).rejects.toMatchObject({ code: 'INVALID_OVERLAY_WIDGET_CONFIGURATION' });
    await expect(repository.create({ sourceType: 'fixed_text', fixedText: '😀'.repeat(241) })).rejects.toMatchObject({ code: 'INVALID_OVERLAY_WIDGET_CONFIGURATION' });
    await expect(repository.create({ sourceType: 'account_label', style: { fontFamily: 'url(https://invalid.example)' } })).rejects.toMatchObject({ code: 'INVALID_OVERLAY_WIDGET_CONFIGURATION' });
    const count = await prisma.overlayWidget.count();
    expect(count).toBe(countBefore);
  });

  it('rotates and revokes only the stored hash, and soft-deletes with capability invalidation atomically', async () => {
    const initialHash = 'd'.repeat(64);
    const nextHash = 'e'.repeat(64);
    const widget = await repository.create({ sourceType: 'account_label', capabilityHash: initialHash });

    const rotated = await repository.rotateCapability({ id: widget.id, expectedVersion: 1, capabilityHash: nextHash });
    expect(rotated).toMatchObject({ capabilityHash: nextHash, capabilityVersion: 2, revokedAt: null, version: 2 });
    await expect(repository.findActiveByCapabilityHash(initialHash)).resolves.toBeNull();
    await expect(repository.findActiveByCapabilityHash(nextHash)).resolves.toMatchObject({ id: widget.id });

    const revoked = await repository.revokeCapability({ id: widget.id, expectedVersion: 2 });
    expect(revoked).toMatchObject({ capabilityHash: null, capabilityVersion: 2, version: 3 });
    expect(revoked.revokedAt).toBeInstanceOf(Date);
    await expect(repository.findActiveByCapabilityHash(nextHash)).resolves.toBeNull();

    const another = await repository.create({ sourceType: 'account_label', capabilityHash: initialHash });
    const deleted = await repository.delete({ id: another.id, expectedVersion: 1 });
    expect(deleted).toMatchObject({ capabilityHash: null, version: 2 });
    expect(deleted.deletedAt).toBeInstanceOf(Date);
    expect(deleted.revokedAt).toBeInstanceOf(Date);
    await expect(repository.findActiveByCapabilityHash(initialHash)).resolves.toBeNull();
    await expect(repository.getById(another.id)).resolves.toMatchObject({ id: another.id, deletedAt: expect.any(Date) });
  });

  it('serializes capability reads with deletion and denies reads after deletion commits', async () => {
    const hash = '9'.repeat(64);
    const widget = await repository.create({ sourceType: 'account_label', capabilityHash: hash });
    let enterProjection;
    let releaseProjection;
    const projectionStarted = new Promise((resolve) => { enterProjection = resolve; });
    const projectionGate = new Promise((resolve) => { releaseProjection = resolve; });
    const read = repository.projectWithActiveCapability(hash, async (activeWidget) => {
      enterProjection();
      await projectionGate;
      return { id: activeWidget.id };
    });
    await projectionStarted;
    let deletionFinished = false;
    const deletion = repository.delete({ id: widget.id, expectedVersion: 1 }).then((result) => { deletionFinished = true; return result; });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(deletionFinished).toBe(false);
    releaseProjection();
    await expect(read).resolves.toEqual({ id: widget.id });
    await deletion;
    await expect(repository.projectWithActiveCapability(hash, async () => ({ secret: 'data' }))).resolves.toBeNull();
  });

  it('retains persisted widget configuration and capability state across a real PostgreSQL container restart', async () => {
    const hash = 'f'.repeat(64);
    const widget = await repository.create({ sourceType: 'fixed_text', fixedText: 'Genshin ready', capabilityHash: hash });
    await prisma.$disconnect();
    docker(['restart', containerName]);
    await waitForPostgres();
    const publishedAfterRestart = docker(['port', containerName, '5432/tcp']).split(':').at(-1);
    connectionString = `postgresql://queuebot:isolated-test-password@127.0.0.1:${publishedAfterRestart}/queuebot?schema=public`;
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    repository = createOverlayWidgetRepository(prisma);
    await expect(repository.getById(widget.id)).resolves.toMatchObject({
      id: widget.id, sourceType: 'fixed_text', fixedText: 'Genshin ready', capabilityHash: hash,
    });
  });

  it('projects only selected source values from persisted account, queue, call audit, and service state', async () => {
    const queue = await prisma.queue.create({ data: { slug: `projection-${randomUUID().slice(0, 8)}`, title: 'Theatre', cost: 10, isOpen: true, remoteSyncStatus: 'synced' } });
    await prisma.setting.upsert({ where: { key: 'account_state' }, create: { key: 'account_state', value: { label: 'Asia 1', source: 'manual' } }, update: { value: { label: 'Asia 1', source: 'manual' } } });
    const waiting = await prisma.entry.create({ data: { queueId: queue.id, twitchUserId: `projection-wait-${randomUUID()}`, userLogin: 'waiter', displayName: 'Waiting Player', source: 'manual', status: 'waiting', position: 1 } });
    const calledAt = new Date('2026-01-02T03:04:05.000Z');
    const called = await prisma.entry.create({ data: { queueId: queue.id, twitchUserId: `projection-call-${randomUUID()}`, userLogin: 'called', displayName: 'Called Player', source: 'manual', status: 'called', calledAt } });
    await prisma.auditLog.create({ data: { queueId: queue.id, entryId: called.id, event: 'entry.transitioned', origin: 'panel', previousState: 'waiting', nextState: 'called', safeDetail: { previousPosition: 7 } } });
    await prisma.entry.create({ data: { queueId: queue.id, twitchUserId: `projection-active-${randomUUID()}`, userLogin: 'active', displayName: 'Active Player', source: 'manual', status: 'in_progress', startedAt: new Date('2026-01-02T03:05:00.000Z') } });
    const queueRepository = createQueueRepository(prisma);
    await expect(queueRepository.getOverlaySourceValue({ sourceType: 'account_label' })).resolves.toBe('Asia 1');
    await expect(queueRepository.getOverlaySourceValue({ sourceType: 'queue_name', queueId: queue.id })).resolves.toBe('Theatre');
    await expect(queueRepository.getOverlaySourceValue({ sourceType: 'queue_state', queueId: queue.id })).resolves.toBe('open');
    await expect(queueRepository.getOverlaySourceValue({ sourceType: 'queue_waiting_count', queueId: queue.id })).resolves.toBe(1);
    await expect(queueRepository.getOverlaySourceValue({ sourceType: 'called_viewer_display_name' })).resolves.toBe('Called Player');
    await expect(queueRepository.getOverlaySourceValue({ sourceType: 'called_viewer_position' })).resolves.toBe(7);
    await expect(queueRepository.getOverlaySourceValue({ sourceType: 'in_service_viewer_display_name' })).resolves.toBe('Active Player');
    expect(waiting.uid).toBeNull();
  });

  it('does not publish desired queue state as confirmed while Twitch synchronization is pending or unknown', async () => {
    const queue = await prisma.queue.create({ data: { slug: `state-${randomUUID().slice(0, 8)}`, title: 'Abyss', cost: 10, isOpen: true, remoteSyncStatus: 'pending_open' } });
    const queueRepository = createQueueRepository(prisma);

    for (const remoteSyncStatus of ['pending_open', 'open_unknown', 'pending_close', 'close_unknown', 'pending_create', 'diverged']) {
      await prisma.queue.update({ where: { id: queue.id }, data: { remoteSyncStatus } });
      await expect(queueRepository.getOverlaySourceValue({ sourceType: 'queue_state', queueId: queue.id })).resolves.toBeNull();
    }

    await prisma.queue.update({ where: { id: queue.id }, data: { remoteSyncStatus: 'synced', isOpen: true } });
    await expect(queueRepository.getOverlaySourceValue({ sourceType: 'queue_state', queueId: queue.id })).resolves.toBe('open');
    await prisma.queue.update({ where: { id: queue.id }, data: { remoteSyncStatus: 'synced', isOpen: false } });
    await expect(queueRepository.getOverlaySourceValue({ sourceType: 'queue_state', queueId: queue.id })).resolves.toBe('closed');
  });

  it('projects a queue as closed after its reward pause is confirmed during deletion', async () => {
    const queue = await prisma.queue.create({ data: { slug: `delete-state-${randomUUID().slice(0, 8)}`, title: 'Theatre', cost: 10, isOpen: false, lifecycleStatus: 'deleting', remoteSyncStatus: 'delete_pending' } });
    const queueRepository = createQueueRepository(prisma);

    await expect(queueRepository.getOverlaySourceValue({ sourceType: 'queue_state', queueId: queue.id })).resolves.toBe('closed');
  });
});
