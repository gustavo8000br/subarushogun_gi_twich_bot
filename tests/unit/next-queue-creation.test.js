import { describe, expect, it, vi } from 'vitest';
import {
  buildQueueCreationPayload,
  createQueueWithRefresh,
  getQueueCreationFeedback,
  getQueueCreationFailureKey,
  isQueueCreationResponse,
} from '../../apps/frontend/features/queues/queue-creation.mjs';

describe('Next queue creation', () => {
  it('builds a manual queue payload without Twitch reward fields', () => {
    expect(buildQueueCreationPayload({
      title: '  Free Queue ', slug: 'free-queue', aliases: 'free, gratis', queueMode: 'manual_only',
      uidMode: 'visible', callTimeoutMin: '12',
    })).toEqual({
      title: 'Free Queue', slug: 'free-queue', aliases: ['free', 'gratis'], queueMode: 'manual_only',
      callTimeoutMin: 12, uidMode: 'visible',
    });
  });

  it('builds a Channel Points payload with optional empty limits omitted', () => {
    expect(buildQueueCreationPayload({
      title: 'Arena', slug: 'arena', aliases: 'pvp, batalha', queueMode: 'channel_points',
      cost: '250', maxRedemptionsPerStream: '', maxRedemptionsPerUserPerStream: '3',
      globalCooldownSeconds: '', rewardPrompt: 'Resgate para entrar', uidMode: 'hidden', callTimeoutMin: '10',
    })).toEqual({
      title: 'Arena', slug: 'arena', aliases: ['pvp', 'batalha'], queueMode: 'channel_points', cost: 250,
      maxRedemptionsPerUserPerStream: 3, rewardPrompt: 'Resgate para entrar', uidMode: 'hidden', callTimeoutMin: 10,
    });
  });

  it.each([
    [{ title: '', slug: 'arena', queueMode: 'manual_only' }, 'INVALID_QUEUE_CREATION'],
    [{ title: 'Arena', slug: 'a', queueMode: 'manual_only' }, 'INVALID_QUEUE_CREATION'],
    [{ title: 'Arena', slug: 'arena', aliases: 'alias, alias', queueMode: 'manual_only' }, 'INVALID_QUEUE_CREATION'],
    [{ title: 'Arena', slug: 'arena', queueMode: 'channel_points', cost: '0' }, 'INVALID_QUEUE_CREATION'],
  ])('rejects invalid queue fields before POST', (input, code) => {
    expect(() => buildQueueCreationPayload(input)).toThrow(expect.objectContaining({ code }));
  });

  it('validates an accepted queue response before exposing it', () => {
    expect(isQueueCreationResponse({ id: 'q1', slug: 'arena', title: 'Arena', queueMode: 'manual_only', isOpen: false })).toBe(true);
    expect(isQueueCreationResponse({ id: '', slug: 'arena' })).toBe(false);
  });

  it('creates through the established endpoint and refreshes the operator projection', async () => {
    const created = { id: 'q1', slug: 'arena', title: 'Arena', queueMode: 'manual_only', isOpen: false };
    const request = vi.fn().mockResolvedValueOnce(created).mockResolvedValueOnce([created]);
    await expect(createQueueWithRefresh({ request, formValues: { title: 'Arena', slug: 'arena', queueMode: 'manual_only' } }))
      .resolves.toEqual({ queue: created, queues: [created], refreshFailed: false, recovered: false });
    expect(request).toHaveBeenNthCalledWith(1, '/api/queues', { method: 'POST', body: JSON.stringify({
      title: 'Arena', slug: 'arena', aliases: [], queueMode: 'manual_only', callTimeoutMin: 10, uidMode: 'hidden',
    }) });
    expect(request).toHaveBeenNthCalledWith(2, '/api/queues');
  });

  it('retains accepted creation when projection refresh fails', async () => {
    const created = { id: 'q1', slug: 'arena', title: 'Arena', queueMode: 'manual_only', isOpen: false };
    const request = vi.fn().mockResolvedValueOnce(created).mockRejectedValueOnce(new Error('unavailable'));
    await expect(createQueueWithRefresh({ request, formValues: { title: 'Arena', slug: 'arena', queueMode: 'manual_only' } }))
      .resolves.toEqual({ queue: created, queues: null, refreshFailed: true, recovered: false });
  });

  it('reconciles a diagnostic server failure against existing queues before allowing a retry', async () => {
    const created = { id: 'q1', slug: 'arena', title: 'Arena', queueMode: 'channel_points', isOpen: false };
    const request = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('failed'), { status: 500, referenceId: 'ref-1' }))
      .mockResolvedValueOnce([created])
      .mockResolvedValueOnce([created]);
    await expect(createQueueWithRefresh({ request, formValues: { title: 'Arena', slug: 'arena', queueMode: 'channel_points', cost: '100' } }))
      .resolves.toEqual({ queue: created, queues: [created], refreshFailed: false, recovered: true });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['502 without diagnostic reference', Object.assign(new Error('bad gateway'), { status: 502 })],
    ['transport failure', new TypeError('connection interrupted')],
  ])('blocks duplicate submission after an unconfirmed %s result', async (_label, error) => {
    const request = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce([]);
    await expect(createQueueWithRefresh({ request, formValues: { title: 'Arena', slug: 'arena', queueMode: 'manual_only' } }))
      .resolves.toMatchObject({ queue: null, queues: [], refreshFailed: false, recovered: false, uncertain: true });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('preserves a safe diagnostic reference when an uncertain create cannot be matched', async () => {
    const error = Object.assign(new Error('failed'), { status: 500, referenceId: 'safe-ref-1' });
    const request = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce([]);
    await expect(createQueueWithRefresh({ request, formValues: { title: 'Arena', slug: 'arena', queueMode: 'manual_only' } }))
      .resolves.toMatchObject({ uncertain: true, referenceId: 'safe-ref-1' });
  });

  it('does not treat a failed local-session initialization as an ambiguous POST', async () => {
    const error = Object.assign(new Error('session initialization failed'), { code: 'REQUEST_FAILED', status: 0 });
    const request = vi.fn().mockRejectedValueOnce(error);
    await expect(createQueueWithRefresh({ request, formValues: { title: 'Arena', slug: 'arena', queueMode: 'manual_only' } }))
      .rejects.toMatchObject({ code: 'REQUEST_FAILED', status: 0 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('reports Twitch reward creation as pending until API projection confirms it', () => {
    expect(getQueueCreationFeedback({
      queue: { queueMode: 'channel_points', remoteSyncStatus: 'pending_create' }, refreshFailed: false, recovered: false,
    })).toEqual({ status: 'pending', key: 'panel.queue.creation_result.pending' });
  });

  it('does not claim a failed or unknown Twitch reward creation succeeded', () => {
    expect(getQueueCreationFeedback({
      queue: { queueMode: 'channel_points', remoteSyncStatus: 'create_failed' }, refreshFailed: false, recovered: false,
    })).toEqual({ status: 'warning', key: 'panel.queue.creation_result.review' });
  });

  it('shows uncertainty feedback without offering another create action', () => {
    expect(getQueueCreationFeedback({ queue: null, refreshFailed: false, recovered: false, uncertain: true }))
      .toEqual({ status: 'uncertain', key: 'panel.queue.creation_result.uncertain' });
  });

  it('reports local creation and recovered creation without claiming Twitch confirmation', () => {
    expect(getQueueCreationFeedback({
      queue: { queueMode: 'manual_only', remoteSyncStatus: 'local_only' }, refreshFailed: false, recovered: false,
    })).toEqual({ status: 'confirmed', key: 'panel.queue.creation_result.created_local' });
    expect(getQueueCreationFeedback({
      queue: { queueMode: 'manual_only', remoteSyncStatus: 'local_only' }, refreshFailed: false, recovered: true,
    })).toEqual({ status: 'warning', key: 'panel.queue.creation_result.recovered' });
  });

  it('maps safe validation/conflict and diagnostic errors to localized feedback keys', () => {
    expect(getQueueCreationFailureKey({ status: 400 })).toBe('panel.error.invalid_queue_settings');
    expect(getQueueCreationFailureKey({ status: 409 })).toBe('panel.queue.creation_result.key_conflict');
    expect(getQueueCreationFailureKey({ status: 500, referenceId: 'abc' })).toBe('panel.error.reference');
    expect(getQueueCreationFailureKey({ status: 503 })).toBe('panel.error.generic');
  });
});
