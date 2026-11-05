// OPS-22 FT-53 (D-A2): the internal error codes map to a CLOSED public `reason`; nothing outside the table is exposed.
import { describe, expect, it, vi } from 'vitest';
import { createQueueDomainService, QUEUE_DELETION_REMOTE_DELETE_REASONS } from '../../apps/api/src/domain/queue-service.mjs';

describe('queue deletion cancel: public reason mapping (FT-53)', () => {
  it('maps only the five internal codes to the closed public list', () => {
    expect({ ...QUEUE_DELETION_REMOTE_DELETE_REASONS }).toEqual({
      authorization_required: 'authorization_required',
      queue_deletion_cancel_verification_unavailable: 'verification_unavailable',
      queue_delete_reward_absent: 'reward_absent',
      queue_delete_reward_diverged: 'reward_diverged',
      queue_delete_cancel_reward_not_paused: 'reward_not_paused',
    });
  });

  function serviceFor({ reward, error }) {
    const repository = {
      beginQueueDeletionCancellation: vi.fn(async () => ({ status: 'verification_required', operationId: 'op-1', rewardId: 'reward-1', requestMayHaveReachedTwitch: true, queue: { title: 'Q', cost: 10 }, expectedVersion: 1 })),
      confirmQueueDeletionCancellation: vi.fn(),
      failQueueDeletionCancellation: vi.fn(async () => ({ status: 'not_cancelled' })),
    };
    const getReward = vi.fn(async () => { if (error) throw error; return reward; });
    return { service: createQueueDomainService({ repository, getTwitch: () => ({ getReward }) }), repository };
  }

  it('attaches the mapped reason to the thrown error for a 401, a 5xx, an absent reward and a missing adapter', async () => {
    for (const [error, reward, expected] of [
      [Object.assign(new Error('x'), { statusCode: 401 }), undefined, 'authorization_required'],
      [Object.assign(new Error('x'), { statusCode: 503 }), undefined, 'verification_unavailable'],
      [Object.assign(new Error('x'), { statusCode: 404 }), undefined, 'reward_absent'],
      [undefined, null, 'reward_absent'],
    ]) {
      const { service } = serviceFor({ reward, error });
      await expect(service.cancelQueueDeletion({ queueId: 'q', actorId: 'a' })).rejects.toMatchObject({ code: 'QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED', reason: expected });
    }
  });
});
