// OPS-31 P6b (Gate C, FT-90, AC 40): the live session on an ISOLATED PostgreSQL with the real migrations (never SQLite, never Prisma mocks).
// M4 over rows that already exist (checksums of every other table), the catalog (no FK, trigger, rule or view), every CHECK refusing its
// invalid row, the rollback guard and the up-down-up through the Prisma runbook; the real repository and service: duplicate, merge window
// edges, lost offline, late online, ignored types, the close-then-insert order, the two-integer channel lock (barrier proven through
// pg_locks), two concurrent onlines, the cap window provider, retention, the merge-window setting and the LIVE-1 mutation test
// (row counts, checksums and statement-trigger counters of entries, redemptions, queues, the outbox and audit_logs stay identical).
import { randomUUID } from 'node:crypto';
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
import { createLiveSessionRepository, LIVE_SESSION_LOCK_CLASS } from '../../apps/api/src/persistence/live-session-repository.mjs';
import { createLiveSessionService } from '../../apps/api/src/twitch/live-session-service.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const containerName = `queuebot-ops31-p6b-${process.pid}-${randomUUID().slice(0, 8)}`;
const M4 = '20261119090000_live_session';
let connectionString;
let prisma;
let repo;
let clockNow = new Date('2030-01-01T12:00:00.000Z');
const logs = [];
const at = (hhmmss) => new Date(`2030-01-01T${hhmmss}.000Z`);

function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `docker ${args[0]} failed`);
  return result.stdout.trim();
}
const psql = (sql) => {
  const result = spawnSync('docker', ['exec', '-i', containerName, 'psql', '-U', 'queuebot', '-d', 'queuebot', '-v', 'ON_ERROR_STOP=1', '-At', '-1', '-f', '-'], { cwd: root, encoding: 'utf8', timeout: 60_000, input: sql });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
};
const file = (name) => readFileSync(fileURLToPath(new URL(`../../apps/api/prisma/migrations/${M4}/${name}`, import.meta.url)), 'utf8');
const prismaCli = (args, input) => spawnSync(process.execPath, ['node_modules/prisma/build/index.js', ...args], { cwd: root, encoding: 'utf8', timeout: 90_000, input, env: { ...process.env, DATABASE_URL: connectionString } });
const refused = (sql, name) => { expect(() => psql(sql)).toThrow(name); };
const sqlValue = (value) => (value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`);

const OTHER_TABLES = ['entries', 'redemptions', 'queues', 'outbox', 'audit_logs', 'settings'];
const checksum = (table) => psql(`SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(t)::text, '|' ORDER BY to_jsonb(t)::text), '')) FROM ${table} t`).trim();
const checksums = (tables = OTHER_TABLES) => Object.fromEntries(tables.map((table) => [table, checksum(table)]));
const relfilenodes = () => psql(`SELECT relname || '=' || relfilenode FROM pg_class WHERE relname IN (${OTHER_TABLES.map((t) => `'${t}'`).join(',')}) ORDER BY 1`).trim();
const streamRows = (broadcaster) => psql(`SELECT twitch_stream_id || '|' || left(stream_session_id::text, 8) || '|' || to_char(started_at AT TIME ZONE 'UTC', 'HH24:MI:SS') || '|' || coalesce(to_char(ended_at AT TIME ZONE 'UTC', 'HH24:MI:SS'), '-') || '|' || source FROM stream_sessions WHERE broadcaster_id = '${broadcaster}' ORDER BY started_at, twitch_stream_id`).trim().split('\n').filter(Boolean);
const sessionIds = (broadcaster) => psql(`SELECT twitch_stream_id || '=' || stream_session_id::text FROM stream_sessions WHERE broadcaster_id = '${broadcaster}' ORDER BY started_at, twitch_stream_id`).trim().split('\n').filter(Boolean);
const tableText = () => psql('\\d stream_sessions').split('\n').sort().join('\n');
const sessionCount = (broadcaster) => Number(psql(`SELECT count(DISTINCT stream_session_id) FROM stream_sessions WHERE broadcaster_id = '${broadcaster}'`).trim());
const openRows = (broadcaster) => Number(psql(`SELECT count(*) FROM stream_sessions WHERE broadcaster_id = '${broadcaster}' AND ended_at IS NULL`).trim());
let sequence = 0;
const fresh = () => { sequence += 1; return `bcast-${sequence}-${randomUUID().slice(0, 6)}`; };
const online = (broadcasterId, streamId, startedAt, extra = {}) => repo.applyOnline({ broadcasterId, streamId, type: 'live', startedAt, ...extra });
const offline = (broadcasterId, streamId, receivedAt) => repo.applyOffline({ broadcasterId, streamId, receivedAt });

async function seedOtherTables() {
  const queue = await prisma.queue.create({ data: { slug: `p6b-${randomUUID().slice(0, 8)}`, title: 'Abyss', cost: 5, isOpen: true, rewardId: `reward-${randomUUID()}`, remoteSyncStatus: 'synced' } });
  await prisma.redemption.create({ data: { redemptionId: `p6b-red-${randomUUID()}`, broadcasterId: 'seed', rewardId: 'r', userId: 'u1', queueId: queue.id, redeemedAt: clockNow } });
  await prisma.entry.create({ data: { queueId: queue.id, twitchUserId: 'u1', userLogin: 'u1', displayName: 'U1', source: 'manual', status: 'waiting', position: 1 } });
  await prisma.outbox.create({ data: { operationType: 'redemption.cancel', entityType: 'queue', entityId: queue.id, idempotencyKey: `p6b-outbox-${randomUUID()}`, status: 'pending' } });
  await prisma.auditLog.create({ data: { event: 'seed.event', origin: 'test', safeDetail: {} } });
  await prisma.setting.upsert({ where: { key: 'seed_setting' }, create: { key: 'seed_setting', value: { a: 1 } }, update: { value: { a: 1 } } });
}

const LOCK_CLASS_SQL = `locktype = 'advisory' AND classid = ${LIVE_SESSION_LOCK_CLASS} AND objsubid = 2`;
const waiters = () => Number(psql(`SELECT count(*) FROM pg_locks WHERE ${LOCK_CLASS_SQL} AND NOT granted`).trim());
async function waitForWaiters(count) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (waiters() >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`the barrier was never proven: ${count} waiter(s) on the channel lock expected, saw ${waiters()}`);
}
/** Holds the channel lock of `broadcasterId` in a separate transaction until `release()`. */
async function holdChannelLock(broadcasterId) {
  let release;
  let acquired;
  const released = new Promise((resolve) => { release = resolve; });
  const ready = new Promise((resolve) => { acquired = resolve; });
  const done = prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(${LIVE_SESSION_LOCK_CLASS}::int, hashtext(${broadcasterId}::text))) AS held`;
    acquired();
    await released;
  }, { timeout: 60_000 });
  await ready;
  return { release, done };
}

