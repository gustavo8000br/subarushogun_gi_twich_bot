import { describe, expect, it, vi } from 'vitest';
import { loadQueueProjection, requestQueueOpenState } from '../../apps/frontend/features/queues/queue-lifecycle.mjs';

describe('Next queue lifecycle API contracts', () => {
  it('posts the requested open state through the same-origin API and returns its confirmed result', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'confirmed', isOpen: true, remoteSyncStatus: 'local_only' });
    await expect(requestQueueOpenState({ request, queueId: 'queue-1', isOpen: true })).resolves.toEqual({
      status: 'confirmed', isOpen: true, remoteSyncStatus: 'local_only',
    });
    expect(request).toHaveBeenCalledWith('/api/queues/queue-1/open-state', {
      method: 'POST', body: JSON.stringify({ isOpen: true }),
    });
  });

  it('preserves pending Twitch confirmation without claiming it is confirmed', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'pending', isOpen: false, remoteSyncStatus: 'pending_close' });
    await expect(requestQueueOpenState({ request, queueId: 'queue-1', isOpen: false })).resolves.toMatchObject({ status: 'pending' });
  });

  it('rejects unknown remote sync statuses instead of allowing false success feedback', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'close_unknown', isOpen: false, remoteSyncStatus: 'close_unknown' });
    await expect(requestQueueOpenState({ request, queueId: 'queue-1', isOpen: false })).rejects.toMatchObject({ code: 'INVALID_QUEUE_OPEN_STATE_RESPONSE' });
  });

  it('rejects malformed acknowledgements rather than displaying a false success', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'confirmed', isOpen: false });
    await expect(requestQueueOpenState({ request, queueId: 'queue-1', isOpen: true })).rejects.toMatchObject({ code: 'INVALID_QUEUE_OPEN_STATE_RESPONSE' });
  });

  it('validates a refreshed queue projection before replacing the screen data', async () => {
    const queues = [{ id: 'queue-1', slug: 'arena', title: 'Arena', isOpen: false, entries: [] }];
    const request = vi.fn().mockResolvedValue(queues);
    await expect(loadQueueProjection(request)).resolves.toBe(queues);
    expect(request).toHaveBeenCalledWith('/api/queues');
    await expect(loadQueueProjection(vi.fn().mockResolvedValue([{ id: 'queue-1' }]))).rejects.toMatchObject({ code: 'INVALID_QUEUE_PROJECTION' });
  });
});
