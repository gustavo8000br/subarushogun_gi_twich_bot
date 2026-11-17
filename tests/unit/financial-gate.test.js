// OPS-31 P1 (Gate A): the single financial gate, the pure settlement resolver (QA plan section 12, U34-01..03),
// the cap window port (U39-01) and the OpenGrep single-writer rule on a fixture.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  capWindowStart, decideFinancialIntent, financialIdempotencyKey, loadSettlementPolicy, resolveSettlementAction, reentryBudget,
} from '../../apps/api/src/persistence/financial-gate.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const base = Object.freeze({
  rev: 4, onCloseSwitchOff: 'wait', onDirectConclusion: 'wait', onModeratorConclude: 'wait', onChatClear: 'wait',
  reentryRefundCap: null, reentryWindowHours: 12, reentryCapHold: 'after_n', reentryCapCountsManual: true,
});
const policy = (over = {}) => ({ ...base, ...over });
const member = { membership: 'member' };
const nonMember = (switchOn = false) => ({ membership: 'non_member', switchOn });
const pick = ({ action, source, cause }) => ({ action, source, cause });

describe('decideFinancialIntent (pure)', () => {
  const ok = { operation: 'cancel', cause: 'queue_cleared', remoteStatus: 'UNFULFILLED' };

  it('creates when nothing exists and the remote is UNFULFILLED', () => {
    expect(decideFinancialIntent(ok)).toEqual({ status: 'created', reason: null });
  });
  it('answers already_same / contradictory for an existing task', () => {
    expect(decideFinancialIntent({ ...ok, existingOperation: 'cancel' }).status).toBe('already_same');
    expect(decideFinancialIntent({ ...ok, existingOperation: 'fulfill' }).status).toBe('contradictory');
  });
  it('writes nothing when the remote is already terminal', () => {
    expect(decideFinancialIntent({ ...ok, remoteStatus: 'CANCELED' }).status).toBe('already_same');
    expect(decideFinancialIntent({ ...ok, remoteStatus: 'FULFILLED' }).status).toBe('contradictory');
    expect(decideFinancialIntent({ ...ok, operation: 'fulfill', remoteStatus: 'FULFILLED' }).status).toBe('already_same');
  });
  it.each(['held_for_service', 'awaiting_choice', 'check_group'])('blocks an ordinary cause in %s', (settlementState) => {
    expect(decideFinancialIntent({ ...ok, settlementState }).status).toBe('held_blocked');
    expect(decideFinancialIntent({ ...ok, settlementState, allowFrom: [settlementState] }).status).toBe('held_blocked');
    expect(decideFinancialIntent({ ...ok, cause: 'streamer_choice', settlementState }).status).toBe('held_blocked');
  });
  it('lets a settlement cause through only from an allowed held state', () => {
    expect(decideFinancialIntent({ ...ok, cause: 'streamer_choice', settlementState: 'awaiting_choice', allowFrom: ['awaiting_choice'] }).status).toBe('created');
    expect(decideFinancialIntent({ ...ok, cause: 'streamer_choice', settlementState: 'check_group', allowFrom: ['awaiting_choice'] }).status).toBe('held_blocked');
  });
  it.each(['intent_recorded', 'settled_external'])('treats %s as absorbing', (settlementState) => {
    expect(decideFinancialIntent({ ...ok, settlementState, existingOperation: 'cancel' }).status).toBe('already_same');
    expect(decideFinancialIntent({ ...ok, settlementState, existingOperation: 'fulfill' }).status).toBe('contradictory');
    expect(decideFinancialIntent({ ...ok, settlementState }).status).toBe('contradictory');
  });
  it('rejects an unknown operation', () => {
    expect(() => decideFinancialIntent({ ...ok, operation: 'refund' })).toThrow(expect.objectContaining({ code: 'FINANCIAL_OPERATION_INVALID' }));
  });
  it('builds the single idempotency key', () => {
    expect(financialIdempotencyKey('r-1')).toBe('financial:r-1');
  });
});

