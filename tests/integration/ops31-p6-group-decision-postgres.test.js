// OPS-31 P6 (Gate C, FT-75): the group decision writer on an ISOLATED PostgreSQL with the real migrations (never SQLite, never Prisma
// mocks). P6 adds no migration; this proves the writer against the M2a columns, shape CHECKs and guard trigger that P5 shipped:
// a conclusive decision is immutable, `unknown` is replaced only by "retry now" and only while the row is still in state `none`,
// a redemption with an intent never gets a decision, the writer moves no state and creates no outbox row, and two racing writers
// leave exactly one decision.
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

const root = fileURLToPath(new URL('../../', import.meta.url));
const containerName = `queuebot-ops31-p6-${process.pid}-${randomUUID().slice(0, 8)}`;
let connectionString;
let prisma;
let repository;
let tick = 0;
const clock = () => new Date(Date.UTC(2030, 0, 1, 12, 0, tick++));

function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `docker ${args[0]} failed`);
  return result.stdout.trim();
}
const prismaCli = (args) => spawnSync(process.execPath, ['node_modules/prisma/build/index.js', ...args], { cwd: root, encoding: 'utf8', timeout: 90_000, env: { ...process.env, DATABASE_URL: connectionString } });

async function newRedemption(extra = {}) {
  return prisma.redemption.create({ data: { redemptionId: `p6-${randomUUID()}`, broadcasterId: 'broadcaster', rewardId: 'reward-p6', userId: '12345', redeemedAt: new Date('2030-01-01T11:00:00Z'), ...extra } });
}
const row = (id) => prisma.redemption.findUnique({ where: { redemptionId: id } });
const eligible = { decision: 'eligible', matchedGroup: 'vip' };
const unknown = (unknownReason = 'timeout') => ({ decision: 'unknown', unknownReason });

