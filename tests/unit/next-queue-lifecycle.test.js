import { describe, expect, it, vi } from 'vitest';
import { isQueueLifecycleActionAvailable, performQueueLifecycleAction } from '../../apps/frontend/features/queues/queue-lifecycle.mjs';

describe('Next queue lifecycle actions', () => {
  it.each([
    ['delete', { status: 'pending' }, '/api/queues/queue%201/delete', { confirm: true }],
    ['cancel-delete', { status: 'cancelled' }, '/api/queues/queue%201/delete/cancel', { confirm: true }],
    ['manual-mode', { status: 'confirmed' }, '/api/queues/queue%201/manual-mode', {}],
    ['unarchive', { status: 'unarchived' }, '/api/queues/queue%201/unarchive', {}],
  ])('uses the existing %s endpoint and confirmation payload', async (action, response, path, body) => {
    const request = vi.fn().mockResolvedValue(response);
    await expect(performQueueLifecycleAction({ request, queueId: 'queue 1', action })).resolves.toEqual(response);
    expect(request).toHaveBeenCalledWith(path, { method: 'POST', body: JSON.stringify(body) });
  });

  it('rejects unknown actions and malformed successful responses', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'unknown' });
    await expect(performQueueLifecycleAction({ request, queueId: 'queue-1', action: 'archive' }))
      .rejects.toMatchObject({ code: 'INVALID_QUEUE_LIFECYCLE_REQUEST' });
    await expect(performQueueLifecycleAction({ request, queueId: 'queue-1', action: 'delete' }))
      .rejects.toMatchObject({ code: 'INVALID_QUEUE_LIFECYCLE_RESPONSE' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('issues a version-bound local archive challenge, then confirms that exact snapshot', async () => {
    const queue = { version: 7 };
    const challenge = {
      status: 'challenge_issued', challengeId: '0b1f1ef0-0ac0-4e63-b71c-e608f5aa1b20',
      expectedVersion: 7, remoteSyncStatus: 'diverged', expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const request = vi.fn().mockResolvedValueOnce(challenge).mockResolvedValueOnce({ status: 'archived' });
    await expect(performQueueLifecycleAction({ request, queueId: 'queue-1', action: 'archive-local-challenge', queue })).resolves.toMatchObject(challenge);
    await expect(performQueueLifecycleAction({ request, queueId: 'queue-1', action: 'archive-local-confirm', challenge })).resolves.toEqual({ status: 'archived' });
    expect(request).toHaveBeenNthCalledWith(1, '/api/queues/queue-1/archive-local/challenge', { method: 'POST', body: JSON.stringify({ expectedVersion: 7 }) });
    expect(request).toHaveBeenNthCalledWith(2, '/api/queues/queue-1/archive-local/confirm', {
      method: 'POST', body: JSON.stringify({ challengeId: challenge.challengeId, expectedVersion: 7, remoteSyncStatus: 'diverged' }),
    });
  });

  it('does not confirm an expired or altered local archive challenge', async () => {
    const request = vi.fn();
    await expect(performQueueLifecycleAction({ request, queueId: 'queue-1', action: 'archive-local-confirm', challenge: {
      challengeId: 'challenge', expectedVersion: 3, remoteSyncStatus: 'unknown', expiresAt: new Date(Date.now() - 1).toISOString(),
    } })).rejects.toMatchObject({ code: 'INVALID_QUEUE_LIFECYCLE_REQUEST' });
    expect(request).not.toHaveBeenCalled();
  });

  it('offers only state-authorized lifecycle controls', () => {
    const local = { lifecycleStatus: 'active', queueMode: 'manual_only', rewardOrigin: 'none', isOpen: false, isArchived: false };
    expect(isQueueLifecycleActionAvailable(local, 'delete')).toBe(true);
    expect(isQueueLifecycleActionAvailable({ ...local, lifecycleStatus: 'deleting' }, 'delete')).toBe(false);
    expect(isQueueLifecycleActionAvailable({ ...local, isArchived: true }, 'unarchive')).toBe(true);
    expect(isQueueLifecycleActionAvailable({ ...local, isOpen: true, isArchived: true }, 'unarchive')).toBe(false);
    expect(isQueueLifecycleActionAvailable({ ...local, queueMode: 'channel_points', rewardId: 'r', remoteSyncStatus: 'synced', modeTransitionStatus: 'none' }, 'manual-mode')).toBe(true);
  });
});
