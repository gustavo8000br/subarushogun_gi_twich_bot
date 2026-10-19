import { describe, expect, it, vi } from 'vitest';
import { confirmQueueClear, getQueueClearFailureFeedback, previewQueueClear } from '../../apps/frontend/features/queues/queue-clear.mjs';

describe('Next queue clear confirmation contract', () => {
  it('previews active entries and requested refunds without clearing them', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'confirmation_required', count: 3, refundsRequested: 2, expiresInSeconds: 15 });
    await expect(previewQueueClear({ request, queueId: 'queue 1' })).resolves.toEqual({
      status: 'confirmation_required', count: 3, refundsRequested: 2, expiresInSeconds: 15,
    });
    expect(request).toHaveBeenCalledWith('/api/queues/queue%201/clear-preview', { method: 'POST', body: '{}' });
  });

  it('accepts cleared, empty-after-consumed-challenge, or renewed-confirmation responses', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'cleared', count: 3, refundsRequested: 2 });
    await expect(confirmQueueClear({ request, queueId: 'queue-1' })).resolves.toMatchObject({ status: 'cleared', count: 3 });
    expect(request).toHaveBeenCalledWith('/api/queues/queue-1/clear-confirm', { method: 'POST', body: '{}' });
    await expect(confirmQueueClear({ request: vi.fn().mockResolvedValue({ status: 'empty', count: 0, refundsRequested: 0 }), queueId: 'queue-1' }))
      .resolves.toEqual({ status: 'empty', count: 0, refundsRequested: 0 });
    const invalid = vi.fn().mockResolvedValue({ status: 'confirmed', count: 3, refundsRequested: 2 });
    await expect(confirmQueueClear({ request: invalid, queueId: 'queue-1' })).rejects.toMatchObject({ code: 'INVALID_QUEUE_CLEAR_RESPONSE' });
  });

  it('classifies confirm transport/server/invalid-response outcomes as uncertain but keeps pre-POST session and preview failures generic', () => {
    expect(getQueueClearFailureFeedback({ code: 'REQUEST_FAILED', status: 0, referenceId: 'clear-safe-01' }, { phase: 'confirm' })).toEqual({
      key: 'panel.queue.clear.uncertain', referenceId: 'clear-safe-01',
    });
    expect(getQueueClearFailureFeedback({ code: 'INTERNAL_ERROR', status: 503 }, { phase: 'confirm' }).key)
      .toBe('panel.queue.clear.uncertain');
    expect(getQueueClearFailureFeedback({ code: 'INVALID_QUEUE_CLEAR_RESPONSE' }, { phase: 'confirm' }).key)
      .toBe('panel.queue.clear.uncertain');
    expect(getQueueClearFailureFeedback({ code: 'SESSION_INITIALIZATION_FAILED', status: 500 }, { phase: 'confirm' }).key)
      .toBe('panel.queue.clear.failed');
    expect(getQueueClearFailureFeedback({ code: 'REQUEST_FAILED', status: 0 }, { phase: 'preview' }).key)
      .toBe('panel.queue.clear.failed');
  });

  it('rejects malformed previews without exposing a mutation path', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'confirmation_required', count: -1, refundsRequested: 1 });
    await expect(previewQueueClear({ request, queueId: 'queue-1' })).rejects.toMatchObject({ code: 'INVALID_QUEUE_CLEAR_RESPONSE' });
  });
});