describe('OPS-31 P6 group decision writer on isolated PostgreSQL', () => {
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

  it('writes the first decision with its snapshot and touches nothing else (no state, no intent, no outbox row)', async () => {
    const { redemptionId } = await newRedemption();
    const outboxBefore = await prisma.outbox.count();
    const result = await repository.recordGroupDecision({ redemptionId, decision: eligible, settlementMode: 'refund_on_end' });
    expect(result).toMatchObject({ written: true, reason: 'written', stored: { decision: 'eligible', matchedGroup: 'vip', unknownReason: null, settlementMode: 'refund_on_end' } });
    const after = await row(redemptionId);
    expect(after).toMatchObject({ groupDecision: 'eligible', matchedGroup: 'vip', groupUnknownReason: null, settlementMode: 'refund_on_end', settlementState: 'none', expectedStatus: null, remoteStatus: 'UNFULFILLED' });
    expect(after.groupCheckedAt).toBeInstanceOf(Date);
    expect(await prisma.outbox.count()).toBe(outboxBefore);
  });

  it('PG75-01: a conclusive decision is immutable, through the writer and through raw SQL (guard trigger)', async () => {
    for (const first of [eligible, { decision: 'not_eligible' }]) {
      const { redemptionId } = await newRedemption();
      await repository.recordGroupDecision({ redemptionId, decision: first, settlementMode: 'refund_on_end' });
      const snapshot = await row(redemptionId);
      for (const second of [{ decision: 'eligible', matchedGroup: 'moderator' }, { decision: 'not_eligible' }, unknown()]) {
        const result = await repository.recordGroupDecision({ redemptionId, decision: second, settlementMode: 'fulfill_on_start', retryUnknown: true });
        expect(result).toMatchObject({ written: false, reason: 'already_decided' });
      }
      expect(await row(redemptionId)).toEqual(snapshot);
      await expect(prisma.$executeRaw`UPDATE redemptions SET group_decision = 'unknown', matched_group = NULL, group_unknown_reason = 'timeout' WHERE redemption_id = ${redemptionId}`)
        .rejects.toThrow(/immutable/);
    }
  });

  it('PG75-02: unknown is replaced only by "retry now" and only while the row is in state none', async () => {
    const plain = await newRedemption();
    await repository.recordGroupDecision({ redemptionId: plain.redemptionId, decision: unknown('forbidden'), settlementMode: 'refund_on_end' });
    // An automatic second lookup (no retry flag) never replaces it.
    expect(await repository.recordGroupDecision({ redemptionId: plain.redemptionId, decision: eligible, settlementMode: 'refund_on_end' })).toMatchObject({ written: false, reason: 'unknown_kept', stored: { decision: 'unknown', unknownReason: 'forbidden' } });
    expect((await row(plain.redemptionId)).groupDecision).toBe('unknown');
    // "Retry now" replaces it, even by another unknown (a new reason and time).
    expect(await repository.recordGroupDecision({ redemptionId: plain.redemptionId, decision: unknown('timeout'), settlementMode: 'refund_on_end', retryUnknown: true })).toMatchObject({ written: true, reason: 'replaced_unknown', stored: { unknownReason: 'timeout' } });
    expect(await repository.recordGroupDecision({ redemptionId: plain.redemptionId, decision: eligible, settlementMode: 'refund_on_end', retryUnknown: true })).toMatchObject({ written: true, reason: 'replaced_unknown', stored: { decision: 'eligible', matchedGroup: 'vip', unknownReason: null } });
    // A row already moved to check_group (P7's state) keeps its unknown: the state CHECK ties them together.
    const held = await newRedemption({ groupDecision: 'unknown', groupUnknownReason: 'timeout', groupCheckedAt: new Date(), settlementMode: 'refund_on_end', settlementState: 'check_group' });
    expect(await repository.recordGroupDecision({ redemptionId: held.redemptionId, decision: eligible, settlementMode: 'refund_on_end', retryUnknown: true })).toMatchObject({ written: false, reason: 'unknown_kept' });
    expect(await row(held.redemptionId)).toMatchObject({ groupDecision: 'unknown', settlementState: 'check_group' });
  });

  it('a redemption with an intent never gets a decision', async () => {
    const withIntent = await newRedemption({ expectedStatus: 'FULFILLED', settlementState: 'intent_recorded' });
    expect(await repository.recordGroupDecision({ redemptionId: withIntent.redemptionId, decision: eligible, settlementMode: 'refund_on_end' })).toMatchObject({ written: false, reason: 'intent_exists', stored: null });
    expect((await row(withIntent.redemptionId)).groupDecision).toBeNull();
    expect(await repository.recordGroupDecision({ redemptionId: 'does-not-exist', decision: eligible, settlementMode: 'refund_on_end' })).toMatchObject({ written: false, reason: 'not_found' });
  });

  it('X1/A3: a settled_external row (money already decided outside) never receives a decision and is not written', async () => {
    const external = await newRedemption({ settlementState: 'settled_external', remoteStatus: 'FULFILLED', settledExternalAt: new Date('2030-01-01T11:30:00Z') });
    const before = await row(external.redemptionId);
    expect(await repository.recordGroupDecision({ redemptionId: external.redemptionId, decision: eligible, settlementMode: 'refund_on_end', retryUnknown: true }))
      .toMatchObject({ written: false, reason: 'settled_external', stored: null });
    expect(await row(external.redemptionId)).toEqual(before);
  });

  it('X1: the lookup-only reason bad_request is stored as lookup_error (the CHECK has the nine older codes); an unknown reason is refused', async () => {
    const { redemptionId } = await newRedemption();
    expect(await repository.recordGroupDecision({ redemptionId, decision: unknown('bad_request'), settlementMode: 'refund_on_end' }))
      .toMatchObject({ written: true, stored: { decision: 'unknown', unknownReason: 'lookup_error' } });
    expect(await row(redemptionId)).toMatchObject({ groupDecision: 'unknown', groupUnknownReason: 'lookup_error' });
    const other = await newRedemption();
    await expect(repository.recordGroupDecision({ redemptionId: other.redemptionId, decision: unknown('made_up'), settlementMode: 'refund_on_end' })).rejects.toMatchObject({ code: 'GROUP_DECISION_INVALID' });
  });

  it('X1/A1: the writer takes FOR NO KEY UPDATE on the row (it changes no key column, so FK inserts from audit/outbox are not blocked)', () => {
    const source = readFileSync(new URL('../../apps/api/src/persistence/group-decision-store.mjs', import.meta.url), 'utf8');
    expect(source).toContain('FOR NO KEY UPDATE');
    expect(source).not.toMatch(/FOR UPDATE`/);
  });

  it('PG75-03: the stored snapshot does not follow later queue setting changes', async () => {
    const queue = await prisma.queue.create({ data: { slug: `p6-${randomUUID().slice(0, 8)}`, title: 'Abyss', cost: 5, isOpen: true, rewardId: `reward-${randomUUID()}`, remoteSyncStatus: 'synced', settlement: 'fulfill_on_start' } });
    const { redemptionId } = await newRedemption({ queueId: queue.id });
    await repository.recordGroupDecision({ redemptionId, decision: { decision: 'not_eligible' }, settlementMode: 'fulfill_on_start' });
    await prisma.queue.update({ where: { id: queue.id }, data: { settlement: 'refund_on_end', refundGroupVip: true } });
    expect(await row(redemptionId)).toMatchObject({ groupDecision: 'not_eligible', settlementMode: 'fulfill_on_start' });
  });

  it('two writers racing with different conclusive answers leave exactly one decision, the same one both report', async () => {
    for (let round = 0; round < 20; round += 1) {
      const { redemptionId } = await newRedemption();
      const results = await Promise.all([
        repository.recordGroupDecision({ redemptionId, decision: eligible, settlementMode: 'refund_on_end' }),
        repository.recordGroupDecision({ redemptionId, decision: { decision: 'not_eligible' }, settlementMode: 'refund_on_end' }),
      ]);
      expect(results.filter((result) => result.written)).toHaveLength(1);
      const final = await row(redemptionId);
      expect(results.every((result) => result.stored.decision === final.groupDecision)).toBe(true);
    }
  });

  it('refuses malformed input before touching the database', async () => {
    const { redemptionId } = await newRedemption();
    const bad = [
      { decision: { decision: 'eligible' } }, { decision: { decision: 'eligible', matchedGroup: 'admin' } }, { decision: { decision: 'not_eligible', matchedGroup: 'vip' } },
      { decision: { decision: 'unknown' } }, { decision: { decision: 'unknown', unknownReason: 'because' } }, { decision: { decision: 'maybe' } },
      { decision: eligible, settlementMode: 'refund_now' }, { decision: null },
    ];
    for (const input of bad) {
      await expect(repository.recordGroupDecision({ redemptionId, settlementMode: 'refund_on_end', ...input })).rejects.toMatchObject({ code: 'GROUP_DECISION_INVALID' });
    }
    await expect(repository.recordGroupDecision({ redemptionId: '', decision: eligible, settlementMode: 'refund_on_end' })).rejects.toMatchObject({ code: 'GROUP_DECISION_INVALID' });
    expect((await row(redemptionId)).groupDecision).toBeNull();
  });
});
