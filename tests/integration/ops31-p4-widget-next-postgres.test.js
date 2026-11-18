// OPS-31 P4 (FT-73, AC 8): the OBS widget source "next" on an ISOLATED PostgreSQL with the real migrations (never SQLite, never Prisma mocks):
// the source value follows the canonical waiting order (priority lane first, then position), skip, restore and reorder;
// nothing but the display name leaves the read; the CHECK constraints of `overlay_widgets` accept the new source only with a queue;
// the migration (up) and its rollback (down, then up again) keep the schema and retire the widgets that use the source.
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ISOLATED_POSTGRES_AFTER_ALL_TIMEOUT_MS, ISOLATED_POSTGRES_CLEANUP_CALL_TIMEOUT_MS, cleanupIsolatedPostgres,
} from '../helpers/isolated-postgres-cleanup.mjs';
import {
  ISOLATED_POSTGRES_BEFORE_ALL_TIMEOUT_MS, ISOLATED_POSTGRES_IMAGE, ISOLATED_POSTGRES_LABEL, ensurePostgresImage, runDockerCommand,
} from '../helpers/isolated-postgres-image.mjs';
import { createQueueRepository } from '../../apps/api/src/persistence/queue-repository.mjs';
import { createOverlayWidgetRepository } from '../../apps/api/src/persistence/overlay-widget-repository.mjs';
import { createOverlayProjectionService } from '../../apps/api/src/domain/overlay-projection-service.mjs';
import { createQueueDomainService } from '../../apps/api/src/domain/queue-service.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const containerName = `queuebot-ops31-p4-${process.pid}-${randomUUID().slice(0, 8)}`;
let connectionString;
let prisma;
let repository;
let overlayRepository;
const now = new Date('2030-01-01T12:00:00.000Z');
const clock = () => now;
const NEXT = 'next_waiting_viewer_display_name';

function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `docker ${args[0]} failed`);
  return result.stdout.trim();
}
const psql = (sql) => {
  const result = spawnSync('docker', ['exec', '-i', containerName, 'psql', '-U', 'queuebot', '-d', 'queuebot', '-v', 'ON_ERROR_STOP=1', '-1', '-f', '-'], { cwd: root, encoding: 'utf8', timeout: 60_000, input: sql });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
};
const migrationFile = (name) => readFileSync(fileURLToPath(new URL(`../../apps/api/prisma/migrations/20261117140000_overlay_next_source/${name}`, import.meta.url)), 'utf8');
const constraint = (name) => psql(`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = '${name}'`);

let sequence = 0;
async function newQueue(extra = {}) {
  sequence += 1;
  return prisma.queue.create({ data: { slug: `p4-${randomUUID().slice(0, 8)}`, title: `Abyss ${sequence}`, cost: 5, isOpen: true, rewardId: `reward-${randomUUID()}`, remoteSyncStatus: 'synced', ...extra } });
}
async function join(queue, login, displayName = login) {
  const result = await repository.importRedemption({
    id: `p4-red-${randomUUID()}`, rewardId: queue.rewardId, broadcasterId: 'broadcaster', userId: `viewer-${randomUUID()}`, userLogin: login, displayName,
    redeemedAt: now, status: 'UNFULFILLED', userInput: '',
  });
  expect(result).toMatchObject({ status: 'added' });
  return prisma.entry.findFirst({ where: { queueId: queue.id, userLogin: login.toLowerCase() } });
}
const nextOf = (queue) => repository.getOverlaySourceValue({ sourceType: NEXT, queueId: queue.id });
const panel = (entryId, to, reason, extra = {}) => createQueueDomainService({ repository }).transitionEntry({ entryId, to, origin: 'panel', trigger: 'panel_action', reason, ...extra });

