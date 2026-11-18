// OPS-31 P5b (FT-74b, AC 34, 35): the pure policy rules. Table-driven; every refusal is its own assertion.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  POLICY_FIELDS, SETTLEMENT_ENFORCEMENT_ACTIVE, changedFields, effectiveBudget, parsePolicyBody, policyDto, refusalFor,
} from '../../apps/api/src/domain/settlement-policy.mjs';
import { SETTLEMENT_VALUES } from '../../apps/api/src/persistence/financial-gate.mjs';

const stored = Object.freeze({
  rev: 3, onCloseSwitchOff: 'legacy', onDirectConclusion: 'wait', onModeratorConclude: 'wait', onChatClear: 'wait',
  reentryRefundCap: null, reentryWindowHours: 12, reentryCapHold: 'after_n', reentryCapCountsManual: true,
});

describe('parsePolicyBody', () => {
  it('requires a non-negative integer expectedPolicyRev and refuses unknown keys', () => {
    expect(parsePolicyBody({ expectedPolicyRev: 0 })).toEqual({ ok: true, expectedPolicyRev: 0, changes: {} });
    for (const bad of [null, [], 'x', {}, { expectedPolicyRev: 1.5 }, { expectedPolicyRev: '1' }, { expectedPolicyRev: -1 }]) {
      expect(parsePolicyBody(bad).ok, JSON.stringify(bad)).toBe(false);
    }
    expect(parsePolicyBody({ expectedPolicyRev: 0, settlementPolicyRev: 1 })).toEqual({ ok: false, field: 'settlementPolicyRev' });
  });

  it('accepts every closed value of every field and nothing coerced', () => {
    for (const field of ['onCloseSwitchOff', 'onDirectConclusion', 'onModeratorConclude', 'onChatClear', 'reentryCapHold']) {
      for (const value of SETTLEMENT_VALUES[field]) expect(parsePolicyBody({ expectedPolicyRev: 0, [field]: value }).changes).toEqual({ [field]: value });
      expect(parsePolicyBody({ expectedPolicyRev: 0, [field]: 'nope' })).toEqual({ ok: false, field });
      expect(parsePolicyBody({ expectedPolicyRev: 0, [field]: 1 })).toEqual({ ok: false, field });
    }
    expect(parsePolicyBody({ expectedPolicyRev: 0, onModeratorConclude: 'fulfill' }).ok).toBe(false); // S3 has no fulfill
  });

  it('checks the ranges at both edges: cap null or 1..20, window 1..72', () => {
    for (const ok of [null, 1, 20]) expect(parsePolicyBody({ expectedPolicyRev: 0, reentryRefundCap: ok }).ok).toBe(true);
    for (const bad of [0, 21, -1, 2.5, '3', undefined, NaN]) expect(parsePolicyBody({ expectedPolicyRev: 0, reentryRefundCap: bad })).toEqual({ ok: false, field: 'reentryRefundCap' });
    for (const ok of [1, 12, 72]) expect(parsePolicyBody({ expectedPolicyRev: 0, reentryWindowHours: ok }).ok).toBe(true);
    for (const bad of [0, 73, null, '12', 1.5]) expect(parsePolicyBody({ expectedPolicyRev: 0, reentryWindowHours: bad })).toEqual({ ok: false, field: 'reentryWindowHours' });
  });

  it('takes only a real boolean for reentryCapCountsManual (no string or number coercion)', () => {
    for (const ok of [true, false]) expect(parsePolicyBody({ expectedPolicyRev: 0, reentryCapCountsManual: ok }).changes).toEqual({ reentryCapCountsManual: ok });
    for (const bad of ['true', 'false', 1, 0, null]) expect(parsePolicyBody({ expectedPolicyRev: 0, reentryCapCountsManual: bad })).toEqual({ ok: false, field: 'reentryCapCountsManual' });
  });
});

