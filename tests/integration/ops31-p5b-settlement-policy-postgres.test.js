// OPS-31 P5b (Gate C, FT-74b): the settlement policy storage and API on an ISOLATED PostgreSQL with the real migrations (never
// SQLite, never Prisma mocks). M3/M3a over rows that already exist (no rewrite, checksum of the old columns), every CHECK
// refusing its invalid row (one constraint per case), the refund guard trigger, the rollback guard and the up-down-up through
// the Prisma runbook, the policy edit (stale revision, equal body, pre-P7 refusal, two concurrent edits), the audit without
// identifiers and the pending-decision counts (one grouped query, unknown when unreadable).
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
import { createQueueRepository } from '../../apps/api/src/persistence/queue-repository.mjs';
import { loadSettlementPolicy, loadStoredSettlementPolicy } from '../../apps/api/src/persistence/financial-gate.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const containerName = `queuebot-ops31-p5b-${process.pid}-${randomUUID().slice(0, 8)}`;
let connectionString;
let prisma;
let repository;
const now = new Date('2030-01-01T12:00:00.000Z');
const clock = () => now;
const M3 = '20261118120000_settlement_policy';
const M3A = '20261118120100_settlement_policy_validate';

function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `docker ${args[0]} failed`);
  return result.stdout.trim();
}
/** Runs SQL in one transaction (like a Prisma migration file); throws with the server message on error. */
const psql = (sql) => {
  const result = spawnSync('docker', ['exec', '-i', containerName, 'psql', '-U', 'queuebot', '-d', 'queuebot', '-v', 'ON_ERROR_STOP=1', '-At', '-1', '-f', '-'], { cwd: root, encoding: 'utf8', timeout: 60_000, input: sql });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
};
const file = (migration, name) => readFileSync(fileURLToPath(new URL(`../../apps/api/prisma/migrations/${migration}/${name}`, import.meta.url)), 'utf8');
const prismaCli = (args) => spawnSync(process.execPath, ['node_modules/prisma/build/index.js', ...args], { cwd: root, encoding: 'utf8', timeout: 90_000, env: { ...process.env, DATABASE_URL: connectionString } });
const refused = (sql, name) => { expect(() => psql(sql)).toThrow(name); };

