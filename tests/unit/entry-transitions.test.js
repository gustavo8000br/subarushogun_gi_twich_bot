import { describe, expect, it } from 'vitest';
import { decideEntryTransition } from '../../apps/api/src/domain/entry-transitions.mjs';

describe('entry transition decisions', () => {
  it.each([
    ['waiting', 'called'],
    ['called', 'in_progress'],
    ['called', 'completed'],
    ['in_progress', 'completed'],
    ['waiting', 'removed'],
    ['called', 'removed'],
    ['in_progress', 'removed'],
    ['called', 'no_show'],
  ])('decides %s -> %s', (from, to) => {
    expect(() => decideEntryTransition({
      from,
      to,
      source: 'redemption',
      origin: 'moderator',
      reason: 'operator action',
      policy: {
        refundIfRemovedWhileCalled: true,
        refundOnNoShow: true,
        refundIfViewerLeavesWhileCalled: true,
      },
    })).not.toThrow();
  });

  it('rejects transitions that are not part of the product lifecycle', () => {
    expect(() => decideEntryTransition({ from: 'waiting', to: 'completed' }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_ENTRY_TRANSITION' }));
    expect(() => decideEntryTransition({ from: 'in_progress', to: 'no_show' }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_ENTRY_TRANSITION' }));
    expect(() => decideEntryTransition({ from: 'removed', to: 'waiting' }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_ENTRY_TRANSITION' }));
    expect(() => decideEntryTransition({ from: 'waiting', to: 'completed', origin: 'moderator' }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_ENTRY_TRANSITION' }));
  });

  it('snapshots cancellation policy for redemption terminal transitions only', () => {
    const decision = decideEntryTransition({
      from: 'called',
      to: 'removed',
      source: 'redemption',
      origin: 'moderator',
      reason: 'moderator_removed',
      policy: { refundIfRemovedWhileCalled: false },
    });

    expect(decision).toMatchObject({
      accepted: true,
      previousStatus: 'called',
      nextStatus: 'removed',
      terminalReason: 'moderator_removed',
      financialDecision: 'no_operation',
      policySnapshot: { refundIfRemovedWhileCalled: false },
    });
  });

  it('uses the viewer-leave policy for self-leave while called', () => {
    expect(decideEntryTransition({
      from: 'called',
      to: 'removed',
      source: 'redemption',
      origin: 'viewer',
      reason: 'viewer_left',
      policy: { refundIfViewerLeavesWhileCalled: true, refundIfRemovedWhileCalled: false },
    }).financialDecision).toBe('request_cancel');
  });

  it.each([
    ['waiting', 'moderator', {}, 'request_cancel'],
    ['called', 'moderator', { refundIfRemovedWhileCalled: true }, 'request_cancel'],
    ['in_progress', 'moderator', { refundIfRemovedWhileCalled: false }, 'no_operation'],
    ['called', 'viewer', { refundIfViewerLeavesWhileCalled: false }, 'no_operation'],
    ['in_progress', 'viewer', { refundIfViewerLeavesWhileCalled: true }, 'request_cancel'],
  ])('applies removal policy for %s by %s', (from, origin, policy, expected) => {
    expect(decideEntryTransition({
      from, to: 'removed', source: 'redemption', origin, reason: 'entry_removed', policy,
    }).financialDecision).toBe(expected);
  });

  it.each([true, false])('applies the no-show policy when refund is %s', (refundOnNoShow) => {
    expect(decideEntryTransition({
      from: 'called', to: 'no_show', source: 'redemption', origin: 'timer', reason: 'no_show_timeout',
      policy: { refundOnNoShow },
    }).financialDecision).toBe(refundOnNoShow ? 'request_cancel' : 'no_operation');
  });

  it('always requests cancellation for clear, regardless of per-action policies', () => {
    expect(decideEntryTransition({
      from: 'in_progress', to: 'removed', source: 'redemption', origin: 'panel', reason: 'queue_cleared',
      policy: {
        refundIfRemovedWhileCalled: false,
        refundIfViewerLeavesWhileCalled: false,
        refundOnNoShow: false,
      },
    }).financialDecision).toBe('request_cancel');
  });

  it('always requests cancellation for queue deletion regardless of queue policy', () => {
    expect(decideEntryTransition({
      from: 'called', to: 'removed', source: 'redemption', origin: 'panel', reason: 'queue_deleted',
      policy: { refundIfRemovedWhileCalled: false, refundIfViewerLeavesWhileCalled: false },
    }).financialDecision).toBe('request_cancel');
  });

  it('requests point consumption only for a local redemption completion', () => {
    expect(decideEntryTransition({
      from: 'in_progress', to: 'completed', source: 'redemption', origin: 'panel', reason: 'service_completed',
    }).financialDecision).toBe('request_fulfill');
  });

  it('never creates a financial operation for manual entries or externally observed terminal states', () => {
    const manual = decideEntryTransition({
      from: 'waiting', to: 'removed', source: 'manual', origin: 'moderator', reason: 'removed',
    });
    const external = decideEntryTransition({
      from: 'called', to: 'completed', source: 'redemption', origin: 'external', reason: 'external_fulfilled',
    });

    expect(manual.financialDecision).toBe('no_operation');
    expect(external.financialDecision).toBe('no_operation');
  });
});
