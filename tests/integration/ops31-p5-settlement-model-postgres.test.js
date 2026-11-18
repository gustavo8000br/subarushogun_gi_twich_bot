// OPS-31 P5 (Gate C, FT-74): the settlement model on an ISOLATED PostgreSQL with the real migrations (never SQLite, never
// Prisma mocks). M2a/M2b over rows that already exist (no rewrite, checksum of the old columns), every CHECK refusing its
// invalid row (one constraint per case, so a dropped constraint turns exactly its case red), the guard trigger, the
// single financial task index, the own refund list (limit under concurrency, privacy), the gate writing
// `intent_recorded`, the setting refusal of AC 30, and rollback guards plus up-down-up through the Prisma runbook.
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
import { createQueueDomainService } from '../../apps/api/src/domain/queue-service.mjs';
import { REFUND_LIST_MAX } from '../../apps/api/src/persistence/refund-list-store.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const containerName = `queuebot-ops31-p5-${process.pid}-${randomUUID().slice(0, 8)}`;
let connectionString;
let prisma;
let repository;
const now = new Date('2030-01-01T12:00:00.000Z');
const clock = () => now;
const M2A = '20261118090000_settlement_model';
const M2B = '20261118090100_settlement_validate';

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
/** Insert one redemption with the given settlement columns (snake_case). */
function redemptionSql(columns = {}) {
  sequence += 1;
  const row = { redemption_id: `p5-red-${sequence}-${randomUUID()}`, broadcaster_id: 'broadcaster', reward_id: 'reward-p5', user_id: `viewer-${sequence}`, redeemed_at: now.toISOString(), ...columns };
  return `INSERT INTO redemptions (${Object.keys(row).join(', ')}) VALUES (${Object.values(row).map(sqlValue).join(', ')})`;
}
const decided = { group_decision: 'eligible', matched_group: 'own_list', settlement_mode: 'refund_on_end', group_checked_at: now.toISOString() };
const unknown = { group_decision: 'unknown', group_unknown_reason: 'timeout', settlement_mode: 'refund_on_end', group_checked_at: now.toISOString() };
const notEligible = { group_decision: 'not_eligible', settlement_mode: 'refund_on_end', group_checked_at: now.toISOString() };
const settledAt = { settled_external_at: now.toISOString() };

const constraintState = () => Object.fromEntries(psql("SELECT conname || '=' || CASE WHEN convalidated THEN 'v' ELSE 'f' END FROM pg_constraint WHERE conrelid = 'redemptions'::regclass AND conname LIKE 'redemptions_%_check' ORDER BY 1")
  .trim().split('\n').filter(Boolean).map((line) => line.split('=')));
const NEW_QUEUE_COLUMNS = ['settlement', 'refund_group_subscriber', 'refund_group_moderator', 'refund_group_vip', 'refund_group_own_list'];
const NEW_REDEMPTION_COLUMNS = ['settlement_state', 'group_decision', 'matched_group', 'settlement_mode', 'group_checked_at', 'group_unknown_reason', 'settlement_cause', 'settled_external_at'];
const dropKeys = (columns) => columns.map((column) => ` - '${column}'`).join('');
const checksum = (table, order, columns = []) => psql(`SELECT md5(coalesce(string_agg((to_jsonb(t)${dropKeys(columns)})::text, '|' ORDER BY ${order}), '')) FROM ${table} t`).trim();
const relfilenodes = () => psql("SELECT relname || '=' || relfilenode FROM pg_class WHERE relname IN ('queues', 'redemptions', 'outbox') ORDER BY 1").trim();
const schemaText = () => ['queues', 'redemptions', 'outbox', 'refund_list_members'].map((table) => psql(`\\d ${table}`)).join('\n');
const functionExists = () => psql("SELECT count(*) FROM pg_proc WHERE proname = 'redemptions_settlement_guard'").trim() === '1';
const columnsOf = (table) => psql(`SELECT column_name FROM information_schema.columns WHERE table_name = '${table}' ORDER BY 1`).trim().split('\n');

async function newQueue(extra = {}) {
  return prisma.queue.create({ data: { slug: `p5-${randomUUID().slice(0, 8)}`, title: 'Abyss', cost: 5, isOpen: true, rewardId: `reward-${randomUUID()}`, remoteSyncStatus: 'synced', ...extra } });
}
const eventFor = (queue, extra = {}) => ({
  id: `p5-ev-${randomUUID()}`, rewardId: queue.rewardId, broadcasterId: 'broadcaster', userId: `viewer-${randomUUID()}`, userLogin: 'Viewer', displayName: 'Viewer',
  redeemedAt: now, status: 'UNFULFILLED', userInput: '', ...extra,
});