describe('OPS-31 P6b live session on isolated PostgreSQL', () => {
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
    const migration = prismaCli(['migrate', 'deploy']);
    expect(migration.status, migration.stderr || migration.stdout).toBe(0);
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    repo = createLiveSessionRepository(prisma, { clock: () => clockNow, logEvent: (event) => logs.push(event) });
  }, ISOLATED_POSTGRES_BEFORE_ALL_TIMEOUT_MS);

  afterAll(async () => {
    await prisma?.$disconnect();
    await cleanupIsolatedPostgres({
      containerName,
      runDocker: (args) => runDockerCommand(args, { timeout: ISOLATED_POSTGRES_CLEANUP_CALL_TIMEOUT_MS }),
    });
  }, ISOLATED_POSTGRES_AFTER_ALL_TIMEOUT_MS);

  it('PG40-09 / PG40-05 M4 over a database whose other tables hold rows: nothing else is touched, the catalog has no FK, trigger, rule or view, and every CHECK refuses its invalid row', async () => {
    psql(file('rollback.sql')); // nothing is open: the guard passes; the schema is now the one before P6b
    expect(psql("SELECT to_regclass('stream_sessions')").trim()).toBe('');
    await seedOtherTables();
    const before = { sums: checksums(), files: relfilenodes() };

    psql(file('migration.sql'));
    expect(checksums()).toEqual(before.sums);
    expect(relfilenodes()).toBe(before.files);
    // the migration is one new table and no ALTER of an existing table, and names no table of the queue or money model
    const sql = file('migration.sql').replace(/--.*$/gm, ''); // statements only: the header comments name what the file does NOT touch
    expect(sql).not.toMatch(/\bALTER\b/i);
    expect(sql).not.toMatch(/\b(queues|entries|redemptions|outbox|audit_logs|settings)\b/);
    expect(sql).toMatch(/SET LOCAL lock_timeout/);
    expect(sql).toMatch(/SET LOCAL statement_timeout/);

    expect(psql("SELECT column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '') FROM information_schema.columns WHERE table_name = 'stream_sessions' ORDER BY ordinal_position").trim().split('\n'))
      .toEqual([
        'broadcaster_id:text:NO:', 'twitch_stream_id:text:NO:', 'stream_session_id:uuid:NO:', 'started_at:timestamp with time zone:NO:',
        'ended_at:timestamp with time zone:YES:', 'source:text:NO:', 'created_at:timestamp with time zone:NO:now()',
      ]);
    expect(psql("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'stream_sessions'::regclass AND contype = 'p'").trim()).toBe('PRIMARY KEY (broadcaster_id, twitch_stream_id)');
    expect(psql("SELECT count(*) FROM pg_constraint WHERE conrelid = 'stream_sessions'::regclass AND contype = 'c'").trim()).toBe('4');
    expect(psql("SELECT indexname FROM pg_indexes WHERE tablename = 'stream_sessions' ORDER BY 1").trim().split('\n'))
      .toEqual(['stream_sessions_channel_started_idx', 'stream_sessions_one_open_per_channel_idx', 'stream_sessions_pkey']);
    expect(psql("SELECT indexdef FROM pg_indexes WHERE indexname = 'stream_sessions_one_open_per_channel_idx'").trim()).toMatch(/UNIQUE INDEX .*\(broadcaster_id\) WHERE \(ended_at IS NULL\)/);
    // PG40-05 catalog: no foreign key (either way), trigger, rule or view
    expect(psql("SELECT count(*) FROM pg_constraint WHERE (conrelid = 'stream_sessions'::regclass OR confrelid = 'stream_sessions'::regclass) AND contype = 'f'").trim()).toBe('0');
    expect(psql("SELECT count(*) FROM pg_trigger WHERE tgrelid = 'stream_sessions'::regclass AND NOT tgisinternal").trim()).toBe('0');
    expect(psql("SELECT count(*) FROM pg_rules WHERE tablename = 'stream_sessions'").trim()).toBe('0');
    expect(psql("SELECT count(*) FROM pg_views WHERE definition ILIKE '%stream_sessions%'").trim()).toBe('0');

    const insert = (columns) => `INSERT INTO stream_sessions (${Object.keys(columns).join(', ')}) VALUES (${Object.values(columns).map(sqlValue).join(', ')})`;
    const valid = { broadcaster_id: 'ck-b', twitch_stream_id: 'ck-1', stream_session_id: randomUUID(), started_at: '2030-01-01T10:00:00Z', source: 'event' };
    psql(insert(valid));
    psql(insert({ ...valid, twitch_stream_id: 'x'.repeat(64), ended_at: '2030-01-01T10:00:00Z', source: 'reconciled' })); // edges: length 64 and ended = started
    refused(insert({ ...valid, twitch_stream_id: 'ck-1' }), 'stream_sessions_pkey');
    refused(insert({ ...valid, twitch_stream_id: 'ck-open-2' }), 'stream_sessions_one_open_per_channel_idx'); // a second open row of the same channel
    psql(insert({ ...valid, broadcaster_id: 'ck-other', twitch_stream_id: 'ck-1' })); // the same stream id in another channel is fine
    refused(insert({ ...valid, twitch_stream_id: '', ended_at: '2030-01-01T10:00:00Z' }), 'stream_sessions_twitch_stream_id_check');
    refused(insert({ ...valid, twitch_stream_id: 'x'.repeat(65), ended_at: '2030-01-01T10:00:00Z' }), 'stream_sessions_twitch_stream_id_check');
    refused(insert({ ...valid, broadcaster_id: '', twitch_stream_id: 'ck-e', ended_at: '2030-01-01T10:00:00Z' }), 'stream_sessions_broadcaster_id_check');
    refused(insert({ ...valid, broadcaster_id: 'b'.repeat(65), twitch_stream_id: 'ck-e', ended_at: '2030-01-01T10:00:00Z' }), 'stream_sessions_broadcaster_id_check');
    refused(insert({ ...valid, twitch_stream_id: 'ck-t', ended_at: '2030-01-01T09:59:59Z' }), 'stream_sessions_time_order_check');
    refused(insert({ ...valid, twitch_stream_id: 'ck-s', ended_at: '2030-01-01T10:30:00Z', source: 'manual' }), 'stream_sessions_source_check');
    psql("DELETE FROM stream_sessions WHERE broadcaster_id IN ('ck-b', 'ck-other')");
    expect(checksums()).toEqual(before.sums);
  }, 120_000);

  it('PG40-09 M4-down: refused while a session is open (schema unchanged), allowed once closed, drops only the table; the Prisma runbook up-down-up gives the same schema; the other tables are never touched', async () => {
    const broadcaster = fresh();
    psql(`INSERT INTO stream_sessions (broadcaster_id, twitch_stream_id, stream_session_id, started_at, source) VALUES ('${broadcaster}', 's-open', gen_random_uuid(), '2030-01-01T10:00:00Z', 'event')`);
    const textBefore = tableText();
    const sums = checksums();
    expect(() => psql(file('rollback.sql'))).toThrow('M4-down refused: a live session is open');
    expect(tableText()).toBe(textBefore); // the refused rollback changed nothing
    // the documented runbook step closes a crash leftover, and then the down passes
    psql('UPDATE "stream_sessions" SET "ended_at" = GREATEST("started_at", now()) WHERE "ended_at" IS NULL');
    const down = prismaCli(['db', 'execute', '--schema', 'apps/api/prisma/schema.prisma', '--file', `apps/api/prisma/migrations/${M4}/rollback.sql`]);
    expect(down.status, down.stderr || down.stdout).toBe(0);
    expect(psql("SELECT to_regclass('stream_sessions')").trim()).toBe('');
    expect(checksums()).toEqual(sums);
    psql(file('rollback.sql')); // idempotent: the table is already gone
    const clean = prismaCli(['db', 'execute', '--schema', 'apps/api/prisma/schema.prisma', '--stdin'], `DELETE FROM _prisma_migrations WHERE migration_name = '${M4}';`);
    expect(clean.status, clean.stderr || clean.stdout).toBe(0);
    const up = prismaCli(['migrate', 'deploy']);
    expect(up.status, up.stderr || up.stdout).toBe(0);
    expect(tableText()).toBe(textBefore); // up-down-up: the schema equals the first up
    expect(psql(`SELECT count(*) FROM _prisma_migrations WHERE migration_name = '${M4}' AND finished_at IS NOT NULL`).trim()).toBe('1');
    expect(checksums()).toEqual(sums);
    // the cap goes back to the fallback while the table is absent is covered by the provider test (no table is not a state of the app)
  }, 180_000);

  it('PG40-03 events on the real table: open, duplicate, offline, duplicate offline, ignored types and an offline of an unknown id write nothing extra', async () => {
    const b = fresh();
    expect(await online(b, 's1', at('10:00:00'))).toMatchObject({ decision: 'opened', merged: false });
    expect(await online(b, 's1', at('10:00:00'))).toMatchObject({ decision: 'duplicate_ignored' });
    for (const type of ['rerun', 'premiere', 'playlist', 'watch_party']) {
      expect(await repo.applyOnline({ broadcasterId: b, streamId: `x-${type}`, type, startedAt: at('10:05:00') })).toMatchObject({ decision: 'ignored_type' });
    }
    expect(streamRows(b)).toHaveLength(1);
    expect(await offline(b, 'unknown-id', at('10:30:00'))).toMatchObject({ decision: 'unknown_stream', reconcile: true });
    expect(streamRows(b)).toHaveLength(1);
    expect(await offline(b, 's1', at('11:00:00'))).toMatchObject({ decision: 'closed', durationMs: 3_600_000 });
    expect(await offline(b, 's1', at('11:05:00'))).toMatchObject({ decision: 'duplicate_ignored' });
    expect(streamRows(b)).toEqual([expect.stringMatching(/^s1\|[0-9a-f]{8}\|10:00:00\|11:00:00\|event$/)]);
  });

  it('PG40-03 merge: drop and return inside the window is one session, a gap longer than the window is a new one; the boundary is inclusive to the second', async () => {
    const inside = fresh();
    await online(inside, 'a', at('10:00:00')); await offline(inside, 'a', at('11:00:00'));
    await online(inside, 'b', at('11:10:00')); // exactly 10 minutes: inclusive
    expect(sessionCount(inside)).toBe(1);
    const outside = fresh();
    await online(outside, 'a', at('10:00:00')); await offline(outside, 'a', at('11:00:00'));
    await online(outside, 'b', at('11:10:01')); // 1 s past the window
    expect(sessionCount(outside)).toBe(2);
    const minus = fresh();
    await online(minus, 'a', at('10:00:00')); await offline(minus, 'a', at('11:00:00'));
    await online(minus, 'b', at('11:09:59'));
    expect(sessionCount(minus)).toBe(1);
  });

  it('PG40-03 lost offline: a still-open row with another id is closed FIRST (reconciled, at the new start) and the new row joins the session; never two open rows', async () => {
    const b = fresh();
    await online(b, 'old', at('10:00:00'));
    const result = await online(b, 'new', at('10:40:00'));
    expect(result).toMatchObject({ decision: 'opened', merged: true });
    expect(streamRows(b).map((row) => row.replace(/\|[0-9a-f]{8}\|/, '|S|'))).toEqual(['old|S|10:00:00|10:40:00|reconciled', 'new|S|10:40:00|-|event']);
    expect(openRows(b)).toBe(1);
    expect(sessionCount(b)).toBe(1);
  });

  it('PG40-03 offline of the OLD id after the online of the new id closes only the old row (already closed by the new online: a duplicate); a late online of an older stream is ignored and changes no stored session id', async () => {
    const b = fresh();
    await online(b, 'old', at('10:00:00'));
    await online(b, 'new', at('10:40:00'));
    const ids = sessionIds(b);
    expect(await offline(b, 'old', at('10:45:00'))).toMatchObject({ decision: 'duplicate_ignored' });
    expect(openRows(b)).toBe(1);
    // DB-8: an online whose start is earlier than a stored row is ignored and nothing is rewritten
    expect(await online(b, 'ancient', at('10:20:00'))).toMatchObject({ decision: 'late_online_ignored' });
    expect(sessionIds(b)).toEqual(ids);
    expect(logs.length).toBeGreaterThanOrEqual(0);
  });

  it('PG40-03 an online whose start precedes the end the offline already recorded still merges; offline never ends before the row started', async () => {
    const b = fresh();
    await online(b, 'a', at('10:00:00'));
    await offline(b, 'a', at('09:30:00')); // skewed receive time: ended_at is clamped to started_at
    expect(streamRows(b)[0]).toMatch(/\|10:00:00\|10:00:00\|/);
  });

  it('PG40-08 the merge window is the `settings` row live_session_policy: absent means 10, 1..60 only, versioned and audited, and a change applies only to later events', async () => {
    const b = fresh();
    expect(await repo.getLivePolicy()).toEqual({ schemaVersion: 1, revision: 0, mergeMinutes: 10 });
    await online(b, 'a', at('10:00:00')); await offline(b, 'a', at('11:00:00'));
    // set 1 minute: the NEXT event uses it; the stored rows are untouched
    const auditBefore = Number(psql("SELECT count(*) FROM audit_logs WHERE event = 'live_session.policy_updated'").trim());
    expect(await repo.setLivePolicy({ expectedRevision: 0, mergeMinutes: 1, actorId: 'local-actor' })).toMatchObject({ revision: 1, mergeMinutes: 1, changed: true });
    expect(Number(psql("SELECT count(*) FROM audit_logs WHERE event = 'live_session.policy_updated'").trim())).toBe(auditBefore + 1);
    expect(psql("SELECT safe_detail::text FROM audit_logs WHERE event = 'live_session.policy_updated' ORDER BY created_at DESC LIMIT 1").trim()).toBe('{"revision": 1, "mergeMinutes": 1}');
    await online(b, 'b', at('11:05:00')); // 5 minutes: inside 10, outside the new 1
    expect(sessionCount(b)).toBe(2);
    await expect(repo.setLivePolicy({ expectedRevision: 0, mergeMinutes: 5 })).rejects.toMatchObject({ code: 'LIVE_POLICY_REVISION_CONFLICT' });
    for (const bad of [0, 61, 1.5, '10', null]) await expect(repo.setLivePolicy({ expectedRevision: 1, mergeMinutes: bad })).rejects.toMatchObject({ code: 'INVALID_LIVE_POLICY' });
    expect(await repo.setLivePolicy({ expectedRevision: 1, mergeMinutes: 1 })).toMatchObject({ revision: 1, changed: false }); // an equal body writes nothing
    expect(await repo.setLivePolicy({ expectedRevision: 1, mergeMinutes: 60 })).toMatchObject({ revision: 2, mergeMinutes: 60 });
    // a damaged stored value reads as the default 10 (never a crash, never 0)
    await prisma.setting.update({ where: { key: 'live_session_policy' }, data: { value: { schemaVersion: 1, revision: 3, mergeMinutes: 0 } } });
    expect((await repo.getLivePolicy()).mergeMinutes).toBe(10);
    await prisma.setting.delete({ where: { key: 'live_session_policy' } });
    expect(await repo.getLivePolicy()).toEqual({ schemaVersion: 1, revision: 0, mergeMinutes: 10 });
  });

  it('PG40-01 two connections deliver the same online at once (barrier proven by pg_locks): one row, one session, no error', async () => {
    for (let round = 0; round < 8; round += 1) {
      const b = fresh();
      const hold = await holdChannelLock(b);
      const first = online(b, 'same', at('10:00:00'));
      await waitForWaiters(1);
      const second = online(b, 'same', at('10:00:00'));
      await waitForWaiters(2);
      hold.release();
      await hold.done;
      const results = await Promise.all([first, second]);
      expect(results.map((r) => r.decision).sort()).toEqual(['duplicate_ignored', 'opened']);
      expect(streamRows(b)).toHaveLength(1);
      expect(sessionCount(b)).toBe(1);
    }
  }, 120_000);

  it('PG40-02 two DIFFERENT onlines at once (barrier proven): exactly one open row, the loser closes the winner first, 23505 is never raised, both orders', async () => {
    for (let round = 0; round < 8; round += 1) {
      const b = fresh();
      const hold = await holdChannelLock(b);
      const [firstId, secondId] = round % 2 === 0 ? ['x', 'y'] : ['y', 'x'];
      const first = online(b, firstId, at('10:00:00'));
      await waitForWaiters(1);
      const second = online(b, secondId, at('10:00:05'));
      await waitForWaiters(2);
      hold.release();
      await hold.done;
      const [r1, r2] = await Promise.all([first, second]);
      expect([r1.decision, r2.decision]).toEqual(['opened', 'opened']);
      expect(openRows(b)).toBe(1);
      expect(sessionCount(b)).toBe(1); // the second joined the first (lost-offline rule): never two open rows, never a split
      expect(streamRows(b).filter((row) => row.endsWith('reconciled'))).toHaveLength(1);
    }
  }, 120_000);

  it('PG40-03 online and offline of one id at once, both orders (barrier proven): online first closes it with ended_at >= started_at; offline first writes nothing and asks for a reconciliation', async () => {
    const b1 = fresh();
    let hold = await holdChannelLock(b1);
    const on = online(b1, 'z', at('10:00:00'));
    await waitForWaiters(1);
    const off = offline(b1, 'z', at('10:30:00'));
    await waitForWaiters(2);
    hold.release(); await hold.done;
    expect((await Promise.all([on, off])).map((r) => r.decision)).toEqual(['opened', 'closed']);
    expect(psql(`SELECT count(*) FROM stream_sessions WHERE broadcaster_id = '${b1}' AND ended_at >= started_at AND ended_at IS NOT NULL`).trim()).toBe('1');

    const b2 = fresh();
    hold = await holdChannelLock(b2);
    const off2 = offline(b2, 'z', at('10:30:00'));
    await waitForWaiters(1);
    const on2 = online(b2, 'z', at('10:00:00'));
    await waitForWaiters(2);
    hold.release(); await hold.done;
    const [offResult, onResult] = await Promise.all([off2, on2]);
    expect(offResult).toMatchObject({ decision: 'unknown_stream', reconcile: true });
    expect(onResult.decision).toBe('opened');
    expect(openRows(b2)).toBe(1);
  }, 120_000);

  it('PG40-06 locks: the channel lock is the two-integer form in its own class (not 1868787013), is invisible to lockQueue (single bigint) and never blocks it or the account lock', async () => {
    expect(LIVE_SESSION_LOCK_CLASS).not.toBe(1868787013);
    const b = fresh();
    const hold = await holdChannelLock(b);
    const held = psql(`SELECT classid || ',' || objsubid FROM pg_locks WHERE ${LOCK_CLASS_SQL} AND granted`).trim().split('\n');
    expect(held).toEqual([`${LIVE_SESSION_LOCK_CLASS},2`]);
    // lockQueue is `pg_advisory_xact_lock(hashtextextended(queueId, 0))` (bigint, objsubid 1) and the account lock is (1868787013, 1): both free
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SET LOCAL lock_timeout = '1s'`;
      await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${randomUUID()}, 0))) AS queue_lock`;
      await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(1868787013, 1)) AS account_lock`;
    });
    // another channel is not blocked either (a hash collision would only serialize, never deadlock)
    await online(fresh(), 'other', at('10:00:00'));
    hold.release(); await hold.done;
  }, 60_000);

  it('PG39-08 the cap window provider: the start of the current session follows the session; a refund after the live ended or inside a merge gap counts against the last session; a new live outside the window starts fresh; fallbacks never become unlimited', async () => {
    const provider = repo.createCapWindowProvider();
    const now = at('15:00:00');
    const b = fresh();
    expect(await provider(null, b, now, { reentryWindowHours: 2 })).toEqual({ kind: 'fallback', start: at('13:00:00'), reason: 'none_known' });
    await online(b, 'a', at('10:00:00'));
    expect(await provider(null, b, now)).toEqual({ kind: 'session', start: at('10:00:00') });
    await offline(b, 'a', at('11:00:00'));
    expect(await provider(null, b, now)).toEqual({ kind: 'session', start: at('10:00:00') }); // Q-3: the last session stays the window
    await online(b, 'b', at('11:05:00')); // merged
    expect(await provider(null, b, now)).toEqual({ kind: 'session', start: at('10:00:00') }); // the session start is the SMALLEST started_at
    await offline(b, 'b', at('12:00:00'));
    await online(b, 'c', at('13:00:00')); // outside the window: a fresh budget
    expect(await provider(null, b, now)).toEqual({ kind: 'session', start: at('13:00:00') });
    // stale: an open session for more than 48 h is not trusted
    expect(await provider(null, b, new Date('2030-01-03T13:00:01.000Z'), { reentryWindowHours: 12 })).toMatchObject({ kind: 'fallback', reason: 'stale' });
    expect((await provider(null, b, new Date('2030-01-03T13:00:00.000Z'))).kind).toBe('session'); // exactly 48 h is not stale
    // the revocation flag forces the fallback
    let revoked = true;
    const revokedProvider = repo.createCapWindowProvider({ isRevoked: () => revoked });
    expect(await revokedProvider(null, b, now, { reentryWindowHours: 12 })).toEqual({ kind: 'fallback', start: at('03:00:00'), reason: 'revoked' });
    revoked = false;
    expect((await revokedProvider(null, b, now)).kind).toBe('session');
    expect(logs.filter((entry) => entry.event === 'live_session.cap_fallback').map((entry) => entry.details.reason)).toEqual(expect.arrayContaining(['none_known', 'stale', 'revoked']));
    // it works with a transaction client too (the gate calls it inside its transaction)
    await prisma.$transaction(async (tx) => { expect((await provider(tx, b, now)).kind).toBe('session'); });
  });

  it('SV-01 liveSession for GET /api/state: live / offline / unknown with the window the cap uses', async () => {
    const b = fresh();
    clockNow = at('12:00:00');
    expect(await repo.describeLiveSession(b)).toEqual({ state: 'unknown', startedAt: null, endedAt: null, source: null, capWindow: 'fallback', fallbackReason: 'none_known' });
    await online(b, 'a', at('10:00:00'));
    expect(await repo.describeLiveSession(b)).toEqual({ state: 'live', startedAt: '2030-01-01T10:00:00.000Z', endedAt: null, source: 'event', capWindow: 'session', fallbackReason: null });
    await offline(b, 'a', at('11:00:00'));
    expect(await repo.describeLiveSession(b)).toMatchObject({ state: 'offline', endedAt: '2030-01-01T11:00:00.000Z', capWindow: 'session' });
    expect(await repo.describeLiveSession(b, { revoked: true })).toMatchObject({ state: 'unknown', capWindow: 'fallback', fallbackReason: 'revoked' });
    const text = JSON.stringify(await repo.describeLiveSession(b));
    expect(text).not.toMatch(new RegExp(`${b}|'a'`));
  });

  it('PG40-07 retention: whole sessions older than 90 days go, never part of a session, never the latest, never one with an open row', async () => {
    const b = fresh();
    const old = (day) => new Date(`2029-09-${day}T10:00:00.000Z`);
    // session 1 (two merged rows) fully old; session 2 old but one row open; session 3 the latest, old too
    await online(b, 'p1', old('01')); await offline(b, 'p1', new Date('2029-09-01T11:00:00.000Z'));
    await online(b, 'p2', new Date('2029-09-01T11:05:00.000Z')); await offline(b, 'p2', new Date('2029-09-01T12:00:00.000Z'));
    await online(b, 'q1', old('10')); await offline(b, 'q1', new Date('2029-09-10T11:00:00.000Z'));
    await online(b, 'r1', old('20')); await offline(b, 'r1', new Date('2029-09-20T11:00:00.000Z'));
    const open = fresh();
    await online(open, 'o1', old('01'));
    const mixed = fresh(); // a session with one old row and one recent row must keep both
    await online(mixed, 'm1', new Date('2029-09-30T10:00:00.000Z')); await offline(mixed, 'm1', new Date('2029-09-30T11:00:00.000Z'));
    await online(mixed, 'm2', new Date('2029-09-30T11:05:00.000Z')); await offline(mixed, 'm2', new Date('2029-12-30T11:00:00.000Z'));
    expect(sessionCount(b)).toBe(3);
    const removed = await repo.purgeOldSessions(new Date('2030-01-01T00:00:00.000Z'), { retentionDays: 90 });
    expect(removed).toBe(3); // p1, p2, q1: one whole session of two rows plus one session of one row
    expect(streamRows(b).map((row) => row.split('|')[0])).toEqual(['r1']); // the latest session is kept
    expect(streamRows(open).map((row) => row.split('|')[0])).toEqual(['o1']); // an open row is kept
    expect(streamRows(mixed).map((row) => row.split('|')[0])).toEqual(['m1', 'm2']);
    expect(await repo.purgeOldSessions(new Date('2030-01-01T00:00:00.000Z'))).toBe(0);
  });

  it('PG40-04 LIVE-1 mutation test: online, duplicate, offline, offline after a new online, reconciliation close (two negatives), new online inside and outside the window, a late online, a rerun and a revocation leave entries, redemptions, queues, the outbox and audit_logs identical (counts, checksums and statement-trigger counters)', async () => {
    await seedOtherTables();
    const watched = ['entries', 'redemptions', 'queues', 'outbox', 'audit_logs'];
    psql(`CREATE TABLE live1_counter (tbl text PRIMARY KEY, ops bigint NOT NULL DEFAULT 0);
      INSERT INTO live1_counter SELECT t, 0 FROM unnest(ARRAY[${watched.map((t) => `'${t}'`).join(',')}]) AS t;
      CREATE FUNCTION live1_count() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE live1_counter SET ops = ops + 1 WHERE tbl = TG_TABLE_NAME; RETURN NULL; END $$;
      ${watched.map((t) => `CREATE TRIGGER live1_${t} AFTER INSERT OR UPDATE OR DELETE ON ${t} FOR EACH STATEMENT EXECUTE FUNCTION live1_count();`).join('\n')}`);
    const counters = () => psql('SELECT string_agg(tbl || \'=\' || ops, \',\' ORDER BY tbl) FROM live1_counter').trim();
    try {
      // positive control: one write to each watched table MUST move its counter, else the harness is broken
      const zero = counters();
      psql(`UPDATE queues SET title = title; UPDATE entries SET version = version; UPDATE redemptions SET updated_at = updated_at; UPDATE outbox SET attempts = attempts; INSERT INTO audit_logs (id, event, origin, safe_detail) VALUES (gen_random_uuid(), 'control', 'test', '{}')`);
      expect(counters()).not.toBe(zero);
      expect(psql("SELECT count(*) FROM live1_counter WHERE ops = 0").trim()).toBe('0');
      psql("DELETE FROM audit_logs WHERE event = 'control'");
      psql('UPDATE live1_counter SET ops = 0');
      const baseline = { sums: checksums(watched), counters: counters() };
      const assertUntouched = (label) => {
        expect(checksums(watched), `${label}: checksums`).toEqual(baseline.sums);
        expect(counters(), `${label}: statement counters`).toBe(baseline.counters);
      };

      const b = fresh();
      const sessionLogs = [];
      const service = createLiveSessionService({
        repository: repo, broadcasterId: b, clock: () => clockNow, sleep: async () => { clockNow = new Date(clockNow.getTime() + 30_000); },
        logEvent: (event) => sessionLogs.push(event),
        getTwitch: () => ({ getCurrentStream: async () => ({ state: 'offline' }) }),
      });
      await service.onOnline({ streamId: 'live-A', type: 'live', startedAt: at('08:00:00') }); assertUntouched('online');
      await service.onOnline({ streamId: 'live-A', type: 'live', startedAt: at('08:00:00') }); assertUntouched('duplicate online');
      await service.onOffline({ streamId: 'live-A', receivedAt: at('08:30:00') }); assertUntouched('offline');
      await service.onOnline({ streamId: 'live-B', type: 'live', startedAt: at('08:35:00') }); assertUntouched('online inside the window');
      await service.onOnline({ streamId: 'live-C', type: 'live', startedAt: at('08:36:00') }); assertUntouched('online while another is open');
      await service.onOffline({ streamId: 'live-B', receivedAt: at('08:40:00') }); assertUntouched('offline of the old id after a new online');
      await service.onOnline({ streamId: 'live-OLD', type: 'live', startedAt: at('07:00:00') }); assertUntouched('late online');
      await service.onOnline({ streamId: 'live-RR', type: 'rerun', startedAt: at('09:00:00') }); assertUntouched('rerun');
      clockNow = at('10:00:00');
      await service.reconcile('periodic'); assertUntouched('reconciliation close (two negatives)');
      expect(openRows(b)).toBe(0);
      await service.onOnline({ streamId: 'live-D', type: 'live', startedAt: at('13:00:00') }); assertUntouched('online outside the window');
      await service.onOffline({ streamId: null, receivedAt: at('13:30:00') }); assertUntouched('offline without a stream id');
      service.markRevoked(); assertUntouched('revocation');
      // the session table DID change as the rules say, and only it (checked before the purge removes the old sessions)
      expect(sessionCount(b), streamRows(b).join(' / ')).toBe(2);
      await repo.purgeOldSessions(new Date('2031-01-01T00:00:00.000Z')); assertUntouched('retention');
      expect(streamRows(b)).toHaveLength(1);
      await repo.describeLiveSession(b); await repo.createCapWindowProvider()(null, b, clockNow); assertUntouched('reads');
      // no log line carries a stream id, the channel id, a title or a login
      const text = JSON.stringify(sessionLogs);
      for (const secret of ['live-A', 'live-B', 'live-C', 'live-D', 'live-RR', b]) expect(text).not.toContain(secret);
      expect(sessionLogs.length).toBeGreaterThan(0);
    } finally {
      psql(`${watched.map((t) => `DROP TRIGGER IF EXISTS live1_${t} ON ${t};`).join('\n')} DROP FUNCTION IF EXISTS live1_count(); DROP TABLE IF EXISTS live1_counter;`);
    }
  }, 180_000);
});
