// OPS-22 FT-36 (#100), group G3 of the `@qa` plan: the begin refusal matrix (U36-01), the single predicate shared by the
// cancel begin and the server projection (U36-07, F17, F19) and the read alias of the legacy reason (U36-04).
import { describe, expect, it } from 'vitest';
import {
  QUEUE_DELETION_CANCEL_REFUSALS, decideQueueDeletionCancellation, getQueueDeletionProjection, normalizeDeletionCancelReason,
} from '../../apps/shared/panel/queue-action-state.mjs';

const deleting = { lifecycleStatus: 'deleting', queueMode: 'channel_points', rewardId: 'reward-1' };
const del = (status, extra = {}) => ({ id: `delete-${status}`, operationType: 'reward.delete', status, lastError: null, payload: {}, ...extra });
const pause = (status, extra = {}) => ({ id: `pause-${status}`, operationType: 'reward.set_open', status, lastError: null, payload: { isOpen: false, deleteAfterConfirm: true }, ...extra });

describe('FT-36 cancel-deletion decision (U36-01)', () => {
  it('exposes exactly the refusal codes of architect §1.2 (three of them new)', () => {
    expect(QUEUE_DELETION_CANCEL_REFUSALS).toEqual([
      'QUEUE_DELETION_ALREADY_COMPLETED', 'QUEUE_DELETION_NOT_PENDING', 'QUEUE_REWARD_OPERATION_PROCESSING', 'QUEUE_DELETION_PAUSE_IN_PROGRESS',
    ]);
  });

  // One row per line of architect-review-ft36 §1.2. `refused` rows never name a target, so nothing can be written.
  const matrix = [
    ['queue deleted', { ...deleting, lifecycleStatus: 'deleted' }, [del('confirmed')], { outcome: 'refused', code: 'QUEUE_DELETION_ALREADY_COMPLETED' }],
    ['reward.delete confirmed (dead branch of the old 200 already_deleted)', deleting, [del('confirmed')], { outcome: 'refused', code: 'QUEUE_DELETION_ALREADY_COMPLETED' }],
    ['queue active', { ...deleting, lifecycleStatus: 'active' }, [del('pending')], { outcome: 'refused', code: 'QUEUE_DELETION_NOT_PENDING' }],
    ['manual or converted queue (D-36-8)', { ...deleting, queueMode: 'manual_only' }, [del('pending')], { outcome: 'refused', code: 'QUEUE_DELETION_NOT_PENDING' }],
    ['no reward', { ...deleting, rewardId: null }, [del('pending')], { outcome: 'refused', code: 'QUEUE_DELETION_NOT_PENDING' }],
    ['no deletion task', deleting, [], { outcome: 'refused', code: 'QUEUE_DELETION_NOT_PENDING' }],
    ['only a cancelled reward.delete of an earlier cycle', deleting, [del('cancelled')], { outcome: 'refused', code: 'QUEUE_DELETION_NOT_PENDING' }],
    ['a set_open that is not a deletion pause', deleting, [{ ...pause('unknown'), payload: { isOpen: false } }], { outcome: 'refused', code: 'QUEUE_DELETION_NOT_PENDING' }],
    ['reward.delete processing with a live lease', deleting, [del('processing', { leaseUntil: new Date(Date.now() + 30_000) })], { outcome: 'refused', code: 'QUEUE_REWARD_OPERATION_PROCESSING' }],
    ['reward.delete processing with an expired lease', deleting, [del('processing', { leaseUntil: new Date(0) })], { outcome: 'refused', code: 'QUEUE_REWARD_OPERATION_PROCESSING' }],
    ['another reward task processing', deleting, [del('pending'), { id: 'update', operationType: 'reward.update', status: 'processing', payload: {} }], { outcome: 'refused', code: 'QUEUE_REWARD_OPERATION_PROCESSING' }],
    ['pause pending', deleting, [pause('pending')], { outcome: 'refused', code: 'QUEUE_DELETION_PAUSE_IN_PROGRESS' }],
    ['pause retry', deleting, [pause('retry', { lastError: 'reward_open_lookup_failed' })], { outcome: 'refused', code: 'QUEUE_DELETION_PAUSE_IN_PROGRESS' }],
    ['pause processing', deleting, [pause('processing')], { outcome: 'refused', code: 'QUEUE_REWARD_OPERATION_PROCESSING' }],
    ['reward.delete in cancel_verification resumes the read', deleting, [del('cancel_verification')], { outcome: 'resume', targetId: 'delete-cancel_verification' }],
    ['blocked pause in cancel_verification resumes the read', deleting, [del('cancelled'), pause('cancel_verification')], { outcome: 'resume', targetId: 'pause-cancel_verification' }],
  ];
  for (const [name, queue, tasks, expected] of matrix) {
    it(`${name}`, () => {
      const decision = decideQueueDeletionCancellation(queue, tasks);
      const shape = { ...expected };
      delete shape.targetId;
      expect(decision).toMatchObject(shape);
      if (expected.outcome === 'refused') expect(decision.target ?? null).toBeNull();
      if (expected.outcome === 'resume') expect(decision.target.id).toBe(expected.targetId);
    });
  }

  it('begins on a pending or blocked reward.delete and reports the deletion state of the target', () => {
    for (const status of ['pending', 'retry']) {
      expect(decideQueueDeletionCancellation(deleting, [pause('confirmed'), del(status, { lastError: 'queue_deletion_waiting_for_refunds' })]), status)
        .toMatchObject({ outcome: 'begin', target: { id: `delete-${status}` }, deletionState: 'pending', blockReason: null });
    }
    expect(decideQueueDeletionCancellation(deleting, [del('retry', { lastError: 'queue_deletion_blocked_by_review' })]))
      .toMatchObject({ outcome: 'begin', deletionState: 'blocked', blockReason: 'financial_review_required' });
    expect(decideQueueDeletionCancellation(deleting, [del('retry', { lastError: 'twitch_authorization_required' })]))
      .toMatchObject({ outcome: 'begin', deletionState: 'blocked', blockReason: 'authorization_required' });
    for (const status of ['unknown', 'failed', 'conflict']) {
      expect(decideQueueDeletionCancellation(deleting, [del(status)]), status)
        .toMatchObject({ outcome: 'begin', target: { id: `delete-${status}` }, deletionState: 'blocked', blockReason: 'reward_operation_unconfirmed' });
    }
  });

  it('F19: begins on a BLOCKED pause (unknown or failed) when no live reward.delete exists, also after an earlier cancelled cycle', () => {
    for (const status of ['unknown', 'failed']) {
      expect(decideQueueDeletionCancellation(deleting, [pause(status)]), status)
        .toMatchObject({ outcome: 'begin', target: { id: `pause-${status}`, operationType: 'reward.set_open' }, deletionState: 'blocked', blockReason: 'reward_operation_unconfirmed' });
      expect(decideQueueDeletionCancellation(deleting, [del('cancelled'), pause('confirmed', { id: 'old-pause' }), pause(status)]), `${status} after a cancelled cycle`)
        .toMatchObject({ outcome: 'begin', target: { id: `pause-${status}` } });
    }
  });
});