describe('OPS-31 P5 settlement model on isolated PostgreSQL', () => {
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

  it('PG74-01 / MG-03 / MG-04: M2a then M2b over rows that already exist: old rows keep their values, no rewrite, constraints unvalidated after M2a and validated after M2b', () => {
    psql(file(M2A, 'rollback.sql')); // an empty feature: the guard passes; the schema is now the one before P5
    expect(columnsOf('queues')).not.toContain('settlement');
    psql(`INSERT INTO queues (id, slug, title, cost) VALUES (gen_random_uuid(), 'old-q-1', 'Old one', 5), (gen_random_uuid(), 'old-q-2', 'Old two', 7);
      ${redemptionSql({ remote_status: 'UNFULFILLED' })};
      ${redemptionSql({ remote_status: 'CANCELED', expected_status: 'CANCELED', sync_status: 'confirmed' })};
      INSERT INTO outbox (operation_type, entity_type, idempotency_key, status) VALUES ('redemption.cancel', 'redemption', 'old-financial-1', 'confirmed')`);
    const before = { queues: checksum('queues', 't.id'), redemptions: checksum('redemptions', 't.redemption_id'), outbox: checksum('outbox', 't.id'), files: relfilenodes() };

    psql(file(M2A, 'migration.sql'));
    expect(relfilenodes()).toBe(before.files); // constant defaults and NOT VALID constraints: no table rewrite
    expect(checksum('queues', 't.id', NEW_QUEUE_COLUMNS)).toBe(before.queues);
    expect(checksum('redemptions', 't.redemption_id', NEW_REDEMPTION_COLUMNS)).toBe(before.redemptions);
    expect(checksum('outbox', 't.id')).toBe(before.outbox);
    expect(Object.values(constraintState()).filter((valid) => valid === 'f')).toHaveLength(5); // five NOT VALID until M2b
    expect(constraintState()).toMatchObject({
      redemptions_settlement_values_check: 'f', redemptions_decision_shape_check: 'f', redemptions_settlement_state_check: 'f',
      redemptions_settlement_cause_check: 'f', redemptions_settled_external_check: 'f',
    });
    expect(psql("SELECT count(*) FROM pg_indexes WHERE indexname IN ('redemptions_pending_settlement_idx', 'redemptions_settled_external_idx')").trim()).toBe('0'); // DB-18: built by M2b

    psql(file(M2B, 'migration.sql'));
    expect(Object.values(constraintState()).filter((valid) => valid === 'f')).toHaveLength(0);
    expect(psql("SELECT count(*) FROM pg_indexes WHERE indexname IN ('redemptions_pending_settlement_idx', 'redemptions_settled_external_idx')").trim()).toBe('2');
    expect(relfilenodes()).toBe(before.files);
    expect(psql("SELECT settlement || ',' || refund_group_subscriber || refund_group_moderator || refund_group_vip || refund_group_own_list FROM queues WHERE slug LIKE 'old-q-%'").trim().split('\n'))
      .toEqual(['fulfill_on_start,falsefalsefalsefalse', 'fulfill_on_start,falsefalsefalsefalse']);
    expect(psql("SELECT DISTINCT settlement_state || coalesce(group_decision, '-') || coalesce(settlement_cause, '-') || coalesce(settled_external_at::text, '-') FROM redemptions").trim()).toBe('none---');
    // the notice defaults of M1 are untouched
    expect(psql("SELECT bool_or(notice_joined) FROM queues WHERE slug LIKE 'old-q-%'").trim()).toBe('f');
  });

  it('M2a also builds the final catalog objects: guard trigger on three columns, the financial unique index, the own list table with its keys', () => {
    expect(psql("SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'redemptions_settlement_guard'")).toMatch(/BEFORE UPDATE OF settlement_state, group_decision, settled_external_at ON (public\.)?redemptions/);
    expect(psql("SELECT indexdef FROM pg_indexes WHERE indexname = 'outbox_financial_redemption_uidx'")).toMatch(/UNIQUE INDEX .*\(redemption_id\) WHERE .*redemption\.cancel.*redemption\.fulfill/);
    // DB-14: the history index carries the tie-break and the partial predicate
    expect(psql("SELECT indexdef FROM pg_indexes WHERE indexname = 'redemptions_settled_external_idx'")).toMatch(/\(queue_id, settled_external_at DESC, redemption_id DESC\) WHERE .*settled_external/);
    expect(psql("SELECT indexdef FROM pg_indexes WHERE indexname = 'redemptions_pending_settlement_idx'")).toMatch(/held_for_service.*awaiting_choice.*check_group/);
  });

  it('PG74-04 the duplicate probe of M2a fails loudly and atomically, then passes once the duplicate is gone', () => {
    psql(file(M2A, 'rollback.sql'));
    const id = `p5-dup-${randomUUID()}`;
    psql(`${redemptionSql({ redemption_id: id })};
      INSERT INTO outbox (operation_type, entity_type, idempotency_key, redemption_id) VALUES ('redemption.cancel', 'redemption', 'dup-a-${id}', '${id}'), ('redemption.cancel', 'redemption', 'dup-b-${id}', '${id}')`);
    expect(() => psql(file(M2A, 'migration.sql'))).toThrow(/more than one financial outbox row/);
    expect(columnsOf('queues')).not.toContain('settlement'); // one transaction: nothing was applied
    psql(`DELETE FROM outbox WHERE idempotency_key = 'dup-b-${id}'`);
    psql(file(M2A, 'migration.sql'));
    psql(file(M2B, 'migration.sql'));
    expect(columnsOf('queues')).toContain('settlement');
  });

  const decisionCases = [
    // values
    ['values: unknown state', { settlement_state: 'bogus' }, 'redemptions_settlement_values_check'],
    ['values: unknown decision', { ...decided, group_decision: 'maybe', matched_group: null }, 'redemptions_settlement_values_check'],
    ['values: unknown matched group', { ...decided, matched_group: 'twitch_friend' }, 'redemptions_settlement_values_check'],
    ['values: unknown mode', { ...decided, settlement_mode: 'keep_forever' }, 'redemptions_settlement_values_check'],
    ['values: unknown reason', { ...unknown, group_unknown_reason: 'cosmic_rays' }, 'redemptions_settlement_values_check'],
    // decision shape
    ['shape: eligible without a matched group', { ...decided, matched_group: null }, 'redemptions_decision_shape_check'],
    ['shape: decision without the check time', { ...decided, group_checked_at: null }, 'redemptions_decision_shape_check'],
    ['shape: decision without the mode', { ...decided, settlement_mode: null }, 'redemptions_decision_shape_check'],
    ['shape: matched group without a decision', { matched_group: 'vip' }, 'redemptions_decision_shape_check'],
    ['shape: unknown without a reason', { ...unknown, group_unknown_reason: null }, 'redemptions_decision_shape_check'],
    ['shape: not_eligible with a matched group', { ...notEligible, matched_group: 'vip' }, 'redemptions_decision_shape_check'],
    ['shape: eligible with a reason', { ...decided, group_unknown_reason: 'timeout' }, 'redemptions_decision_shape_check'],
    // state against facts (DB-1)
    ['state: held_for_service with a NULL decision (the NULL trap)', { settlement_state: 'held_for_service' }, 'redemptions_settlement_state_check'],
    ['state: held_for_service with not_eligible', { ...notEligible, settlement_state: 'held_for_service' }, 'redemptions_settlement_state_check'],
    ['state: held_for_service with an intent', { ...decided, settlement_state: 'held_for_service', expected_status: 'CANCELED' }, 'redemptions_settlement_state_check'],
    ['state: held_for_service with a terminal remote', { ...decided, settlement_state: 'held_for_service', remote_status: 'FULFILLED' }, 'redemptions_settlement_state_check'],
    ['state: awaiting_choice with an intent', { settlement_state: 'awaiting_choice', settlement_cause: 'policy_wait', expected_status: 'FULFILLED' }, 'redemptions_settlement_state_check'],
    ['state: awaiting_choice with a terminal remote', { settlement_state: 'awaiting_choice', settlement_cause: 'cannot_ask', remote_status: 'CANCELED' }, 'redemptions_settlement_state_check'],
    ['state: check_group with an eligible decision', { ...decided, settlement_state: 'check_group' }, 'redemptions_settlement_state_check'],
    ['state: check_group with a NULL decision', { settlement_state: 'check_group' }, 'redemptions_settlement_state_check'],
    ['state: check_group with an intent', { ...unknown, settlement_state: 'check_group', expected_status: 'CANCELED' }, 'redemptions_settlement_state_check'],
    ['state: intent_recorded without an expectation', { settlement_state: 'intent_recorded' }, 'redemptions_settlement_state_check'],
    ['state: settled_external with the remote still UNFULFILLED', { settlement_state: 'settled_external', ...settledAt }, 'redemptions_settlement_state_check'],
    ['state: settled_external with an intent', { settlement_state: 'settled_external', ...settledAt, remote_status: 'FULFILLED', expected_status: 'FULFILLED' }, 'redemptions_settlement_state_check'],
    // cause (DB-12 strict form)
    ['cause: unknown code', { settlement_state: 'awaiting_choice', settlement_cause: 'because' }, 'redemptions_settlement_cause_check'],
    ['cause: awaiting_choice without a cause', { settlement_state: 'awaiting_choice' }, 'redemptions_settlement_cause_check'],
    ['cause: a cause on state none', { settlement_cause: 'policy_wait' }, 'redemptions_settlement_cause_check'],
    ['cause: a cause on intent_recorded', { settlement_state: 'intent_recorded', expected_status: 'CANCELED', settlement_cause: 'reentry_cap' }, 'redemptions_settlement_cause_check'],
    // settled_external_at (DB-13)
    ['settled: a time on state none', { ...settledAt }, 'redemptions_settled_external_check'],
    ['settled: settled_external without a time', { settlement_state: 'settled_external', remote_status: 'FULFILLED' }, 'redemptions_settled_external_check'],
  ];
  it.each(decisionCases)('MG-06 / PG74-02 / PG37-0x %s is refused by exactly its constraint', (_label, columns, constraint) => {
    refused(redemptionSql(columns), constraint);
  });

  it('MG-06 the valid shapes are accepted, including `awaiting_choice` with a NULL or not_eligible decision (DB-1 regression) and every one of the six causes', () => {
    const valid = [
      { settlement_state: 'held_for_service', ...decided },
      { settlement_state: 'awaiting_choice', settlement_cause: 'policy_wait' },
      { settlement_state: 'awaiting_choice', settlement_cause: 'legacy_residue', ...notEligible },
      { settlement_state: 'awaiting_choice', settlement_cause: 'cannot_ask', ...decided },
      { settlement_state: 'check_group', ...unknown },
      { settlement_state: 'intent_recorded', expected_status: 'CANCELED' },
      { settlement_state: 'settled_external', ...settledAt, remote_status: 'FULFILLED' },
      { settlement_state: 'settled_external', ...settledAt, remote_status: 'CANCELED', ...decided },
      ...['policy_wait', 'cannot_ask', 'chat_clear', 'legacy_residue', 'reentry_cap', 'batch_deferred'].map((cause) => ({ settlement_state: 'awaiting_choice', settlement_cause: cause })),
    ];
    for (const columns of valid) psql(redemptionSql(columns));
  });

  it('MG-06 queue and own-list constraints: closed set, id format, label length, one row per Twitch id', () => {
    refused("INSERT INTO queues (id, slug, title, cost, settlement) VALUES (gen_random_uuid(), 'bad-settlement', 'Bad', 5, 'refund_always')", 'queues_settlement_check');
    refused("INSERT INTO refund_list_members (twitch_user_id) VALUES ('12ab')", 'refund_list_members_twitch_user_id_check');
    refused("INSERT INTO refund_list_members (twitch_user_id) VALUES ('')", 'refund_list_members_twitch_user_id_check');
    refused(`INSERT INTO refund_list_members (twitch_user_id) VALUES ('${'9'.repeat(21)}')`, 'refund_list_members_twitch_user_id_check');
    refused("INSERT INTO refund_list_members (twitch_user_id, label) VALUES ('777001', '')", 'refund_list_members_label_check');
    refused(`INSERT INTO refund_list_members (twitch_user_id, label) VALUES ('777002', '${'x'.repeat(41)}')`, 'refund_list_members_label_check');
    psql(`INSERT INTO refund_list_members (twitch_user_id, label) VALUES ('777003', '${'x'.repeat(40)}'), ('777004', NULL)`);
    refused("INSERT INTO refund_list_members (twitch_user_id) VALUES ('777003')", 'refund_list_members_twitch_user_id_key');
    psql("DELETE FROM refund_list_members WHERE twitch_user_id LIKE '7770%'");
  });

  it('PG74-03 / MG-07 the guard trigger: intent_recorded and settled_external are absorbing, a conclusive decision never changes, settled_external_at is immutable', () => {
    const id = (label) => `p5-guard-${label}-${randomUUID()}`;
    const intent = id('intent');
    psql(redemptionSql({ redemption_id: intent, settlement_state: 'intent_recorded', expected_status: 'CANCELED' }));
    expect(() => psql(`UPDATE redemptions SET settlement_state = 'none' WHERE redemption_id = '${intent}'`)).toThrow(/intent_recorded is absorbing/);
    expect(() => psql(`UPDATE redemptions SET settlement_state = 'settled_external', settled_external_at = now(), remote_status = 'CANCELED', expected_status = NULL WHERE redemption_id = '${intent}'`)).toThrow(/intent_recorded is absorbing/);
    psql(`UPDATE redemptions SET sync_status = 'pending', remote_status = 'CANCELED' WHERE redemption_id = '${intent}'`); // other columns do not fire it
    psql(`UPDATE redemptions SET settlement_state = 'intent_recorded' WHERE redemption_id = '${intent}'`); // the same value is not a change

    const external = id('external');
    psql(redemptionSql({ redemption_id: external, settlement_state: 'settled_external', ...settledAt, remote_status: 'FULFILLED' }));
    expect(() => psql(`UPDATE redemptions SET settlement_state = 'none', settled_external_at = NULL WHERE redemption_id = '${external}'`)).toThrow(/settled_external is absorbing/);
    expect(() => psql(`UPDATE redemptions SET settled_external_at = now() + interval '1 hour' WHERE redemption_id = '${external}'`)).toThrow(/settled_external_at is immutable/);

    const conclusive = id('conclusive');
    psql(redemptionSql({ redemption_id: conclusive, ...decided }));
    expect(() => psql(`UPDATE redemptions SET group_decision = 'not_eligible', matched_group = NULL WHERE redemption_id = '${conclusive}'`)).toThrow(/conclusive group_decision is immutable/);
    expect(() => psql(`UPDATE redemptions SET group_decision = NULL, matched_group = NULL, settlement_mode = NULL, group_checked_at = NULL WHERE redemption_id = '${conclusive}'`)).toThrow(/conclusive group_decision is immutable/);
    psql(`UPDATE redemptions SET matched_group = 'vip' WHERE redemption_id = '${conclusive}'`);

    const open = id('unknown');
    psql(redemptionSql({ redemption_id: open, ...unknown }));
    psql(`UPDATE redemptions SET group_decision = 'eligible', matched_group = 'moderator', group_unknown_reason = NULL WHERE redemption_id = '${open}'`); // unknown may become conclusive once
  });

  it('M3 (the single financial task): a second financial row of one redemption is refused by the partial unique index; other operations are not affected', async () => {
    const redemptionId = `p5-task-${randomUUID()}`;
    await prisma.redemption.create({ data: { redemptionId, broadcasterId: 'broadcaster', rewardId: 'reward-p5', userId: 'viewer-task', redeemedAt: now } });
    const row = (operationType, key) => prisma.outbox.create({ data: { operationType, entityType: 'redemption', entityId: redemptionId, idempotencyKey: key, redemptionId, payload: {} } });
    await row('redemption.cancel', `financial:${redemptionId}`);
    await expect(row('redemption.fulfill', `financial-other-${redemptionId}`)).rejects.toThrow(/Unique constraint|outbox_financial_redemption_uidx/);
    await expect(row('redemption.cancel', `financial-again-${redemptionId}`)).rejects.toThrow(/Unique constraint|outbox_financial_redemption_uidx/);
    await row('chat.notice', `notice-${redemptionId}`); // not a financial row
    expect(await prisma.outbox.count({ where: { redemptionId } })).toBe(2);
  });

  it('U74-05..07 / PG74-06 own list: adds with a label, refuses a duplicate and a bad id, removes, clears (idempotent) and never returns the Twitch id', async () => {
    await repository.clearRefundList({ actorId: 'test' });
    const first = await repository.addRefundListMember({ twitchUserId: '555001', label: '  Friend One  ', actorId: 'actor-1' });
    expect(first).toMatchObject({ count: 1, member: { label: 'Friend One' } });
    expect(Object.keys(first.member).sort()).toEqual(['createdAt', 'id', 'label']);
    const second = await repository.addRefundListMember({ twitchUserId: '555002' });
    expect(second.member.label).toBeNull();
    await expect(repository.addRefundListMember({ twitchUserId: '555001' })).rejects.toMatchObject({ code: 'REFUND_LIST_DUPLICATE' });
    await expect(repository.addRefundListMember({ twitchUserId: 'abc' })).rejects.toMatchObject({ code: 'REFUND_LIST_INVALID' });
    await expect(repository.addRefundListMember({ twitchUserId: '555003', label: 'x'.repeat(41) })).rejects.toMatchObject({ code: 'REFUND_LIST_INVALID' });
    await expect(repository.addRefundListMember({ twitchUserId: '555003', label: 'bad\nlabel' })).rejects.toMatchObject({ code: 'REFUND_LIST_INVALID' });
    expect(await prisma.refundListMember.count()).toBe(2);

    const list = await repository.listRefundList();
    expect(list).toMatchObject({ count: 2, max: REFUND_LIST_MAX });
    expect(list.items.map((item) => item.label)).toEqual(['Friend One', null]);
    expect(JSON.stringify(list)).not.toMatch(/555001|555002/);

    await expect(repository.removeRefundListMember({ id: randomUUID() })).rejects.toMatchObject({ code: 'REFUND_LIST_MEMBER_NOT_FOUND' });
    expect(await repository.removeRefundListMember({ id: first.member.id, actorId: 'actor-1' })).toEqual({ count: 1 });
    expect(await repository.clearRefundList({ actorId: 'actor-1' })).toEqual({ removed: 1 });
    expect(await repository.clearRefundList({ actorId: 'actor-1' })).toEqual({ removed: 0 });

    // audit carries counts only: never an id, a login or a label
    const events = await prisma.auditLog.findMany({ where: { event: { startsWith: 'refund_list.' } }, orderBy: { createdAt: 'asc' } });
    expect(events.map((event) => event.event)).toEqual(expect.arrayContaining(['refund_list.member_added', 'refund_list.member_removed', 'refund_list.cleared']));
    for (const event of events) {
      expect(Object.keys(event.safeDetail)).toEqual(['count']);
      expect(JSON.stringify(event)).not.toMatch(/55500|Friend/);
    }
  });

  it('U74-06 / PG74-06 the 500th person is accepted, the 501st is refused; two connections racing for the 500th place leave exactly 500 rows and one refusal (50 rounds)', async () => {
    await repository.clearRefundList({ actorId: 'test' });
    await prisma.$executeRawUnsafe(`INSERT INTO refund_list_members (twitch_user_id) SELECT (900000 + g)::text FROM generate_series(1, ${REFUND_LIST_MAX - 1}) g`);
    expect(await repository.addRefundListMember({ twitchUserId: '800000' })).toMatchObject({ count: REFUND_LIST_MAX });
    await expect(repository.addRefundListMember({ twitchUserId: '800001' })).rejects.toMatchObject({ code: 'REFUND_LIST_FULL' });
    expect(await prisma.refundListMember.count()).toBe(REFUND_LIST_MAX);
    for (let round = 0; round < 50; round += 1) {
      await prisma.refundListMember.deleteMany({ where: { twitchUserId: { in: ['800000', '800001', '800002'] } } });
      const outcomes = await Promise.allSettled([repository.addRefundListMember({ twitchUserId: '800001' }), repository.addRefundListMember({ twitchUserId: '800002' })]);
      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled'), `round ${round}`).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === 'rejected').map((outcome) => outcome.reason.code), `round ${round}`).toEqual(['REFUND_LIST_FULL']);
      expect(await prisma.refundListMember.count(), `round ${round}`).toBe(REFUND_LIST_MAX);
    }
    await repository.clearRefundList({ actorId: 'test' });
  }, 120_000);

  it('U74-08 / PG74-07 the own list belongs to the channel: deleting a queue keeps the people and only that queue loses its own_list switch', async () => {
    await repository.clearRefundList({ actorId: 'test' });
    await repository.addRefundListMember({ twitchUserId: '600001', label: 'Keep me' });
    const queue = await newQueue({ refundGroupOwnList: true });
    await prisma.queue.update({ where: { id: queue.id }, data: { lifecycleStatus: 'deleted', deletedAt: now, isArchived: true } });
    expect(await prisma.refundListMember.count()).toBe(1);
    expect(await prisma.queue.findUnique({ where: { id: queue.id } })).toMatchObject({ refundGroupOwnList: true, lifecycleStatus: 'deleted' });
    await repository.clearRefundList({ actorId: 'test' });
  });

  it('U74-01 / U74-04 / AC 9, 30: a new queue is fulfill_on_start with no group; groups are stored in the fixed order; refund_on_end is refused with a stable code and writes nothing', async () => {
    const created = await repository.createQueue({ slug: `p5-new-${randomUUID().slice(0, 8)}`, title: 'New', cost: 5 });
    expect(created).toMatchObject({ settlement: 'fulfill_on_start', refundGroupSubscriber: false, refundGroupModerator: false, refundGroupVip: false, refundGroupOwnList: false });
    const queue = await newQueue();
    const queueId = queue.id;

    const grouped = await repository.updateLocalQueueSettings({ queueId, expectedVersion: queue.version, settings: { refundGroups: ['subscriber', 'own_list'] }, actorId: 'actor' });
    expect(grouped).toMatchObject({ settlement: 'fulfill_on_start', refundGroupOwnList: true, refundGroupSubscriber: true, refundGroupModerator: false, refundGroupVip: false, version: queue.version + 1 });
    const listed = (await repository.listQueueProjection()).find((item) => item.id === queueId);
    expect(listed).toMatchObject({ settlement: 'fulfill_on_start', refundGroups: ['own_list', 'subscriber'] });
    const emptied = await repository.updateLocalQueueSettings({ queueId, expectedVersion: grouped.version, settings: { refundGroups: [] }, actorId: 'actor' });
    expect(emptied).toMatchObject({ refundGroupOwnList: false, refundGroupSubscriber: false });

    const stable = await prisma.queue.findUnique({ where: { id: queueId } });
    const auditBefore = await prisma.auditLog.count({ where: { queueId } });
    for (const settings of [{ settlement: 'refund_on_end' }, { settlement: 'refund_on_end', refundGroups: ['vip'], noticeJoined: false }]) {
      await expect(repository.updateLocalQueueSettings({ queueId, expectedVersion: stable.version, settings, actorId: 'actor' }))
        .rejects.toMatchObject({ code: 'SETTLEMENT_MODE_UNAVAILABLE', reason: 'not_delivered' });
    }
    expect(await prisma.queue.findUnique({ where: { id: queueId } })).toEqual(stable); // not even the version or the other fields moved
    expect(await prisma.auditLog.count({ where: { queueId } })).toBe(auditBefore);
    for (const settings of [{ settlement: 'sometimes' }, { refundGroups: ['everyone'] }, { refundGroups: ['vip', 'vip'] }, { refundGroups: 'vip' }]) {
      await expect(repository.updateLocalQueueSettings({ queueId, expectedVersion: stable.version, settings, actorId: 'actor' })).rejects.toMatchObject({ code: 'INVALID_LOCAL_QUEUE_SETTING' });
    }
    const same = await repository.updateLocalQueueSettings({ queueId, expectedVersion: stable.version, settings: { settlement: 'fulfill_on_start' }, actorId: 'actor' });
    expect(same.settlement).toBe('fulfill_on_start');

    const changes = await prisma.auditLog.findMany({ where: { queueId, event: 'queue.settlement_changed' } });
    expect(changes).toHaveLength(2); // groups on, groups off; the repeat of fulfill_on_start changed nothing
    expect(changes[0]).toMatchObject({ previousState: 'fulfill_on_start', nextState: 'fulfill_on_start', safeDetail: { previousGroups: [], nextGroups: ['own_list', 'subscriber'] } });
  });

  it('the gate writes `intent_recorded` in the same statement as the expectation; a closed-queue refusal is one cancel intent in state intent_recorded', async () => {
    const queue = await newQueue({ isOpen: false });
    const event = eventFor(queue);
    expect(await repository.importRedemption(event)).toMatchObject({ reason: 'queue_closed' });
    expect(await prisma.redemption.findUnique({ where: { redemptionId: event.id } })).toMatchObject({ expectedStatus: 'CANCELED', settlementState: 'intent_recorded', settlementCause: null, remoteStatus: 'UNFULFILLED' });
    expect(await prisma.outbox.count({ where: { redemptionId: event.id, operationType: 'redemption.cancel' } })).toBe(1);

    // a request that arrives later for the same redemption does not move the state (absorbing) and creates no second task
    const open = await newQueue();
    const served = eventFor(open);
    await repository.importRedemption(served);
    const entry = await prisma.entry.findUnique({ where: { redemptionId: served.id } });
    const service = createQueueDomainService({ repository, getTwitch: () => null });
    await service.transitionEntry({ entryId: entry.id, to: 'called', origin: 'panel', reason: 'operator_call' });
    await service.transitionEntry({ entryId: entry.id, to: 'in_progress', origin: 'panel', reason: 'service_started' });
    expect(await prisma.redemption.findUnique({ where: { redemptionId: served.id } })).toMatchObject({ expectedStatus: 'FULFILLED', settlementState: 'intent_recorded' });
    await service.transitionEntry({ entryId: entry.id, to: 'completed', origin: 'panel', reason: 'service_completed' });
    expect(await prisma.outbox.count({ where: { redemptionId: served.id } })).toBe(1);
    expect(await prisma.redemption.findUnique({ where: { redemptionId: served.id } })).toMatchObject({ settlementState: 'intent_recorded' });
  });

  it('an external transition of a redemption that already has a recorded intent keeps the expectation (the CHECK would refuse a NULL one) and still records the remote status', async () => {
    const queue = await newQueue();
    const event = eventFor(queue);
    await repository.importRedemption(event);
    const entry = await prisma.entry.findUnique({ where: { redemptionId: event.id } });
    await prisma.$executeRawUnsafe(`UPDATE redemptions SET expected_status = 'CANCELED', settlement_state = 'intent_recorded' WHERE redemption_id = '${event.id}'`);
    const service = createQueueDomainService({ repository, getTwitch: () => null });
    await service.transitionEntry({ entryId: entry.id, to: 'removed', origin: 'external', reason: 'twitch_cancellation', remoteStatus: 'CANCELED' });
    expect(await prisma.redemption.findUnique({ where: { redemptionId: event.id } })).toMatchObject({ remoteStatus: 'CANCELED', expectedStatus: 'CANCELED', settlementState: 'intent_recorded', syncStatus: 'confirmed' });
  });

  it('MG-08 / MG-11 the M2a-down guard refuses after use (refund_on_end queue, a decision state, a stored decision, a non-empty list) and passes before; up-down-up through the Prisma runbook restores the same schema', async () => {
    psql("DELETE FROM redemptions WHERE settlement_state NOT IN ('none', 'intent_recorded') OR group_decision IS NOT NULL"); // artifacts of the shape tests above
    const schemaAtStart = schemaText();
    const guardCases = [
      ['a queue in refund_on_end', () => psql("UPDATE queues SET settlement = 'refund_on_end' WHERE slug = 'old-q-1'"), () => psql("UPDATE queues SET settlement = 'fulfill_on_start' WHERE slug = 'old-q-1'"), /queue is in refund_on_end/],
      ['a redemption awaiting a choice', () => psql(redemptionSql({ redemption_id: 'guard-awaiting', settlement_state: 'awaiting_choice', settlement_cause: 'policy_wait' })), () => psql("DELETE FROM redemptions WHERE redemption_id = 'guard-awaiting'"), /holds a settlement decision/],
      ['a stored decision', () => psql(redemptionSql({ redemption_id: 'guard-decision', ...notEligible })), () => psql("DELETE FROM redemptions WHERE redemption_id = 'guard-decision'"), /holds a settlement decision/],
      ['a settled_external redemption', () => psql(redemptionSql({ redemption_id: 'guard-external', settlement_state: 'settled_external', ...settledAt, remote_status: 'CANCELED' })), () => psql("DELETE FROM redemptions WHERE redemption_id = 'guard-external'"), /holds a settlement decision/],
      ['a non-empty own list', () => psql("INSERT INTO refund_list_members (twitch_user_id) VALUES ('424242')"), () => psql("DELETE FROM refund_list_members"), /own refund list is not empty/],
    ];
    for (const [label, use, clean, message] of guardCases) {
      use();
      expect(() => psql(file(M2A, 'rollback.sql')), label).toThrow(message);
      expect(schemaText(), `${label}: the refused rollback changed nothing`).toBe(schemaAtStart);
      clean();
    }
    // `intent_recorded` alone does not block the down: the gate writes it for every ordinary intent and it repeats `expected_status`
    psql(redemptionSql({ redemption_id: 'guard-intent', settlement_state: 'intent_recorded', expected_status: 'FULFILLED' }));

    const before = { queues: checksum('queues', 't.id', NEW_QUEUE_COLUMNS), redemptions: checksum('redemptions', 't.redemption_id', NEW_REDEMPTION_COLUMNS), outbox: checksum('outbox', 't.id') };
    // the real runbook: db execute the rollback, delete the history rows (migrate resolve --rolled-back is refused), deploy again
    const down = prismaCli(['db', 'execute', '--schema', 'apps/api/prisma/schema.prisma', '--file', `apps/api/prisma/migrations/${M2A}/rollback.sql`]);
    expect(down.status, down.stderr || down.stdout).toBe(0);
    expect(functionExists()).toBe(false);
    expect(columnsOf('queues')).not.toContain('settlement');
    expect(columnsOf('redemptions')).not.toContain('settlement_state');
    expect(columnsOf('refund_list_members')).toEqual(['']); // the table is gone
    expect(psql("SELECT count(*) FROM pg_indexes WHERE indexname IN ('outbox_financial_redemption_uidx', 'redemptions_pending_settlement_idx', 'redemptions_settled_external_idx')").trim()).toBe('0');
    expect(psql("SELECT count(*) FROM pg_constraint WHERE conname LIKE 'redemptions_settle%' OR conname LIKE 'redemptions_decision%' OR conname = 'queues_settlement_check'").trim()).toBe('0');
    expect(checksum('queues', 't.id')).toBe(before.queues);
    expect(checksum('redemptions', 't.redemption_id')).toBe(before.redemptions);
    expect(checksum('outbox', 't.id')).toBe(before.outbox);

    const refusedResolve = prismaCli(['migrate', 'resolve', '--rolled-back', M2A]);
    expect(refusedResolve.status).not.toBe(0); // documented: refused for a migration that was applied successfully
    const cleanHistory = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'execute', '--schema', 'apps/api/prisma/schema.prisma', '--stdin'], {
      cwd: root, encoding: 'utf8', timeout: 60_000, env: { ...process.env, DATABASE_URL: connectionString },
      input: `DELETE FROM _prisma_migrations WHERE migration_name IN ('${M2B}', '${M2A}');`,
    });
    expect(cleanHistory.status, cleanHistory.stderr || cleanHistory.stdout).toBe(0);
    const up = prismaCli(['migrate', 'deploy']);
    expect(up.status, up.stderr || up.stdout).toBe(0);
    expect(schemaText()).toBe(schemaAtStart); // up-down-up: schema equal to the first up
    expect(Object.values(constraintState()).filter((valid) => valid === 'f')).toHaveLength(0);
    expect(psql("SELECT count(*) FROM _prisma_migrations WHERE migration_name IN ('20261118090000_settlement_model', '20261118090100_settlement_validate') AND finished_at IS NOT NULL").trim()).toBe('2');
    expect(psql("SELECT settlement FROM queues WHERE slug = 'old-q-1'").trim()).toBe('fulfill_on_start');
  }, 180_000);

  it('MG-04 M2a-down works when M2b was never applied (the unvalidated constraints and the missing indexes are tolerated)', () => {
    psql(file(M2A, 'rollback.sql'));
    psql(file(M2A, 'migration.sql')); // M2a alone
    expect(Object.values(constraintState()).filter((valid) => valid === 'f')).toHaveLength(5);
    psql(file(M2A, 'rollback.sql'));
    expect(columnsOf('redemptions')).not.toContain('settlement_cause');
    psql(file(M2A, 'migration.sql'));
    psql(file(M2B, 'migration.sql'));
    psql(file(M2B, 'rollback.sql')); // the no-op leaves everything in place
    expect(columnsOf('queues')).toContain('settlement');
    expect(Object.values(constraintState()).filter((valid) => valid === 'f')).toHaveLength(0);
  });
});