describe('constant providers (U34-03, U39-01)', () => {
  it('returns the legacy/wait constant policy, frozen, with rev 0', async () => {
    const loaded = await loadSettlementPolicy({}, 'queue-1');
    expect(loaded).toMatchObject({ rev: 0, onCloseSwitchOff: 'legacy', onDirectConclusion: 'wait', onModeratorConclude: 'wait', onChatClear: 'wait', reentryRefundCap: null });
    expect(Object.isFrozen(loaded)).toBe(true);
  });
  it('with the constant policy no event changes today: every row resolves to rule or wait without money', async () => {
    const constant = await loadSettlementPolicy({}, 'queue-1');
    expect(resolveSettlementAction({ kind: 'close_switch_off' }, nonMember(false), constant).action).toBe('rule');
    expect(resolveSettlementAction({ kind: 'chat_clear' }, nonMember(), constant).action).toBe('rule');
  });
  it('capWindowStart is a constant fallback with the hours window until P6b', async () => {
    const now = new Date('2030-01-01T12:00:00.000Z');
    expect(await capWindowStart({}, 'broadcaster', now)).toEqual({ kind: 'fallback', start: new Date('2030-01-01T00:00:00.000Z'), reason: 'no_session_provider' });
    expect((await capWindowStart({}, 'broadcaster', now, { reentryWindowHours: 2 })).start).toEqual(new Date('2030-01-01T10:00:00.000Z'));
  });
});