describe('FT-36 single predicate for the cancel button (U36-07, U26-06 update)', () => {
  const projectionFacts = (tasks) => ({
    rewardDelete: tasks.find(({ operationType }) => operationType === 'reward.delete') ?? null,
    rewardPause: tasks.find(({ operationType, status, payload }) => operationType === 'reward.set_open' && payload?.deleteAfterConfirm === true && !['confirmed', 'cancelled'].includes(status)) ?? null,
    rewardTaskProcessing: tasks.some(({ status }) => status === 'processing'),
    blockingOperations: 0,
    authorizationBlocked: false,
  });
  const sweep = [
    [], [del('pending')], [del('retry')], [del('unknown')], [del('failed')], [del('conflict')], [del('cancel_verification')],
    [del('processing')], [del('confirmed')], [del('cancelled')], [pause('pending')], [pause('retry')], [pause('unknown')],
    [pause('failed')], [pause('cancel_verification')], [pause('processing')], [del('cancelled'), pause('unknown')],
  ];

  it('canCancelDeletion and cancellationInProgress follow the begin decision for every task state (no remote read)', () => {
    for (const tasks of sweep) {
      const decision = decideQueueDeletionCancellation(deleting, tasks);
      const projection = getQueueDeletionProjection({ ...deleting, remoteSyncStatus: 'delete_pending' }, projectionFacts(tasks));
      const label = tasks.map(({ operationType, status }) => `${operationType}:${status}`).join(',') || 'none';
      expect(projection.canCancelDeletion, label).toBe(decision.outcome !== 'refused');
      expect(projection.cancellationInProgress, label).toBe(decision.outcome === 'resume');
    }
  });

  it('a blocked pause (close_unknown) is cancellable; a pause still in progress is not', () => {
    const closeUnknown = { ...deleting, remoteSyncStatus: 'close_unknown' };
    expect(getQueueDeletionProjection(closeUnknown, projectionFacts([pause('unknown', { lastError: 'reward_open_result_unknown' })])))
      .toMatchObject({ deletionState: 'blocked', blockReason: 'reward_operation_unconfirmed', canCancelDeletion: true, cancellationInProgress: false });
    expect(getQueueDeletionProjection({ ...deleting, remoteSyncStatus: 'pending_close' }, projectionFacts([pause('pending')])))
      .toMatchObject({ canCancelDeletion: false, cancellationInProgress: false });
    expect(getQueueDeletionProjection(closeUnknown, projectionFacts([pause('cancel_verification')])))
      .toMatchObject({ canCancelDeletion: true, cancellationInProgress: true });
  });
});

describe('FT-36 reason alias (U36-04)', () => {
  it('reads the legacy queue_deletion_cancel_verification_failed as ..._unavailable and keeps every other reason', () => {
    expect(normalizeDeletionCancelReason('queue_deletion_cancel_verification_failed')).toBe('queue_deletion_cancel_verification_unavailable');
    for (const reason of ['queue_deletion_cancel_verification_unavailable', 'queue_delete_reward_absent', 'queue_delete_reward_diverged',
      'queue_delete_cancel_reward_not_paused', 'authorization_required', 'queue_deletion_cancel_verification_stale']) {
      expect(normalizeDeletionCancelReason(reason)).toBe(reason);
    }
    expect(normalizeDeletionCancelReason(undefined)).toBeUndefined();
  });
});
