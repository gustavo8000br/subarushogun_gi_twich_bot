import { describe, expect, it, vi } from 'vitest';
import { loadQueueHistory, validateQueueHistory } from '../../apps/frontend/features/queues/queue-history.mjs';

describe('Next queue history', () => {
  it('loads the bounded terminal-entry projection through the existing queue route', async () => {
    const request = vi.fn().mockResolvedValue([{
      id: 'entry-1', userLogin: 'viewer', displayName: 'Viewer', status: 'completed', finishedAt: '2026-10-15T12:00:00.000Z',
      uid: 'must-not-be-rendered', terminalReason: 'service_completed',
    }]);
    await expect(loadQueueHistory({ request, queueId: 'queue 1' })).resolves.toEqual([{
      id: 'entry-1', userLogin: 'viewer', displayName: 'Viewer', status: 'completed', finishedAt: '2026-10-15T12:00:00.000Z',
    }]);
    expect(request).toHaveBeenCalledWith('/api/queues/queue%201/history');
  });

  it.each([
    null,
    [{ id: 'x', userLogin: 'viewer', status: 'waiting' }],
    [{ id: 'x', userLogin: 'viewer', status: 'completed', finishedAt: 'not-a-date' }],
    Array.from({ length: 101 }, (_, index) => ({ id: String(index), userLogin: 'viewer', status: 'removed' })),
  ])('rejects malformed or unbounded history payloads', (value) => {
    expect(() => validateQueueHistory(value)).toThrow();
  });
});