describe('changedFields / refusalFor (design 3.14 D, 3.13 B.1)', () => {
  it('an equal body has no change and is never refused, whatever the flag', () => {
    const body = Object.fromEntries(POLICY_FIELDS.map((field) => [field, stored[field]]));
    expect(changedFields(stored, body)).toEqual({});
    expect(refusalFor(stored, {}, { enforcementActive: false })).toBeNull();
    expect(refusalFor(stored, {}, { enforcementActive: true })).toBeNull();
  });

  it('is off in the code until P7', () => {
    expect(SETTLEMENT_ENFORCEMENT_ACTIVE).toBe(false);
  });

  it('refuses every single field change with policy_not_active while enforcement is off (S1..S5, window, both cap fields)', () => {
    const edits = { onCloseSwitchOff: 'wait', onDirectConclusion: 'refund', onModeratorConclude: 'refund', onChatClear: 'fulfill', reentryRefundCap: 3, reentryWindowHours: 24, reentryCapHold: 'at_n', reentryCapCountsManual: false };
    for (const [field, value] of Object.entries(edits)) {
      const changed = changedFields(stored, { [field]: value });
      expect(changed, field).toEqual({ [field]: value });
      expect(refusalFor(stored, changed, { enforcementActive: false }), field).toEqual({ reason: 'policy_not_active' });
      expect(refusalFor(stored, changed, { enforcementActive: true }), field).toBeNull();
    }
  });

  it('a mixed body with one real change is refused as a whole; the equal fields do not hide it', () => {
    const changed = changedFields(stored, { onChatClear: 'wait', reentryCapCountsManual: false });
    expect(changed).toEqual({ reentryCapCountsManual: false });
    expect(refusalFor(stored, changed, { enforcementActive: false })).toEqual({ reason: 'policy_not_active' });
  });

  it('legacy is a one-way door: not selectable again once left, still accepted while it is the stored value', () => {
    const left = { ...stored, onCloseSwitchOff: 'wait' };
    expect(refusalFor(left, changedFields(left, { onCloseSwitchOff: 'legacy' }), { enforcementActive: true })).toEqual({ reason: 'legacy_not_selectable' });
    expect(refusalFor(stored, changedFields(stored, { onCloseSwitchOff: 'legacy' }), { enforcementActive: true })).toBeNull();
    expect(refusalFor(left, changedFields(left, { onCloseSwitchOff: 'refund' }), { enforcementActive: true })).toBeNull();
  });
});

describe('effectiveBudget / policyDto (design 3.15 B, E)', () => {
  it('N with after_n, N - 1 with at_n (N = 1 gives 0), null without a cap', () => {
    expect(effectiveBudget({ ...stored, reentryRefundCap: 3 })).toBe(3);
    expect(effectiveBudget({ ...stored, reentryRefundCap: 3, reentryCapHold: 'at_n' })).toBe(2);
    expect(effectiveBudget({ ...stored, reentryRefundCap: 1, reentryCapHold: 'at_n' })).toBe(0);
    expect(effectiveBudget({ ...stored, reentryRefundCap: 20 })).toBe(20);
    expect(effectiveBudget({ ...stored, reentryCapHold: 'at_n' })).toBeNull();
  });

  it('exposes exactly the contract keys, with legacySelectable only while S1 is legacy', () => {
    const dto = policyDto(stored);
    expect(Object.keys(dto).sort()).toEqual([
      'effectiveBudget', 'enforcementActive', 'legacySelectable', 'onChatClear', 'onCloseSwitchOff', 'onDirectConclusion', 'onModeratorConclude',
      'reentryCapCountsManual', 'reentryCapHold', 'reentryRefundCap', 'reentryWindowHours', 'settlementPolicyRev',
    ]);
    expect(dto).toMatchObject({ settlementPolicyRev: 3, legacySelectable: true, enforcementActive: false, effectiveBudget: null });
    expect(policyDto({ ...stored, onCloseSwitchOff: 'wait' }, { enforcementActive: true })).toMatchObject({ legacySelectable: false, enforcementActive: true });
  });
});

describe('the P7 flag is a code constant, never wired by a caller (AC 35, design 3.14 D)', () => {
  it('no production module passes `settlementEnforcementActive` to the repository factory', () => {
    const root = fileURLToPath(new URL('../../apps/api/src/', import.meta.url));
    const offenders = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.mjs') && readFileSync(path, 'utf8').includes('settlementEnforcementActive')) offenders.push(relative(root, path));
      }
    };
    walk(root);
    // Only the factory itself (declares the option) and the policy-DTO callers inside it may name it.
    expect(offenders).toEqual(['persistence/queue-repository.mjs']);
    for (const caller of ['server.mjs', 'runtime.mjs']) {
      expect(readFileSync(join(root, caller), 'utf8'), caller).not.toContain('settlementEnforcementActive');
    }
  });
});