describe('resolveSettlementAction truth table (QA plan section 12)', () => {
  const close = { kind: 'close_switch_off' };
  it.each([
    ['1 non-member switch on', close, nonMember(true), policy({ onCloseSwitchOff: 'refund' }), null, { action: 'rule', source: 'rule', cause: null }],
    ['2 non-member off legacy', close, nonMember(), policy({ onCloseSwitchOff: 'legacy' }), null, { action: 'rule', source: 'rule', cause: null }],
    ['3 non-member off wait', close, nonMember(), policy({ onCloseSwitchOff: 'wait', reentryRefundCap: 1 }), null, { action: 'wait', source: 'policy', cause: 'policy_wait' }],
    ['4 non-member off fulfill (cap not read)', close, nonMember(), policy({ onCloseSwitchOff: 'fulfill', reentryRefundCap: 1 }), null, { action: 'fulfill', source: 'policy', cause: null }],
    ['5a refund no cap', close, nonMember(), policy({ onCloseSwitchOff: 'refund' }), null, { action: 'refund', source: 'policy', cause: null }],
    ['5b refund below cap', close, nonMember(), policy({ onCloseSwitchOff: 'refund', reentryRefundCap: 3 }), { count: 2 }, { action: 'refund', source: 'policy', cause: null }],
    ['6 refund at cap', close, nonMember(), policy({ onCloseSwitchOff: 'refund', reentryRefundCap: 3 }), { count: 3 }, { action: 'wait', source: 'policy', cause: 'reentry_cap' }],
    ['7/8/8b member close: not a policy', close, member, policy({ onCloseSwitchOff: 'refund' }), null, { action: 'rule', source: 'rule', cause: null }],
    ['8b unknown decision, any event', { kind: 'direct_conclusion' }, { membership: 'unknown' }, policy(), null, { action: 'rule', source: 'rule', cause: null }],
    ['9 non-member direct conclusion', { kind: 'direct_conclusion' }, nonMember(), policy({ onDirectConclusion: 'refund' }), null, { action: 'rule', source: 'rule', cause: null }],
    ['10 member S2 wait', { kind: 'direct_conclusion' }, member, policy(), null, { action: 'wait', source: 'policy', cause: 'policy_wait' }],
    ['11 member S2 refund below', { kind: 'direct_conclusion' }, member, policy({ onDirectConclusion: 'refund' }), null, { action: 'refund', source: 'policy', cause: null }],
    ['12 member S2 refund at cap', { kind: 'direct_conclusion' }, member, policy({ onDirectConclusion: 'refund', reentryRefundCap: 2 }), { count: 2 }, { action: 'wait', source: 'policy', cause: 'reentry_cap' }],
    ['13 member S2 fulfill', { kind: 'direct_conclusion' }, member, policy({ onDirectConclusion: 'fulfill', reentryRefundCap: 1 }), { count: 9 }, { action: 'fulfill', source: 'policy', cause: null }],
    ['15 moderator wait wait', { kind: 'direct_conclusion', byModerator: true }, member, policy(), null, { action: 'wait', source: 'policy', cause: 'policy_wait' }],
    ['16 moderator wait refund', { kind: 'direct_conclusion', byModerator: true }, member, policy({ onModeratorConclude: 'refund' }), null, { action: 'wait', source: 'policy', cause: 'policy_wait' }],
    ['17 moderator refund wait', { kind: 'direct_conclusion', byModerator: true }, member, policy({ onDirectConclusion: 'refund' }), null, { action: 'wait', source: 'policy', cause: 'policy_wait' }],
    ['18 moderator refund refund', { kind: 'direct_conclusion', byModerator: true }, member, policy({ onDirectConclusion: 'refund', onModeratorConclude: 'refund' }), null, { action: 'refund', source: 'policy', cause: null }],
    ['19 moderator fulfill wait', { kind: 'direct_conclusion', byModerator: true }, member, policy({ onDirectConclusion: 'fulfill' }), null, { action: 'wait', source: 'policy', cause: 'policy_wait' }],
    ['20 moderator fulfill refund', { kind: 'direct_conclusion', byModerator: true }, member, policy({ onDirectConclusion: 'fulfill', onModeratorConclude: 'refund' }), null, { action: 'wait', source: 'policy', cause: 'policy_wait' }],
    ['21 held member, moderator, S3 wait', { kind: 'held_conclusion', byModerator: true }, member, policy(), null, { action: 'wait', source: 'policy', cause: 'policy_wait' }],
    ['22 held member, moderator, S3 refund', { kind: 'held_conclusion', byModerator: true }, member, policy({ onModeratorConclude: 'refund' }), null, { action: 'refund', source: 'policy', cause: null }],
    ['23 held member, streamer: end-of-service refund', { kind: 'held_conclusion' }, member, policy(), null, { action: 'refund', source: 'rule', cause: null }],
    ['24 chat clear non-member', { kind: 'chat_clear' }, nonMember(), policy(), null, { action: 'rule', source: 'rule', cause: null }],
    ['25 chat clear member wait', { kind: 'chat_clear' }, member, policy(), null, { action: 'wait', source: 'policy', cause: 'policy_wait' }],
    ['26a chat clear member refund', { kind: 'chat_clear' }, member, policy({ onChatClear: 'refund' }), null, { action: 'refund', source: 'policy', cause: null }],
    ['26b chat clear member refund over cap', { kind: 'chat_clear' }, member, policy({ onChatClear: 'refund', reentryRefundCap: 1 }), { count: 1 }, { action: 'wait', source: 'policy', cause: 'reentry_cap' }],
    ['27 chat clear member fulfill', { kind: 'chat_clear' }, member, policy({ onChatClear: 'fulfill' }), null, { action: 'fulfill', source: 'policy', cause: null }],
    ['12.6 other events', { kind: 'other' }, member, policy(), null, { action: 'rule', source: 'rule', cause: null }],
  ])('%s', (_name, event, context, selected, cap, expected) => {
    const outcome = resolveSettlementAction(event, context, selected, cap);
    expect(pick(outcome)).toEqual(expected);
    expect(outcome.policyRev).toBe(selected.rev);
    expect(Object.isFrozen(outcome)).toBe(true);
    expect(Object.keys(outcome).sort()).toEqual(['action', 'cause', 'policyRev', 'settingId', 'source']);
  });

  it.each([
    ['C1 after_n 3 count 0', 'after_n', 3, 0, 'refund'], ['C2 after_n 3 count 2', 'after_n', 3, 2, 'refund'],
    ['C3 after_n 3 count 3', 'after_n', 3, 3, 'wait'], ['C4 after_n 3 count 4', 'after_n', 3, 4, 'wait'],
    ['C5 at_n 3 count 0', 'at_n', 3, 0, 'refund'], ['C6 at_n 3 count 1', 'at_n', 3, 1, 'refund'],
    ['C7 at_n 3 count 2', 'at_n', 3, 2, 'wait'], ['at_n 1 count 0 (budget 0)', 'at_n', 1, 0, 'wait'],
    ['at_n 20 count 18', 'at_n', 20, 18, 'refund'], ['at_n 20 count 19', 'at_n', 20, 19, 'wait'],
  ])('cap %s', (_name, hold, cap, count, expected) => {
    const outcome = resolveSettlementAction(close, nonMember(), policy({ onCloseSwitchOff: 'refund', reentryRefundCap: cap, reentryCapHold: hold }), { count });
    expect(outcome.action).toBe(expected);
    if (expected === 'wait') expect(outcome).toMatchObject({ cause: 'reentry_cap', settingId: 'S5' });
  });

  it('reentryBudget follows 3.15 B', () => {
    expect(reentryBudget(policy())).toBeNull();
    expect(reentryBudget(policy({ reentryRefundCap: 3 }))).toBe(3);
    expect(reentryBudget(policy({ reentryRefundCap: 3, reentryCapHold: 'at_n' }))).toBe(2);
  });

  it('fails closed on a missing cap count or an unknown value', () => {
    const capped = policy({ onCloseSwitchOff: 'refund', reentryRefundCap: 3 });
    expect(() => resolveSettlementAction(close, nonMember(), capped, null)).toThrow(expect.objectContaining({ code: 'SETTLEMENT_INPUT_INVALID' }));
    expect(() => resolveSettlementAction(close, nonMember(), policy({ onCloseSwitchOff: 'generous' }))).toThrow(expect.objectContaining({ code: 'SETTLEMENT_INPUT_INVALID' }));
    expect(() => resolveSettlementAction({ kind: 'nope' }, member, policy())).toThrow(expect.objectContaining({ code: 'SETTLEMENT_INPUT_INVALID' }));
  });

  it('property over the whole finite domain (U34-02)', () => {
    const kinds = ['close_switch_off', 'direct_conclusion', 'held_conclusion', 'chat_clear', 'other'];
    const memberships = ['member', 'non_member', 'unknown'];
    const s1 = ['legacy', 'wait', 'fulfill', 'refund'];
    const s2 = ['wait', 'refund', 'fulfill'];
    const s3 = ['wait', 'refund'];
    const s4 = ['wait', 'refund', 'fulfill'];
    const caps = [null, 1, 3];
    const holds = ['after_n', 'at_n'];
    let rows = 0;
    for (const kind of kinds) for (const membership of memberships) for (const byModerator of [false, true])
      for (const switchOn of [false, true]) for (const a of s1) for (const b of s2) for (const c of s3) for (const d of s4)
        for (const cap of caps) for (const hold of holds) for (const count of [0, 1, 2, 3]) {
          const selected = policy({ onCloseSwitchOff: a, onDirectConclusion: b, onModeratorConclude: c, onChatClear: d, reentryRefundCap: cap, reentryCapHold: hold });
          const outcome = resolveSettlementAction({ kind, byModerator }, { membership, switchOn }, selected, { count });
          rows += 1;
          expect(['refund', 'fulfill', 'wait', 'rule']).toContain(outcome.action);
          if (membership !== 'member' && kind !== 'close_switch_off') expect(outcome.action).toBe('rule');
          if (membership === 'unknown') expect(outcome.action).toBe('rule');
          if (outcome.cause === 'reentry_cap') expect(outcome.action).toBe('wait');
          if (outcome.action === 'fulfill') expect(outcome.source).toBe('policy');
          if (kind === 'direct_conclusion' && byModerator && membership === 'member' && b !== c) expect(outcome.action).toBe('wait');
          if (outcome.action === 'refund' && cap !== null) expect(count).toBeLessThan(reentryBudget(selected));
        }
    expect(rows).toBeGreaterThan(10_000);
  });
});