describe('OPS-31 P4 widget "next" on isolated PostgreSQL', () => {
  beforeAll(async () => {
    ensurePostgresImage();
    docker(['run', '--detach', '--rm', '--pull', 'never', '--label', ISOLATED_POSTGRES_LABEL, '--name', containerName,
      '--env', 'POSTGRES_USER=queuebot', '--env', 'POSTGRES_PASSWORD=isolated-test-password', '--env', 'POSTGRES_DB=queuebot',
      '--publish', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql:rw,noexec,nosuid,size=512m',
      ISOLATED_POSTGRES_IMAGE]);
    const published = docker(['port', containerName, '5432/tcp']).split(':').at(-1);
    connectionString = `postgresql://queuebot:isolated-test-password@127.0.0.1:${published}/queuebot?schema=public`;
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
    repository = createQueueRepository(prisma, { clock });
    overlayRepository = createOverlayWidgetRepository(prisma, { clock });
  }, ISOLATED_POSTGRES_BEFORE_ALL_TIMEOUT_MS);

  afterAll(async () => {
    await prisma?.$disconnect();
    await cleanupIsolatedPostgres({
      containerName,
      runDocker: (args) => runDockerCommand(args, { timeout: ISOLATED_POSTGRES_CLEANUP_CALL_TIMEOUT_MS }),
    });
  }, ISOLATED_POSTGRES_AFTER_ALL_TIMEOUT_MS);

  it('PG73-01 nobody waiting: null (the widget shows nothing), and only waiting entries count', async () => {
    const queue = await newQueue();
    expect(await nextOf(queue)).toBeNull();
    const ana = await join(queue, 'Ana');
    expect(await nextOf(queue)).toBe('Ana');
    await panel(ana.id, 'called', 'operator_call');
    expect(await nextOf(queue)).toBeNull();
    await panel(ana.id, 'in_progress', 'operator_attend');
    expect(await nextOf(queue)).toBeNull();
  });

  it('PG73-02 canonical order: the priority lane first, then position; call, skip, restore and reorder move it', async () => {
    const queue = await newQueue();
    const ana = await join(queue, 'Ana');
    const bia = await join(queue, 'Bia');
    const caio = await join(queue, 'Caio');
    expect(await nextOf(queue)).toBe('Ana');

    // a standard entry promoted to the priority lane goes ahead of the standard lane
    await repository.setEntryPriority({ queueId: queue.id, entryId: caio.id, priority: true, reason: 'operator_override' });
    expect(await nextOf(queue)).toBe('Caio');
    // two entries in the priority lane: once the first is called, the second (position 2 of ITS lane) still beats Ana (position 1 of the standard lane)
    await repository.setEntryPriority({ queueId: queue.id, entryId: bia.id, priority: true, reason: 'operator_override' });
    await panel(caio.id, 'called', 'operator_call');
    expect(await nextOf(queue)).toBe('Bia');
    const caioCalled = await prisma.entry.findUnique({ where: { id: caio.id } });
    await panel(caio.id, 'waiting', 'operator_skip', { expectedVersion: caioCalled.version });
    await repository.setEntryPriority({ queueId: queue.id, entryId: caio.id, priority: false, reason: 'operator_override' });
    await repository.setEntryPriority({ queueId: queue.id, entryId: bia.id, priority: false, reason: 'operator_override' });
    await prisma.$executeRaw`UPDATE entries SET position = CASE id WHEN ${ana.id}::uuid THEN 1 WHEN ${bia.id}::uuid THEN 2 ELSE 3 END WHERE queue_id = ${queue.id}::uuid`;
    expect(await nextOf(queue)).toBe('Ana');
    // the read follows the canonical contract (class, then position, then creation, then id), not only the stored position:
    // renumbering normally makes the two agree, so force a priority entry whose position is higher than the standard head
    await prisma.$executeRaw`UPDATE entries SET priority_class = 'priority', priority_reason = 'operator_override', position = 9 WHERE id = ${bia.id}::uuid`;
    expect(await nextOf(queue)).toBe('Bia');
    await prisma.$executeRaw`UPDATE entries SET priority_class = 'standard', priority_reason = NULL, position = 2 WHERE id = ${bia.id}::uuid`;
    expect(await nextOf(queue)).toBe('Ana');

    // reorder
    const current = await prisma.entry.findUnique({ where: { id: bia.id } });
    await repository.moveWaitingEntry({ queueId: queue.id, entryId: bia.id, position: 1, expectedVersion: current.version });
    expect(await nextOf(queue)).toBe('Bia');

    // call the head: the next person is the next waiting one; skipping returns the called entry at position 2, so Ana stays next
    await panel(bia.id, 'called', 'operator_call');
    expect(await nextOf(queue)).toBe('Ana');
    const called = await prisma.entry.findUnique({ where: { id: bia.id } });
    await panel(bia.id, 'waiting', 'operator_skip', { expectedVersion: called.version });
    expect(await nextOf(queue)).toBe('Ana');
    expect((await prisma.entry.findUnique({ where: { id: bia.id } })).position).toBeGreaterThan((await prisma.entry.findUnique({ where: { id: ana.id } })).position);

    // the head goes away: the next waiting entry is shown, and a removed entry is never shown
    await panel(ana.id, 'called', 'operator_call');
    await panel(ana.id, 'no_show', 'operator_no_show');
    expect(await nextOf(queue)).toBe('Bia');
    // restore returns the absent entry at position 2: the head stays Bia
    const absent = await prisma.entry.findUnique({ where: { id: ana.id } });
    await panel(ana.id, 'waiting', 'operator_restore', { expectedVersion: absent.version });
    expect(await nextOf(queue)).toBe('Bia');
  });

  it('PG73-03 isolation: another queue, a deleted queue and an unknown queue never leak a name', async () => {
    const a = await newQueue();
    const b = await newQueue();
    await join(a, 'OnlyInA');
    expect(await nextOf(b)).toBeNull();
    expect(await repository.getOverlaySourceValue({ sourceType: NEXT, queueId: randomUUID() })).toBeNull();
    expect(await repository.getOverlaySourceValue({ sourceType: NEXT, queueId: null })).toBeNull();
    await prisma.queue.update({ where: { id: a.id }, data: { lifecycleStatus: 'deleted' } });
    expect(await nextOf(a)).toBeNull();
  });

  it('PG73-04 unicode and long names come back intact, and the full projection carries only the name and style', async () => {
    const queue = await newQueue();
    const longName = `${'Ñandú-'.repeat(20)}😀`;
    await join(queue, 'viewer_login', longName);
    expect(await nextOf(queue)).toBe(longName);

    const token = 'k'.repeat(43);
    await overlayRepository.create({ sourceType: NEXT, queueId: queue.id, capabilityHash: createHash('sha256').update(token, 'utf8').digest('hex') });
    const projected = await createOverlayProjectionService({ overlayRepository, queueRepository: repository }).readWithCapability(token);
    expect(projected).toMatchObject({ sourceType: NEXT, value: longName });
    expect(Object.keys(projected).sort()).toEqual(['fallbackText', 'messages', 'productLocale', 'sourceType', 'style', 'value']);
    const serialized = JSON.stringify(projected);
    for (const secret of ['viewer_login', 'twitchUserId', 'userLogin', 'uid', 'redemption', queue.id]) expect(serialized).not.toContain(secret);
  });

  it('MG-73-01 CHECK constraints: the source needs a queue and no fixed text; other sources keep their rules', async () => {
    const queue = await newQueue();
    const insert = (source, { queueId = null, fixedText = null } = {}) => prisma.$executeRaw`
      INSERT INTO overlay_widgets (id, source_type, queue_id, fixed_text, updated_at)
      VALUES (${randomUUID()}::uuid, ${source}, ${queueId}::uuid, ${fixedText}, now())`;
    await expect(insert(NEXT, { queueId: queue.id })).resolves.toBe(1);
    await expect(insert(NEXT)).rejects.toThrow();
    await expect(insert(NEXT, { queueId: queue.id, fixedText: 'x' })).rejects.toThrow();
    await expect(insert('next_waiting_viewer_position', { queueId: queue.id })).rejects.toThrow();
    await expect(insert('queue_name', { queueId: queue.id })).resolves.toBe(1);
    await expect(insert('account_label')).resolves.toBe(1);
    await expect(insert('account_label', { queueId: queue.id })).rejects.toThrow();
    await expect(insert('fixed_text', { fixedText: 'Live' })).resolves.toBe(1);
  });

  it('MG-73-02 rollback retires the widgets that use the source, keeps the others and the queues, and up again restores the schema', async () => {
    const queue = await newQueue();
    const waiting = await join(queue, 'Ana');
    const keep = await overlayRepository.create({ sourceType: 'queue_name', queueId: queue.id, capabilityHash: 'd'.repeat(64) });
    const retired = await overlayRepository.create({ sourceType: NEXT, queueId: queue.id, capabilityHash: 'e'.repeat(64) });
    const typeBefore = constraint('overlay_widgets_source_type_check');
    const scopeBefore = constraint('overlay_widgets_source_scope_check');
    expect(typeBefore).toContain(NEXT);
    expect(scopeBefore).toContain(NEXT);

    psql(migrationFile('rollback.sql'));
    expect(constraint('overlay_widgets_source_type_check')).not.toContain(NEXT);
    expect(constraint('overlay_widgets_source_scope_check')).not.toContain(NEXT);
    expect(await prisma.overlayWidget.count({ where: { sourceType: NEXT } })).toBe(0);
    const gone = await prisma.overlayWidget.findUnique({ where: { id: retired.id } });
    expect(gone).toMatchObject({ sourceType: 'fixed_text', fixedText: '', queueId: null, capabilityHash: null });
    expect(gone.revokedAt).toBeInstanceOf(Date);
    expect(gone.deletedAt).toBeInstanceOf(Date);
    expect(gone.version).toBe(retired.version + 1);
    expect(await overlayRepository.findActiveByCapabilityHash('e'.repeat(64))).toBeNull();
    expect(await prisma.overlayWidget.findUnique({ where: { id: keep.id } })).toMatchObject({ sourceType: 'queue_name', queueId: queue.id, capabilityHash: 'd'.repeat(64), deletedAt: null });
    expect(await prisma.entry.findUnique({ where: { id: waiting.id } })).toMatchObject({ status: 'waiting' });
    await expect(prisma.$executeRaw`INSERT INTO overlay_widgets (id, source_type, queue_id, updated_at) VALUES (${randomUUID()}::uuid, ${NEXT}, ${queue.id}::uuid, now())`).rejects.toThrow();

    psql(migrationFile('migration.sql'));
    expect(constraint('overlay_widgets_source_type_check')).toBe(typeBefore);
    expect(constraint('overlay_widgets_source_scope_check')).toBe(scopeBefore);
    await overlayRepository.create({ sourceType: NEXT, queueId: queue.id });
    expect(await nextOf(queue)).toBe('Ana');
  });
});