let sequence = 0;
const sqlValue = (value) => (value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`);
/** Insert one redemption (snake_case columns). */
function redemptionSql(columns = {}) {
  sequence += 1;
  const row = { redemption_id: `p5b-red-${sequence}-${randomUUID()}`, broadcaster_id: 'broadcaster', reward_id: 'reward-p5b', user_id: `viewer-${sequence}`, redeemed_at: now.toISOString(), ...columns };
  return `INSERT INTO redemptions (${Object.keys(row).join(', ')}) VALUES (${Object.values(row).map(sqlValue).join(', ')})`;
}
const refundedAt = { refunded_at: now.toISOString(), refund_origin: 'automatic' };

const M3_QUEUE_COLUMNS = ['settlement_on_close_switch_off', 'settlement_on_direct_conclusion', 'settlement_on_moderator_conclude', 'settlement_on_chat_clear', 'reentry_refund_cap', 'reentry_window_hours', 'settlement_policy_rev', 'reentry_cap_hold', 'reentry_cap_counts_manual'];
const M3_REDEMPTION_COLUMNS = ['refunded_at', 'refund_origin'];
const dropKeys = (columns) => columns.map((column) => ` - '${column}'`).join('');
const checksum = (table, order, columns = []) => psql(`SELECT md5(coalesce(string_agg((to_jsonb(t)${dropKeys(columns)})::text, '|' ORDER BY ${order}), '')) FROM ${table} t`).trim();
const relfilenodes = () => psql("SELECT relname || '=' || relfilenode FROM pg_class WHERE relname IN ('queues', 'redemptions', 'outbox') ORDER BY 1").trim();
const columnsOf = (table) => psql(`SELECT column_name FROM information_schema.columns WHERE table_name = '${table}' ORDER BY 1`).trim().split('\n');
/** `\d` text with the column order removed, so a column re-added by an out-of-order replay does not look like drift. */
const schemaText = () => ['queues', 'redemptions', 'outbox', 'refund_list_members'].map((table) => psql(`\\d ${table}`)
  .split('\n').filter((line) => !/^\s*(Column|Table|Indexes|Check constraints|Foreign-key|Referenced|Triggers)/.test(line) || true).sort().join('\n')).join('\n');
const refundConstraintValid = () => psql("SELECT convalidated FROM pg_constraint WHERE conname = 'redemptions_refund_origin_check'").trim();
const newObjects = () => psql(`SELECT
  (SELECT count(*) FROM pg_proc WHERE proname = 'redemptions_refund_guard') || ',' ||
  (SELECT count(*) FROM pg_indexes WHERE indexname = 'redemptions_refunded_idx') || ',' ||
  (SELECT count(*) FROM pg_constraint WHERE conrelid = 'queues'::regclass AND conname IN ('queues_settlement_on_close_switch_off_check', 'queues_settlement_on_direct_conclusion_check', 'queues_settlement_on_moderator_conclude_check', 'queues_settlement_on_chat_clear_check', 'queues_reentry_refund_cap_check', 'queues_reentry_window_hours_check', 'queues_settlement_policy_rev_check', 'queues_reentry_cap_hold_check')) || ',' ||
  (SELECT count(*) FROM pg_constraint WHERE conname = 'redemptions_refund_origin_check')`).trim();

async function newQueue(extra = {}) {
  return prisma.queue.create({ data: { slug: `p5b-${randomUUID().slice(0, 8)}`, title: 'Abyss', cost: 5, isOpen: true, rewardId: `reward-${randomUUID()}`, remoteSyncStatus: 'synced', ...extra } });
}
const stored = (queueId) => prisma.queue.findUnique({ where: { id: queueId } });

describe('OPS-31 P5b settlement policy on isolated PostgreSQL', () => {
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
    repository = createQueueRepository(prisma, { clock });
  }, ISOLATED_POSTGRES_BEFORE_ALL_TIMEOUT_MS);

  afterAll(async () => {
    await prisma?.$disconnect();
    await cleanupIsolatedPostgres({
      containerName,
      runDocker: (args) => runDockerCommand(args, { timeout: ISOLATED_POSTGRES_CLEANUP_CALL_TIMEOUT_MS }),
    });
  }, ISOLATED_POSTGRES_AFTER_ALL_TIMEOUT_MS);

  it('PG34-01 / MG-03: M3 then M3a over rows that already exist: old rows keep their values and read legacy, no rewrite, the origin constraint is unvalidated after M3 and validated after M3a, the index appears only in M3a', () => {
    psql(file(M3, 'rollback.sql')); // an empty feature: the guard passes; the schema is now the one before P5b
    expect(columnsOf('queues')).not.toContain('settlement_policy_rev');
    expect(columnsOf('redemptions')).not.toContain('refunded_at');
    psql(`INSERT INTO queues (id, slug, title, cost) VALUES (gen_random_uuid(), 'old-q-1', 'Old one', 5), (gen_random_uuid(), 'old-q-2', 'Old two', 7);
      ${redemptionSql({ remote_status: 'UNFULFILLED' })};
      ${redemptionSql({ remote_status: 'CANCELED', expected_status: 'CANCELED', sync_status: 'confirmed' })}`);
    const before = { queues: checksum('queues', 't.id'), redemptions: checksum('redemptions', 't.redemption_id'), files: relfilenodes() };

    psql(file(M3, 'migration.sql'));
    expect(relfilenodes()).toBe(before.files); // constant defaults: no table rewrite
    expect(checksum('queues', 't.id', M3_QUEUE_COLUMNS)).toBe(before.queues);
    expect(checksum('redemptions', 't.redemption_id', M3_REDEMPTION_COLUMNS)).toBe(before.redemptions);
    expect(psql("SELECT bool_and(atthasmissing) FROM pg_attribute WHERE attrelid = 'queues'::regclass AND attname IN ('settlement_on_close_switch_off', 'settlement_on_chat_clear', 'reentry_window_hours', 'settlement_policy_rev', 'reentry_cap_hold', 'reentry_cap_counts_manual')").trim()).toBe('t');
    expect(refundConstraintValid()).toBe('f'); // NOT VALID until M3a
    expect(psql("SELECT count(*) FROM pg_indexes WHERE indexname = 'redemptions_refunded_idx'").trim()).toBe('0'); // DB-18: built by M3a
    expect(psql("SELECT settlement_on_close_switch_off || ',' || settlement_on_direct_conclusion || ',' || settlement_on_moderator_conclude || ',' || settlement_on_chat_clear || ',' || coalesce(reentry_refund_cap::text, 'null') || ',' || reentry_window_hours || ',' || settlement_policy_rev || ',' || reentry_cap_hold || ',' || reentry_cap_counts_manual FROM queues WHERE slug LIKE 'old-q-%'").trim().split('\n'))
      .toEqual(Array(2).fill('legacy,wait,wait,wait,null,12,0,after_n,true'));
    expect(psql('SELECT count(*) FROM redemptions WHERE refunded_at IS NOT NULL OR refund_origin IS NOT NULL').trim()).toBe('0');

    psql(file(M3A, 'migration.sql'));
    expect(refundConstraintValid()).toBe('t');
    expect(psql("SELECT count(*) FROM pg_indexes WHERE indexname = 'redemptions_refunded_idx' AND indexdef LIKE '%WHERE (refunded_at IS NOT NULL)%'").trim()).toBe('1');
    expect(relfilenodes()).toBe(before.files);
  });

  it('M3 does not reference any M2 column: it applies on a database without M2 and comes back out cleanly', () => {
    psql(file(M3, 'rollback.sql'));
    const m2a = '20261118090000_settlement_model';
    const m2b = '20261118090100_settlement_validate';
    psql(file(m2a, 'rollback.sql')); // the guard of M2a is empty: nothing in use
    expect(columnsOf('queues')).not.toContain('settlement');
    psql(file(M3, 'migration.sql'));
    psql(file(M3A, 'migration.sql'));
    expect(columnsOf('queues')).toContain('settlement_policy_rev');
    psql(file(M3, 'rollback.sql')); // the guard looks the M2 columns up in the catalog, so it also runs without them
    psql(file(m2a, 'migration.sql'));
    psql(file(m2b, 'migration.sql'));
    psql(file(M3, 'migration.sql'));
    psql(file(M3A, 'migration.sql'));
    expect(columnsOf('queues')).toEqual(expect.arrayContaining(['settlement', 'settlement_policy_rev']));
  });

  it('MG-06 queue constraints: each closed set and range refuses its invalid value on its own, and accepts the edges', () => {
    const insert = (column, value) => `INSERT INTO queues (id, slug, title, cost, ${column}) VALUES (gen_random_uuid(), 'ck-${randomUUID().slice(0, 8)}', 'T', 1, ${sqlValue(value)})`;
    const cases = [
      ['settlement_on_close_switch_off', ['legacy', 'wait', 'fulfill', 'refund'], ['always', 'Legacy', ''], 'queues_settlement_on_close_switch_off_check'],
      ['settlement_on_direct_conclusion', ['wait', 'refund', 'fulfill'], ['legacy', 'x'], 'queues_settlement_on_direct_conclusion_check'],
      ['settlement_on_moderator_conclude', ['wait', 'refund'], ['fulfill', 'legacy'], 'queues_settlement_on_moderator_conclude_check'],
      ['settlement_on_chat_clear', ['wait', 'refund', 'fulfill'], ['legacy', 'x'], 'queues_settlement_on_chat_clear_check'],
      ['reentry_cap_hold', ['after_n', 'at_n'], ['before_n', ''], 'queues_reentry_cap_hold_check'],
      ['reentry_refund_cap', [1, 20, 7], [0, 21, -1], 'queues_reentry_refund_cap_check'],
      ['reentry_window_hours', [1, 12, 72], [0, 73, -5], 'queues_reentry_window_hours_check'],
      ['settlement_policy_rev', [0, 9], [-1], 'queues_settlement_policy_rev_check'],
    ];
    for (const [column, good, bad, name] of cases) {
      for (const value of good) psql(insert(column, value));
      for (const value of bad) refused(insert(column, value), name);
    }
    psql(insert('reentry_refund_cap', null)); // no cap is a valid value
    psql("INSERT INTO queues (id, slug, title, cost, reentry_cap_counts_manual) VALUES (gen_random_uuid(), 'ck-bool', 'T', 1, false)");
  });

  it('MG-06 / MG-15 refund columns: both set or both NULL, a closed origin, and the guard freezes a refund once written (the nulling job may clear both)', () => {
    const id = (label) => `refund-${label}`;
    refused(redemptionSql({ redemption_id: id('only-at'), refunded_at: now.toISOString() }), 'redemptions_refund_origin_check');
    refused(redemptionSql({ redemption_id: id('only-origin'), refund_origin: 'automatic' }), 'redemptions_refund_origin_check');
    refused(redemptionSql({ redemption_id: id('bad-origin'), refunded_at: now.toISOString(), refund_origin: 'robot' }), 'redemptions_refund_origin_check');
    psql(redemptionSql({ redemption_id: id('auto'), ...refundedAt }));
    psql(redemptionSql({ redemption_id: id('hand'), refunded_at: now.toISOString(), refund_origin: 'streamer' }));
    psql(redemptionSql({ redemption_id: id('plain') }));

    // first write NULL -> value passes (the row had none)
    psql(`UPDATE redemptions SET refunded_at = '${now.toISOString()}', refund_origin = 'streamer' WHERE redemption_id = '${id('plain')}'`);
    // a refund is never rewritten
    refused(`UPDATE redemptions SET refunded_at = refunded_at + interval '1 minute' WHERE redemption_id = '${id('auto')}'`, 'refunded_at is immutable once set');
    refused(`UPDATE redemptions SET refund_origin = 'streamer' WHERE redemption_id = '${id('auto')}'`, 'refund_origin is immutable once set');
    refused(`UPDATE redemptions SET refund_origin = 'automatic' WHERE redemption_id = '${id('hand')}'`, 'refund_origin is immutable once set');
    // the origin cannot be removed alone, nor the timestamp alone (the CHECK), but both together pass (72 h nulling job)
    refused(`UPDATE redemptions SET refund_origin = NULL WHERE redemption_id = '${id('auto')}'`, 'redemptions_refund_origin_check');
    refused(`UPDATE redemptions SET refunded_at = NULL WHERE redemption_id = '${id('auto')}'`, 'redemptions_refund_origin_check');
    psql(`UPDATE redemptions SET refunded_at = NULL, refund_origin = NULL WHERE redemption_id = '${id('auto')}'`);
    // a row without refund can be touched by other columns without firing the guard
    psql(`UPDATE redemptions SET sync_status = 'confirmed' WHERE redemption_id = '${id('hand')}'`);
    psql(`DELETE FROM redemptions WHERE redemption_id LIKE 'refund-%'`);
  });

  it('PG34-03 a queue inserted after M3 reads legacy and the defaults, by SQL and through the repository', async () => {
    const queue = await newQueue();
    expect(queue).toMatchObject({
      settlementOnCloseSwitchOff: 'legacy', settlementOnDirectConclusion: 'wait', settlementOnModeratorConclude: 'wait', settlementOnChatClear: 'wait',
      reentryRefundCap: null, reentryWindowHours: 12, settlementPolicyRev: 0, reentryCapHold: 'after_n', reentryCapCountsManual: true,
    });
    expect(await repository.getQueueSettlementPolicy(queue.id)).toEqual({
      settlementPolicyRev: 0, onCloseSwitchOff: 'legacy', onDirectConclusion: 'wait', onModeratorConclude: 'wait', onChatClear: 'wait',
      reentryRefundCap: null, reentryWindowHours: 12, reentryCapHold: 'after_n', reentryCapCountsManual: true,
      effectiveBudget: null, legacySelectable: true, enforcementActive: false,
    });
    expect(await repository.getQueueSettlementPolicy(randomUUID())).toBeNull();
  });

  it('the stored policy is read by one loader and the decision provider stays the constant object until P7', async () => {
    const queue = await newQueue({ settlementOnDirectConclusion: 'refund', reentryRefundCap: 4, reentryCapHold: 'at_n', settlementPolicyRev: 5 });
    const read = await loadStoredSettlementPolicy(prisma, queue.id);
    expect(read).toMatchObject({ rev: 5, source: 'stored', onDirectConclusion: 'refund', reentryRefundCap: 4, reentryCapHold: 'at_n', reentryCapCountsManual: true });
    expect(Object.isFrozen(read)).toBe(true);
    expect(await loadStoredSettlementPolicy(prisma, randomUUID())).toBeNull();
    // a stored value cannot change what a closing does before the settlement service exists
    expect(await loadSettlementPolicy(prisma, queue.id)).toMatchObject({ source: 'constant', onDirectConclusion: 'wait', reentryRefundCap: null });
  });

  it('AC 35 before P7: a stale revision is refused with the current one; an equal body writes nothing; every real change is refused as a whole and writes nothing, not even the revision or an audit row', async () => {
    const queue = await newQueue();
    const auditBefore = await prisma.auditLog.count({ where: { queueId: queue.id } });
    const snapshot = JSON.stringify(await stored(queue.id));

    await expect(repository.updateQueueSettlementPolicy({ queueId: queue.id, expectedPolicyRev: 9, changes: {} })).rejects.toMatchObject({ code: 'SETTLEMENT_POLICY_STALE', settlementPolicyRev: 0 });
    // stale wins over the content of the body
    await expect(repository.updateQueueSettlementPolicy({ queueId: queue.id, expectedPolicyRev: 9, changes: { onChatClear: 'refund' } })).rejects.toMatchObject({ code: 'SETTLEMENT_POLICY_STALE' });

    const equal = await repository.updateQueueSettlementPolicy({ queueId: queue.id, expectedPolicyRev: 0, changes: { onCloseSwitchOff: 'legacy', onChatClear: 'wait', reentryRefundCap: null, reentryWindowHours: 12, reentryCapHold: 'after_n', reentryCapCountsManual: true } });
    expect(equal).toMatchObject({ settlementPolicyRev: 0, enforcementActive: false });

    const edits = [
      { onCloseSwitchOff: 'wait' }, { onDirectConclusion: 'refund' }, { onModeratorConclude: 'refund' }, { onChatClear: 'fulfill' },
      { reentryRefundCap: 3 }, { reentryWindowHours: 24 }, { reentryCapHold: 'at_n' }, { reentryCapCountsManual: false },
      { onChatClear: 'wait', reentryCapCountsManual: false }, // an accepted field mixed with a refused one
    ];
    for (const changes of edits) {
      await expect(repository.updateQueueSettlementPolicy({ queueId: queue.id, expectedPolicyRev: 0, changes }), JSON.stringify(changes))
        .rejects.toMatchObject({ code: 'SETTLEMENT_MODE_UNAVAILABLE', reason: 'policy_not_active' });
    }
    expect(JSON.stringify(await stored(queue.id))).toBe(snapshot);
    expect(await prisma.auditLog.count({ where: { queueId: queue.id } })).toBe(auditBefore);
  });

  it('AC 35 edit refused on a deleting, deleted-looking or archived queue and on a queue that does not exist (before the revision is compared)', async () => {
    const deleting = await newQueue({ lifecycleStatus: 'deleting' });
    const archived = await newQueue({ isArchived: true });
    await expect(repository.updateQueueSettlementPolicy({ queueId: deleting.id, expectedPolicyRev: 99, changes: {} })).rejects.toMatchObject({ code: 'QUEUE_NOT_AVAILABLE' });
    await expect(repository.updateQueueSettlementPolicy({ queueId: archived.id, expectedPolicyRev: 99, changes: {} })).rejects.toMatchObject({ code: 'QUEUE_NOT_AVAILABLE' });
    await expect(repository.updateQueueSettlementPolicy({ queueId: randomUUID(), expectedPolicyRev: 0, changes: {} })).rejects.toMatchObject({ code: 'QUEUE_NOT_FOUND' });
    const deleted = await newQueue({ lifecycleStatus: 'deleted', deletedAt: now });
    await expect(repository.updateQueueSettlementPolicy({ queueId: deleted.id, expectedPolicyRev: 0, changes: {} })).rejects.toMatchObject({ code: 'QUEUE_NOT_FOUND' });
    expect(await repository.getQueueSettlementPolicy(deleted.id)).toBeNull();
  });

  describe('with the P7 flag on (a test-only injection; production passes nothing)', () => {
    let active;
    beforeAll(() => { active = createQueueRepository(prisma, { clock, settlementEnforcementActive: true }); });

    it('PG35-01 the values and the revision go in one update, the audit carries closed values only, and legacy cannot be selected again', async () => {
      const queue = await newQueue();
      const result = await active.updateQueueSettlementPolicy({
        queueId: queue.id, expectedPolicyRev: 0, actorId: 'session-1',
        changes: { onCloseSwitchOff: 'wait', onDirectConclusion: 'refund', reentryRefundCap: 3, reentryCapHold: 'at_n', reentryCapCountsManual: false },
      });
      expect(result).toMatchObject({ settlementPolicyRev: 1, onCloseSwitchOff: 'wait', reentryRefundCap: 3, effectiveBudget: 2, legacySelectable: false, enforcementActive: true });
      expect(await stored(queue.id)).toMatchObject({ settlementPolicyRev: 1, settlementOnCloseSwitchOff: 'wait', settlementOnDirectConclusion: 'refund', reentryRefundCap: 3, reentryCapHold: 'at_n', reentryCapCountsManual: false, settlementOnChatClear: 'wait' });
      const audit = await prisma.auditLog.findMany({ where: { queueId: queue.id, event: 'queue.settlement_policy_changed' } });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ origin: 'panel', actorId: 'session-1' });
      expect(audit[0].safeDetail).toEqual({
        fields: ['onCloseSwitchOff', 'onDirectConclusion', 'reentryCapCountsManual', 'reentryCapHold', 'reentryRefundCap'],
        previous: { onCloseSwitchOff: 'legacy', onDirectConclusion: 'wait', reentryRefundCap: null, reentryCapHold: 'after_n', reentryCapCountsManual: true },
        next: { onCloseSwitchOff: 'wait', onDirectConclusion: 'refund', reentryRefundCap: 3, reentryCapHold: 'at_n', reentryCapCountsManual: false },
        policyRev: 1,
      });
      // one-way door: after the revision compare, before anything is written
      await expect(active.updateQueueSettlementPolicy({ queueId: queue.id, expectedPolicyRev: 1, changes: { onCloseSwitchOff: 'legacy' } })).rejects.toMatchObject({ code: 'SETTLEMENT_MODE_UNAVAILABLE', reason: 'legacy_not_selectable' });
      await expect(active.updateQueueSettlementPolicy({ queueId: queue.id, expectedPolicyRev: 0, changes: { onCloseSwitchOff: 'legacy' } })).rejects.toMatchObject({ code: 'SETTLEMENT_POLICY_STALE', settlementPolicyRev: 1 });
      expect((await stored(queue.id)).settlementPolicyRev).toBe(1);
      // an equal body on the changed queue writes nothing and does not move the revision
      await active.updateQueueSettlementPolicy({ queueId: queue.id, expectedPolicyRev: 1, changes: { onDirectConclusion: 'refund' } });
      expect((await stored(queue.id)).settlementPolicyRev).toBe(1);
      expect(await prisma.auditLog.count({ where: { queueId: queue.id, event: 'queue.settlement_policy_changed' } })).toBe(1);
      expect(JSON.stringify(audit)).not.toMatch(/viewer|twitch|label|login/i);
    });

    it('PG35-01 two concurrent edits from the same revision: exactly one wins, the loser is stale, 50 rounds', async () => {
      for (let round = 0; round < 50; round += 1) {
        const queue = await newQueue();
        const outcomes = await Promise.allSettled([
          active.updateQueueSettlementPolicy({ queueId: queue.id, expectedPolicyRev: 0, changes: { onChatClear: 'refund' } }),
          active.updateQueueSettlementPolicy({ queueId: queue.id, expectedPolicyRev: 0, changes: { onChatClear: 'fulfill' } }),
        ]);
        const winners = outcomes.filter(({ status }) => status === 'fulfilled');
        const losers = outcomes.filter(({ status }) => status === 'rejected');
        expect(winners, `round ${round}`).toHaveLength(1);
        expect(losers[0].reason).toMatchObject({ code: 'SETTLEMENT_POLICY_STALE', settlementPolicyRev: 1 });
        const row = await stored(queue.id);
        expect(row.settlementPolicyRev).toBe(1);
        expect(row.settlementOnChatClear).toBe(winners[0].value.onChatClear);
        expect(await prisma.auditLog.count({ where: { queueId: queue.id, event: 'queue.settlement_policy_changed' } })).toBe(1);
      }
    }, 120_000);
  });

  it('AC 38 pendingDecisions: counts awaiting_choice and check_group per queue, not held_for_service, in ONE grouped query whatever the number of queues; unreadable means absent', async () => {
    const decided = { group_decision: 'eligible', matched_group: 'own_list', settlement_mode: 'refund_on_end', group_checked_at: now.toISOString() };
    const a = await newQueue();
    const b = await newQueue();
    const c = await newQueue();
    const insert = (queue, columns) => psql(redemptionSql({ queue_id: queue.id, remote_status: 'UNFULFILLED', ...columns }));
    insert(a, { settlement_state: 'awaiting_choice', settlement_cause: 'policy_wait' });
    insert(a, { settlement_state: 'awaiting_choice', settlement_cause: 'cannot_ask' });
    insert(a, { settlement_state: 'check_group', group_decision: 'unknown', group_unknown_reason: 'timeout', settlement_mode: 'refund_on_end', group_checked_at: now.toISOString() });
    insert(a, { settlement_state: 'held_for_service', ...decided });
    insert(a, { settlement_state: 'held_for_service', ...decided });
    insert(a, { settlement_state: 'held_for_service', ...decided }); // three held rows: a counted held would show in the totals
    insert(b, { settlement_state: 'held_for_service', ...decided });
    insert(b, { settlement_state: 'check_group', group_decision: 'unknown', group_unknown_reason: 'timeout', settlement_mode: 'refund_on_end', group_checked_at: now.toISOString() });
    insert(c, {});
    const byId = (list) => Object.fromEntries(list.map((queue) => [queue.id, queue.pendingDecisions]));

    const calls = [];
    const counting = new Proxy(prisma, { get(target, property) {
      if (property !== 'redemption') return Reflect.get(target, property);
      return new Proxy(target.redemption, { get(model, method) {
        const value = Reflect.get(model, method);
        return typeof value === 'function' ? (...args) => { calls.push(String(method)); return value.apply(model, args); } : value;
      } });
    } });
    const counted = createQueueRepository(counting, { clock });
    const projection = byId(await counted.listQueueProjection());
    expect(projection[a.id]).toEqual({ awaitingChoice: 2, checkGroup: 1, total: 3 });
    expect(projection[b.id]).toEqual({ awaitingChoice: 0, checkGroup: 1, total: 1 });
    expect(projection[c.id]).toEqual({ awaitingChoice: 0, checkGroup: 0, total: 0 });
    expect(calls.filter((method) => method === 'groupBy')).toHaveLength(1); // one query for every queue
    const queuesInProjection = (await counted.listQueueProjection()).length;
    expect(queuesInProjection).toBeGreaterThanOrEqual(3);
    expect(calls.filter((method) => method === 'groupBy')).toHaveLength(2); // one more call = one more query, never one per queue

    const broken = new Proxy(prisma, { get(target, property) {
      if (property !== 'redemption') return Reflect.get(target, property);
      return new Proxy(target.redemption, { get(model, method) { return method === 'groupBy' ? async () => { throw new Error('boom'); } : Reflect.get(model, method); } });
    } });
    const unknown = await createQueueRepository(broken, { clock }).listQueueProjection();
    expect(unknown.length).toBeGreaterThanOrEqual(3);
    for (const queue of unknown) expect(queue).not.toHaveProperty('pendingDecisions'); // unknown, never a false 0
  });

  it('MG-08 / MG-11 the M3-down guard refuses after use (a refund timestamp, each waiting state, a refund_on_end queue) and passes before; up-down-up through the Prisma runbook restores the same schema', async () => {
    psql("DELETE FROM redemptions WHERE settlement_state IN ('awaiting_choice', 'check_group', 'held_for_service')"); // artifacts of the count test
    const guardCases = [
      ['a refund timestamp', () => psql(redemptionSql({ redemption_id: 'guard-refund', ...refundedAt })), () => psql("DELETE FROM redemptions WHERE redemption_id = 'guard-refund'"), /refund timestamp/],
      ['a redemption awaiting a choice', () => psql(redemptionSql({ redemption_id: 'guard-awaiting', settlement_state: 'awaiting_choice', settlement_cause: 'policy_wait' })), () => psql("DELETE FROM redemptions WHERE redemption_id = 'guard-awaiting'"), /waiting for a settlement decision/],
      ['a held redemption', () => psql(redemptionSql({ redemption_id: 'guard-held', settlement_state: 'held_for_service', group_decision: 'eligible', matched_group: 'own_list', settlement_mode: 'refund_on_end', group_checked_at: now.toISOString() })), () => psql("DELETE FROM redemptions WHERE redemption_id = 'guard-held'"), /waiting for a settlement decision/],
      ['a redemption in check_group', () => psql(redemptionSql({ redemption_id: 'guard-check', settlement_state: 'check_group', group_decision: 'unknown', group_unknown_reason: 'timeout', settlement_mode: 'refund_on_end', group_checked_at: now.toISOString() })), () => psql("DELETE FROM redemptions WHERE redemption_id = 'guard-check'"), /waiting for a settlement decision/],
      ['a queue in refund_on_end', () => psql("UPDATE queues SET settlement = 'refund_on_end' WHERE slug = 'old-q-1'"), () => psql("UPDATE queues SET settlement = 'fulfill_on_start' WHERE slug = 'old-q-1'"), /queue is in refund_on_end/],
    ];
    const schemaAtStart = schemaText();
    for (const [label, use, clean, message] of guardCases) {
      use();
      expect(() => psql(file(M3, 'rollback.sql')), label).toThrow(message);
      expect(schemaText(), `${label}: the refused rollback changed nothing`).toBe(schemaAtStart);
      expect(newObjects(), label).toBe(psql(`SELECT 1 || ',' || 1 || ',' || 8 || ',' || 1`).trim());
      clean();
    }

    // some policy values and rows exist now: the down loses only the new columns
    const before = { queues: checksum('queues', 't.id', M3_QUEUE_COLUMNS), redemptions: checksum('redemptions', 't.redemption_id', M3_REDEMPTION_COLUMNS), outbox: checksum('outbox', 't.id') };
    psql(file(M3A, 'rollback.sql')); // the no-op
    expect(columnsOf('queues')).toContain('settlement_policy_rev');
    const down = prismaCli(['db', 'execute', '--schema', 'apps/api/prisma/schema.prisma', '--file', `apps/api/prisma/migrations/${M3}/rollback.sql`]);
    expect(down.status, down.stderr || down.stdout).toBe(0);
    expect(columnsOf('queues')).not.toEqual(expect.arrayContaining(['settlement_policy_rev']));
    for (const column of M3_QUEUE_COLUMNS) expect(columnsOf('queues')).not.toContain(column);
    for (const column of M3_REDEMPTION_COLUMNS) expect(columnsOf('redemptions')).not.toContain(column);
    expect(psql(`SELECT count(*) FROM pg_proc WHERE proname = 'redemptions_refund_guard'`).trim()).toBe('0');
    expect(psql("SELECT count(*) FROM pg_indexes WHERE indexname = 'redemptions_refunded_idx'").trim()).toBe('0');
    expect(psql("SELECT count(*) FROM pg_constraint WHERE conname = 'redemptions_refund_origin_check' OR conname LIKE 'queues\\_settlement\\_on\\_%' OR conname LIKE 'queues\\_reentry\\_%' OR conname = 'queues_settlement_policy_rev_check'").trim()).toBe('0');
    expect(checksum('queues', 't.id')).toBe(before.queues);
    expect(checksum('redemptions', 't.redemption_id')).toBe(before.redemptions);
    expect(checksum('outbox', 't.id')).toBe(before.outbox);

    const cleanHistory = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'execute', '--schema', 'apps/api/prisma/schema.prisma', '--stdin'], {
      cwd: root, encoding: 'utf8', timeout: 60_000, env: { ...process.env, DATABASE_URL: connectionString },
      input: `DELETE FROM _prisma_migrations WHERE migration_name IN ('${M3A}', '${M3}');`,
    });
    expect(cleanHistory.status, cleanHistory.stderr || cleanHistory.stdout).toBe(0);
    const up = prismaCli(['migrate', 'deploy']);
    expect(up.status, up.stderr || up.stdout).toBe(0);
    expect(schemaText()).toBe(schemaAtStart); // up-down-up: schema equal to the first up
    expect(refundConstraintValid()).toBe('t');
    expect(psql(`SELECT count(*) FROM _prisma_migrations WHERE migration_name IN ('${M3}', '${M3A}') AND finished_at IS NOT NULL`).trim()).toBe('2');
    expect(psql("SELECT settlement_on_close_switch_off FROM queues WHERE slug = 'old-q-1'").trim()).toBe('legacy');
  }, 180_000);

  it('MG-04 M3-down works when M3a was never applied (the unvalidated constraint and the missing index are tolerated)', () => {
    psql(file(M3, 'rollback.sql'));
    psql(file(M3, 'migration.sql')); // M3 alone
    expect(refundConstraintValid()).toBe('f');
    psql(file(M3, 'rollback.sql'));
    expect(columnsOf('redemptions')).not.toContain('refund_origin');
    psql(file(M3, 'migration.sql'));
    psql(file(M3A, 'migration.sql'));
    psql(file(M3A, 'rollback.sql')); // the no-op leaves everything in place
    expect(columnsOf('queues')).toContain('settlement_policy_rev');
    expect(refundConstraintValid()).toBe('t');
  });
});