describe('OpenGrep single-writer rule (U-gate fixture)', () => {
  const opengrep = spawnSync('opengrep', ['--version'], { encoding: 'utf8' });
  const scan = (target) => spawnSync('opengrep', ['scan', '--config', '.opengrep/rules.yml', '--no-git-ignore', '--json', '--quiet', target], { cwd: root, encoding: 'utf8', timeout: 60_000 });

  const flagged = (target) => JSON.parse(scan(target).stdout).results.map((entry) => entry.check_id);
  it.skipIf(opengrep.status !== 0)('flags a hand-built financial key outside the gate (pattern 1)', () => {
    expect(flagged('tests/fixtures/opengrep/financial-key-violation.mjs').some((id) => id.endsWith('financial-intent-single-writer'))).toBe(true);
  });

  it.skipIf(opengrep.status !== 0)('flags a hand-built financial operation outside the gate (pattern 2)', () => {
    expect(flagged('tests/fixtures/opengrep/financial-operation-violation.mjs').some((id) => id.endsWith('financial-intent-single-writer'))).toBe(true);
  });

  it.skipIf(opengrep.status !== 0)('does not flag the clean fixture that uses the gate helpers', () => {
    expect(flagged('tests/fixtures/opengrep/financial-key-clean.mjs')).toEqual([]);
  });
});
