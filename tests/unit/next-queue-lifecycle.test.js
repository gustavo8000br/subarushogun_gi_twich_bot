import { describe, expect, it, vi } from 'vitest';
import { getQueueLifecycleFailureFeedback, getQueueLifecycleOutcome, isQueueLifecycleActionAvailable, performQueueLifecycleAction } from '../../apps/frontend/features/queues/queue-lifecycle.mjs';

describe('Next queue lifecycle actions', () => {
  it.each([
    ['QUEUE_DELETION_NOT_PENDING', 'panel.queue.delete.cancel.stale'],
    ['QUEUE_DELETION_CANCELLATION_STALE', 'panel.queue.delete.cancel.stale'],
    ['QUEUE_REWARD_OPERATION_PROCESSING', 'panel.queue.delete.cancel.processing'],
    ['QUEUE_DELETION_CANCELLATION_UNVERIFIED', 'panel.queue.delete.cancel.unverified'],
    ['QUEUE_NOT_FOUND', 'panel.error.queue_not_found'],
  ])('maps the %s deletion-cancel result to exact localized feedback', (code, key) => {
    expect(getQueueLifecycleFailureFeedback({ code, status: code === 'QUEUE_NOT_FOUND' ? 404 : 409 }, { action: 'cancel-delete' }))
      .toEqual({ status: 'error', key, uncertain: false });
  });

  it('keeps transport/server cancellation outcomes explicitly uncertain and exposes only a safe reference', () => {
    expect(getQueueLifecycleFailureFeedback({ code: 'REQUEST_FAILED', status: 0, referenceId: 'cancel-op_12' }, { action: 'cancel-delete' }))
      .toEqual({ status: 'error', key: 'panel.queue.delete.cancel.uncertain', uncertain: true, referenceId: 'cancel-op_12' });
    expect(getQueueLifecycleFailureFeedback({ code: 'INTERNAL_ERROR', status: 503, referenceId: 'private details' }, { action: 'cancel-delete' }))
      .toEqual({ status: 'error', key: 'panel.queue.delete.cancel.uncertain', uncertain: true });
    expect(getQueueLifecycleFailureFeedback({ code: 'SESSION_INITIALIZATION_FAILED', status: 0 }, { action: 'cancel-delete' }))
      .toEqual({ status: 'error', key: 'panel.error.generic', uncertain: false });
    expect(getQueueLifecycleFailureFeedback({ code: 'constructor', status: 409 }, { action: 'cancel-delete' }))
      .toEqual({ status: 'error', key: 'panel.error.generic', uncertain: false });
    expect(getQueueLifecycleFailureFeedback({ code: 'QUEUE_NOT_FOUND' }, { action: 'unarchive' }))
      .toEqual({ status: 'error', key: 'panel.error.generic', uncertain: false });
  });

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

// OPS-22 / FT-23 (#103, UX-3, UX-4, R6): the cancel mapper table of the UX plan, section 3.4.
describe('FT-23 cancel-deletion outcome mapper (ux-plan 3.4)', () => {
  const rewardQueue = { id: 'q', queueMode: 'channel_points', rewardId: 'reward-1' };
  it.each([
    [{ code: 'QUEUE_DELETION_ALREADY_COMPLETED', status: 409 }, 'panel.queue.delete.cancel.already_deleted'],
    [{ code: 'QUEUE_DELETION_PAUSE_IN_PROGRESS', status: 409 }, 'panel.queue.delete.cancel.pause_in_progress'],
    [{ code: 'QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED', status: 409 }, 'panel.queue.delete.cancel.remote_delete_attempted'],
    [{ code: 'QUEUE_REWARD_OPERATION_PROCESSING', status: 409 }, 'panel.queue.delete.cancel.processing'],
    [{ code: 'QUEUE_DELETION_NOT_PENDING', status: 409 }, 'panel.queue.delete.cancel.stale'],
    [{ code: 'QUEUE_DELETION_CANCELLATION_STALE', status: 409 }, 'panel.queue.delete.cancel.stale'],
    [{ code: 'QUEUE_DELETION_CANCELLATION_UNVERIFIED', status: 409 }, 'panel.queue.delete.cancel.unverified'],
    [{ code: 'QUEUE_NOT_FOUND', status: 404 }, 'panel.error.queue_not_found'],
    [{ code: 'QUEUE_DELETE_CANCEL_CONFIRMATION_REQUIRED', status: 400 }, 'panel.error.generic'],
    [{ code: 'SOMETHING_NEW', status: 418 }, 'panel.error.generic'],
    [{ code: 'INTERNAL_ERROR', status: 503, referenceId: 'ref-1' }, 'panel.queue.delete.cancel.uncertain'],
    [{ code: 'REQUEST_FAILED', status: 0 }, 'panel.queue.delete.cancel.uncertain'],
    [{ code: 'INVALID_QUEUE_LIFECYCLE_RESPONSE' }, 'panel.queue.delete.cancel.uncertain'],
  ])('U23-05: %j maps to %s, always in the alert element', (error, key) => {
    const outcome = getQueueLifecycleOutcome({ action: 'cancel-delete', error, queue: rewardQueue });
    expect(outcome.key).toBe(key);
    expect(outcome.element).toBe('alert');
  });

  it('U23-05: the real 409 codes of the FT-36 API are all known (none falls back to the generic text)', () => {
    for (const code of ['QUEUE_DELETION_ALREADY_COMPLETED', 'QUEUE_DELETION_PAUSE_IN_PROGRESS', 'QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED']) {
      expect(getQueueLifecycleFailureFeedback({ code, status: 409 }, { action: 'cancel-delete' }).key).not.toBe('panel.error.generic');
    }
  });

  it.each([
    ['queue_delete_reward_absent', 'panel.queue.delete.cancel.reward_absent', 'operations'],
    ['queue_delete_reward_diverged', 'panel.queue.delete.cancel.reward_diverged', 'operations'],
    ['queue_delete_cancel_reward_not_paused', 'panel.queue.delete.cancel.reward_not_paused', 'operations'],
    ['queue_deletion_cancel_verification_unavailable', 'panel.queue.delete.cancel.unverified', undefined],
    ['authorization_required', 'panel.queue.delete.cancel.authorization_required', 'connection'],
    ['something_new', 'panel.queue.delete.cancel.unverified', undefined],
    [undefined, 'panel.queue.delete.cancel.unverified', undefined],
  ])('U23-05: not_cancelled reason %s maps to %s (alert)', (reason, key, action) => {
    const outcome = getQueueLifecycleOutcome({ action: 'cancel-delete', result: { status: 'not_cancelled', reason }, queue: rewardQueue });
    expect(outcome).toMatchObject({ key, element: 'alert' });
    expect(outcome.action).toBe(action);
  });

  it('U23-07: cancelled goes to the status element; every refusal goes to alert; no refusal claims the queue is safe or reopened', () => {
    expect(getQueueLifecycleOutcome({ action: 'cancel-delete', result: { status: 'cancelled' }, queue: rewardQueue })).toMatchObject({ key: 'panel.queue.delete.cancelled', element: 'status' });
    for (const reason of ['queue_delete_reward_absent', 'queue_delete_reward_diverged', 'queue_delete_cancel_reward_not_paused', 'authorization_required', 'x']) {
      expect(getQueueLifecycleOutcome({ action: 'cancel-delete', result: { status: 'not_cancelled', reason }, queue: rewardQueue }).element).toBe('alert');
    }
  });

  it('U23-08 / R6: already_deleted comes from the 409 code, never from a 200 status', () => {
    const fromCode = getQueueLifecycleOutcome({ action: 'cancel-delete', error: { code: 'QUEUE_DELETION_ALREADY_COMPLETED', status: 409 }, queue: rewardQueue });
    expect(fromCode.key).toBe('panel.queue.delete.cancel.already_deleted');
    const from200 = getQueueLifecycleOutcome({ action: 'cancel-delete', result: { status: 'already_deleted' }, queue: rewardQueue });
    expect(from200.key).not.toBe('panel.queue.delete.cancel.already_deleted');
    expect(from200.element).toBe('alert');
  });

  it('never renders the API free-text error and only a safe reference id', () => {
    const outcome = getQueueLifecycleOutcome({ action: 'cancel-delete', error: { code: 'INTERNAL_ERROR', status: 503, error: 'Falha privada do servidor', message: 'secret', referenceId: 'ok-1' }, queue: rewardQueue });
    expect(JSON.stringify(outcome)).not.toMatch(/privada|secret/);
    expect(outcome.referenceId).toBe('ok-1');
    const unsafe = getQueueLifecycleOutcome({ action: 'cancel-delete', error: { code: 'INTERNAL_ERROR', status: 503, referenceId: 'private SQL details' }, queue: rewardQueue });
    expect(unsafe.referenceId).toBeUndefined();
  });
});
